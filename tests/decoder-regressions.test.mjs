import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadDecoderContext() {
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
      body: { classList: { toggle: () => {}, add: () => {}, remove: () => {} }, style: {} },
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} } }),
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
      decodeKenmoreSamsungRarePattern,
      resolveKenmoreDecoderFromPrefixValue,
      buildRheemPrefixGuidance
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

test('GE Narrow Date guardrails prevent 2007 override and clamp to 2019 floor', () => {
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
  assert.equal(selected.chosenYear, 2019);
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

test('Kenmore prefix 401 rare Samsung-built pattern decodes A00843ESC00128 as 2009', () => {
  const samsung = api.decoderData.appliances.decoders.samsung;
  const out = api.decodeKenmoreSamsungRarePattern(
    'A00843ESC00128',
    { prefix: '401', decoderId: 'samsung', manufacturer: 'Samsung' },
    samsung
  );
  assert.ok(out);
  assert.equal(out.year, '2009');
  assert.equal(out.month, 'December');
});

test('Normal Kenmore prefix behavior and normal Samsung decode remain unchanged', () => {
  const kenmore110 = api.resolveKenmoreDecoderFromPrefixValue('110');
  assert.equal(kenmore110.decoderId, 'whirlpool');
  assert.equal(kenmore110.manufacturer, 'Whirlpool');

  const samsung = api.decoderData.appliances.decoders.samsung;
  const samsungResult = samsung.decode('AAAS1BBBBBB');
  assert.ok(samsungResult);
  assert.equal(samsungResult.year, '2009');
  assert.equal(samsungResult.month, 'January');
});

test('Rheem water heater RHx prefix format decodes week/year correctly', () => {
  const rheem = api.decoderData.waterHeaters.decoders.rheem;
  const out = rheem.decode('RHA251405618');
  assert.ok(out);
  assert.equal(out.year, '2014');
  assert.equal(out.month, 'Week 25');
  assert.equal(out.weekDigits, '25');
});

test('Rheem water heater RH prefix format without 3rd char also decodes', () => {
  const rheem = api.decoderData.waterHeaters.decoders.rheem;
  const out = rheem.decode('RH251405618');
  assert.ok(out);
  assert.equal(out.year, '2014');
  assert.equal(out.month, 'Week 25');
  assert.equal(out.weekDigits, '25');
});

test('Non-Rheem brand does not use Rheem RH prefix week/year rule', () => {
  const ruud = api.decoderData.waterHeaters.decoders.ruud;
  const out = ruud.decode('RHA251405618');
  assert.ok(out);
  assert.notEqual(out.year, '2014');
});

test('Ambiguous Rheem prefixed serial triggers try-without-prefix guidance', () => {
  const guidance = api.buildRheemPrefixGuidance('rheem', 'RHBX123', 'waterHeaters');
  assert.ok(guidance.includes('If your serial includes a prefix, try searching again without the prefix letters.'));
  assert.ok(guidance.includes('Or decode manually using the method shown.'));
});

test('Reliance letter month code uses first letter and digits 2-3 for year', () => {
  const reliance = api.decoderData.waterHeaters.decoders.reliance_water_heaters;
  const out = reliance.decode('A14056189');
  assert.ok(out);
  assert.equal(out.month, 'October');
  assert.equal(out.year, '2014');
  assert.equal(out.monthCode, 'A');
  assert.equal(out.yearCode, '14');
});

test('Reliance month code map includes C=December and D=January', () => {
  const reliance = api.decoderData.waterHeaters.decoders.reliance_water_heaters;
  const cOut = reliance.decode('C140561890');
  const dOut = reliance.decode('D140561890');
  assert.equal(cOut.month, 'December');
  assert.equal(dOut.month, 'January');
});

test('Reliance letter month code rule does not apply outside 9/10-char serials', () => {
  const reliance = api.decoderData.waterHeaters.decoders.reliance_water_heaters;
  const shortOut = reliance.decode('A1405618');
  assert.equal(shortOut, null);
});
