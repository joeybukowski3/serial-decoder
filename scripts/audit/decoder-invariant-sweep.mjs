#!/usr/bin/env node
/**
 * Decoder invariant sweep (read-only audit).
 *
 * Loads decoder-data.js in a VM sandbox and probes every brand decoder with
 * generated and adversarial inputs. Raw decoder candidates can legitimately
 * include era alternatives that the public result pipeline later filters, so
 * findings are classified rather than treated as one undifferentiated count.
 *
 * Fatal invariants (non-zero exit): thrown exceptions, invalid displayed
 * week/month forms, and undefined/NaN/null leaks. Raw out-of-range candidate
 * years, case differences, and punctuation differences remain informational
 * until they are evaluated through the public sanitize/render pipeline.
 *
 * Usage: node scripts/audit/decoder-invariant-sweep.mjs [--json <outfile>]
 */

import fs from 'node:fs';
import vm from 'node:vm';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_MIN = 1940;
const YEAR_MAX = CURRENT_YEAR + 1;
const FATAL_INVARIANTS = new Set([
  'THROW',
  'THROW-lower',
  'THROW-punct',
  'I2-week-range',
  'I3-month-form',
  'I6-leak',
]);

function loadDecoderData() {
  const ctx = { console, window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('decoder-data.js', 'utf8'), ctx);
  vm.runInContext('globalThis.__d = decoderData;', ctx);
  return ctx.__d;
}

function probeInputs() {
  const probes = new Set();
  const letters = ['A', 'C', 'F', 'K', 'M', 'R', 'T', 'X'];
  const digitBlocks = ['0101', '1404', '2352', '9954', '3599', '0000', '5313', '9913'];
  for (const digits of digitBlocks) {
    probes.add(digits + '123456');
    probes.add(digits + '12345');
    probes.add('S' + digits + '12345');
    probes.add('RH' + digits + '12345');
  }
  for (const letter of letters) {
    probes.add(letter + '12345678');
    probes.add(letter + 'B1234567');
    probes.add('X' + letter + '123456J');
    probes.add(letter + '082116285');
  }
  [
    'WRF535SWHZ',
    'GTS18GTHWW',
    '123',
    '99999999999999',
    'ZZZZZZZZZZ',
    '9999999999',
    '5501234567',
    '2299123456',
  ].forEach((probe) => probes.add(probe));
  return [...probes];
}

function extractYears(text) {
  return (String(text).match(/\b(19|20)\d{2}\b/g) || []).map(Number);
}

const MONTHS = new Set(['january','february','march','april','may','june','july','august','september','october','november','december']);

function record(violations, entry) {
  violations.push({ ...entry, severity: FATAL_INVARIANTS.has(entry.invariant) ? 'fatal' : 'info' });
}

function checkResult(brandKey, input, res, violations) {
  if (!res || typeof res !== 'object') return;
  const year = res.year == null ? '' : String(res.year);
  const month = res.month == null ? '' : String(res.month);
  if (/undefined|NaN|null/.test(year + ' ' + month)) {
    record(violations, { brand: brandKey, input, invariant: 'I6-leak', detail: `year="${year}" month="${month}"` });
  }
  if (/unknown|invalid|unsupported|cannot/i.test(year)) return;
  for (const decodedYear of extractYears(year)) {
    if (decodedYear < YEAR_MIN || decodedYear > YEAR_MAX) {
      record(violations, { brand: brandKey, input, invariant: 'I1-year-range', detail: `raw candidate year ${decodedYear} from "${year}"` });
    }
  }
  const week = month.match(/week\s*(\d+)/i);
  if (week) {
    const value = parseInt(week[1], 10);
    if (value < 1 || value > 53) {
      record(violations, { brand: brandKey, input, invariant: 'I2-week-range', detail: `week ${value} (year "${year}")` });
    }
  } else if (month && !/quarter|q[1-4]|^\s*$|n\/?a|unknown|invalid/i.test(month)) {
    const monthWord = month.toLowerCase().replace(/[^a-z]/g, '');
    if (monthWord && !MONTHS.has(monthWord) && !/^\d{1,2}$/.test(month.trim()) && !/code/i.test(month)) {
      record(violations, { brand: brandKey, input, invariant: 'I3-month-form', detail: `month="${month}"` });
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
        } catch (error) {
          record(violations, { brand: brandKey, input, invariant: 'THROW', detail: error.message });
          continue;
        }
        stats.decodes++;
        if (!res) continue;
        stats.successes++;
        checkResult(brandKey, input, res, violations);
        try {
          const lower = decoder.decode(input.toLowerCase());
          if (stable(lower) !== stable(res)) {
            record(violations, { brand: brandKey, input, invariant: 'I4-case', detail: `upper=${stable(res)} lower=${stable(lower)}` });
          }
        } catch (error) {
          record(violations, { brand: brandKey, input: input.toLowerCase(), invariant: 'THROW-lower', detail: error.message });
        }
        if (input.length > 4) {
          const spaced = input.slice(0, 3) + ' ' + input.slice(3, 6) + '-' + input.slice(6);
          try {
            const alt = decoder.decode(spaced);
            if (alt && stable(alt) !== stable(res)) {
              record(violations, { brand: brandKey, input: spaced, invariant: 'I5-punct', detail: `compact=${stable(res)} spaced=${stable(alt)}` });
            }
          } catch (error) {
            record(violations, { brand: brandKey, input: spaced, invariant: 'THROW-punct', detail: error.message });
          }
        }
      }
    }
  }

  const byInvariant = {};
  for (const violation of violations) byInvariant[violation.invariant] = (byInvariant[violation.invariant] || 0) + 1;
  const fatal = violations.filter((violation) => violation.severity === 'fatal');

  console.log('=== DECODER INVARIANT SWEEP ===');
  console.log(`brands: ${stats.brands}, decode calls: ${stats.decodes}, successful decodes: ${stats.successes}`);
  console.log('findings by invariant:', JSON.stringify(byInvariant));
  console.log(`fatal findings: ${fatal.length}; informational findings: ${violations.length - fatal.length}`);

  const byBrand = {};
  for (const violation of violations) {
    byBrand[violation.brand] = byBrand[violation.brand] || [];
    if (byBrand[violation.brand].length < 4) byBrand[violation.brand].push(violation);
  }
  for (const [brand, brandViolations] of Object.entries(byBrand)) {
    console.log(`\n${brand}:`);
    for (const violation of brandViolations) {
      console.log(`  [${violation.severity.toUpperCase()} ${violation.invariant}] input="${violation.input}" ${violation.detail}`);
    }
  }

  const jsonIndex = process.argv.indexOf('--json');
  if (jsonIndex !== -1 && process.argv[jsonIndex + 1]) {
    fs.writeFileSync(process.argv[jsonIndex + 1], JSON.stringify({ stats, byInvariant, fatalCount: fatal.length, violations }, null, 2));
  }

  if (fatal.length > 0) process.exitCode = 1;
}

main();
