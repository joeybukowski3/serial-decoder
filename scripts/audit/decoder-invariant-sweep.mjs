#!/usr/bin/env node
/**
 * Decoder invariant sweep (read-only audit).
 *
 * Loads decoder-data.js in a VM sandbox and probes every brand decoder with
 * a battery of generated + adversarial inputs. Any successful decode result
 * is checked against invariants:
 *   I1  every decoded 4-digit year is within [1940, currentYear + 1]
 *   I2  "Week NN" months are within 1..53
 *   I3  month names, when present, are real month names or Week/Quarter forms
 *   I4  lowercase input decodes identically to uppercase input
 *   I5  inputs with spaces/hyphens decode identically to the compact form
 *   I6  the result never leaks "undefined"/"NaN" into year or month text
 *
 * Violations are reported per brand; the script never modifies anything.
 *
 * Usage: node scripts/audit/decoder-invariant-sweep.mjs [--json <outfile>]
 */

import fs from 'node:fs';
import vm from 'node:vm';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_MIN = 1940;
const YEAR_MAX = CURRENT_YEAR + 1;

function loadDecoderData() {
  const ctx = { console, window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('decoder-data.js', 'utf8'), ctx);
  vm.runInContext('globalThis.__d = decoderData;', ctx);
  return ctx.__d;
}

/** Generated probe battery: shapes commonly seen across manufacturers. */
function probeInputs() {
  const probes = new Set();
  const letters = ['A', 'C', 'F', 'K', 'M', 'R', 'T', 'X'];
  const digitBlocks = ['0101', '1404', '2352', '9954', '3599', '0000', '5313', '9913'];
  for (const d of digitBlocks) {
    probes.add(d + '123456');       // NNNN + 6
    probes.add(d + '12345');        // NNNN + 5
    probes.add('S' + d + '12345');  // letter prefix
    probes.add('RH' + d + '12345'); // two-letter prefix
  }
  for (const l of letters) {
    probes.add(l + '12345678');
    probes.add(l + 'B1234567');
    probes.add('X' + l + '123456J');
    probes.add(l + '082116285');
  }
  // adversarial / wrong-kind inputs
  [
    'WRF535SWHZ',        // model number as serial
    'GTS18GTHWW',        // model number as serial
    '123',               // too short
    '99999999999999',    // long digits
    'ZZZZZZZZZZ',        // letters only
    '9999999999',
    '5501234567',        // plausible YYWW far future (2055 wk 01)
    '2299123456',        // week 99
  ].forEach((p) => probes.add(p));
  return [...probes];
}

function extractYears(text) {
  return (String(text).match(/\b(19|20)\d{2}\b/g) || []).map(Number);
}

const MONTHS = new Set(['january','february','march','april','may','june','july','august','september','october','november','december']);

function checkResult(brandKey, input, res, violations) {
  if (!res || typeof res !== 'object') return;
  const year = res.year == null ? '' : String(res.year);
  const month = res.month == null ? '' : String(res.month);
  if (/undefined|NaN|null/.test(year + ' ' + month)) {
    violations.push({ brand: brandKey, input, invariant: 'I6-leak', detail: `year="${year}" month="${month}"` });
  }
  if (/unknown|invalid|unsupported|cannot/i.test(year)) return; // explicit non-answers are fine
  const years = extractYears(year);
  for (const y of years) {
    if (y < YEAR_MIN || y > YEAR_MAX) {
      violations.push({ brand: brandKey, input, invariant: 'I1-year-range', detail: `decoded year ${y} from "${year}"` });
    }
  }
  const wk = month.match(/week\s*(\d+)/i);
  if (wk) {
    const w = parseInt(wk[1], 10);
    if (w < 1 || w > 53) {
      violations.push({ brand: brandKey, input, invariant: 'I2-week-range', detail: `week ${w} (year "${year}")` });
    }
  } else if (month && !/quarter|q[1-4]|^\s*$|n\/?a|unknown|invalid/i.test(month)) {
    const monthWord = month.toLowerCase().replace(/[^a-z]/g, '');
    if (monthWord && !MONTHS.has(monthWord) && !/^\d{1,2}$/.test(month.trim())) {
      // month strings like "Unknown month code: Z" are fine; flag only leaks
      if (!/code/i.test(month)) {
        violations.push({ brand: brandKey, input, invariant: 'I3-month-form', detail: `month="${month}"` });
      }
    }
  }
}

function stable(res) {
  if (!res || typeof res !== 'object') return JSON.stringify(res);
  return JSON.stringify({ year: res.year ?? null, month: res.month ?? null });
}

function main() {
  const data = loadDecoderData();
  const probes = probeInputs();
  const violations = [];
  const stats = { brands: 0, decodes: 0, successes: 0 };

  for (const [category, catData] of Object.entries(data)) {
    const decoders = catData.decoders || {};
    for (const [brandId, decoder] of Object.entries(decoders)) {
      if (typeof decoder.decode !== 'function') continue;
      stats.brands++;
      const brandKey = `${category}/${brandId}`;
      for (const input of probes) {
        let res = null;
        try {
          res = decoder.decode(input);
        } catch (err) {
          violations.push({ brand: brandKey, input, invariant: 'THROW', detail: err.message });
          continue;
        }
        stats.decodes++;
        if (res) {
          stats.successes++;
          checkResult(brandKey, input, res, violations);
          // I4 case-insensitivity
          try {
            const lower = decoder.decode(input.toLowerCase());
            if (stable(lower) !== stable(res)) {
              violations.push({ brand: brandKey, input, invariant: 'I4-case', detail: `upper=${stable(res)} lower=${stable(lower)}` });
            }
          } catch (err) {
            violations.push({ brand: brandKey, input: input.toLowerCase(), invariant: 'THROW-lower', detail: err.message });
          }
          // I5 punctuation tolerance (insert space + hyphen mid-string)
          if (input.length > 4) {
            const spaced = input.slice(0, 3) + ' ' + input.slice(3, 6) + '-' + input.slice(6);
            try {
              const alt = decoder.decode(spaced);
              if (alt && stable(alt) !== stable(res)) {
                violations.push({ brand: brandKey, input: spaced, invariant: 'I5-punct', detail: `compact=${stable(res)} spaced=${stable(alt)}` });
              }
            } catch (err) {
              violations.push({ brand: brandKey, input: spaced, invariant: 'THROW-punct', detail: err.message });
            }
          }
        }
      }
    }
  }

  const byInvariant = {};
  for (const v of violations) byInvariant[v.invariant] = (byInvariant[v.invariant] || 0) + 1;

  console.log('=== DECODER INVARIANT SWEEP ===');
  console.log(`brands: ${stats.brands}, decode calls: ${stats.decodes}, successful decodes: ${stats.successes}`);
  console.log('violations by invariant:', JSON.stringify(byInvariant));
  const byBrand = {};
  for (const v of violations) {
    byBrand[v.brand] = byBrand[v.brand] || [];
    if (byBrand[v.brand].length < 4) byBrand[v.brand].push(v);
  }
  for (const [brand, vs] of Object.entries(byBrand)) {
    console.log(`\n${brand}:`);
    for (const v of vs) console.log(`  [${v.invariant}] input="${v.input}" ${v.detail}`);
  }

  const jsonIdx = process.argv.indexOf('--json');
  if (jsonIdx !== -1 && process.argv[jsonIdx + 1]) {
    fs.writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ stats, byInvariant, violations }, null, 2));
  }
}

main();
