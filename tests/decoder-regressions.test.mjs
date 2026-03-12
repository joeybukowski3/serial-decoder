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
      chooseCandidateFromLookup,
      KENMORE_PREFIX_TO_DECODER,
      expandKnownSmartLookupQuery
    };
  `, ctx);

  return ctx.__api;
}

const api = loadDecoderContext();

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
