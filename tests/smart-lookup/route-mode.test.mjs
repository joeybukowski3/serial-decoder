import test from 'node:test';
import assert from 'node:assert/strict';

import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';
import { chooseSmartLookupRoute, ROUTE_MODES } from '../../lib/smart-lookup/route-mode.js';

const route = (query, extra = {}) => chooseSmartLookupRoute({ ...classifySmartLookupQuery(query), ...extra });

test('a brand and category with nothing else is GENERAL_GUIDANCE', () => {
  for (const query of ['Samsung Refrigerator', 'samsung refrigerator', 'Whirlpool washer', 'LG TV', 'Rheem gas water heater']) {
    const decision = route(query);
    assert.equal(decision.mode, ROUTE_MODES.GENERAL_GUIDANCE, query);
    assert.deepEqual(decision.reasons, [], query);
  }
});

test('a bare brand or a bare category is GENERAL_GUIDANCE', () => {
  for (const query of ['Whirlpool', 'Samsung', 'washer', 'refrigerator', 'my old fridge']) {
    assert.equal(route(query).mode, ROUTE_MODES.GENERAL_GUIDANCE, query);
  }
});

test('any model-like token routes to PRECISION_RESEARCH', () => {
  for (const query of ['Samsung RF28R7551SR', 'WRF535SWHZ00', 'H4080BM', 'Dell OptiPlex 9020', 'Whirlpool WRF535SWHZ00 refrigerator']) {
    const decision = route(query);
    assert.equal(decision.mode, ROUTE_MODES.PRECISION_RESEARCH, query);
    assert.ok(decision.reasons.length > 0, query);
  }
});

test('an unfamiliar but plausible model token errs toward PRECISION_RESEARCH', () => {
  // None of these match any known pattern or brand; the router must not need to
  // recognize a token's format to send it to research.
  for (const query of ['Zephyrix ZX-9000', 'Quasarline QL7 refrigerator', 'XJ-440B', 'Kelvinator KR-12 fridge', 'ABC123']) {
    assert.equal(route(query).mode, ROUTE_MODES.PRECISION_RESEARCH, query);
  }
});

test('a distinctive description beyond brand and category errs toward PRECISION_RESEARCH', () => {
  for (const query of ['Samsung french door refrigerator', 'Sony Bravia', 'Nintendo Switch 2', 'Honda generator']) {
    assert.equal(route(query).mode, ROUTE_MODES.PRECISION_RESEARCH, query);
  }
});

test('digits, serial or service-tag text, and user notes all push toward PRECISION_RESEARCH', () => {
  assert.equal(route('Whirlpool 2015 washer').mode, ROUTE_MODES.PRECISION_RESEARCH);
  assert.equal(route('Samsung refrigerator serial: ABC12345').mode, ROUTE_MODES.PRECISION_RESEARCH);
  assert.equal(route('Dell laptop service tag ABC1234').mode, ROUTE_MODES.PRECISION_RESEARCH);
  const withNotes = route('Samsung Refrigerator', { userNotes: 'bought it used, label is faded' });
  assert.equal(withNotes.mode, ROUTE_MODES.PRECISION_RESEARCH);
  assert.ok(withNotes.reasons.includes('user-notes'));
});

test('uncertainty always resolves to PRECISION_RESEARCH, never to a refusal', () => {
  const modes = new Set(Object.values(ROUTE_MODES));
  // Missing signal fields (an older or foreign queryInfo) are not enough to be sure.
  assert.equal(chooseSmartLookupRoute({}).mode, ROUTE_MODES.PRECISION_RESEARCH);
  assert.equal(chooseSmartLookupRoute(undefined).mode, ROUTE_MODES.PRECISION_RESEARCH);
  for (const query of ['', 'asdfgh', 'x', '12345', '???', 'zzzz qqqq', 'Samsung Refrigerator']) {
    const decision = route(query);
    assert.ok(modes.has(decision.mode), `${JSON.stringify(query)} must map to one of the two modes`);
  }
});

test('the router has no model-number format table', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../lib/smart-lookup/route-mode.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\/\^?\[A-Z\]|\\d\{\d|new RegExp/, 'no model-format regexes in the router');
});
