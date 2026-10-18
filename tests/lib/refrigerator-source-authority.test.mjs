import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bindRefrigeratorFacts, extractRefrigeratorFacts, mergeRefrigeratorSources } from '../../lib/replacement-discovery/refrigerator-retrieval.js';

/**
 * Source authority for specification facts. A retailer fills what the manufacturer leaves unstated, but two sources that state
 * different values for the same exact-model fact are AMBIGUOUS in either direction: neither class silently overrides the other,
 * and the conflict records which class said what. Live case: AJ Madison reports LF25Z6211S "Counter Depth: No" while LG
 * identifies the model as Counter-Depth MAX. The engine holds no runtime manufacturer record for that model (the LG page used
 * here is a test fixture and tests/ is not deployed), so nothing is hard-coded: only the generic merge semantics are pinned.
 */

const MODEL = 'LF25Z6211S';
const fixture = (name) => fs.readFileSync(new URL(`../fixtures/replacement-discovery/${name}`, import.meta.url), 'utf8');
const URLS = {
  'lg.com': `https://www.lg.com/us/refrigerators/lg-${MODEL.toLowerCase()}-french-3-door-refrigerator`,
  'homedepot.com': `https://www.homedepot.com/p/LG-25-cu-ft-French-3-Door-Refrigerator-${MODEL}/320000001`,
  'ajmadison.com': `https://www.ajmadison.com/cgi-bin/ajmadison/${MODEL}.html`,
  'lowes.com': `https://www.lowes.com/pd/LG-25-cu-ft-French-Door-Refrigerator-${MODEL}/5001234567`,
};
const page = (rows = '') => `<html><head><title>LG ${MODEL} 25 cu. ft. French 3-Door Refrigerator</title></head><body><h1>LG ${MODEL} French 3-Door Refrigerator</h1>`
  + `<div>Model Number ${MODEL}</div><div>Total Capacity (cu. ft.)</div><div>25.1</div>${rows}</body></html>`;
const YES = page('<div>Counter Depth Yes</div>');
const NO = page('<div>Counter Depth No</div>');
const SILENT = page();

/** One bound source: `domain` decides whether it is manufacturer or retailer evidence. */
const bound = (domain, html, id = `source-${domain}`) => bindRefrigeratorFacts(extractRefrigeratorFacts(html, MODEL, { sourceUrl: URLS[domain] }),
  { id, domain, title: id, url: URLS[domain], model: MODEL, brand: 'LG' });
const merged = (...sources) => mergeRefrigeratorSources(sources).facts.counterDepth;
const sides = (fact) => fact.conflicts.map((side) => `${side.value}:${side.sourceClass}`).sort();

test('1: manufacturer Yes + retailer No is AMBIGUOUS, in either order, with both classes recorded', () => {
  for (const order of [[bound('lg.com', YES), bound('homedepot.com', NO)], [bound('homedepot.com', NO), bound('lg.com', YES)]]) {
    const fact = merged(...order);
    assert.deepEqual([fact.status, fact.value, [...fact.alternatives].sort()], ['AMBIGUOUS', null, [false, true]]);
    assert.deepEqual(sides(fact), ['false:RETAILER', 'true:MANUFACTURER']);
    assert.equal(fact.basis, 'SOURCE_CONFLICT');
    assert.equal(fact.evidenceRefs.length, 2);
  }
});

test('2: manufacturer No + retailer Yes is AMBIGUOUS, in either order', () => {
  for (const order of [[bound('lg.com', NO), bound('lowes.com', YES)], [bound('lowes.com', YES), bound('lg.com', NO)]]) {
    const fact = merged(...order);
    assert.deepEqual([fact.status, fact.value], ['AMBIGUOUS', null]);
    assert.deepEqual(sides(fact), ['false:MANUFACTURER', 'true:RETAILER']);
  }
});

test('3 and 4: a lone retailer statement is KNOWN, true or false', () => {
  const yes = merged(bound('homedepot.com', YES));
  const no = merged(bound('ajmadison.com', NO));
  assert.deepEqual([yes.status, yes.value], ['KNOWN', true]);
  assert.deepEqual([no.status, no.value], ['KNOWN', false]);
  // A manufacturer page that is silent on depth does not conflict with, or block, the retailer's statement.
  const filled = merged(bound('lg.com', SILENT), bound('ajmadison.com', NO));
  assert.deepEqual([filled.status, filled.value], ['KNOWN', false]);
  assert.equal(filled.evidenceRefs.length, 1);
});

test('5: two retailers that disagree are AMBIGUOUS, and a third source cannot break the tie', () => {
  const fact = merged(bound('homedepot.com', YES), bound('ajmadison.com', NO));
  assert.deepEqual([fact.status, fact.value], ['AMBIGUOUS', null]);
  assert.deepEqual(sides(fact), ['false:RETAILER', 'true:RETAILER']);
  for (const third of [bound('lg.com', YES), bound('lowes.com', NO)]) {
    const still = merged(bound('homedepot.com', YES), bound('ajmadison.com', NO), third);
    assert.deepEqual([still.status, still.value, [...still.alternatives].sort()], ['AMBIGUOUS', null, [false, true]]);
  }
  assert.equal(merged(bound('lowes.com', NO), bound('homedepot.com', YES), bound('lg.com', YES)).status, 'AMBIGUOUS');
});

test('6: manufacturer and retailer that agree give the KNOWN agreed value from both sources', () => {
  for (const [html, value] of [[YES, true], [NO, false]]) {
    const fact = merged(bound('lg.com', html), bound('homedepot.com', html));
    assert.deepEqual([fact.status, fact.value], ['KNOWN', value]);
    assert.equal(fact.evidenceRefs.length, 2);
    assert.deepEqual(fact.sourceIds.sort(), ['source-homedepot.com', 'source-lg.com']);
  }
});

test('7: silence is UNKNOWN: no fact at all, never false', () => {
  assert.equal(merged(bound('lg.com', SILENT), bound('homedepot.com', SILENT)), undefined);
  assert.equal(merged(bound('ajmadison.com', SILENT)), undefined);
});

test('8: the LF25Z6211S conflict (LG fixture vs a retailer page reading "Counter Depth: No") is AMBIGUOUS, not false', () => {
  const lg = bound('lg.com', fixture('lg-lf25z6211s-page.html'));
  assert.equal(lg.facts.counterDepth.value, true);
  // The synthetic retailer fixture, edited to state what the live AJ Madison page was reported to say.
  const retailerNo = fixture('ajmadison-lf25z6211s-page.html').replace(/Counter-Depth MAX /g, '').replace('<div>Counter Depth</div><div>Yes</div>', '<div>Counter Depth</div><div>No</div>');
  const aj = bound('ajmadison.com', retailerNo);
  assert.equal(aj.facts.counterDepth.value, false);
  const fact = merged(lg, aj);
  assert.deepEqual([fact.status, fact.value], ['AMBIGUOUS', null]);
  assert.deepEqual(sides(fact), ['false:RETAILER', 'true:MANUFACTURER']);
  // The same retailer page on its own (the situation at runtime today) still reads as that retailer's statement.
  assert.deepEqual([merged(aj).status, merged(aj).value], ['KNOWN', false]);
  // Conflict on one fact does not disturb the facts the sources agree on.
  const all = mergeRefrigeratorSources([lg, aj]).facts;
  assert.deepEqual([all.totalCapacityCuFt.status, all.totalCapacityCuFt.value, all.model.status], ['KNOWN', 25.1, 'KNOWN']);
});
