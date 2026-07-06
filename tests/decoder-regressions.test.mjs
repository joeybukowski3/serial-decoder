import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadDecoderContext() {
  function createMockElement() {
    return {
      style: {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      appendChild: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      setAttribute: () => {},
      getAttribute: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    };
  }

  const ctx = {
    console,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    URL,
    URLSearchParams,
    fetch: async () => ({ ok: false, text: async () => '', json: async () => ({}) }),
    history: { pushState: () => {} },
    window: {
      location: { pathname: '/', search: '', href: 'http://localhost/', origin: 'http://localhost', replace: () => {} },
      addEventListener: () => {},
      scrollTo: () => {},
    },
    document: {
      head: { appendChild: () => {} },
      body: { classList: { toggle: () => {}, add: () => {}, remove: () => {} }, style: {}, appendChild: () => {} },
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => createMockElement(),
    },
    navigator: { clipboard: { writeText: async () => {} } },
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);

  const decoderSource = fs.readFileSync('decoder-data.js', 'utf8');
  vm.runInContext(decoderSource, ctx);
  vm.runInContext('globalThis.__decoderData = decoderData;', ctx);

  const scriptSource = fs.readFileSync('script.js', 'utf8');
  vm.runInContext(scriptSource, ctx);
  vm.runInContext(`
    globalThis.__api = {
      decoderData: __decoderData,
      parseCandidateYears,
      computeEstimatedAge,
      hasSingleResolvedYear,
      buildAmbiguousYearMessage,
      updateSerialResultNotes,
      chooseCandidateFromLookup,
      resolveSerialYearFromModel,
      getCurrentSupplementalModelValue,
      setStoredSupplementalModel,
      KENMORE_PREFIX_TO_DECODER,
      expandKnownSmartLookupQuery,
      getSupplementalModelConfig,
      normalizeDecoderCategory,
      normalizeBrandId,
      sanitizeDecodeResult,
      extractKenmoreModelPrefix,
      resolveKenmoreDecoderFromPrefix,
      getVizioModelDecodeInput,
      isLikelyVizioModelValue
    };
  `, ctx);

  return { api: ctx.__api, ctx };
}

function loadSplitDecoderData(bundleFiles) {
  const ctx = { window: {} };
  vm.createContext(ctx);

  for (const file of bundleFiles) {
    const source = fs.readFileSync(file, 'utf8');
    vm.runInContext(source, ctx);
  }

  return ctx.window.decoderData;
}

function loadDecoderBundleManifest() {
  const manifest = JSON.parse(fs.readFileSync('assets/decoders/decoder-bundles.json', 'utf8'));
  return Object.fromEntries(
    Object.entries(manifest).map(([key, value]) => [key, value.replace(/^\//, '')])
  );
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const { api, ctx } = loadDecoderContext();

test('GE serial-only decode for GM028928Q remains unchanged', () => {
  const ge = api.decoderData.appliances.decoders.ge;
  const result = ge.decode('GM028928Q');
  assert.equal(result.year, '1983/1995/2007/2019');
  assert.equal(result.month, 'April');
});

test('category decoder bundles preserve decoder output parity with decoder-data.js', () => {
  const manifest = loadDecoderBundleManifest();
  const splitData = loadSplitDecoderData([
    manifest.appliances,
    manifest.waterHeaters,
    manifest.hvac,
    manifest.electronics
  ]);

  assert.deepEqual(
    plain(splitData.appliances.decoders.ge.decode('GM028928Q')),
    plain(api.decoderData.appliances.decoders.ge.decode('GM028928Q'))
  );
  assert.deepEqual(
    plain(splitData.hvac.decoders.goodman.decode('1404123456')),
    plain(api.decoderData.hvac.decoders.goodman.decode('1404123456'))
  );
  assert.deepEqual(
    plain(splitData.waterHeaters.decoders.rheem.decode('RH120512345')),
    plain(api.decoderData.waterHeaters.decoders.rheem.decode('RH120512345'))
  );
  assert.deepEqual(
    plain(splitData.electronics.decoders.vizio.decode('VW32L HDTV10A')),
    plain(api.decoderData.electronics.decoders.vizio.decode('VW32L HDTV10A'))
  );
});

test('single category decoder bundle only registers that category', () => {
  const manifest = loadDecoderBundleManifest();
  const splitData = loadSplitDecoderData([manifest.hvac]);

  assert.deepEqual(Object.keys(splitData), ['hvac']);
  assert.ok(splitData.hvac.decoders.goodman);
  assert.equal(splitData.appliances, undefined);
});

test('GE Narrow Date refinement selects the closest serial-valid candidate to lookup data', () => {
  const ge = api.decoderData.appliances.decoders.ge;
  const serialResult = ge.decode('GM028928Q');
  const candidates = Array.from(api.parseCandidateYears(serialResult.year));
  assert.deepEqual(candidates, [1983, 1995, 2007, 2019]);

  const selected = api.chooseCandidateFromLookup(candidates, {
    estimatedYear: '2007',
    yearRange: '2019-Present',
    notes: 'GE JB258DM1WW introduced in 2019 and sold from 2019 onward.'
  }, 'JB258DM1WW', '');

  assert.ok(selected);
  assert.equal(selected.chosenYear, 2007);
});

test('Estimated age stays hidden when multiple valid manufacturer years are returned', () => {
  const ge = api.decoderData.appliances.decoders.ge;
  const result = ge.decode('GM028928Q');

  assert.equal(result.year, '1983/1995/2007/2019');
  assert.equal(api.computeEstimatedAge(result.year), '—');
  assert.equal(api.hasSingleResolvedYear(result.year), false);
});

test('Narrow Date still allows legitimate strong-evidence adjustment', () => {
  const selected = api.chooseCandidateFromLookup(
    [2017, 2019],
    {
      estimatedYear: '2008',
      notes: 'Model launched in 2008 and released in 2008.'
    },
    'TEST2008',
    ''
  );
  assert.ok(selected);
  assert.equal(selected.chosenYear, 2017);
});

test('Rare Samsung-built Kenmore serial layout decodes A00843ESC00128 as 2009/2029', () => {
  const samsung = api.decoderData.appliances.decoders.samsung;
  const out = samsung.decode('A00843ESC00128');
  assert.ok(out);
  // S is now correctly marked as 2009/2029 (20-year Samsung cycle)
  assert.equal(out.year, '2009/2029');
  assert.equal(out.month, 'December');
});

test('Normal Kenmore prefix behavior and normal Samsung decode remain unchanged', () => {
  const kenmore110 = api.KENMORE_PREFIX_TO_DECODER['110'];
  assert.equal(kenmore110.decoderId, 'whirlpool');
  assert.equal(kenmore110.manufacturer, 'Whirlpool');

  const samsung = api.decoderData.appliances.decoders.samsung;
  const samsungResult = samsung.decode('AAAS1BBBBBB');
  assert.ok(samsungResult);
  // S is 2009/2029 (20-year ambiguous code)
  assert.equal(samsungResult.year, '2009/2029');
  assert.equal(samsungResult.month, 'January');
});

test('Vizio model requirement is scoped to electronics only', () => {
  const vizioElectronics = api.getSupplementalModelConfig('electronics', 'vizio');
  const vizioAppliances = api.getSupplementalModelConfig('appliances', 'vizio');

  assert.equal(vizioElectronics.required, true);
  assert.equal(vizioElectronics.useModelAsPrimaryInput, true);
  assert.equal(vizioAppliances.required, false);
});

test('Vizio VW32L HDTV10A falls back to model-era evidence instead of incomplete', () => {
  const vizio = api.decoderData.electronics.decoders.vizio;
  const result = vizio.decode('VW32L HDTV10A');

  assert.ok(result);
  assert.equal(result.year, '2007');
  assert.equal(result.month, 'September');
  assert.match(result.notes, /Serial number format was not directly decoded/);
});

test('Vizio reversed model and serial fields recover the model candidate', () => {
  const resolved = api.getVizioModelDecodeInput('LSPATBH4026090', 'VW32L HDTV10A');
  const vizio = api.decoderData.electronics.decoders.vizio;
  const result = vizio.decode(resolved.model);

  assert.equal(resolved.model, 'VW32L HDTV10A');
  assert.equal(resolved.usedSwappedFields, true);
  assert.ok(result);
  assert.equal(result.year, '2007');
});

test('Unsupported Vizio serial without a model does not invent a date', () => {
  const vizio = api.decoderData.electronics.decoders.vizio;

  assert.equal(api.isLikelyVizioModelValue('LSPATBH4026090'), false);
  assert.equal(vizio.decode('LSPATBH4026090'), null);
});

test('Kenmore requires a model prefix regardless of category key shape', () => {
  const kenmoreAppliances = api.getSupplementalModelConfig('appliances', 'kenmore');
  const normalized = api.normalizeDecoderCategory('water-heaters');

  assert.equal(kenmoreAppliances.required, true);
  assert.equal(kenmoreAppliances.label, 'Model Prefix');
  assert.equal(normalized, 'waterHeaters');
});

test('Kenmore LG prefix 795 is recognized from a full dotted model number', () => {
  const extracted = api.extractKenmoreModelPrefix('795.74053.410');
  const resolved = api.resolveKenmoreDecoderFromPrefix('795.74053.410');

  assert.equal(extracted, '795');
  assert.equal(resolved.prefix, '795');
  assert.equal(resolved.manufacturer, 'LG');
  assert.equal(resolved.decoderId, 'lg');
  assert.equal(resolved.usedDefault, false);
});

test('Kenmore 795 refrigerator serial routes to LG decoding without missing-prefix guidance', () => {
  const resolved = api.resolveKenmoreDecoderFromPrefix('795.74053.410');
  const lg = api.decoderData.appliances.decoders[resolved.decoderId];
  const out = lg.decode('410KR00219');

  assert.ok(out);
  assert.equal(resolved.note, '');
  assert.equal(out.year, '2004/2014/2024');
  assert.equal(out.month, 'October');
});

test('Current model field value overrides stale stored model state', () => {
  const originalGetById = ctx.document.getElementById;
  const input = {
    value: 'WM3470HWA',
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null; }
  };

  api.setStoredSupplementalModel('appliances', 'OLDVALUE');
  ctx.document.getElementById = (id) => id === 'modelNumber' ? input : originalGetById(id);

  const value = api.getCurrentSupplementalModelValue('appliances', 'lg');

  assert.equal(value, 'WM3470HWA');
  assert.equal(api.getCurrentSupplementalModelValue('appliances', 'lg'), 'WM3470HWA');
  ctx.document.getElementById = originalGetById;
});

test('Sub-Zero accepts alphanumeric serials where the second character is the year code', () => {
  const subZero = api.decoderData.appliances.decoders.sub_zero;
  const out = subZero.decode('C22501800');

  assert.ok(out);
  assert.equal(out.year, '2012/2042');
  assert.equal(out.month, 'N/A');
  assert.equal(out.yearCode, '2');
});

test('Sub-Zero legacy letter-based decode remains unchanged', () => {
  const subZero = api.decoderData.appliances.decoders.sub_zero;
  const out = subZero.decode('CB2501800');

  assert.ok(out);
  assert.equal(out.year, '1992/2022');
  assert.equal(out.yearCode, 'B');
});

test('LG ambiguous serial years prompt for model instead of assuming the newest year', () => {
  const lg = api.decoderData.appliances.decoders.lg;
  const out = lg.decode('412TATG1H105');

  assert.ok(out);
  assert.equal(out.year, '2004/2014/2024');
  assert.equal(api.computeEstimatedAge(out.year), '—');
  assert.equal(
    api.buildAmbiguousYearMessage(api.parseCandidateYears(out.year), { modelAttempted: false }),
    'Possible manufacture years: 2004, 2014, or 2024. Add a model number to narrow the date.'
  );
});

test('LG ambiguous serial can narrow to 2014 from upfront model evidence', async () => {
  ctx.fetch = async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({
      brand: 'LG',
      model: 'WM3470HWA',
      estimatedYear: '2014',
      yearRange: '2013-2016'
    })
  });

  const resolved = await api.resolveSerialYearFromModel({
    candidates: [2004, 2014, 2024],
    brand: 'LG',
    model: 'WM3470HWA',
    context: ''
  });

  assert.equal(resolved.chosenYear, 2014);
  assert.equal(resolved.confidence, 'Medium');
});

test('Frigidaire ambiguous serial can narrow to 2004 from model evidence', async () => {
  ctx.fetch = async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({
      brand: 'Frigidaire',
      model: 'FEFL79DBB',
      estimatedYear: '2004',
      yearRange: '2003-2005'
    })
  });

  const resolved = await api.resolveSerialYearFromModel({
    candidates: [1994, 2004, 2014, 2024],
    brand: 'Frigidaire',
    model: 'FEFL79DBB',
    context: ''
  });

  assert.equal(resolved.chosenYear, 2004);
  assert.equal(resolved.confidence, 'Medium');
});

test('Frigidaire ambiguous serial still narrows from built-in model evidence when lookup fails', async () => {
  ctx.fetch = async () => {
    throw new Error('lookup offline');
  };

  const resolved = await api.resolveSerialYearFromModel({
    candidates: [1994, 2004, 2014, 2024],
    brand: 'Frigidaire',
    model: 'FEFL79DBB',
    context: ''
  });

  assert.equal(resolved.chosenYear, 2004);
  assert.equal(resolved.source, 'client-evidence');
});

test('Frigidaire FFCO7C3AW2 with WB24435510 resolves to 2002 from built-in model evidence', async () => {
  ctx.fetch = async () => {
    throw new Error('lookup offline');
  };

  const frig = api.decoderData.appliances.decoders.frigidaire;
  const out = frig.decode('WB24435510');
  assert.ok(out);
  assert.equal(out.year, '1992/2002/2012/2022');
  assert.equal(out.month, 'Week 44 (see notes for decade)');

  const resolved = await api.resolveSerialYearFromModel({
    candidates: api.parseCandidateYears(out.year),
    brand: 'Frigidaire',
    model: 'FFCO7C3AW2',
    context: ''
  });

  assert.equal(resolved.chosenYear, 2002);
  assert.equal(resolved.source, 'client-evidence');
});

test('Frigidaire WB24435510 stays ambiguous without model evidence', async () => {
  const resolved = await api.resolveSerialYearFromModel({
    candidates: [1992, 2002, 2012, 2022],
    brand: 'Frigidaire',
    model: '',
    context: ''
  });

  assert.equal(resolved.chosenYear, null);
  assert.equal(
    resolved.summary,
    'Possible manufacture years: 1992, 2002, 2012, or 2022. Add a model number to narrow the date.'
  );
});

test('Frigidaire WB24435510 stays ambiguous with unsupported model evidence', async () => {
  ctx.fetch = async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({
      brand: 'Frigidaire',
      model: 'UNKNOWNMODEL',
      estimatedYear: null,
      yearRange: null
    })
  });

  const resolved = await api.resolveSerialYearFromModel({
    candidates: [1992, 2002, 2012, 2022],
    brand: 'Frigidaire',
    model: 'UNKNOWNMODEL',
    context: ''
  });

  assert.equal(resolved.chosenYear, null);
});

test('LG ambiguous serial still narrows from built-in model evidence when lookup fails', async () => {
  ctx.fetch = async () => {
    throw new Error('lookup offline');
  };

  const resolved = await api.resolveSerialYearFromModel({
    candidates: [2004, 2014, 2024],
    brand: 'LG',
    model: 'WM3470HWA',
    context: ''
  });

  assert.equal(resolved.chosenYear, 2014);
  assert.equal(resolved.source, 'client-evidence');
});

test('LG ambiguous serial keeps all candidates when model evidence is unknown', async () => {
  ctx.fetch = async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({
      brand: 'LG',
      model: 'UNKNOWNMODEL',
      estimatedYear: null,
      yearRange: null
    })
  });

  const resolved = await api.resolveSerialYearFromModel({
    candidates: [2004, 2014, 2024],
    brand: 'LG',
    model: 'UNKNOWNMODEL',
    context: ''
  });

  assert.equal(resolved.chosenYear, null);
  assert.equal(
    resolved.summary,
    'Possible manufacture years: 2004, 2014, or 2024. Model number could not confidently narrow this repeating serial cycle.'
  );
});

test('Whirlpool serial-only ambiguous result does not collapse to a single year', () => {
  const whirlpool = api.decoderData.appliances.decoders.whirlpool;
  const out = whirlpool.decode('TRD3481274');

  assert.ok(out);
  assert.equal(out.year, '1994/2024');
  assert.equal(api.computeEstimatedAge(out.year), '—');
  assert.equal(api.hasSingleResolvedYear(out.year), false);
});

test('Whirlpool ambiguous serial can narrow to 2024 from upfront model evidence', async () => {
  ctx.fetch = async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({
      brand: 'Whirlpool',
      model: 'WMH31017HS12',
      estimatedYear: '2024',
      yearRange: '2023-2025'
    })
  });

  const resolved = await api.resolveSerialYearFromModel({
    candidates: [1994, 2024],
    brand: 'Whirlpool',
    model: 'WMH31017HS12',
    context: ''
  });

  assert.equal(resolved.chosenYear, 2024);
  assert.equal(resolved.confidence, 'Medium');
});

test('Whirlpool ambiguous serial still narrows from built-in model evidence when lookup fails', async () => {
  ctx.fetch = async () => {
    throw new Error('lookup offline');
  };

  const resolved = await api.resolveSerialYearFromModel({
    candidates: [1994, 2024],
    brand: 'Whirlpool',
    model: 'WMH31017HS12',
    context: ''
  });

  assert.equal(resolved.chosenYear, 2024);
  assert.equal(resolved.source, 'client-evidence');
});

test('Refinement notes use narrowed model-era evidence when a single year is resolved', () => {
  const notes = api.updateSerialResultNotes(
    'Frigidaire serial year digit repeats by decade.',
    'Model evidence suggests around 2004; closest serial-valid candidate is 2004.',
    [1994, 2004, 2014, 2024],
    true,
    true
  );

  assert.match(notes, /closest serial-valid candidate is 2004/i);
  assert.doesNotMatch(notes, /could not confidently resolve/i);
});

test('Rheem water heater MMYY format decodes month/year correctly', () => {
  const rheem = api.decoderData.waterHeaters.decoders.rheem;
  const out = rheem.decode('1291A39968');
  assert.ok(out);
  assert.equal(out.year, '1991');
  assert.equal(out.month, 'December');
  assert.equal(out.monthCode, '12');
});

test('Rheem water heater accepts generic MMYY serial starts without extra prefix logic', () => {
  const rheem = api.decoderData.waterHeaters.decoders.rheem;
  const out = rheem.decode('0414B76543');
  assert.ok(out);
  assert.equal(out.year, '2014');
  assert.equal(out.month, 'April');
  assert.equal(out.monthCode, '04');
});

test('Rheem HVAC-like serial does not fall through to bogus MMYY text decode', () => {
  const rheem = api.decoderData.waterHeaters.decoders.rheem;
  const out = rheem.decode('RHLNQ15143648');

  assert.ok(out);
  assert.equal(out.year, '2014');
  assert.equal(out.month, 'Week 15');
  assert.equal(out.weekDigits, '15');
  assert.equal(out.decodeStyle, 'Embedded WWYY');
});

test('Rheem numeric serial 0302118742 resolves to 2021 using the documented Style 2 layout', () => {
  const rheem = api.decoderData.waterHeaters.decoders.rheem;
  const out = rheem.decode('0302118742', 'E40 2 RH95');

  assert.ok(out);
  assert.equal(out.year, '2021');
  assert.equal(out.month, 'Week 30');
  assert.equal(out.yearCode, '21');
  assert.equal(out.weekDigits, '30');
});

test('Non-Rheem brand does not use Rheem RH prefix week/year rule', () => {
  const ruud = api.decoderData.waterHeaters.decoders.ruud;
  const out = ruud.decode('RHA251405618');
  assert.ok(out);
  assert.notEqual(out.year, '2014');
});

test('Reliance pre-2008 letter format uses month code in position 2 and year in positions 3-4', () => {
  const reliance = api.decoderData.waterHeaters.decoders.reliance_water_heaters;
  const out = reliance.decode('BA14056189');
  assert.ok(out);
  assert.equal(out.month, 'January');
  assert.equal(out.year, '2014');
  assert.equal(out.monthCode, 'A');
  assert.equal(out.yearCode, '14');
});

test('Reliance month code map includes C=March and D=April', () => {
  const reliance = api.decoderData.waterHeaters.decoders.reliance_water_heaters;
  const cOut = reliance.decode('BC140561890');
  const dOut = reliance.decode('BD140561890');
  assert.equal(cOut.month, 'March');
  assert.equal(dOut.month, 'April');
});

test('Reliance returns null for too-short serials', () => {
  const reliance = api.decoderData.waterHeaters.decoders.reliance_water_heaters;
  const shortOut = reliance.decode('A14');
  assert.equal(shortOut, null);
});

test('Smart Lookup expands LR3RE-1000 to the Litter-Robot product family', () => {
  const expanded = api.expandKnownSmartLookupQuery('LR3RE-1000');
  assert.match(expanded, /Litter-Robot 3 Open Air/i);
  assert.match(expanded, /Whisker/i);
  assert.doesNotMatch(expanded, /Generac/i);
});

// ── Audit: A.O. Smith off-by-one fix ─────────────────────────────────────────

test('A.O. Smith letter-coded serial A1405618 decodes to October 2014', () => {
  const aos = api.decoderData.waterHeaters.decoders.a_o_smith;
  const out = aos.decode('A1405618');
  assert.ok(out);
  assert.equal(out.year, '2014');
  assert.equal(out.month, 'October');
  assert.equal(out.monthCode, 'A');
  assert.equal(out.yearCode, '14');
});

test('A.O. Smith letter-coded serial H1309XXXXX decodes to May 2013', () => {
  const aos = api.decoderData.waterHeaters.decoders.a_o_smith;
  const out = aos.decode('H1309XXXXX');
  assert.ok(out);
  assert.equal(out.year, '2013');
  assert.equal(out.month, 'May');
  assert.equal(out.monthCode, 'H');
});

test('A.O. Smith numeric YYWW serial 1504A023527 still decodes correctly', () => {
  const aos = api.decoderData.waterHeaters.decoders.a_o_smith;
  const out = aos.decode('1504A023527');
  assert.ok(out);
  assert.equal(out.year, '2015');
  assert.equal(out.month, 'Week 4');
});

test('American Water Heater numeric YYWW serial 9948125186 decodes to 1999 week 48', () => {
  const brandId = api.normalizeBrandId('American Water Heater');
  const american = api.decoderData.waterHeaters.decoders[brandId];
  const out = american.decode('9948125186');

  assert.equal(brandId, 'american_water_heater_company');
  assert.ok(out);
  assert.equal(out.year, '1999');
  assert.equal(out.month, 'Week 48');
  assert.equal(out.yearCode, '99');
  assert.equal(out.weekDigits, '48');
  assert.equal(out.decodeStyle, 'Numeric YYWW');
  assert.equal(api.sanitizeDecodeResult(out).valid, true);
});

test('American Water Heater Company alias also routes to the same YYWW decoder', () => {
  const brandId = api.normalizeBrandId('American Water Heater Company');
  const american = api.decoderData.waterHeaters.decoders[brandId];
  const out = american.decode('9948125186');

  assert.equal(brandId, 'american_water_heater_company');
  assert.ok(out);
  assert.equal(out.year, '1999');
  assert.equal(out.month, 'Week 48');
});

test('A.O. Smith-family numeric YYWW handles 00, 01, and 99 year edges', () => {
  const american = api.decoderData.waterHeaters.decoders.american_water_heater_company;
  const aos = api.decoderData.waterHeaters.decoders.a_o_smith;
  const craftmaster = api.decoderData.waterHeaters.decoders.u_s_craftmaster;

  assert.equal(american.decode('0048125186').year, '2000');
  assert.equal(aos.decode('0148125186').year, '2001');
  assert.equal(craftmaster.decode('9948125186').year, '1999');
});

test('A.O. Smith-family numeric YYWW rejects malformed lengths and invalid weeks', () => {
  const american = api.decoderData.waterHeaters.decoders.american_water_heater_company;

  assert.equal(american.decode('994'), null);
  assert.equal(american.decode('0000125186'), null);
  assert.equal(american.decode('9954125186'), null);
});

test('A.O. Smith rejects too-short serials', () => {
  const aos = api.decoderData.waterHeaters.decoders.a_o_smith;
  assert.equal(aos.decode('A1'), null);
  assert.equal(aos.decode(''), null);
});

// ── Audit: HVAC future-year threshold fix ────────────────────────────────────

test('Carrier year code 27 returns 2027 not 1927', () => {
  const carrier = api.decoderData.hvac.decoders.carrier;
  const out = carrier.decode('XX27XXXXX');
  assert.ok(out);
  assert.equal(out.year, '2027');
});

test('Bryant year code 27 in WWYY position returns 2027', () => {
  const bryant = api.decoderData.hvac.decoders.bryant;
  const out = bryant.decode('0127XXXXX');
  assert.ok(out);
  assert.equal(out.year, '2027');
});

test('Trane year code 27 returns 2027 not 1927', () => {
  const trane = api.decoderData.hvac.decoders.trane;
  const out = trane.decode('XX27XXXXXX');
  assert.ok(out);
  assert.equal(out.year, '2027');
});

test('Lennox year code 27 returns 2027', () => {
  const lennox = api.decoderData.hvac.decoders.lennox;
  const out = lennox.decode('0127XXXXX');
  assert.ok(out);
  assert.equal(out.year, '2027');
});

test('Goodman 2019 August still decodes correctly after threshold fix', () => {
  const goodman = api.decoderData.hvac.decoders.goodman;
  const out = goodman.decode('1908123456');
  assert.ok(out);
  assert.equal(out.year, '2019');
  assert.equal(out.month, 'August');
});

// ── Audit: Samsung 20-year cycle completeness ────────────────────────────────

test('Samsung year code N returns 2020/2040 after ambiguous cycle fix', () => {
  const samsung = api.decoderData.appliances.decoders.samsung;
  // 15-char: year at position 7 (0-indexed). Position 6='0', 7='N', 8='1'=January
  const out = samsung.decode('01H0010N1RR0Z5P');
  assert.ok(out);
  assert.equal(out.year, '2020/2040');
});

test('Samsung year code P returns 2007/2027 after ambiguous cycle fix', () => {
  const samsung = api.decoderData.appliances.decoders.samsung;
  // 15-char: P at position 7
  const out = samsung.decode('01H0010P1RR0Z5P');
  assert.ok(out);
  assert.equal(out.year, '2007/2027');
});

// ── Audit: Whirlpool skipped letters note ────────────────────────────────────

test('Whirlpool notes mention N as a skipped letter', () => {
  const wp = api.decoderData.appliances.decoders.whirlpool;
  assert.match(wp.notes, /I N O Q V are skipped/);
});

// ── Audit: GE and Frigidaire accuracy checks ─────────────────────────────────

test('GE serial RG527327B decodes to August 1980/1992/2004/2016', () => {
  const ge = api.decoderData.appliances.decoders.ge;
  const out = ge.decode('RG527327B');
  assert.ok(out);
  // GE: char0=month(R=August), char1=year(G=1980/1992/2004/2016)
  assert.equal(out.year, '1980/1992/2004/2016');
  assert.equal(out.month, 'August');
});

test('GE RZ825479 stays ambiguous without model evidence', async () => {
  const ge = api.decoderData.appliances.decoders.ge;
  const out = ge.decode('RZ825479');
  assert.ok(out);
  assert.equal(out.year, '1988/2000/2012/2024');
  assert.equal(out.month, 'August');

  const resolved = await api.resolveSerialYearFromModel({
    candidates: api.parseCandidateYears(out.year),
    brand: 'GE',
    model: '',
    context: ''
  });

  assert.equal(resolved.chosenYear, null);
  assert.equal(api.computeEstimatedAge(out.year), '—');
});

test('GE GTH18GBCDCRBB with RZ825479 resolves to 2012 from model evidence', async () => {
  ctx.fetch = async () => {
    throw new Error('lookup offline');
  };

  const ge = api.decoderData.appliances.decoders.ge;
  const out = ge.decode('RZ825479');
  assert.ok(out);

  const resolved = await api.resolveSerialYearFromModel({
    candidates: api.parseCandidateYears(out.year),
    brand: 'GE',
    model: 'GTH18GBCDCRBB',
    context: ''
  });

  assert.equal(resolved.chosenYear, 2012);
  assert.equal(resolved.source, 'client-evidence');
});

test('Frigidaire serial NF11910958 decodes to 2001/2011/2021 week 19', () => {
  const frig = api.decoderData.appliances.decoders.frigidaire;
  const out = frig.decode('NF11910958');
  assert.ok(out);
  assert.match(out.year, /2001/);
  assert.match(out.year, /2011/);
  assert.match(out.year, /2021/);
  assert.match(out.month, /19/);
});

// ── Audit: Bradford White water heater ──────────────────────────────────────

test('Bradford White serial MC12345678 decodes to March 1995 or 2015', () => {
  const bw = api.decoderData.waterHeaters.decoders.bradford_white;
  const out = bw.decode('MC12345678');
  assert.ok(out);
  assert.match(out.year, /1995/);
  assert.match(out.year, /2015/);
  assert.equal(out.month, 'March');
});

// ── Audit: Bosch FD format accuracy ─────────────────────────────────────────

test('Bosch FD8605123456 decodes to 2006 May', () => {
  const bosch = api.decoderData.appliances.decoders.bosch;
  const out = bosch.decode('FD8605123456');
  assert.ok(out);
  assert.equal(out.year, '2006');
  assert.equal(out.month, 'May');
});
