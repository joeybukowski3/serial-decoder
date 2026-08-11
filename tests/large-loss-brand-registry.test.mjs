import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadLargeLossContext } from './helpers/large-loss-context.mjs';

const HTML_SOURCE = fs.readFileSync('large-loss-decoder.html', 'utf8');

test('large-loss-decoder.html has no hard-coded brand list', () => {
  assert.equal(HTML_SOURCE.includes('brandsByCategory'), false);
  assert.equal(/window\.decoders\??\./.test(HTML_SOURCE), false);
  assert.equal(HTML_SOURCE.includes('decoder-data.js'), true);
});

test('appliance brand list is derived from the canonical decoder-data registry', () => {
  const { LLD, ctx } = loadLargeLossContext();
  const lldOptions = LLD.getBrandOptions('appliances').map(o => o.name).sort();
  const canonicalOptions = ctx.getCategoryDropdownBrands('appliances').map(o => o.name).sort();
  assert.deepEqual(lldOptions, canonicalOptions);
  assert.ok(lldOptions.length > 20, 'expected far more than the old 8-brand hard-coded list');
});

test('Alliance and Speed Queen are automatically available in the appliance brand list', () => {
  const { LLD } = loadLargeLossContext();
  const names = LLD.getBrandOptions('appliances').map(o => o.name);
  assert.ok(names.includes('Alliance'), 'Alliance missing from Large Loss appliance brands');
  assert.ok(names.includes('Speed Queen'), 'Speed Queen missing from Large Loss appliance brands');
});

test('existing common brands remain available', () => {
  const { LLD } = loadLargeLossContext();
  const names = LLD.getBrandOptions('appliances').map(o => o.name);
  for (const brand of ['Samsung', 'LG', 'Whirlpool', 'GE', 'Maytag']) {
    assert.ok(names.includes(brand), `${brand} missing from Large Loss appliance brands`);
  }
});

test('a brand added to decoder-data.js becomes available without touching large-loss-decoder.html', () => {
  const { ctx } = loadLargeLossContext();
  // Simulate decoder-data.js gaining a brand new future appliance brand.
  vmAddFutureBrand(ctx);
  const options = ctx.getCategoryDropdownBrands('appliances');
  assert.ok(options.some(o => o.name === 'Future Test Brand'));
});

function vmAddFutureBrand(ctx) {
  vm.runInContext(`
    decoderData.appliances.brands.push({ id: 'future_test_brand', name: 'Future Test Brand' });
    decoderData.appliances.decoders.future_test_brand = {
      name: 'Future Test Brand',
      decode: function () { return { year: '2030', month: 'January' }; }
    };
    NORMALIZED_BRAND_CACHE = null;
  `, ctx);
}

test('each category exposes its own canonical brand list', () => {
  const { LLD } = loadLargeLossContext();
  const categories = ['appliances', 'waterHeaters', 'hvac', 'electronics'];
  const seen = categories.map(c => LLD.getBrandOptions(c));
  seen.forEach((options, i) => {
    assert.ok(options.length > 0, `${categories[i]} should have at least one brand`);
  });
  // Category lists must actually differ from each other (not one shared list).
  assert.notDeepEqual(seen[0].map(o => o.id).sort(), seen[2].map(o => o.id).sort());
});

test('changing a row category refreshes its available brands and clears an invalid selection', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  const row = LLD.rows[0];

  LLD.selectBrand(row.id, 'alliance', 'Alliance');
  assert.equal(row.brand, 'alliance');

  LLD.setCategory(row.id, 'hvac');
  assert.equal(row.category, 'hvac');
  assert.equal(row.brand, '', 'brand should be cleared: Alliance is not an HVAC brand');
  assert.equal(row.brandLabel, '');

  LLD.selectBrand(row.id, 'carrier', 'Carrier');
  LLD.setCategory(row.id, 'hvac');
  assert.equal(row.brand, 'carrier', 'brand should be retained when it is still valid for the (unchanged) category');
});

test('newly added rows (Add Row) receive the same category brand list as initial rows', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  LLD.addRow();
  const [firstRow, secondRow] = LLD.rows;
  const firstOptions = LLD.getBrandOptions(firstRow.category);
  const secondOptions = LLD.getBrandOptions(secondRow.category);
  assert.deepEqual(firstOptions, secondOptions);
  assert.ok(firstOptions.some(o => o.name === 'Alliance'));
});

test('brand search filters case-insensitively by substring', () => {
  const { LLD } = loadLargeLossContext();
  const options = LLD.getBrandOptions('appliances');

  const alli = LLD.filterBrandOptions(options, 'alli');
  assert.ok(alli.some(o => o.name === 'Alliance'));

  const speed = LLD.filterBrandOptions(options, 'speed');
  assert.ok(speed.some(o => o.name === 'Speed Queen'));

  const upper = LLD.filterBrandOptions(options, 'ALLI');
  assert.ok(upper.some(o => o.name === 'Alliance'));

  const none = LLD.filterBrandOptions(options, 'zzzznotabrand');
  assert.equal(none.length, 0);
});

test('Large Loss decode submission routes the canonical brand id through the shared decoder for Alliance', () => {
  const { LLD } = loadLargeLossContext();
  const result = LLD.buildDecodeResult({
    category: 'appliances',
    brand: 'alliance',
    era: '',
    serial: '1804053488',
    model: 'AWN63RSN115TW01',
  });
  assert.equal(result.error, undefined);
  assert.equal(result.year, '2018');
  assert.equal(result.month, 'April');
});

test('Large Loss decode submission routes the canonical brand id through the shared decoder for Speed Queen', () => {
  const { LLD } = loadLargeLossContext();
  const result = LLD.buildDecodeResult({
    category: 'appliances',
    brand: 'speed_queen',
    era: '',
    serial: '1804053488',
    model: 'AWN63RSN115TW01',
  });
  assert.equal(result.error, undefined);
  assert.equal(result.year, '2018');
  assert.equal(result.month, 'April');
});

test('an unselected brand yields a clear error instead of a silent/broken decode', () => {
  const { LLD } = loadLargeLossContext();
  const result = LLD.buildDecodeResult({
    category: 'appliances',
    brand: '',
    era: '',
    serial: '1804053488',
    model: '',
  });
  assert.equal(result.error, 'Please select a brand');
});
