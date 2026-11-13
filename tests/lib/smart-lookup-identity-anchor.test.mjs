import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retrievalFirstLookup, isFamilyOfIdentifier, isSiblingIdentifierShape, namesAsAlias,
} from '../../lib/smart-lookup/retrieval-first.js';
import { classifySmartLookupQuery } from '../../lib/smart-lookup/normalize.js';
import { isSmartAgeProductCompatible, matchesOnlyByFormatting, withoutYearClaims } from '../../lib/smart-lookup/age-identity.js';

// Production diagnostic audit, Nov 9-12 2026: the provider found a supported
// product but post-provider identity validation rejected it. Positive cases
// must survive with the user's code still anchored; every negative control is a
// genuine neighbour SKU that must stay rejected even when a retrieved row names it.
const row = (title, domain, snippet = title) => ({ title, snippet, url: `https://${domain}/item` });

function synthesis(fields) {
  return { identified: true, identifierType: 'model', identityConfidence: 'medium', identityBasis: 'Matching results',
    needsMoreDetail: false, refinementSuggestion: null, introductionYearConfidence: 'medium',
    introductionYearReason: 'Model-era estimate', introductionYearEvidence: null, ...fields };
}

async function validate(query, rows, fields) {
  const report = await retrievalFirstLookup(query, { searchImpl: async () => rows,
    synthesisImpl: async () => ({ ok: true, requestCount: 1, result: synthesis(fields) }) });
  assert.equal(report.geminiRequestCount, 1);
  assert.ok(report.serperRequestCount <= 2);
  return report.validation;
}

const SAMSUNG_ROWS = [
  row('Samsung UN65RU800DFXZA 65" Class RU800D 4K UHD TV', 'samsung.com', 'Order code UN65RU800DFXZA, model UN65RU800D.'),
  row('Samsung UN65RU800DFXZA television', 'bestbuy.com'),
];
const anchored = (code) => ({ exactModel: code, originalIdentifier: code });

const accepted = [
  ['A2901 -> descriptive Mac Studio', 'A2901', [row('Apple Mac Studio A2901 desktop computer', 'apple.com'), row('Apple A2901 Mac Studio support', 'support.example')],
    { brand: 'Apple', model: 'Mac Studio', ...anchored('A2901'), productType: 'desktop computer', likelyProduct: 'Apple Mac Studio desktop computer', estimatedIntroductionYear: 2023 },
    'Mac Studio', 'descriptive'],
  ['20GSBB-6714A -> descriptive RS20A', 'Cummins Onan RS20A model 20GSBB-6714A',
    [row('Cummins Onan RS20A 20GSBB-6714A standby generator', 'cummins.com'), row('Cummins 20GSBB-6714A generator parts', 'parts.example')],
    { brand: 'Cummins Onan', model: 'RS20A', ...anchored('20GSBB-6714A'), productType: 'generator', likelyProduct: 'Cummins Onan RS20A 20 kW generator', estimatedIntroductionYear: 2012 },
    'RS20A', 'descriptive'],
  ['UN65RU800DFXZA -> family UN65RU800D', 'UN65RU800DFXZA', SAMSUNG_ROWS,
    { brand: 'Samsung', model: 'UN65RU800D', ...anchored('UN65RU800DFXZA'), productType: 'television', likelyProduct: 'Samsung 65-inch RU800D 4K UHD Smart TV', estimatedIntroductionYear: 2019 },
    'UN65RU800D', 'family'],
  ['UN65RU800DFXZA -> short family RU800D', 'UN65RU800DFXZA', SAMSUNG_ROWS,
    { brand: 'Samsung', model: 'RU800D', ...anchored('UN65RU800DFXZA'), productType: 'television', likelyProduct: 'Samsung RU800D 4K UHD Smart TV', estimatedIntroductionYear: 2019 },
    'RU800D', 'family'],
  // Confirmed false rejection (externally verified in review): JVC documentation
  // ties HA-B5T to model EBT1-21044 and FCC ID 2ATF51604783. Accepted only
  // because a retrieved row carries that relationship -- HA-B5T is not hard-coded.
  ['EBT1-21044 -> JVC HA-B5T tied to it by a retrieved row', 'EBT1-21044',
    [row('JVC HA-B5T True Wireless Earbuds', 'fccid.example', 'JVC HA-B5T, Model EBT1-21044, FCC ID 2ATF51604783'), row('EBT1-21044 JVC earbuds', 'support.example')],
    { brand: 'JVC', model: 'HA-B5T', ...anchored('EBT1-21044'), productType: 'earbuds', likelyProduct: 'JVC HA-B5T true wireless earbuds', estimatedIntroductionYear: 2021 },
    'HA-B5T', 'evidence-alias'],
  ['GDF550PGR7WW -> GE base model named beside it in a retrieved row', 'GDF550PGR7WW',
    [row('GE GDF550PGR7WW dishwasher parts', 'partselect.ca', 'Parts for GE dishwasher GDF550PGR7WW (GDF550PGRWW)'), row('GE GDF550PGR7WW Dishwasher', 'searspartsdirect.com')],
    { brand: 'GE', model: 'GDF550PGRWW', ...anchored('GDF550PGR7WW'), productType: 'dishwasher', likelyProduct: 'GE built-in dishwasher', estimatedIntroductionYear: 2018 },
    'GDF550PGRWW', 'evidence-alias'],
  ['GDF550PGR7WW -> descriptive name with a spec phrase', 'GDF550PGR7WW',
    [row('GE GDF550PGR7WW dishwasher parts', 'partselect.ca'), row('GE GDF550PGR7WW Dishwasher', 'searspartsdirect.com')],
    { brand: 'GE', model: 'GE 24-inch built-in dishwasher', ...anchored('GDF550PGR7WW'), productType: 'dishwasher', likelyProduct: 'GE 24-inch built-in dishwasher', estimatedIntroductionYear: 2018 },
    'GE 24-inch built-in dishwasher', 'descriptive'],
];

for (const [label, query, rows, fields, model, anchor] of accepted) {
  test(`accepts ${label} and keeps the supplied code anchored`, async () => {
    const validation = await validate(query, rows, fields);
    assert.equal(validation.accepted, true, validation.reason);
    assert.equal(validation.identityAnchor, anchor);
    assert.equal(validation.result.model, model);
    assert.equal(validation.result.exactModel, fields.originalIdentifier.toUpperCase());
    // An already-generated qualified year survives; nothing new is invented.
    assert.equal(validation.result.estimatedIntroductionYear, fields.estimatedIntroductionYear);
    assert.equal(validation.result.introductionYearConfidence, 'medium');
  });
}

test('an accepted identity with no generated year stays undated', async () => {
  const validation = await validate('UN65RU800DFXZA', SAMSUNG_ROWS,
    { brand: 'Samsung', model: 'RU800D', ...anchored('UN65RU800DFXZA'), productType: 'television',
      likelyProduct: 'Samsung RU800D TV', estimatedIntroductionYear: null, introductionYearConfidence: 'unknown' });
  assert.equal(validation.accepted, true);
  assert.equal(validation.result.estimatedIntroductionYear, null);
  assert.equal(validation.result.introductionYearConfidence, 'unknown');
});

// Each row names BOTH codes, so co-occurrence alone would accept. The
// same-shape sibling guard is what keeps them rejected.
const rejected = [
  ['A2901 -> A2900', 'A2901', 'Apple', 'A2900', 'Apple Mac Studio A2901 / A2900 desktop'],
  ['20GSBB-6714A -> 20GSBB-6715A', '20GSBB-6714A', 'Cummins Onan', '20GSBB-6715A', 'Cummins 20GSBB-6714A 20GSBB-6715A generator'],
  ['UN55NU7100 -> UN55TU7000', 'UN55NU7100', 'Samsung', 'UN55TU7000', 'Samsung UN55NU7100 vs UN55TU7000 television'],
  ['MVWX655DW1 -> MVWX655DW0', 'MVWX655DW1', 'Maytag', 'MVWX655DW0', 'Maytag MVWX655DW1 MVWX655DW0 washer'],
  ['EB324 -> EB325', 'RUNHOOD EB324', 'Runhood', 'EB325', 'Runhood EB324 EB325 Energy Bar battery'],
  ['EBT1-21044 -> unrelated JVC EBT1-21045', 'EBT1-21044', 'JVC', 'EBT1-21045', 'JVC EBT1-21044 EBT1-21045 earbuds'],
  ['GDF550PGR7WW -> neighbouring GDT550PGR7WW', 'GDF550PGR7WW', 'GE', 'GDT550PGR7WW', 'GE GDF550PGR7WW GDT550PGR7WW dishwasher parts'],
  ['GDF550PGR7WW -> other color GDF550PGR7BB', 'GDF550PGR7WW', 'GE', 'GDF550PGR7BB', 'GE GDF550PGR7WW GDF550PGR7BB dishwasher'],
  ['UN65RU800DFXZA -> different model UN65RU8000', 'UN65RU800DFXZA', 'Samsung', 'UN65RU8000', 'Samsung UN65RU800DFXZA UN65RU8000 television'],
];

for (const [label, query, brand, rival, title] of rejected) {
  test(`rejects competing identifier ${label} even when a row names both`, async () => {
    const supplied = query.split(' ').pop();
    const validation = await validate(query, [row(title, 'maker.example'), row(`${brand} ${supplied} support`, 'support.example')],
      { brand, model: rival, ...anchored(supplied), productType: 'product', likelyProduct: `${brand} product`, estimatedIntroductionYear: 2020 });
    assert.equal(validation.accepted, false);
    assert.equal(validation.reason, 'IDENTIFIER_CHANGED');
    assert.equal(validation.identityAnchor, 'competing-identifier');
  });
}

test('rejects a competing exactModel even with a descriptive model name', async () => {
  const validation = await validate('A2901', [row('Apple Mac Studio A2901', 'apple.com'), row('Apple A2901 support', 'support.example')],
    { brand: 'Apple', model: 'Mac Studio', exactModel: 'A2900', originalIdentifier: 'A2901', productType: 'desktop computer', likelyProduct: 'Apple Mac Studio' });
  assert.equal(validation.accepted, false);
  assert.equal(validation.reason, 'IDENTIFIER_CHANGED');
});

test('rejects an alias no retrieved row ties to the supplied code', async () => {
  const validation = await validate('EBT1-21044', [row('EBT1-21044 JVC earbuds', 'fcc.example'), row('JVC EBT1-21044 Bluetooth earphones', 'ebay.com')],
    { brand: 'JVC', model: 'HA-B5T', ...anchored('EBT1-21044'), productType: 'earbuds', likelyProduct: 'JVC true wireless earbuds', estimatedIntroductionYear: 2021 });
  assert.equal(validation.accepted, false);
  assert.equal(validation.reason, 'IDENTIFIER_CHANGED');
  assert.equal(validation.identityAnchor, 'unsupported-alias');
});

// KDPS624PS has no manufacturer listing; KitchenAid's real SKU is KDPS624SPS
// (KDPS624SBE in Black Ore). They are the same naming scheme with a different
// finish/variant run, so the provider's KDPS624SPS is a different SKU, not an
// alias -- rejected even when a retrieved row names both.
test('KDPS624PS stays rejected when the provider substitutes KDPS624SPS', async () => {
  for (const rows of [
    [row('KitchenAid KDPS624SPS dishwasher', 'kitchenaid.com'), row('KDPS624PS kitchenaid dishwasher', 'ebay.com')],
    [row('KitchenAid KDPS624PS KDPS624SPS dishwasher', 'ebay.com'), row('KDPS624PS dishwasher', 'parts.example')],
  ]) {
    const validation = await validate('KDPS624PS', rows,
      { brand: 'KitchenAid', model: 'KDPS624SPS', ...anchored('KDPS624PS'), productType: 'dishwasher', likelyProduct: 'KitchenAid dishwasher', estimatedIntroductionYear: 2021 });
    assert.equal(validation.accepted, false);
    assert.equal(validation.reason, 'IDENTIFIER_CHANGED');
    assert.equal(validation.identityAnchor, 'competing-identifier');
  }
});

test('a likelyProduct naming an unretrieved non-family code is still rejected', async () => {
  const validation = await validate('UN65RU800DFXZA', SAMSUNG_ROWS,
    { brand: 'Samsung', model: 'RU800D', ...anchored('UN65RU800DFXZA'), productType: 'television', likelyProduct: 'Samsung UN65RU8000FXZA television' });
  assert.equal(validation.accepted, false);
  assert.equal(validation.reason, 'UNSUPPORTED_DESCRIPTIVE_CODE');
});

test('family relation needs whole digit runs and only a shortened final letter run', () => {
  assert.equal(isFamilyOfIdentifier('UN65RU800D', 'UN65RU800DFXZA'), true);
  assert.equal(isFamilyOfIdentifier('RU800D', 'UN65RU800DFXZA'), true);
  for (const [code, identifier] of [['A2900', 'A2901'], ['EB32', 'EB324'], ['KDPS624SPS', 'KDPS624PS'],
    ['UN65RU8000', 'UN65RU800DFXZA'], ['MVWX655DW0', 'MVWX655DW1'], ['GDF550PGRWW', 'GDF550PGR7WW'], ['A', 'A2901']]) {
    assert.equal(isFamilyOfIdentifier(code, identifier), false, `${code} / ${identifier}`);
  }
  assert.equal(isSiblingIdentifierShape('A2900', 'A2901'), true);
  assert.equal(isSiblingIdentifierShape('HA-B5T', 'EBT1-21044'), false);
  assert.equal(isSiblingIdentifierShape('GDF550PGRWW', 'GDF550PGR7WW'), false);
});

// Review round 3 (adversarial). Each case below is rejected by origin/main and
// was accepted with a year by the round-2 branch.

// B1: a number joined to a code by "-" is part of that code, not a spec
// phrase, so the rival code stays visible even before "in black" or after "L"/"P".
const hyphenatedRivals = [
  ['DCS-932L -> DCS-930L', 'DCS-932L', 'D-Link', 'DCS-930L', [row('D-Link DCS-932L camera', 'dlink.com'), row('DCS-932L vs DCS-930L', 'cams.example')]],
  ['DGS-1008P -> DGS-1005P', 'DGS-1008P', 'D-Link', 'DGS-1005P', [row('D-Link DGS-1008P switch', 'dlink.com')]],
  ['WF-7210 -> WF-7720 in black', 'WF-7210', 'Epson', 'WF-7720 in black', [row('Epson WF-7210 printer', 'epson.com')]],
  ['A2901 -> A-2900 in silver', 'A2901', 'Apple', 'A-2900 in silver', [row('Apple Mac Studio A2901', 'apple.com')]],
];

for (const [label, query, brand, rival, rows] of hyphenatedRivals) {
  test(`rejects hyphenated rival ${label} instead of reading its tail as a spec`, async () => {
    const validation = await validate(query, rows,
      { brand, model: rival, ...anchored(query), productType: 'product', likelyProduct: `${brand} product`, estimatedIntroductionYear: 2015 });
    assert.equal(validation.accepted, false);
    assert.equal(validation.reason, 'IDENTIFIER_CHANGED');
    assert.equal(validation.identityAnchor, 'competing-identifier');
  });
}

test('a hyphenated rival in likelyProduct is not erased as a spec phrase', async () => {
  const validation = await validate('DCS-932L', [row('D-Link DCS-932L camera', 'dlink.com')],
    { brand: 'D-Link', model: 'DCS-932L', ...anchored('DCS-932L'), productType: 'camera', likelyProduct: 'D-Link DCS-930L camera', estimatedIntroductionYear: 2010 });
  assert.equal(validation.accepted, false);
  assert.equal(validation.reason, 'UNSUPPORTED_DESCRIPTIVE_CODE');
});

test('standalone spec phrases (24-inch, 55 inch, 4K, 1080p, 20 kW) are still not model codes', async () => {
  for (const model of ['GE 24-inch built-in dishwasher', 'GE 55 inch 4K dishwasher display', 'GE 1080p 20 kW dishwasher']) {
    const validation = await validate('GDF550PGR7WW', [row('GE GDF550PGR7WW dishwasher parts', 'partselect.ca'), row('GE GDF550PGR7WW Dishwasher', 'searspartsdirect.com')],
      { brand: 'GE', model, ...anchored('GDF550PGR7WW'), productType: 'dishwasher', likelyProduct: model, estimatedIntroductionYear: 2018 });
    assert.equal(validation.accepted, true, `${model}: ${validation.reason}`);
    assert.equal(validation.identityAnchor, 'descriptive');
    assert.equal(validation.result.estimatedIntroductionYear, 2018);
  }
});

// B2: a row naming both codes is an alias only when it says they are one unit.
const coMentions = [
  ['comparison', 'EBT1-21044', 'JVC', 'WF-1000XM4', row('JVC EBT1-21044 vs Sony WF-1000XM4 comparison', 'versus.example')],
  ['successor', 'HA-B5T', 'JVC', 'HAA7T2', row('JVC HA-B5T replaced by JVC HAA7T2 earbuds', 'jvc.com')],
  ['colour variant', 'GDF550PGR7WW', 'GE', 'GDF550PGRBB', row('GE GDF550PGR7WW dishwasher white, also in black GDF550PGRBB', 'ge.com')],
  ['compatible part', 'EBT1-21044', 'JVC', 'HA-A10T', row('Charging case compatible with EBT1-21044 model HA-A10T', 'parts.example')],
  ['list of models', 'EBT1-21044', 'JVC', 'HA-A10T', row('JVC EBT1-21044 and model HA-A10T earbuds', 'list.example')],
  // Round 4: a label in the gap is not enough; the gap must be only the label.
  ['part number -> appliance', 'DA29-00020B', 'Samsung', 'RF28HMEDBSR', row('Samsung DA29-00020B Refrigerator Water Filter Model RF28HMEDBSR', 'parts.example')],
  ['dashed part number -> appliance', 'DA29-00020B', 'Samsung', 'RF28HMEDBSR', row('Samsung DA29-00020B Water Filter - Model RF28HMEDBSR', 'parts.example')],
  ['"the model after"', 'EBT1-21044', 'JVC', 'HA-B5T', row('JVC EBT1-21044, the model after HA-B5T', 'jvc.example')],
  ['"previous model"', 'EBT1-21044', 'JVC', 'HA-B5T', row('JVC EBT1-21044 previous model HA-B5T', 'jvc.example')],
  ['"a different model from"', 'EBT1-21044', 'JVC', 'HA-B5T', row('JVC EBT1-21044 is a different model from HA-B5T', 'jvc.example')],
  ['"is not model"', 'EBT1-21044', 'JVC', 'HA-B5T', row('JVC EBT1-21044 is not model HA-B5T', 'jvc.example')],
  ['labelled list', 'EBT1-21044', 'JVC', 'HA-B5T', row('JVC Manuals: EBT1-21044, Model HA-B5T, Model HA-A9T', 'jvc.example')],
  ['accessory "for X model Y"', 'EBT1-21044', 'JVC', 'HA-B5T', row('JVC Filter for EBT1-21044 model HA-B5T', 'parts.example')],
  // Round 5: a bracket links codes only when they share a leading letter run.
  ['remote part bracketed after its TV', 'AKB75095307', 'LG', '55UH6150', row('Remote Control for LG 55UH6150 (AKB75095307)', 'shop.example')],
  ['accessory "for X (Y)"', 'EBT1-21044', 'JVC', 'HA-B5T', row('Ear tips for EBT1-21044 (HA-B5T)', 'parts.example')],
  ['bundle "X (Y ...)"', 'EBT1-21044', 'JVC', 'HA-B5T', row('Bundle: EBT1-21044 (HA-B5T charging case)', 'shop.example')],
];

for (const [label, query, brand, rival, linking] of coMentions) {
  test(`a ${label} row naming both codes does not link ${rival} to ${query}`, async () => {
    const validation = await validate(query, [linking, row(`${brand} ${query} support`, 'support.example')],
      { brand, model: rival, ...anchored(query), productType: 'product', likelyProduct: `${brand} product`, estimatedIntroductionYear: 2021 });
    assert.equal(validation.accepted, false);
    assert.equal(validation.reason, 'IDENTIFIER_CHANGED');
    assert.notEqual(validation.identityAnchor, 'evidence-alias');
  });
}

test('alias linking needs an identity label or parenthesis between the two codes', () => {
  assert.equal(namesAsAlias('JVC HA-B5T, Model EBT1-21044, FCC ID 2ATF51604783', 'EBT1-21044', 'HA-B5T'), true);
  assert.equal(namesAsAlias('Parts for GE dishwasher GDF550PGR7WW (GDF550PGRWW)', 'GDF550PGR7WW', 'GDF550PGRWW'), true);
  assert.equal(namesAsAlias('GDF550PGR7WW (GDF550PGRWW)', 'GDF550PGR7WW', 'GDF550PGRWW'), true);
  // A bracket alone links only codes from one naming scheme (same leading letter run).
  for (const [text, identifier, code] of [['Remote Control for LG 55UH6150 (AKB75095307)', 'AKB75095307', '55UH6150'],
    ['EBT1-21044 (HA-B5T)', 'EBT1-21044', 'HA-B5T'], ['Ear tips for EBT1-21044 (HA-B5T)', 'EBT1-21044', 'HA-B5T'],
    ['Bundle: EBT1-21044 (HA-B5T charging case)', 'EBT1-21044', 'HA-B5T']]) {
    assert.equal(namesAsAlias(text, identifier, code), false, text);
  }
  assert.equal(namesAsAlias('HA-B5T aka EBT1-21044', 'EBT1-21044', 'HA-B5T'), true);
  for (const text of ['Model HA-B5T, FCC ID EBT1-21044', 'HA-B5T P/N EBT1-21044', 'HA-B5T SKU EBT1-21044',
    'HA-B5T, also known as EBT1-21044', 'HA-B5T a.k.a. EBT1-21044', 'HA-B5T - Model No. EBT1-21044', 'HA-B5T, Model #: EBT1-21044']) {
    assert.equal(namesAsAlias(text, 'EBT1-21044', 'HA-B5T'), true, text);
  }
  for (const text of ['EBT1-21044, Model HA-B5T, Model HA-A9T', 'EBT1-21044 Water Filter Model HA-B5T',
    'EBT1-21044, the model after HA-B5T', 'Filter for EBT1-21044 model HA-B5T']) {
    assert.equal(namesAsAlias(text, 'EBT1-21044', 'HA-B5T'), false, text);
  }
  for (const text of ['JVC HA-B5T EBT1-21044 earbuds', 'HA-B5T / EBT1-21044', 'HA-B5T model EBT1-21044 vs Sony',
    'HA-B5T true wireless earbuds with long battery life and the model EBT1-21044', 'EBT1-21044 or model HA-B5T']) {
    assert.equal(namesAsAlias(text, 'EBT1-21044', 'HA-B5T'), false, text);
  }
});

// N2: a family code must be specific and keep the identifier's last number.
test('short fragments of the supplied code never count as a family', async () => {
  for (const [code, identifier] of [['UN65', 'UN65RU800DFXZA'], ['65RU', 'UN65RU800DFXZA'], ['UN65R', 'UN65RU800DFXZA'],
    ['OLED65C', 'OLED65C3PUA'], ['1000XM', 'WH1000XM4'], ['AB123', 'AB1-23C']]) {
    assert.equal(isFamilyOfIdentifier(code, identifier), false, `${code} / ${identifier}`);
  }
  assert.equal(isFamilyOfIdentifier('OLED65C3', 'OLED65C3PUA'), true);
  // A number-led code may not drop letters glued to that number (WF-1000XM4 shares 1000XM4)...
  for (const [code, identifier] of [['1000XM4', 'WH1000XM4'], ['65RU800', 'UN65RU800DFXZA']]) {
    assert.equal(isFamilyOfIdentifier(code, identifier), false, `${code} / ${identifier}`);
  }
  // ...but may start where the identifier itself starts.
  assert.equal(isFamilyOfIdentifier('20GSBB-6714', '20GSBB-6714A'), true);
  assert.equal(isFamilyOfIdentifier('RU800D', 'UN65RU800DFXZA'), true);
  for (const [query, model, rows] of [['UN65RU800DFXZA', 'UN65R', SAMSUNG_ROWS], ['OLED65C3PUA', 'OLED65C', [row('LG OLED65C3PUA TV', 'lg.com')]]]) {
    const validation = await validate(query, rows, { brand: query.startsWith('UN') ? 'Samsung' : 'LG', model, ...anchored(query),
      productType: 'television', likelyProduct: 'Television', estimatedIntroductionYear: 2021 });
    assert.equal(validation.accepted, false, model);
    assert.notEqual(validation.identityAnchor, 'family');
  }
});

// N3: the punctuation join exempts only identifiers that were actually joined;
// a different, longer model that embeds the request code stays rejected as on main.
test('native identity check does not newly accept TU7000 -> UN55TU7000FXZA', () => {
  const queryInfo = classifySmartLookupQuery('TU7000');
  const answer = { brand: 'Samsung', model: 'UN55TU7000FXZA', likelyProduct: 'Samsung UN55TU7000FXZA TV' };
  assert.equal(isSmartAgeProductCompatible(answer, queryInfo), false);
  assert.equal(matchesOnlyByFormatting(answer, queryInfo), false);
});

test('dropping year claims also drops sentences that restate the year', () => {
  const stripped = withoutYearClaims({ brand: 'Epson', model: 'WF-7200', introductionYear: 2017,
    summary: 'Epson WorkForce printer. The WF-7200 launched in 2017.', notes: 'Introduced in 2017.',
    caveats: ['Sold until 2019.', 'Check the label.'], historicalContext: 'Part of the 2017 WorkForce refresh.',
    evidence: [{ detail: 'Introduced in 2017 per Epson.', source: 'Epson' }, { detail: 'Listed on the support page.', source: 'Epson' }] });
  assert.equal(stripped.introductionYear, undefined);
  assert.equal(stripped.summary, 'Epson WorkForce printer.');
  assert.equal(stripped.notes, null);
  assert.deepEqual(stripped.caveats, ['Check the label.']);
  assert.equal(stripped.historicalContext, null);
  assert.deepEqual(stripped.evidence, [{ detail: 'Listed on the support page.', source: 'Epson' }]);
});

// WF7200 is not established as an Epson product (only WF-7210 / WF-7710 /
// WF-7720 are), so it is never a dated fixture. Formatting equivalence is an
// identity rule only: it may prevent UNRELATED_MODEL, never supply evidence.
test('WF7200 with retrieval naming only neighbouring Epson models stays unresolved and undated', async () => {
  const validation = await validate('WF7200', [row('Epson WorkForce WF-7210 wide-format printer', 'epson.com'),
    row('Epson WorkForce WF-7720 all-in-one', 'rtings.com')],
  { brand: 'Epson', model: 'WorkForce WF-7200', exactModel: 'WF-7200', originalIdentifier: 'WF7200', productType: 'printer',
    likelyProduct: 'Epson WorkForce WF-7200 printer', estimatedIntroductionYear: 2017 });
  assert.equal(validation.accepted, false);
  assert.notEqual(validation.result?.estimatedIntroductionYear, 2017);
});

test('formatting-only matches are flagged so they cannot supply year evidence', () => {
  const queryInfo = classifySmartLookupQuery('WF7200');
  assert.equal(matchesOnlyByFormatting({ brand: 'Epson', model: 'WorkForce WF-7200', likelyProduct: 'Epson WF-7200 printer' }, queryInfo), true);
  assert.equal(matchesOnlyByFormatting({ brand: 'Epson', model: 'WF-7210' }, queryInfo), false);
  assert.equal(matchesOnlyByFormatting({ brand: 'Epson', model: 'WF7200 printer', likelyProduct: 'Epson WF7200 printer' }, queryInfo), false);
});

test('native identity check treats WF-7200 as WF7200 but not neighbouring codes', () => {
  const queryInfo = classifySmartLookupQuery('WF7200');
  for (const fields of [{ model: 'WF-7200' }, { model: 'WorkForce WF-7200' }, { likelyProduct: 'Epson WF 7200 printer' }]) {
    assert.equal(isSmartAgeProductCompatible({ brand: 'Epson', ...fields }, queryInfo), true, JSON.stringify(fields));
  }
  for (const model of ['WF-72000', 'WF-7210', 'XWF-7200', 'WF-720']) {
    assert.equal(isSmartAgeProductCompatible({ brand: 'Epson', model, likelyProduct: `Epson ${model} printer` }, queryInfo), false, model);
  }
});
