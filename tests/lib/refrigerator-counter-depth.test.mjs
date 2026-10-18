import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bindRefrigeratorFacts, extractRefrigeratorFacts, mergeRefrigeratorSources } from '../../lib/replacement-discovery/refrigerator-retrieval.js';

/**
 * Counter-depth is bound only from explicit evidence about the exact model. Silence, a missing field, another product's heading,
 * or prose that merely starts with "No" must leave it UNKNOWN; contradictory evidence about the model is AMBIGUOUS.
 * The live regression: LG LF25Z6211S (a Counter-Depth MAX model) came back from a retailer page as counterDepth = false.
 */

const MODEL = 'LF25Z6211S';
const URL_AJ = 'https://www.ajmadison.com/cgi-bin/ajmadison/LF25Z6211S.html';
const fixture = (name) => fs.readFileSync(new URL(`../fixtures/replacement-discovery/${name}`, import.meta.url), 'utf8');
const SILENT_TITLE = `LG ${MODEL} 25 cu. ft. French 3-Door Refrigerator - AJ Madison`;

/** A minimal retailer page. `title`/`h1` default to wording that says nothing about depth. */
const page = ({ title = SILENT_TITLE, h1 = `LG ${MODEL} French 3-Door Refrigerator`, rows = '', after = '' } = {}) =>
  `<html><head><title>${title}</title></head><body><h1>${h1}</h1>${after}<div>Model Number ${MODEL}</div><div>Total Capacity (cu. ft.)</div><div>25.1</div>${rows}</body></html>`;
const counterDepthOf = (html) => extractRefrigeratorFacts(html, MODEL, { sourceUrl: URL_AJ }).counterDepth;

test('1: explicit positive evidence for the exact model binds true', () => {
  assert.equal(counterDepthOf(page({ rows: '<div>Counter Depth Yes</div>' })), true);
  assert.equal(counterDepthOf(page({ rows: '<div>Counter Depth</div><div>Yes</div>' })), true);
  assert.equal(counterDepthOf(page({ rows: '<div>Counter Depth: true</div>' })), true);
  assert.equal(counterDepthOf(page({ rows: '<div>Depth Type</div><div>Counter Depth MAX™</div>' })), true);
  assert.equal(counterDepthOf(page({ title: `LG ${MODEL} 25 cu. ft. Counter-Depth MAX French 3-Door Refrigerator` })), true);
  assert.equal(counterDepthOf(page({ h1: `LG ${MODEL} Counter Depth French 3-Door Refrigerator` })), true);
});

test('2: explicit negative / standard-depth evidence for the exact model binds false', () => {
  assert.equal(counterDepthOf(page({ rows: '<div>Counter Depth No</div>' })), false);
  assert.equal(counterDepthOf(page({ rows: '<div>Counter Depth</div><div>No</div>' })), false);
  assert.equal(counterDepthOf(page({ rows: '<div>Counter Depth: false</div>' })), false);
  assert.equal(counterDepthOf(page({ rows: '<div>Standard Depth Yes</div>' })), false);
  assert.equal(counterDepthOf(page({ rows: '<div>Depth Type Standard Depth</div>' })), false);
  assert.equal(counterDepthOf(page({ title: `LG ${MODEL} 25 cu. ft. Standard-Depth French 3-Door Refrigerator` })), false);
  assert.equal(counterDepthOf(page({ title: `LG ${MODEL} 25 cu. ft. Non-Counter-Depth French 3-Door Refrigerator` })), false);
});

test('3: absence of evidence stays unknown and never becomes false', () => {
  assert.equal(counterDepthOf(page()), undefined);
  // Each of these used to produce false: an empty value cell makes the reader fall through to the NEXT row, and a bare /^no/
  // matched "No. of Doors", "No frost" and "No-Frost".
  assert.equal(counterDepthOf(page({ rows: '<div>Counter Depth</div><div>No. of Doors</div><div>3</div>' })), undefined);
  assert.equal(counterDepthOf(page({ rows: '<div>Counter Depth</div><div>No frost cooling</div>' })), undefined);
  assert.equal(counterDepthOf(page({ rows: '<div>Counter Depth No-Frost</div>' })), undefined);
  assert.equal(counterDepthOf(page({ rows: '<div>Counter Depth</div><div></div><div>None</div>' })), undefined);
  assert.equal(counterDepthOf(page({ rows: '<div>Depth Type</div><div>Standard Depth models also available</div>' })), undefined);
  assert.equal(counterDepthOf(page({ rows: '<div>Standard Depth No</div>' })), undefined);
  assert.equal(counterDepthOf(page({ rows: '<div>Depth</div><div>35.4 in</div>' })), undefined);
  // The remaining phrase "Counter Depth MAX" in marketing copy is a label with no yes/no value, not a negative.
  assert.equal(counterDepthOf(page({ rows: '<div>Counter Depth Type</div><div>Not listed</div>' })), undefined);
});

test('4: a related or comparison product cannot bind its depth to the target model', () => {
  const related = '<h1>Customers also viewed: LG LF25H6200S Standard-Depth French Door Refrigerator</h1>';
  assert.equal(counterDepthOf(page({ after: related })), undefined);
  // A later section about another model is cut off at that model's line, so its rows are never read for the target.
  assert.equal(counterDepthOf(page({ rows: '<div>LF25H6200S</div><div>Counter Depth</div><div>No</div><div>Standard Depth</div><div>Yes</div>' })), undefined);
  // A related heading does not outvote the target's own positive evidence either.
  assert.equal(counterDepthOf(page({ title: `LG ${MODEL} Counter-Depth MAX French 3-Door Refrigerator`, after: related })), true);
});

test('5: conflicting evidence about the exact model is AMBIGUOUS, never silently resolved', () => {
  const conflicted = page({ title: `LG ${MODEL} Counter-Depth MAX French 3-Door Refrigerator`, rows: '<div>Counter Depth No</div>' });
  assert.deepEqual(counterDepthOf(conflicted), { ambiguous: [true, false] });
  assert.deepEqual(counterDepthOf(page({ rows: '<div>Counter Depth Yes</div><div>Standard Depth Yes</div>' })), { ambiguous: [true, false] });
  const source = { id: 'source-1', domain: 'ajmadison.com', title: 'x', url: URL_AJ, model: MODEL, brand: 'LG' };
  const raw = extractRefrigeratorFacts(conflicted, MODEL, { sourceUrl: URL_AJ });
  const bound = bindRefrigeratorFacts(raw, source);
  assert.deepEqual([bound.facts.counterDepth.status, bound.facts.counterDepth.value, bound.facts.counterDepth.alternatives],
    ['AMBIGUOUS', null, [true, false]]);
  assert.equal(bound.evidence.some((record) => record.claim.fieldKey === 'counterDepth'), false);
  // Merged with a second source that cleanly says Yes, the conflict stands and keeps both alternatives (no null alternative).
  const clean = bindRefrigeratorFacts(extractRefrigeratorFacts(page({ rows: '<div>Counter Depth Yes</div>' }), MODEL, { sourceUrl: URL_AJ }), { ...source, id: 'source-2' });
  const merged = mergeRefrigeratorSources([bound, clean]).facts.counterDepth;
  assert.deepEqual([merged.status, merged.value, merged.alternatives], ['AMBIGUOUS', null, [true, false]]);
});

test('6: the LF25Z6211S retailer-style fixture never reports false', () => {
  const html = fixture('ajmadison-lf25z6211s-page.html');
  const facts = extractRefrigeratorFacts(html, MODEL, { sourceUrl: URL_AJ });
  assert.equal(facts.counterDepth, true);
  assert.deepEqual([facts.totalCapacityCuFt.value, facts.configuration, facts.widthIn, facts.depthIn], [25.1, 'FRENCH_DOOR', 35.75, 27.5]);
  // Strip every positive statement: the traps (empty Depth Type, "No frost", "No. of Doors", the related standard-depth product) remain.
  const silent = html.replace(/Counter-Depth MAX /g, '').replace('<div>Counter Depth</div><div>Yes</div>', '');
  assert.equal(extractRefrigeratorFacts(silent, MODEL, { sourceUrl: URL_AJ }).counterDepth, undefined);
  assert.equal(extractRefrigeratorFacts(silent, MODEL, { sourceUrl: URL_AJ }).totalCapacityCuFt.value, 25.1);
});

test('LG manufacturer fixtures keep their explicit values (Z: counter depth, H6200S: standard depth)', () => {
  const lg = (name, model) => extractRefrigeratorFacts(fixture(name), model, { sourceUrl: `https://www.lg.com/us/refrigerators/lg-${model.toLowerCase()}-french-3-door-refrigerator` });
  assert.equal(lg('lg-lf25z6211s-page.html', 'LF25Z6211S').counterDepth, true);
  assert.equal(lg('lg-lf25h6200s-page.html', 'LF25H6200S').counterDepth, false);
  assert.equal(lg('lg-lrfcs25d3s-page.html', 'LRFCS25D3S').counterDepth, false);
});
