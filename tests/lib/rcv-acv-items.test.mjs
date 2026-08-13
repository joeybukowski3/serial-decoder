import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIRMED_ITEMS, UNDETERMINED_ITEMS, OTHER_CUSTOM_ITEM, ALL_ITEMS, findRcvAcvItem } from '../../lib/calculators/rcv-acv-items.js';
import { calculateRcvAcv } from '../../lib/calculators/rcv-acv.js';

function byName(items, name) {
  return items.find((entry) => entry.item === name);
}

test('every confirmed item has a non-null, positive annual rate', () => {
  for (const item of CONFIRMED_ITEMS) {
    assert.equal(item.confidence, 'CONFIRMED');
    assert.equal(typeof item.annualDepreciationRate, 'number');
    assert.ok(item.annualDepreciationRate > 0, `${item.item} must have a positive rate`);
  }
});

test('every confirmed item carries a Claims Pages source name and a live https URL', () => {
  for (const item of CONFIRMED_ITEMS) {
    assert.match(item.sourceName, /Claims Pages/);
    assert.match(item.sourceUrl, /^https:\/\/www\.claimspages\.com\//);
    assert.equal(item.sourceStatus, 'current');
  }
});

test('no confirmed item source URL contains a malformed path (embedded slash mid-slug)', () => {
  for (const item of CONFIRMED_ITEMS) {
    const path = item.sourceUrl.replace('https://www.claimspages.com/tools/depreciation/', '');
    const segments = path.split('/').filter(Boolean);
    assert.equal(segments.length, 2, `${item.item} URL should be exactly group/slug, got: ${item.sourceUrl}`);
  }
});

test('no duplicate item ids across the whole dataset', () => {
  const ids = ALL_ITEMS.map((item) => item.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length);
});

test('no duplicate confirmed source URLs (each maps to a distinct Claims Pages item)', () => {
  const urls = CONFIRMED_ITEMS.map((item) => item.sourceUrl);
  const unique = new Set(urls);
  assert.equal(unique.size, urls.length);
});

test('confirmed and undetermined ids do not overlap', () => {
  const confirmedIds = new Set(CONFIRMED_ITEMS.map((item) => item.id));
  const undeterminedIds = new Set(UNDETERMINED_ITEMS.map((item) => item.id));
  for (const id of undeterminedIds) {
    assert.equal(confirmedIds.has(id), false, `${id} must not be in both CONFIRMED_ITEMS and UNDETERMINED_ITEMS`);
  }
});

test('every undetermined item has a null rate and a documented reason, never an invented rate', () => {
  for (const item of UNDETERMINED_ITEMS) {
    assert.equal(item.annualDepreciationRate, null);
    assert.equal(item.sourceName, null);
    assert.equal(item.confidence, 'UNDETERMINED');
    assert.ok(item.reason && item.reason.length > 0);
  }
});

test('Other / Custom has no rate and no source, requiring manual entry', () => {
  assert.equal(OTHER_CUSTOM_ITEM.annualDepreciationRate, null);
  assert.equal(OTHER_CUSTOM_ITEM.sourceName, null);
});

test('the reviewed undetermined categories from the task brief are present', () => {
  const expectedNames = [
    'Induction Range',
    'Wall Oven',
    'OLED Television',
    'Tablet',
    'Computer Monitor',
    'Soundbar',
    'Projector',
    'Mini-Split / Ductless HVAC',
    'Heat-Pump Water Heater',
    'Generator',
    'Pool Pump',
    'Hot Tub / Spa Equipment',
  ];
  for (const name of expectedNames) {
    assert.ok(byName(UNDETERMINED_ITEMS, name), `${name} should be in the undetermined dataset`);
  }
});

test('the four items demoted by the 2026-08 live source-integrity audit are undetermined, not confirmed', () => {
  const demotedNames = ['Shop Vacuum (Wet/Dry)', 'Smartphone (Apple iPhone)', 'Smartphone (Samsung)', 'Smartphone (Google)'];
  for (const name of demotedNames) {
    assert.ok(byName(UNDETERMINED_ITEMS, name), `${name} should be in the undetermined dataset`);
    assert.equal(byName(CONFIRMED_ITEMS, name), undefined, `${name} must not remain in the confirmed dataset`);
  }
});

test('findRcvAcvItem resolves a known id and returns null for an unknown one', () => {
  assert.equal(findRcvAcvItem(CONFIRMED_ITEMS[0].id).id, CONFIRMED_ITEMS[0].id);
  assert.equal(findRcvAcvItem('not-a-real-id'), null);
  assert.equal(findRcvAcvItem(''), null);
});

test('known value: Dishwasher is 10.00%/year from Claims Pages', () => {
  const item = byName(CONFIRMED_ITEMS, 'Dishwasher');
  assert.ok(item);
  assert.equal(item.annualDepreciationRate, 10.00);
});

test('known value: Washing Machine (Washer) is 8.33%/year from Claims Pages', () => {
  const item = byName(CONFIRMED_ITEMS, 'Washing Machine');
  assert.ok(item);
  assert.equal(item.annualDepreciationRate, 8.33);
});

test('known value: Electric Dryer is 7.69%/year from Claims Pages', () => {
  const item = byName(CONFIRMED_ITEMS, 'Electric Dryer');
  assert.ok(item);
  assert.equal(item.annualDepreciationRate, 7.69);
});

test('known value: Microwave Oven is 12.50%/year from Claims Pages', () => {
  const item = byName(CONFIRMED_ITEMS, 'Microwave Oven');
  assert.ok(item);
  assert.equal(item.annualDepreciationRate, 12.50);
});

test('known value: HDTV / Flat-Screen Television is 10.00%/year from Claims Pages', () => {
  const item = byName(CONFIRMED_ITEMS, 'HDTV / Flat-Screen Television');
  assert.ok(item);
  assert.equal(item.annualDepreciationRate, 10.00);
});

test('known value: Computer is 25.00%/year from Claims Pages', () => {
  const item = byName(CONFIRMED_ITEMS, 'Computer');
  assert.ok(item);
  assert.equal(item.annualDepreciationRate, 25.00);
});

test('audited correction: Garbage Disposal is 9.09%/year (was incorrectly 10.00%)', () => {
  assert.equal(byName(CONFIRMED_ITEMS, 'Garbage Disposal').annualDepreciationRate, 9.09);
});

test('audited correction: Ceiling Fan is 5.00%/year (was incorrectly 10.00%)', () => {
  assert.equal(byName(CONFIRMED_ITEMS, 'Ceiling Fan').annualDepreciationRate, 5.00);
});

test('audited correction: Robot Vacuum is 25.00%/year (was incorrectly 14.29%)', () => {
  assert.equal(byName(CONFIRMED_ITEMS, 'Robot Vacuum').annualDepreciationRate, 25.00);
});

test('a confirmed item loads its rate and flows correctly through the depreciation calculation', () => {
  const dishwasher = byName(CONFIRMED_ITEMS, 'Dishwasher');
  const result = calculateRcvAcv({
    replacementCost: 600,
    ageYears: 4,
    annualDepreciationRatePct: dishwasher.annualDepreciationRate,
    maxTotalDepreciationPct: 75,
    rateLabel: 'Claims Pages reference rate',
  });
  assert.equal(result.valid, true);
  assert.equal(result.rawDepreciationPct, 40);
  assert.match(result.detailText, /^Claims Pages reference rate: 10\.00%\/year × 4 years/);
});

test('changing items updates the rate correctly (selecting two different confirmed items yields two different rates)', () => {
  const dishwasher = byName(CONFIRMED_ITEMS, 'Dishwasher');
  const computer = byName(CONFIRMED_ITEMS, 'Computer');
  assert.notEqual(dishwasher.annualDepreciationRate, computer.annualDepreciationRate);
  assert.notEqual(dishwasher.sourceUrl, computer.sourceUrl);
});
