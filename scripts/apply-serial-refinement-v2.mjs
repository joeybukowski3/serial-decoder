import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (name) => readFile(path.join(root, name), 'utf8');
const write = (name, value) => writeFile(path.join(root, name), value, 'utf8');

function assertChanged(before, after, label) {
  if (before === after) throw new Error(`Migration did not change ${label}`);
  return after;
}

// Package scripts: keep the existing production site, but make the new browser source reproducible.
{
  const file = 'package.json';
  const pkg = JSON.parse(await read(file));
  pkg.scripts = {
    ...pkg.scripts,
    'build:browser': 'node scripts/build-serial-refinement-browser.js',
    'build:seo': 'node scripts/generate-seo-pages.js',
    'build:inject': 'node scripts/inject-serial-refinement-script.js',
    build: 'npm run build:browser && npm run build:seo && npm run build:inject',
    dev: 'npx vercel dev',
    'test:decoder': 'node tests/decoder-regressions.test.mjs',
    'test:unit': 'node --test tests/refinement/*.test.mjs',
    'test:api': 'node --test tests/api/*.test.mjs',
    test: 'npm run test:decoder && npm run test:unit && npm run test:api',
    'test:playwright': 'npx playwright test tests/playwright-verify.spec.js tests/serial-refinement-ui.spec.js',
  };
  await write(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

// Dedicated function duration and safe revalidation for stable JavaScript filenames.
{
  const file = 'vercel.json';
  const config = JSON.parse(await read(file));
  config.functions = {
    ...(config.functions || {}),
    'api/refine-serial-date.js': { maxDuration: 10 },
  };
  const jsHeader = (config.headers || []).find((item) => item.source === '/(:path*).js');
  if (!jsHeader) throw new Error('JavaScript cache header was not found in vercel.json');
  const cacheControl = (jsHeader.headers || []).find((item) => item.key.toLowerCase() === 'cache-control');
  if (!cacheControl) throw new Error('JavaScript Cache-Control header was not found');
  cacheControl.value = 'public, max-age=0, must-revalidate';
  await write(file, `${JSON.stringify(config, null, 2)}\n`);
}

// Remove the general Smart Lookup midpoint fabrication while preserving the rest of that endpoint.
{
  const file = 'api/age-lookup.js';
  const before = await read(file);
  const startMarker = '    // ── Calculate estimatedYear from yearRange if estimatedYear is missing ──';
  const endMarker = '    finalResult._source = source;';
  const start = before.indexOf(startMarker);
  const end = before.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('Could not locate age-lookup midpoint block');
  const after = `${before.slice(0, start)}    // Preserve broad yearRange values as ranges; do not fabricate an exact midpoint year.\n    ${before.slice(end)}`;
  await write(file, assertChanged(before, after, file));
}

// Add an application timeout to the remaining general query-interpreter Gemini call.
{
  const file = 'api/smart-query-interpret.js';
  const before = await read(file);
  if (before.includes('const geminiInterpretController = new AbortController();')) {
    // Already migrated.
  } else {
    let after = before.replace(
      '  try {\n    const response = await fetch(\n      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,',
      '  try {\n    const geminiInterpretController = new AbortController();\n    const geminiInterpretTimeout = setTimeout(() => geminiInterpretController.abort(), 10000);\n    const response = await fetch(\n      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,'
    );
    after = after.replace(
      '          },\n        }),\n      }\n    );\n\n    if (!response.ok)',
      '          },\n        }),\n        signal: geminiInterpretController.signal,\n      }\n    );\n    clearTimeout(geminiInterpretTimeout);\n\n    if (!response.ok)'
    );
    await write(file, assertChanged(before, after, file));
  }
}

// Migrate local model data to ranges/evidence. Broad single-year guesses become legacy metadata only.
{
  const file = 'data/model-age-db.json';
  const db = JSON.parse(await read(file));
  db.version = 2;
  db.schemaVersion = 'serial-refinement-v2';
  db.lastUpdated = '2026-07-01';
  db.description = 'Local-first model availability evidence. Exact manufacture years are only stored when independently known.';

  const evidence = {
    'LG|WM3470HWA': [2013, 2016, 'LG front-load washer retail/manual publication window'],
    'Whirlpool|WMH31017HS12': [2023, 2025, 'Whirlpool WMH31017HS12 manual and retail publication window'],
    'Frigidaire|FEFL79DBB': [2003, 2005, 'Frigidaire FEFL79DBB manual and factory-parts publication window'],
    'Frigidaire|FFCO7C3AW2': [2002, 2002, 'Frigidaire data plate marked Manufactured 11-02'],
    'Frigidaire|FFTR2045VS0': [2020, 2024, 'Frigidaire FFTR2045VS model-era support'],
    'GE|GTH18GBCDCRBB': [2011, 2013, 'GE GTH top-mount refrigerator model-family evidence'],
    'GE|JB258DM1WW': [2018, 2020, 'GE JB258DM1WW model/manual publication window'],
    'Vizio|VW32L HDTV10A': [2007, 2008, 'Vizio VW32L HDTV10A launch and support-literature window'],
  };

  db.records = Array.isArray(db.records) ? db.records : [];
  if (!db.records.some((record) => record.brand === 'GE' && record.model === 'JB258DM1WW')) {
    db.records.push({
      brand: 'GE', model: 'JB258DM1WW', normalizedBrand: 'ge', normalizedModel: 'jb258dm1ww', category: 'range',
      yearStart: 2018, yearEnd: 2020, productionRange: '2018-2020',
      source: 'GE JB258DM1WW model/manual publication window',
      notes: 'The exact JB258DM1WW revision is associated with late-2010s model-year documentation, which eliminates the earlier repeating GE serial cycles.',
      aliases: ['GE JB258DM1WW'],
    });
  }
  if (!db.records.some((record) => record.brand === 'Vizio' && record.model === 'VW32L HDTV10A')) {
    db.records.push({
      brand: 'Vizio', model: 'VW32L HDTV10A', normalizedBrand: 'vizio', normalizedModel: 'vw32lhdtv10a', category: 'television',
      yearStart: 2007, yearEnd: 2008, productionRange: '2007-2008',
      source: 'Vizio VW32L HDTV10A launch and support-literature window',
      notes: 'This is model-derived evidence for the 2007 product generation; the supplied serial format is not directly decoded.',
      aliases: ['VW32LHDTV10A', 'Vizio VW32L HDTV10A'],
    });
  }

  db.records = db.records.map((record) => {
    const next = { ...record };
    if (next.estimatedYear != null) {
      next.legacyEstimatedYear = next.estimatedYear;
      delete next.estimatedYear;
    }
    if (Number.isInteger(next.yearStart) && next.yearStart === next.yearEnd) {
      next.exactManufactureYear = next.yearStart;
    }
    const key = `${next.brand}|${next.model}`;
    if (evidence[key]) {
      const [start, end, sourceName] = evidence[key];
      next.recordType = 'exact-model';
      next.refinementEvidence = [{
        type: 'local-db',
        title: `${next.brand} ${next.model} structured model record`,
        sourceName,
        sourceUrl: null,
        productionStart: start,
        productionEnd: end,
        supports: next.notes || `Structured model window ${start}-${end}.`,
        quality: 'official',
        verified: true,
      }];
    }
    if (key === 'Frigidaire|FFTR2045VS0') {
      next.aliases = (next.aliases || []).filter((alias) => !/VS[O]$/i.test(String(alias).replace(/[^A-Za-z0-9]/g, '')));
      next.transcriptionAlternatives = [{ value: 'FFTR2045VSO', change: 'O→0', verified: false }];
    }
    return next;
  });
  await write(file, `${JSON.stringify(db, null, 2)}\n`);
}

// Keep the legacy general lookup compatible with v2 ranges without inventing a midpoint.
{
  const file = 'lib/model-age-db.js';
  const before = await read(file);
  let after = before.replace(
    /export function normalizeModelNumber\(value\) \{[\s\S]*?\n\}/,
    `export function normalizeModelNumber(value) {\n  return String(value || '')\n    .toLowerCase()\n    .replace(/[^a-z0-9]/g, '');\n}`
  );
  if (!after.includes('function getExactManufactureYear(record)')) {
    after = after.replace(
      'export function formatLocalModelAgeMatch(record, options = {}) {',
      `function getExactManufactureYear(record) {\n  if (record.exactManufactureYear != null) return record.exactManufactureYear;\n  if (Number.isInteger(record.yearStart) && record.yearStart === record.yearEnd) return record.yearStart;\n  return null;\n}\n\nexport function formatLocalModelAgeMatch(record, options = {}) {`
    );
  }
  after = after.replace(
    "    estimatedYear: record.estimatedYear != null ? String(record.estimatedYear) : null,",
    "    estimatedYear: getExactManufactureYear(record) != null ? String(getExactManufactureYear(record)) : null,"
  );
  await write(file, assertChanged(before, after, file));
}

// Update the legacy regression expectation: transcription alternatives are no longer silently canonicalized.
{
  const file = 'tests/decoder-regressions.test.mjs';
  const before = await read(file);
  const marker = "test('Local model-era lookup normalizes Frigidaire trailing O typo for FFTR2045VS models'";
  const start = before.indexOf(marker);
  if (start < 0) throw new Error('Could not locate legacy trailing-O regression test');
  const replacement = `test('Local model lookup preserves Frigidaire O/0 distinction', async () => {\n  assert.equal(normalizeModelNumber('FFTR2045VSO'), 'fftr2045vso');\n  assert.equal(normalizeModelNumber('FFTR2045VS0'), 'fftr2045vs0');\n\n  const db = await loadLocalModelAgeDb({ forceReload: true });\n  const unverified = findExactLocalModelAgeMatch(db.records, 'FFTR2045VSO', 'Frigidaire');\n  const exact = findExactLocalModelAgeMatch(db.records, 'FFTR2045VS0', 'Frigidaire');\n  assert.equal(unverified, null);\n  assert.ok(exact);\n  assert.equal(exact.record.estimatedYear, undefined);\n  assert.equal(exact.record.productionRange, '2020-2024');\n});\n`;
  await write(file, `${before.slice(0, start)}${replacement}`);
}

// Document the schema without rewriting unrelated historical documentation.
{
  const file = 'docs/local-model-age-db.md';
  const before = await read(file);
  if (!before.includes('## Serial Refinement v2 Schema')) {
    await appendFile(path.join(root, file), `\n\n## Serial Refinement v2 Schema\n\nSerial-date refinement uses exact-model records and structured \`refinementEvidence\`. Broad \`estimatedYear\` guesses are retained only as \`legacyEstimatedYear\` metadata and are not used to choose a serial candidate.\n\nEach refinement evidence record can include \`type\`, \`sourceName\`, \`sourceUrl\`, \`productionStart\`, \`productionEnd\`, \`availabilityStart\`, \`availabilityEnd\`, \`quality\`, and \`verified\`. Exact selection is performed only by intersecting the serial-valid candidate years with a defensible evidence window.\n\nShort family prefixes are not exact aliases. O/0 and I/L/1 changes are represented as transcription alternatives and must be validated against a structured exact-model record before use.\n`, 'utf8');
  }
}

console.log('Applied serial refinement v2 repository migration.');
