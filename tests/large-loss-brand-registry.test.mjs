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

function fakeBrandInput(value) {
  return {
    value,
    setAttribute() {},
    removeAttribute() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 40, right: 100, width: 100, height: 40 }),
  };
}

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

test('Large Loss rejects unsupported, invalid, and unknown decoder outcomes as row errors', () => {
  const { LLD } = loadLargeLossContext();

  const unsupported = LLD.buildDecodeResult({
    category: 'hvac',
    brand: 'carrier',
    brandLabel: 'Carrier',
    era: '',
    serial: 'AB1234567',
    model: '',
  });
  assert.ok(unsupported.error, 'unsupported serial must not succeed');
  assert.match(String(unsupported.error), /No result from decoder|Decoding failed|Sanity check/i);

  const impossibleFuture = LLD.buildDecodeResult({
    category: 'hvac',
    brand: 'carrier',
    brandLabel: 'Carrier',
    era: '',
    // Week 12 / year code 34 → 2034; rejected by Carrier and/or sanitizer.
    serial: '1234567890',
    model: '',
  });
  assert.ok(impossibleFuture.error, 'impossible future year must be a row error');

  const unknownMonth = LLD.buildDecodeResult({
    category: 'waterHeaters',
    brand: 'richmond',
    brandLabel: 'Richmond',
    era: '',
    // Force a classified incomplete outcome by stubbing decode after brand resolve
    // is not practical; instead use a known incomplete classifier payload path
    // through a serial that fails format rather than inventing success ages.
    serial: 'ZZZZZZZZ',
    model: '',
  });
  assert.ok(unknownMonth.error, 'unknown/unsupported Richmond serial must be a row error');
});

test('Large Loss still surfaces complete successes and multi-year ambiguous ages', () => {
  const { LLD } = loadLargeLossContext();

  const complete = LLD.buildDecodeResult({
    category: 'hvac',
    brand: 'carrier',
    brandLabel: 'Carrier',
    era: '',
    serial: '1419XXXXX',
    model: '',
  });
  assert.equal(complete.error, undefined);
  assert.equal(complete.year, '2019');
  assert.equal(complete.month, 'Week 14');
  assert.equal(complete.classification, 'complete_success');

  const ambiguous = LLD.buildDecodeResult({
    category: 'appliances',
    brand: 'ge',
    brandLabel: 'GE',
    era: '',
    serial: 'GM028928Q',
    model: '',
  });
  assert.equal(ambiguous.error, undefined, 'ambiguous multi-year ages remain displayable');
  assert.match(String(ambiguous.year), /\//);
});

test('keyboard navigation (ArrowDown then Enter) selects a brand and stores its canonical id', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  const row = LLD.rows[0];
  const inputEl = fakeBrandInput('sam');

  // Opens the listbox and filters, mirroring what onBrandInput does.
  LLD.openBrandListbox(row.id, inputEl, 'sam');
  assert.ok(LLD.activeBrandOptions.length > 0, 'expected at least one match for "sam"');

  let prevented = 0;
  const downEvent = { key: 'ArrowDown', target: inputEl, preventDefault: () => { prevented++; } };
  LLD.onBrandKeydown(row.id, downEvent);
  assert.equal(LLD.activeBrandIndex, 0);

  const enterEvent = { key: 'Enter', target: inputEl, preventDefault: () => { prevented++; } };
  LLD.onBrandKeydown(row.id, enterEvent);

  assert.ok(row.brand, 'Enter should have committed a brand selection');
  assert.equal(row.brandLabel.toLowerCase().includes('sam'), true);
  assert.ok(prevented >= 2, 'ArrowDown and Enter should both preventDefault to avoid page scroll/submit');
});

test('Escape closes the listbox without changing the row brand', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  const row = LLD.rows[0];
  LLD.selectBrand(row.id, 'alliance', 'Alliance');

  const inputEl = fakeBrandInput('sam');
  LLD.openBrandListbox(row.id, inputEl, 'sam');
  assert.equal(LLD.getBrandListboxEl().hidden, false);

  const escEvent = { key: 'Escape', target: inputEl, preventDefault: () => {} };
  LLD.onBrandKeydown(row.id, escEvent);

  assert.equal(LLD.getBrandListboxEl().hidden, true);
  assert.equal(row.brand, 'alliance', 'Escape must not clear an already-committed selection');
});

test('every Large Loss text input has a specificity-safe color rule for every state (idle, hover, focus, autofill)', () => {
  // shared.css ships a site-wide `input[type=text], select, textarea { color:
  // #1a2d42 }` rule whose specificity (0,1,1) beats a single-class
  // `.lld-input` selector (0,1,0). The visible symptom: once :focus flips the
  // background back to dark navy, the still-dark-navy text becomes
  // unreadable. This affects EVERY .lld-input text field (brand search,
  // serial, model), not just brand, so the fix is centralized on
  // `input.lld-input[type="text"]` (0,2,1), which out-specifies shared.css
  // regardless of source order and covers all three fields with one rule.
  const styleBlock = HTML_SOURCE.slice(HTML_SOURCE.indexOf('<style>'), HTML_SOURCE.indexOf('</style>'));

  const selector = /input\.lld-input\[type="text"\]/;
  assert.match(styleBlock, selector, 'expected a centralized, specificity-safe selector strong enough to beat shared.css');
  assert.match(styleBlock, /input\.lld-input\[type="text"\]:focus\s*\{[^}]*color\s*:/s, 'focused text inputs must explicitly set color');
  assert.match(styleBlock, /input\.lld-input\[type="text"\]::placeholder\s*\{[^}]*color\s*:/s, 'placeholder must be styled separately from typed/selected text');
  assert.match(styleBlock, /input\.lld-input\[type="text"\]:-webkit-autofill/, 'autofill state must be handled so Chrome cannot silently darken the text');

  // The centralized rule must actually apply to all three fields, not just
  // brand: confirm the markup gives serial/model/brand the classes+type the
  // CSS selector targets.
  assert.match(HTML_SOURCE, /id="serial-\$\{rowData\.id\}"/, 'serial input markup not found');
  assert.match(HTML_SOURCE, /id="model-\$\{rowData\.id\}"/, 'model input markup not found');
  for (const idPrefix of ['serial-', 'model-', 'brand-input-']) {
    const idx = HTML_SOURCE.indexOf(`id="${idPrefix}\${rowData.id}"`);
    assert.ok(idx > -1, `${idPrefix} input markup not found`);
    const tagStart = HTML_SOURCE.lastIndexOf('<input', idx);
    const tagEnd = HTML_SOURCE.indexOf('>', idx);
    const tag = HTML_SOURCE.slice(tagStart, tagEnd);
    assert.match(tag, /type="text"/, `${idPrefix} input must be type="text" for the centralized selector to apply`);
    assert.match(tag, /class="[^"]*\blld-input\b/, `${idPrefix} input must carry the lld-input class`);
  }
});

test('the floating brand listbox has a bounded height with vertical scroll enabled', () => {
  const styleBlock = HTML_SOURCE.slice(HTML_SOURCE.indexOf('<style>'), HTML_SOURCE.indexOf('</style>'));
  const listboxRuleMatch = styleBlock.match(/\.lld-brand-listbox\s*\{([^}]*)\}/s);
  assert.ok(listboxRuleMatch, '.lld-brand-listbox rule not found');
  const rule = listboxRuleMatch[1];
  assert.match(rule, /max-height\s*:/, 'listbox must have a bounded max-height rather than growing indefinitely');
  assert.match(rule, /overflow-y\s*:\s*auto/, 'listbox must allow vertical scrolling');
});

test('scrolling the listbox itself does not close it (window scroll-capture must ignore internal scroll)', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  const row = LLD.rows[0];
  const inputEl = fakeBrandInput('');

  LLD.openBrandListbox(row.id, inputEl, '');
  const listbox = LLD.getBrandListboxEl();
  assert.equal(listbox.hidden, false);

  // A scroll event whose target IS the listbox (what happens when the user
  // scrolls the list with a wheel/trackpad/touch) must be ignored, not
  // treated as a page scroll that closes the dropdown.
  LLD.handleWindowScroll({ target: listbox });
  assert.equal(listbox.hidden, false, 'scrolling the listbox itself must not close it');
  assert.equal(LLD.activeBrandRowId, row.id, 'the active row must remain tracked after an internal scroll');
});

test('scrolling the page (not the listbox) repositions rather than silently breaking', () => {
  const { LLD, idRegistry } = loadLargeLossContext();
  LLD.addRow();
  const row = LLD.rows[0];
  const inputEl = fakeBrandInput('');
  // renderRow() builds the real brand input via an innerHTML template
  // string, which this lightweight mock (unlike jsdom) never parses back
  // into queryable nodes. Registering the fake input under the same id the
  // real markup would use lets handleWindowScroll's
  // document.getElementById(`brand-input-${rowId}`) find it, matching what
  // happens in an actual browser.
  idRegistry.set(`brand-input-${row.id}`, inputEl);

  LLD.openBrandListbox(row.id, inputEl, '');
  const listbox = LLD.getBrandListboxEl();

  const pageScrollTarget = { contains: () => false };
  LLD.handleWindowScroll({ target: pageScrollTarget });

  assert.equal(listbox.hidden, false, 'a page scroll while a row is active should reposition, not close, the listbox');
});

// ---- Kenmore manufacturer-prefix routing ----
// large-loss-decoder.html must NOT declare its own prefix table -- everything
// below is reused from script.js's canonical KENMORE_PREFIX_TO_DECODER /
// getKenmorePrefixDropdownOptions / resolveKenmoreDecoderFromPrefix, the same
// source the main Serial Number Decoder uses.

test('large-loss-decoder.html does not declare a second Kenmore prefix table', () => {
  assert.equal(/KENMORE_PREFIX_TO_DECODER\s*=\s*\{/.test(HTML_SOURCE), false, 'Large Loss must reuse script.js\'s table, not declare its own');
});

test('Kenmore prefix options come from the canonical getKenmorePrefixDropdownOptions() source', () => {
  const { LLD, ctx } = loadLargeLossContext();
  const lldOptions = LLD.getKenmorePrefixOptions();
  const canonicalOptions = ctx.getKenmorePrefixDropdownOptions();
  assert.deepEqual(lldOptions, canonicalOptions);
  assert.ok(lldOptions.length > 5, 'expected the real multi-manufacturer prefix table, not a stub');
  assert.ok(lldOptions.some(o => o.value === '110' && /Whirlpool/.test(o.label)));
});

test('selecting Kenmore reveals per-row prefix requirement; other brands do not need one', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  const row = LLD.rows[0];

  assert.equal(LLD.isKenmoreBrand('kenmore'), true);
  assert.equal(LLD.isKenmoreBrand('ge'), false);

  LLD.selectBrand(row.id, 'kenmore', 'Kenmore');
  assert.equal(row.brand, 'kenmore');
  assert.equal(row.kenmorePrefix, '', 'prefix starts unset until the user picks one');
});

test('decoding Kenmore without a prefix fails with a clear validation message instead of an ambiguous/broken result', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  const row = LLD.rows[0];
  LLD.selectBrand(row.id, 'kenmore', 'Kenmore');
  row.serial = '5K0752357';

  const result = LLD.buildDecodeResult(row);
  assert.match(result.error, /manufacturer prefix/i);
  assert.match(result.error, /Kenmore/i);
});

test('decoding Kenmore with an unrecognized prefix value is also rejected (no silent default)', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  const row = LLD.rows[0];
  LLD.selectBrand(row.id, 'kenmore', 'Kenmore');
  row.serial = '5K0752357';
  row.kenmorePrefix = '999'; // not a real entry in KENMORE_PREFIX_TO_DECODER

  const result = LLD.buildDecodeResult(row);
  assert.match(result.error, /manufacturer prefix/i);
});

test('selecting a valid Kenmore prefix routes to the expected underlying OEM decoder (regression: serial 5K0752357)', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  const row = LLD.rows[0];
  LLD.selectBrand(row.id, 'kenmore', 'Kenmore');
  row.serial = '5K0752357';
  row.kenmorePrefix = '110'; // Whirlpool-built Kenmore

  const result = LLD.buildDecodeResult(row);
  assert.equal(result.error, undefined);
  assert.equal(result.year, '2000');
  assert.equal(result.brandDisplay, 'Kenmore (OEM: Whirlpool)');
});

test('a different Kenmore prefix routes to a different OEM decoder', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  const row = LLD.rows[0];
  LLD.selectBrand(row.id, 'kenmore', 'Kenmore');
  // LG-format serial (year digit + MM month). Whirlpool-format serials used with
  // the LG prefix classify as incomplete/unknown and are correctly rejected by
  // the shared sanitizer rather than shown as successful ages.
  row.serial = '401KR12345';
  row.kenmorePrefix = '795'; // LG-built Kenmore

  const result = LLD.buildDecodeResult(row);
  assert.equal(result.error, undefined);
  assert.equal(result.brandDisplay, 'Kenmore (OEM: LG)');
  assert.match(String(result.year), /2004|2014|2024/);
});

test('Kenmore LG-prefix with a non-LG serial is a row error, not a fake age', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  const row = LLD.rows[0];
  LLD.selectBrand(row.id, 'kenmore', 'Kenmore');
  row.serial = '5K0752357'; // Whirlpool-format serial
  row.kenmorePrefix = '795'; // LG-built Kenmore

  const result = LLD.buildDecodeResult(row);
  assert.ok(result.error, 'unknown/incomplete LG decode must surface as a row error');
  assert.match(String(result.error), /incomplete|unknown|No result|Sanity|Decoding failed/i);
});

test('Kenmore prefix state is independent per row', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  LLD.addRow();
  const [rowA, rowB] = LLD.rows;

  LLD.selectBrand(rowA.id, 'kenmore', 'Kenmore');
  rowA.kenmorePrefix = '110';
  LLD.selectBrand(rowB.id, 'kenmore', 'Kenmore');
  rowB.kenmorePrefix = '795';

  assert.equal(rowA.kenmorePrefix, '110');
  assert.equal(rowB.kenmorePrefix, '795', 'row B must not have been affected by row A\'s prefix');
});

test('changing a Kenmore row to a different brand clears its stale prefix', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  const row = LLD.rows[0];
  LLD.selectBrand(row.id, 'kenmore', 'Kenmore');
  row.kenmorePrefix = '110';

  LLD.selectBrand(row.id, 'ge', 'GE');
  assert.equal(row.brand, 'ge');
  assert.equal(row.kenmorePrefix, '', 'prefix must not linger once the brand is no longer Kenmore');
});

test('newly added rows behave identically for Kenmore prefix handling', () => {
  const { LLD } = loadLargeLossContext();
  LLD.addRow();
  LLD.addRow();
  const [firstRow, secondRow] = LLD.rows;

  LLD.selectBrand(firstRow.id, 'kenmore', 'Kenmore');
  LLD.selectBrand(secondRow.id, 'kenmore', 'Kenmore');
  firstRow.serial = '5K0752357';
  secondRow.serial = '5K0752357';
  firstRow.kenmorePrefix = '110';
  secondRow.kenmorePrefix = '110';

  const resultA = LLD.buildDecodeResult(firstRow);
  const resultB = LLD.buildDecodeResult(secondRow);
  assert.deepEqual(resultA, resultB);
});
