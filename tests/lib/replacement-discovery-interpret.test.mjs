import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretReplacementSearch } from '../../lib/replacement-discovery/interpret.js';

const interpret = (query, notes = '') => interpretReplacementSearch({ query, notes });
const fact = (result, key) => result.normalizedOriginal.facts[key];

test('55 Samsung QLED TV preserves explicit identity and unknown exact model', () => {
  const result = interpret('55 Samsung QLED TV');
  assert.deepEqual(result.detectedCategory, { value: 'television', status: 'KNOWN' });
  assert.deepEqual([fact(result, 'brand').value, fact(result, 'screenSizeIn').value, fact(result, 'displayTechnology').value], ['Samsung', 55, 'QLED']);
  assert.equal(fact(result, 'model'), undefined);
  assert.ok(result.unknownImportantFacts.some((item) => item.key === 'model' && item.status === 'UNKNOWN'));
  assert.equal(fact(result, 'tier').status, 'ASSUMED');
  assert.equal(result.candidateDiscoveryHints.minimumTier.status, 'ASSUMED');
  assert.equal(result.candidateDiscoveryHints.minimumResolution, null);
  assert.match(result.searchTermsForDiscovery[0], /Samsung 55 QLED/);
});

test('LG side by side refrigerator retains known configuration and unknown capacity and fit', () => {
  const result = interpret('LG side by side refrigerator');
  assert.deepEqual(result.detectedCategory, { value: 'refrigerator', status: 'KNOWN' });
  assert.equal(fact(result, 'brand').status, 'KNOWN');
  assert.equal(fact(result, 'configurationFloor').value, 'SIDE_BY_SIDE');
  assert.equal(fact(result, 'configurationFloor').status, 'KNOWN');
  assert.equal(result.candidateDiscoveryHints.minimumCapacity, null);
  assert.ok(result.unknownImportantFacts.some((item) => item.key === 'totalCapacityCuFt'));
  assert.ok(result.unknownImportantFacts.some((item) => item.key === 'physicalFit'));
});

test('existing family registry recognizes Samsung QN55Q80 without inventing resolution or refresh', () => {
  const result = interpret('Samsung QN55Q80');
  assert.equal(result.replacementPrecision, 'exact-model');
  assert.equal(fact(result, 'model').value, 'QN55Q80');
  assert.equal(fact(result, 'family').value, 'Q80 Series');
  assert.equal(fact(result, 'family').status, 'INFERRED');
  assert.equal(fact(result, 'screenSizeIn').status, 'INFERRED');
  assert.equal(fact(result, 'resolution'), undefined);
  assert.equal(fact(result, 'refreshHz'), undefined);
});

test('OLED category inference and explicit Whirlpool capacity, layout and finish', () => {
  const oled = interpret('65 inch LG OLED');
  assert.deepEqual(oled.detectedCategory, { value: 'television', status: 'INFERRED' });
  assert.equal(fact(oled, 'screenSizeIn').value, 65);
  const fridge = interpret('Whirlpool 25 cu ft French door stainless refrigerator');
  assert.equal(fact(fridge, 'totalCapacityCuFt').value, 25);
  assert.equal(fact(fridge, 'configurationFloor').value, 'FRENCH_DOOR');
  assert.equal(fact(fridge, 'finish').value, 'stainless');
  assert.equal(fact(fridge, 'tier').status, 'ASSUMED');
});

test('explicit notes become known facts while conflicting capacities remain ambiguous', () => {
  const full = interpret('55 Samsung QLED TV', 'tier: premium; physical fit: yes; 4K; 120 Hz; HDR10+');
  assert.equal(fact(full, 'tier').status, 'KNOWN');
  assert.equal(fact(full, 'physicalFit').value, true);
  assert.equal(fact(full, 'resolution').value, '4K');
  assert.equal(fact(full, 'hdr').value, 'HDR10+');
  const conflict = interpret('LG 25 cu ft side by side refrigerator', '27 cu ft');
  assert.equal(fact(conflict, 'totalCapacityCuFt').status, 'AMBIGUOUS');
  assert.deepEqual(fact(conflict, 'totalCapacityCuFt').alternatives, [25, 27]);
});

test('unsupported and empty queries fail explicitly without inventing candidates', () => {
  assert.throws(() => interpret(''), /nonempty/);
  assert.throws(() => interpret('Whirlpool range'), /supports only/);
});
