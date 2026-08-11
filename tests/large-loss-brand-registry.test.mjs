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

test('the brand input has a specificity-safe color rule for every state (idle, hover, focus, autofill)', () => {
  // shared.css ships a site-wide `input[type=text], select, textarea { color:
  // #1a2d42 }` rule whose specificity (0,1,1) beats a single-class
  // `.lld-input` selector (0,1,0). The visible symptom: once :focus flips the
  // background back to dark navy, the still-dark-navy text becomes
  // unreadable. The fix must out-specify shared.css on the two-class
  // selector `input.lld-input.lld-brand-input` (0,2,0), not just add another
  // single-class rule that would tie (and lose on source order fragility).
  const styleBlock = HTML_SOURCE.slice(HTML_SOURCE.indexOf('<style>'), HTML_SOURCE.indexOf('</style>'));

  assert.match(styleBlock, /input\.lld-input\.lld-brand-input\s*(,|\{)/, 'expected a two-class selector strong enough to beat shared.css');
  assert.match(styleBlock, /input\.lld-input\.lld-brand-input:focus\s*\{[^}]*color\s*:/s, 'focused brand input must explicitly set color');
  assert.match(styleBlock, /input\.lld-input\.lld-brand-input::placeholder\s*\{[^}]*color\s*:/s, 'placeholder must be styled separately from typed/selected text');
  assert.match(styleBlock, /input\.lld-input\.lld-brand-input:-webkit-autofill/, 'autofill state must be handled so Chrome cannot silently darken the text');
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
