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
      chooseCandidateFromLookup,
      resolveSerialYearFromModel,
      getCurrentSupplementalModelValue,
      setStoredSupplementalModel,
      KENMORE_PREFIX_TO_DECODER,
      expandKnownSmartLookupQuery,
      getSupplementalModelConfig,
      normalizeDecoderCategory,
      extractKenmoreModelPrefix,
      resolveKenmoreDecoderFromPrefix
    };
  `, ctx);

  return { api: ctx.__api, ctx };
}

const { api, ctx } = loadDecoderContext();

test('GE serial-only decode for GM028928Q remains unchanged', () => {
  const ge = api.decoderData.appliances.decoders.ge;
  const result = ge.decode('GM028928Q');
  assert.equal(result.year, '1983/1995/2007/2019');
  assert.equal(result.month, 'April');
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

test('Rare Samsung-built Kenmore serial layout decodes A00843ESC00128 as 2009', () => {
  const samsung = api.decoderData.appliances.decoders.samsung;
  const out = samsung.decode('A00843ESC00128');
  assert.ok(out);
  assert.equal(out.year, '2009');
  assert.equal(out.month, 'December');
});

test('Normal Kenmore prefix behavior and normal Samsung decode remain unchanged', () => {
  const kenmore110 = api.KENMORE_PREFIX_TO_DECODER['110'];
  assert.equal(kenmore110.decoderId, 'whirlpool');
  assert.equal(kenmore110.manufacturer, 'Whirlpool');

  const samsung = api.decoderData.appliances.decoders.samsung;
  const samsungResult = samsung.decode('AAAS1BBBBBB');
  assert.ok(samsungResult);
  assert.equal(samsungResult.year, '2009');
  assert.equal(samsungResult.month, 'January');
});

test('Vizio model requirement is scoped to electronics only', () => {
  const vizioElectronics = api.getSupplementalModelConfig('electronics', 'vizio');
  const vizioAppliances = api.getSupplementalModelConfig('appliances', 'vizio');

  assert.equal(vizioElectronics.required, true);
  assert.equal(vizioElectronics.useModelAsPrimaryInput, true);
  assert.equal(vizioAppliances.required, false);
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
    'Possible manufacture years: 2004, 2014, or 2024. The model number could not confidently resolve the repeating cycle.'
  );
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
