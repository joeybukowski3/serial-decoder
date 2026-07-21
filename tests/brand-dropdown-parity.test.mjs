import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadDecoderContext, setCurrentCategory } from './helpers/decoder-context.mjs';

const { api, ctx } = loadDecoderContext();

const CATEGORIES = ['appliances', 'hvac', 'waterHeaters', 'electronics'];

// A declared brand may be absent from the dropdown for exactly two legitimate
// reasons. Everything else is a defect.
//
//   1. INTENTIONAL ERA COLLAPSE -- the pre-2006 and post-2006 rows of one brand
//      merge into a single consumer option that then prompts for an era. The
//      brand IS reachable; only the extra row is gone.
//
//   2. INTENTIONAL EVIDENCE-BASED EXCLUSION -- the brand is deliberately not
//      offered because we cannot stand behind routing it to its decoder. The
//      brand is NOT reachable, and that is the point. Read from production so
//      the exclusion list has one home; a brand silently dropped without being
//      listed there still fails.
//
//   3. Anything else -- an unreachable-brand defect, which is what shipped for
//      Hotpoint, GE Profile, GE Monogram and Samsung TVs.
const INTENTIONAL_ERA_COLLAPSE = new Set([
  'admiral_post_2006', 'admiral_pre_2006',
  'amana_post_2006', 'amana_pre_2006',
  'jenn_air_post_2006', 'jenn_air_pre_2006',
  'maytag_post_2006', 'maytag_pre_2006'
]);

function excludedBrands(category) {
  return api.BRAND_DROPDOWN_EXCLUSIONS[category] || {};
}

function isEraCollapsed(entry) {
  return (entry.decoderIds || []).every((id) => INTENTIONAL_ERA_COLLAPSE.has(id));
}

function dropdownIds(category) {
  return api.getCategoryDropdownBrands(category).map((option) => option.id);
}

// An option represents a brand when it carries that brand's own id, or when it
// is a cycling option that owns one of the brand's decoders (Admiral's two era
// rows both render as the single "admiral" option, and "LG" renders under the
// "lg_tv" cycling key). Comparing raw ids would flag those legitimate renames.
function representsEntry(category, optionId, entry) {
  if (optionId === entry.id) return true;
  const mapping = (api.CYCLING_BRANDS[category] || {})[optionId];
  if (!mapping) return false;
  return ['single', 'pre', 'post']
    .map((slot) => mapping[slot])
    .some((decoderId) => decoderId && (entry.decoderIds || []).includes(decoderId));
}

test('every declared brand is reachable unless collapsed by era or excluded on purpose', () => {
  const missing = [];

  for (const category of CATEGORIES) {
    const shown = dropdownIds(category);
    const excluded = excludedBrands(category);

    for (const entry of api.getNormalizedBrandCatalog().byCategory[category] || []) {
      if (isEraCollapsed(entry)) continue;
      if (Object.prototype.hasOwnProperty.call(excluded, entry.id)) continue;
      if (!shown.some((optionId) => representsEntry(category, optionId, entry))) {
        missing.push(`${category}: ${entry.name} [${entry.id}] -> decoders ${JSON.stringify(entry.decoderIds)}`);
      }
    }
  }

  assert.deepEqual(missing, [], `Declared brands missing from the dropdown:\n${missing.join('\n')}`);
});

test('intentionally excluded brands are absent, documented, and really declared', () => {
  for (const category of CATEGORIES) {
    const shown = dropdownIds(category);
    const declared = new Set((api.getNormalizedBrandCatalog().byCategory[category] || []).map((e) => e.id));

    for (const [brandId, reason] of Object.entries(excludedBrands(category))) {
      assert.ok(
        declared.has(brandId),
        `${category}: "${brandId}" is excluded but no longer exists as a brand -- drop the stale exclusion`
      );
      assert.ok(
        !shown.includes(brandId),
        `${category}: "${brandId}" is on the exclusion list but still rendered as an option`
      );
      assert.ok(
        typeof reason === 'string' && reason.trim().length >= 40,
        `${category}: "${brandId}" needs a written justification, got ${JSON.stringify(reason)}`
      );
    }
  }
});

test('RCA stays excluded pending category, era and OEM evidence', () => {
  const excluded = excludedBrands('appliances');

  assert.ok('rca' in excluded, 'RCA must remain on the documented exclusion list');
  assert.ok(!dropdownIds('appliances').includes('rca'), 'RCA must not be selectable');
  assert.match(excluded.rca, /evidence|sourcing/i, 'the RCA exclusion should say what evidence is missing');
});

test('every decoder is reachable from some dropdown option, or its brand is excluded', () => {
  const unreachable = [];

  for (const category of CATEGORIES) {
    const catalog = api.getNormalizedBrandCatalog().byCategory[category] || [];
    const excluded = excludedBrands(category);
    const reachable = new Set();

    for (const optionId of dropdownIds(category)) {
      const entry = catalog.find((e) => e.id === optionId);
      if (entry) (entry.decoderIds || []).forEach((id) => reachable.add(id));
      const mapping = (api.CYCLING_BRANDS[category] || {})[optionId];
      if (mapping) ['single', 'pre', 'post'].forEach((slot) => mapping[slot] && reachable.add(mapping[slot]));
    }

    // A decoder only reached via an excluded brand is intentionally dormant.
    const viaExcluded = new Set(
      catalog.filter((e) => Object.prototype.hasOwnProperty.call(excluded, e.id))
        .flatMap((e) => e.decoderIds || [])
    );

    for (const decoderId of Object.keys(api.decoderData[category].decoders)) {
      if (!reachable.has(decoderId) && !viaExcluded.has(decoderId)) {
        unreachable.push(`${category}: ${decoderId}`);
      }
    }
  }

  assert.deepEqual(unreachable, [], `Decoders no dropdown option can select:\n${unreachable.join('\n')}`);
});

test('Samsung electronics labels are not narrower than what their decoders cover', () => {
  const options = api.getCategoryDropdownBrands('electronics');
  const tv = options.find((o) => o.id === 'samsung_tv');
  const phone = options.find((o) => o.id === 'samsung_phone');

  // The samsung_tv decoder documents monitors alongside TVs, so a "(TVs)" label
  // would understate its coverage and push monitor owners toward Smart Lookup.
  assert.match(api.decoderData.electronics.decoders.samsung_tv.notes, /monitor/i);
  assert.equal(tv.name, 'Samsung (TVs & Monitors)');
  assert.equal(phone.name, 'Samsung (Phones & Tablets)');
});

test('dropdown option counts hold steady per category', () => {
  assert.equal(dropdownIds('appliances').length, 52);
  assert.equal(dropdownIds('hvac').length, 11);
  assert.equal(dropdownIds('waterHeaters').length, 18);
  assert.equal(dropdownIds('electronics').length, 10);
});

test('GE-family sub-brands are individually selectable and are not folded into GE', () => {
  const shown = dropdownIds('appliances');

  // RCA is deliberately absent -- see the exclusion tests above.
  for (const id of ['ge', 'hotpoint', 'ge_profile', 'ge_monogram', 'cafe']) {
    assert.ok(shown.includes(id), `expected "${id}" in the appliances dropdown, got: ${shown.join(', ')}`);
  }
});

test('Samsung TV and Samsung phone decoders are both reachable in electronics', () => {
  const shown = dropdownIds('electronics');

  assert.ok(shown.includes('samsung_tv'), `samsung_tv missing from electronics dropdown: ${shown.join(', ')}`);
  assert.ok(shown.includes('samsung_phone'), `samsung_phone missing from electronics dropdown: ${shown.join(', ')}`);
});

test('GE-family brands route to the GE decoder', () => {
  setCurrentCategory(ctx, 'appliances');

  for (const id of ['hotpoint', 'ge_profile', 'ge_monogram']) {
    assert.equal(api.resolveDecoderId(id), 'ge', `${id} should decode with the GE-family decoder`);
  }

  // RCA's routing stays wired but dormant behind the exclusion, so lifting the
  // exclusion once the evidence exists is a one-line change, not a rebuild.
  assert.equal(api.resolveDecoderId('rca'), 'ge');
});

test('result branding preserves the selected consumer brand, never relabels it GE', () => {
  setCurrentCategory(ctx, 'appliances');

  const hotpoint = api.getResultBrandDisplayName('hotpoint', 'Hotpoint', null);
  assert.match(hotpoint, /^Hotpoint\b/, `expected the Hotpoint label to survive, got "${hotpoint}"`);
  assert.match(hotpoint, /GE family decoding/, 'the shared-decoder method should be disclosed');
  assert.notEqual(hotpoint, 'GE');
});

test('every CYCLING_BRANDS decoder reference points at a real decoder', () => {
  const dangling = [];

  for (const category of CATEGORIES) {
    const decoders = api.decoderData[category].decoders;
    const config = api.CYCLING_BRANDS[category] || {};

    for (const [brandId, mapping] of Object.entries(config)) {
      for (const slot of ['single', 'pre', 'post']) {
        const decoderId = mapping[slot];
        if (decoderId && !decoders[decoderId]) {
          dangling.push(`${category}.${brandId}.${slot} -> "${decoderId}" (no such decoder)`);
        }
      }
    }
  }

  assert.deepEqual(dangling, [], `CYCLING_BRANDS references missing decoders:\n${dangling.join('\n')}`);
});

test('MOST_COMMON_APPLIANCE_BRANDS only promotes brands that exist in the dropdown', () => {
  const shown = new Set(dropdownIds('appliances'));
  const orphaned = Object.keys(api.MOST_COMMON_APPLIANCE_BRANDS).filter((id) => !shown.has(id));

  assert.deepEqual(orphaned, [], `"Most Common" promotes brands the dropdown never renders: ${orphaned.join(', ')}`);
});

test('every data-prefill-brand in shipped HTML matches a real dropdown option', () => {
  const allIds = new Set(CATEGORIES.flatMap((category) => dropdownIds(category)));
  const broken = [];

  for (const file of fs.readdirSync('.').filter((name) => name.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/data-prefill-brand="([^"]*)"/g)) {
      if (match[1] && !allIds.has(match[1])) {
        broken.push(`${file}: data-prefill-brand="${match[1]}"`);
      }
    }
  }

  assert.deepEqual(broken, [], `Landing pages prefill brand values that no dropdown option uses:\n${broken.join('\n')}`);
});

test('brand directory prefill values match real dropdown options', () => {
  const broken = [];

  for (const item of api.getBrandDirectoryItems()) {
    const category = item.prefillCat;
    if (!category) continue;
    const shown = new Set(dropdownIds(category));
    if (item.prefillBrand && !shown.has(item.prefillBrand)) {
      broken.push(`${item.name} [${item.slug}] -> ${category}:${item.prefillBrand}`);
    }
  }

  assert.deepEqual(broken, [], `Brand directory entries prefill unselectable brands:\n${broken.join('\n')}`);
});
