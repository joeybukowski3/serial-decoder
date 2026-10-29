#!/usr/bin/env node
/**
 * Regenerates the two files the ItemAssist frontend keeps as generated copies of this engine's research.2 data, or checks them for drift:
 *   - tests/itemassist-research/fixtures/research2-golden.json   every demo scenario, built by the real research.2 builder
 *   - api/_lib/itemassist-research/sources.js                    only the block between the GENERATED markers (the source registry)
 *
 * Usage:  node scripts/itemassist-research-export.mjs <frontend-repo-root>            write both files
 *         node scripts/itemassist-research-export.mjs <frontend-repo-root> --check    change nothing; exit 1 if either file is out of date
 *
 * Deterministic: a fixed reference date and clock, no network, no environment, no randomness. Run it after any change to
 * fixture-v2.js, contract-v2.js, pricing.js, requirements.js or the source registry in evidence.js.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResearchResponseV2, isValidResearchResponseV2 } from '../lib/itemassist-research/contract-v2.js';
import { EXACT_HOST_ONLY, STOREFRONT_LABELS, SOURCE_REGISTRY } from '../lib/itemassist-research/evidence.js';
import { fixtureResearch2For } from '../lib/itemassist-research/fixture-v2.js';

const REFERENCE_DATE = '2026-10-22';
const NOW = Date.UTC(2026, 9, 22, 12);
const GOLDEN_PATH = 'tests/itemassist-research/fixtures/research2-golden.json';
const SOURCES_PATH = 'api/_lib/itemassist-research/sources.js';
const BEGIN = '// BEGIN GENERATED REGISTRY (scripts/itemassist-research-export.mjs in the research engine; do not edit by hand)';
const END = '// END GENERATED REGISTRY';

// The query that routes to each scenario in fixture-v2.js.
const QUERIES = Object.freeze({
  'tv-premium-oled': 'LG C3 OLED TV', 'tv-strong-retail': 'Samsung S90D 65', 'fridge-constraints': 'Samsung RF28 refrigerator', 'washer-dimensions': 'front load washer 27 inch',
  'ambiguous-model': 'Samsung 65 inch TV', 'sparse-estimate': 'Bosch dishwasher', 'unsupported-claims': 'unsupported price claims tv', insufficient: 'something I cannot describe',
});

export function goldenText() {
  const scenarios = {};
  for (const [id, query] of Object.entries(QUERIES)) {
    const { id: routed, input } = fixtureResearch2For(query, REFERENCE_DATE);
    if (routed !== id) throw new Error(`"${query}" routed to ${routed}, expected ${id}`);
    const engine = buildResearchResponseV2(input, { requestId: 'engine-req-1', elapsedMs: 5, answerSource: 'AI_ESTIMATE', fixture: true, now: NOW });
    if (!isValidResearchResponseV2(engine, { allowFixture: true })) throw new Error(`scenario ${id} does not validate`);
    scenarios[id] = { query, engine };
  }
  const golden = {
    generatedFrom: 'itemassist-pricing-audit lib/itemassist-research/fixture-v2.js through buildResearchResponseV2 (Phase 4 M1)',
    referenceDate: REFERENCE_DATE,
    note: 'Illustrative demo data only. Regenerate with scripts/itemassist-research-export.mjs in the research engine when the research.2 contract changes.',
    scenarios,
  };
  return `${JSON.stringify(golden, null, 2)}\n`;
}

export function registryBlock() {
  const rows = SOURCE_REGISTRY.map(([domain, sourceClass, name]) => `  [${JSON.stringify(domain)}, ${JSON.stringify(sourceClass)}, ${JSON.stringify(name)}],`).join('\n');
  return `${BEGIN}\nconst REGISTRY = Object.freeze([\n${rows}\n]);\nconst STOREFRONT_LABELS = Object.freeze(${JSON.stringify([...STOREFRONT_LABELS])});\nconst EXACT_HOST_ONLY = Object.freeze(${JSON.stringify([...EXACT_HOST_ONLY])});\n${END}`;
}

/** `sourcesText` with its generated block replaced; throws when the markers are missing. */
export function withRegistryBlock(sourcesText) {
  const start = sourcesText.indexOf(BEGIN);
  const end = sourcesText.indexOf(END);
  if (start === -1 || end === -1 || end < start) throw new Error(`${SOURCES_PATH} has no GENERATED REGISTRY markers`);
  return sourcesText.slice(0, start) + registryBlock() + sourcesText.slice(end + END.length);
}

// CRLF checkouts must not read as drift.
const lf = (text) => text.replace(/\r\n/g, '\n');

function run(argv) {
  const check = argv.includes('--check');
  const target = argv.find((arg) => !arg.startsWith('--'));
  if (!target) { console.error('usage: node scripts/itemassist-research-export.mjs <frontend-repo-root> [--check]'); return 2; }
  const root = resolve(target);
  const goldenFile = join(root, GOLDEN_PATH);
  const sourcesFile = join(root, SOURCES_PATH);
  if (!existsSync(sourcesFile)) { console.error(`not a frontend checkout: ${SOURCES_PATH} not found under ${root}`); return 2; }

  const wanted = [
    [goldenFile, goldenText(), existsSync(goldenFile) ? readFileSync(goldenFile, 'utf8') : null],
    [sourcesFile, withRegistryBlock(lf(readFileSync(sourcesFile, 'utf8'))), lf(readFileSync(sourcesFile, 'utf8'))],
  ];
  const stale = wanted.filter(([, next, current]) => current === null || lf(current) !== next);
  if (check) {
    for (const [file] of stale) console.error(`out of date: ${file}`);
    console.log(stale.length ? `${stale.length} file(s) out of date` : 'research.2 golden fixture and source registry are up to date');
    return stale.length ? 1 : 0;
  }
  for (const [file, next] of stale) { writeFileSync(file, next); console.log(`wrote ${file}`); }
  if (!stale.length) console.log('already up to date');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = run(process.argv.slice(2));
