import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { findExactLocalModelAgeMatch, loadLocalModelAgeDb, normalizeModelNumber } from '../lib/model-age-db.js';
import { buildDecoderBundles } from '../scripts/split-decoder-data.js';
import { loadDecoderContext } from './helpers/decoder-context.mjs';


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

test('GE modern serial with a trailing plant character preserves all A-code cycles', () => {
  const ge = api.decoderData.appliances.decoders.ge;

  for (const serial of ['LA208110G', 'la208110g', '  LA208110G  ']) {
    const normalized = serial.trim();
    const result = ge.decode(normalized);
    assert.ok(result, serial);
    assert.equal(result.month, 'June', serial);
    assert.equal(result.yearCode, 'A', serial);
    assert.equal(result.year, '1977/1989/2001/2013/2025', serial);
    assert.equal(api.hasSingleResolvedYear(result.year), false, serial);
    assert.equal(api.computeEstimatedAge(result.year), '—', serial);
  }
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
    plain(splitData.waterHeaters.decoders.richmond.decode('Q082116285')),
    plain(api.decoderData.waterHeaters.decoders.richmond.decode('Q082116285'))
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

function createTempDecoderOutputDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'decoder-bundles-'));
}

function seedPreviousDecoderBundles(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    appliances: '/assets/decoders/appliances.0000000000.js',
    hvac: '/assets/decoders/hvac.0000000000.js',
    waterHeaters: '/assets/decoders/water-heaters.0000000000.js',
    electronics: '/assets/decoders/electronics.0000000000.js'
  };
  Object.values(manifest).forEach((publicPath) => {
    fs.writeFileSync(path.join(dir, publicPath.replace('/assets/decoders/', '')), 'previous bundle', 'utf8');
  });
  fs.writeFileSync(path.join(dir, 'decoder-bundles.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function readTempManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'decoder-bundles.json'), 'utf8'));
}

test('atomic decoder bundle generation writes a complete deterministic manifest', () => {
  const dir = createTempDecoderOutputDir();
  try {
    fs.writeFileSync(path.join(dir, 'appliances.deadbeef00.js'), 'obsolete bundle', 'utf8');

    const artifacts = buildDecoderBundles({ sourcePath: 'decoder-data.js', outputDir: dir });
    const manifest = readTempManifest(dir);

    assert.deepEqual(Object.keys(manifest).sort(), ['appliances', 'electronics', 'hvac', 'waterHeaters']);
    for (const publicPath of Object.values(manifest)) {
      const file = publicPath.replace('/assets/decoders/', '');
      const fullPath = path.join(dir, file);
      assert.equal(fs.existsSync(fullPath), true, file + ' should exist');
      assert.ok(fs.statSync(fullPath).size > 0, file + ' should be non-empty');
    }
    assert.equal(fs.existsSync(path.join(dir, 'appliances.deadbeef00.js')), false, 'obsolete bundles are removed after success');
    assert.deepEqual(manifest, artifacts.manifest);

    buildDecoderBundles({ sourcePath: 'decoder-data.js', outputDir: dir });
    assert.deepEqual(readTempManifest(dir), manifest, 're-running generation is deterministic');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('atomic decoder bundle generation failure after temporary files preserves previous output', () => {
  const dir = createTempDecoderOutputDir();
  try {
    const previous = seedPreviousDecoderBundles(dir);

    assert.throws(
      () => buildDecoderBundles({ sourcePath: 'decoder-data.js', outputDir: dir, simulateFailureAt: 'after-temp' }),
      /Simulated decoder bundle generation failure/
    );

    assert.deepEqual(readTempManifest(dir), previous);
    for (const publicPath of Object.values(previous)) {
      assert.equal(fs.existsSync(path.join(dir, publicPath.replace('/assets/decoders/', ''))), true);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('atomic decoder bundle generation failure after bundle publication does not expose a partial manifest', () => {
  const dir = createTempDecoderOutputDir();
  try {
    const previous = seedPreviousDecoderBundles(dir);

    assert.throws(
      () => buildDecoderBundles({ sourcePath: 'decoder-data.js', outputDir: dir, simulateFailureAt: 'after-bundles' }),
      /Simulated decoder bundle generation failure/
    );

    assert.deepEqual(readTempManifest(dir), previous);
    for (const publicPath of Object.values(previous)) {
      assert.equal(fs.existsSync(path.join(dir, publicPath.replace('/assets/decoders/', ''))), true);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('GE Narrow Date refinement treats internally contradictory evidence as unusable (PR-2)', () => {
  // PR-2 policy change: estimatedYear (2007) falls outside the yearRange
  // window (2019-Present), so this evidence is contradictory and must not
  // resolve to either side. Previously this picked 2007 via unbounded
  // nearest-candidate selection, which is exactly the audit's risk case.
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
  assert.equal(selected.chosenYear, null);
  assert.equal(selected.status, 'conflict');
  assert.equal(selected.reason, 'contradictory-evidence');
  assert.deepEqual(Array.from(selected.remainingCandidateYears), candidates);
});

test('Estimated age stays hidden when multiple valid manufacturer years are returned', () => {
  const ge = api.decoderData.appliances.decoders.ge;
  const result = ge.decode('GM028928Q');

  assert.equal(result.year, '1983/1995/2007/2019');
  assert.equal(api.computeEstimatedAge(result.year), '—');
  assert.equal(api.hasSingleResolvedYear(result.year), false);
});

test('Narrow Date no longer picks a far-away candidate as "strong-evidence adjustment" (PR-2)', () => {
  // PR-2 policy change: estimatedYear 2008 is 9+ years from every serial
  // candidate, well outside the +/-3 year tolerance, so this must return
  // conflict instead of the previous unbounded nearest-candidate pick (2017).
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
  assert.equal(selected.chosenYear, null);
  assert.equal(selected.status, 'conflict');
  assert.deepEqual(Array.from(selected.remainingCandidateYears), [2017, 2019]);
});

// ── PR-2 audit: unified intersection/tolerance policy for model-assisted
//    year narrowing (narrowCandidatesWithEvidence) ──────────────────────────

test('narrowCandidatesWithEvidence resolves when exactly one candidate falls inside the model yearRange window', () => {
  const result = api.narrowCandidatesWithEvidence([2004, 2014, 2024], { yearRange: '2013-2016' });
  assert.ok(result);
  assert.equal(result.status, 'resolved');
  assert.equal(result.chosenYear, 2014);
  assert.deepEqual(Array.from(result.remainingCandidateYears), [2014]);
});

test('narrowCandidatesWithEvidence stays ambiguous when multiple candidates fall inside the model yearRange window', () => {
  // yearRange 2010-2025 intersects 2014 and 2024, but 2004 falls outside the
  // window and is correctly excluded from the narrowed remaining set.
  const result = api.narrowCandidatesWithEvidence([2004, 2014, 2024], { yearRange: '2010-2025' });
  assert.ok(result);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.chosenYear, null);
  assert.deepEqual(Array.from(result.remainingCandidateYears), [2014, 2024]);
});

test('narrowCandidatesWithEvidence returns conflict when no candidate falls inside the model yearRange window', () => {
  const result = api.narrowCandidatesWithEvidence([1994, 2024], { yearRange: '2010-2013' });
  assert.ok(result);
  assert.equal(result.status, 'conflict');
  assert.equal(result.chosenYear, null);
  assert.deepEqual(Array.from(result.remainingCandidateYears), [1994, 2024]);
});

test('narrowCandidatesWithEvidence resolves a lone estimatedYear only within +/-3 year tolerance of exactly one candidate', () => {
  const resolved = api.narrowCandidatesWithEvidence([2004, 2014, 2024], { estimatedYear: '2015' });
  assert.ok(resolved);
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.chosenYear, 2014);
  assert.equal(resolved.confidence, 'Low', 'point-tolerance resolutions are lower confidence than window intersections');
});

test('narrowCandidatesWithEvidence does not resolve a lone estimatedYear more than 3 years from every candidate', () => {
  const result = api.narrowCandidatesWithEvidence([2017, 2019], { estimatedYear: '2008' });
  assert.ok(result);
  assert.equal(result.status, 'conflict');
  assert.equal(result.chosenYear, null);
  assert.deepEqual(Array.from(result.remainingCandidateYears), [2017, 2019]);
});

test('narrowCandidatesWithEvidence stays ambiguous when a lone estimatedYear is within tolerance of multiple candidates', () => {
  const result = api.narrowCandidatesWithEvidence([2012, 2014, 2024], { estimatedYear: '2013' });
  assert.ok(result);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.chosenYear, null);
  assert.deepEqual(Array.from(result.remainingCandidateYears), [2012, 2014]);
});

test('detectContradictoryEvidence flags an estimatedYear that falls outside the yearRange window', () => {
  const contradictory = api.detectContradictoryEvidence({ estimatedYear: '2007', yearRange: '2019-Present' });
  const consistent = api.detectContradictoryEvidence({ estimatedYear: '2014', yearRange: '2013-2016' });
  assert.equal(contradictory, true);
  assert.equal(consistent, false);
});

test('narrowCandidatesWithEvidence treats contradictory estimatedYear/yearRange evidence as unusable', () => {
  const result = api.narrowCandidatesWithEvidence(
    [1983, 1995, 2007, 2019],
    { estimatedYear: '2007', yearRange: '2019-Present' }
  );
  assert.ok(result);
  assert.equal(result.status, 'conflict');
  assert.equal(result.reason, 'contradictory-evidence');
  assert.equal(result.chosenYear, null);
  assert.deepEqual(Array.from(result.remainingCandidateYears), [1983, 1995, 2007, 2019]);
});

test('narrowCandidatesWithEvidence returns null when there is no usable evidence signal', () => {
  assert.equal(api.narrowCandidatesWithEvidence([2004, 2014, 2024], {}), null);
  assert.equal(api.narrowCandidatesWithEvidence([2004, 2014, 2024], { estimatedYear: null, yearRange: null }), null);
  assert.equal(api.narrowCandidatesWithEvidence([], { yearRange: '2013-2016' }), null);
});

test('Smart Lookup fallback cannot render a confirmed year unless it passes the unified policy', async () => {
  // Candidates 9+ years from the LLM-suggested year must not resolve, even
  // though the old code would nearest-select the first suggestion as if it
  // were a confirmed decode.
  let callCount = 0;
  ctx.fetch = async (url) => {
    callCount += 1;
    if (String(url).includes('/api/age-lookup')) {
      throw new Error('lookup offline');
    }
    if (String(url).includes('/api/smart-query-interpret')) {
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ suggestions: ['This model was likely made around 2008.'] })
      };
    }
    throw new Error('unexpected fetch: ' + url);
  };

  const resolved = await api.resolveSerialYearFromModel({
    candidates: [2017, 2019],
    brand: 'TestBrand',
    model: 'NOMATCHMODEL',
    context: ''
  });

  assert.equal(resolved.chosenYear, null);
  assert.notEqual(resolved.source, 'smart-lookup');
});

test('Smart Lookup fallback can resolve a year when its suggestion passes the unified tolerance policy', async () => {
  ctx.fetch = async (url) => {
    if (String(url).includes('/api/age-lookup')) {
      throw new Error('lookup offline');
    }
    if (String(url).includes('/api/smart-query-interpret')) {
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ suggestions: ['This model was likely made in 2015.'] })
      };
    }
    throw new Error('unexpected fetch: ' + url);
  };

  const resolved = await api.resolveSerialYearFromModel({
    candidates: [2004, 2014, 2024],
    brand: 'TestBrand',
    model: 'NOMATCHMODEL',
    context: ''
  });

  assert.equal(resolved.chosenYear, 2014);
  assert.equal(resolved.source, 'smart-lookup');
  assert.equal(resolved.confidence, 'Low', 'Smart Lookup evidence is supporting-only, never authoritative');
});

test('Smart Lookup fallback does not guess when suggestions mention multiple distinct years', async () => {
  ctx.fetch = async (url) => {
    if (String(url).includes('/api/age-lookup')) {
      throw new Error('lookup offline');
    }
    if (String(url).includes('/api/smart-query-interpret')) {
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ suggestions: ['Could be 2014 or maybe 2024, hard to say.'] })
      };
    }
    throw new Error('unexpected fetch: ' + url);
  };

  const resolved = await api.resolveSerialYearFromModel({
    candidates: [2004, 2014, 2024],
    brand: 'TestBrand',
    model: 'NOMATCHMODEL',
    context: ''
  });

  assert.equal(resolved.chosenYear, null);
  assert.notEqual(resolved.source, 'smart-lookup');
});

test('deterministicRefinement no longer nearest-selects a free-text year mention outside tolerance', () => {
  const result = api.deterministicRefinement([2017, 2019], 'UNKNOWNMODEL', 'Model launched in 2008.');
  assert.equal(result.chosenYear, null);
});

test('deterministicRefinement resolves a free-text year mention within tolerance of exactly one candidate', () => {
  const result = api.deterministicRefinement([2004, 2014, 2024], 'UNKNOWNMODEL', 'Released around 2015.');
  assert.equal(result.chosenYear, 2014);
  assert.equal(result.confidence, 'Low');
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

test('Vizio V505-J09 returns model-year context without claiming a serial decode', () => {
  const result = api.decoderData.electronics.decoders.vizio.decode('V505-J09');

  assert.ok(result);
  assert.equal(result.year, '2021');
  assert.match(result.method, /model number year code/i);
});

test('Apple legacy and randomized serial paths remain explicitly different', () => {
  const apple = api.decoderData.electronics.decoders.apple;
  const legacy = apple.decode('C02X12ABCDEF');
  const randomized = apple.decode('AB12CD34EF');

  assert.deepEqual({ year: legacy.year, month: legacy.month }, { year: '2019/2029', month: 'Week 12' });
  assert.equal(randomized.year, 'Post-2021 (Randomized)');
  assert.match(randomized.month, /may be randomized/i);
});

test('HP CNX7120BXX preserves decade ambiguity and production week', () => {
  const result = api.decoderData.electronics.decoders.hp.decode('CNX7120BXX');

  assert.ok(result);
  assert.equal(result.year, '2007/2017');
  assert.equal(result.month, 'Week 12');
});

test('Sony XR65A90K returns model suffix year context', () => {
  const result = api.decoderData.electronics.decoders.sony.decode('XR65A90K');

  assert.ok(result);
  assert.equal(result.year, '2022');
  assert.equal(result.month, 'Model suffix: K');
});

test('Samsung TV example preserves candidate-year cycle and month', () => {
  const result = api.decoderData.electronics.decoders.samsung_tv.decode('07R5CAHJB001234');

  assert.ok(result);
  assert.equal(result.year, '2017/2037');
  assert.equal(result.month, 'November');
});

test('Kenmore model field is no longer required, and accepts a full model number (UX update)', () => {
  // UX change: users can now decode Kenmore without providing a model
  // number/prefix at all (falls back to the documented Whirlpool default),
  // and the write-in field accepts a full model number rather than being
  // truncated to a 3-digit prefix on every keystroke.
  const kenmoreAppliances = api.getSupplementalModelConfig('appliances', 'kenmore');
  const normalized = api.normalizeDecoderCategory('water-heaters');

  assert.equal(kenmoreAppliances.required, false);
  assert.equal(kenmoreAppliances.label, 'Model Number');
  assert.equal(kenmoreAppliances.maxLength, undefined);
  assert.equal(kenmoreAppliances.sanitize, undefined);
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

test('Richmond plant-prefix WWYY serial Q082116285 decodes to week 8 of 2021', () => {
  const richmond = api.decoderData.waterHeaters.decoders.richmond;
  const out = richmond.decode('Q082116285');

  assert.ok(out);
  assert.equal(out.year, '2021');
  assert.equal(out.month, 'Week 8');
  assert.equal(out.yearCode, '21');
  assert.equal(out.weekDigits, '08');
  assert.equal(out.plantCode, 'Q');
  assert.equal(out.decodeStyle, 'Plant-prefix WWYY');
  assert.match(out.notes, /Q0821 indicates week 08 of 2021/i);
});

test('Richmond plant-prefix WWYY decode remains valid with optional model GG50-38F3', () => {
  const richmond = api.decoderData.waterHeaters.decoders.richmond;
  const out = richmond.decode('Q082116285', 'GG50-38F3');

  assert.ok(out);
  assert.equal(out.year, '2021');
  assert.equal(out.month, 'Week 8');
  assert.deepEqual(plain(api.sanitizeDecodeResult(out)), { valid: true });
  assert.equal(api.isIncompleteResult(out), false);
});

test('Rheem-family plant-prefix WWYY parser normalizes formatted direct input before prefix-MMYY matching', () => {
  const variants = [
    'Q082116285',
    'Q08-21-16285',
    'Q08 21 16285',
    'Q08/21/16285',
    'Q08.21.16285',
    'q082116285',
    'q08-21-16285',
    'q08 21 16285',
    'q08/21/16285',
    'q08.21.16285'
  ];

  for (const brandId of ['rheem', 'richmond', 'ruud']) {
    const decoder = api.decoderData.waterHeaters.decoders[brandId];
    for (const serial of variants) {
      const out = decoder.decode(serial, 'GG50-38F3');
      assert.ok(out, brandId + ' should decode ' + serial);
      assert.equal(out.year, '2021', brandId + ' ' + serial);
      assert.equal(out.month, 'Week 8', brandId + ' ' + serial);
      assert.equal(out.yearCode, '21', brandId + ' ' + serial);
      assert.equal(out.weekDigits, '08', brandId + ' ' + serial);
      assert.equal(out.decodeStyle, 'Plant-prefix WWYY', brandId + ' ' + serial);
    }
  }
});

test('Richmond Rheem-family letter-prefix MMYY serial RMLN0711511358 decodes to July 2011', () => {
  const richmond = api.decoderData.waterHeaters.decoders.richmond;
  const out = richmond.decode('RMLN0711511358', '6G50-38F1');

  assert.ok(out);
  assert.equal(out.year, '2011');
  assert.equal(out.month, 'July');
  assert.equal(out.yearCode, '11');
  assert.equal(out.monthCode, '07');
  assert.equal(out.prefix, 'RMLN');
  assert.equal(out.decodeStyle, 'Letter-prefix MMYY');
  assert.deepEqual(plain(api.sanitizeDecodeResult(out)), { valid: true });
  assert.equal(api.isIncompleteResult(out), false);
});

test('Rheem-family alias handling decodes RMLN0711511358 as letter-prefix MMYY', () => {
  for (const brandId of ['rheem', 'ruud']) {
    const decoder = api.decoderData.waterHeaters.decoders[brandId];
    const out = decoder.decode('RMLN0711511358', '6G50-38F1');

    assert.ok(out, brandId + ' should decode RMLN0711511358');
    assert.equal(out.year, '2011', brandId);
    assert.equal(out.month, 'July', brandId);
    assert.equal(out.decodeStyle, 'Letter-prefix MMYY', brandId);
  }
});

test('Rheem-family letter-prefix MMYY parser normalizes lowercase and formatted serial input', () => {
  const richmond = api.decoderData.waterHeaters.decoders.richmond;
  const out = richmond.decode(' rmln-07 11-511358 ', '6G50-38F1');

  assert.ok(out);
  assert.equal(out.year, '2011');
  assert.equal(out.month, 'July');
  assert.equal(out.prefix, 'RMLN');
});

test('Rheem-family letter-prefix MMYY parser rejects invalid month values', () => {
  for (const brandId of ['rheem', 'richmond', 'ruud']) {
    const decoder = api.decoderData.waterHeaters.decoders[brandId];
    assert.equal(decoder.decode('RMLN1311511358', '6G50-38F1'), null, brandId + ' should reject month 13');
  }
});

test('Rheem-family plant-prefix WWYY format accepts only weeks 01 through 53', () => {
  for (const brandId of ['rheem', 'richmond', 'ruud']) {
    const decoder = api.decoderData.waterHeaters.decoders[brandId];
    assert.ok(decoder.decode('Q012116285'), brandId + ' should accept week 01');
    assert.ok(decoder.decode('Q532116285'), brandId + ' should accept week 53');
    assert.equal(decoder.decode('Q002116285'), null, brandId + ' should reject week 00');
    assert.equal(decoder.decode('Q542116285'), null, brandId + ' should reject week 54');
    assert.equal(decoder.decode('Q54-21-16285'), null, brandId + ' formatted week 54 must not fall through');
  }
});

test('Rheem-family plant-prefix WWYY format enforces the existing one-year future tolerance', () => {
  const nextYear = new Date().getFullYear() + 1;
  const tooFarFutureYear = nextYear + 1;
  const withinTolerance = 'Q08' + String(nextYear).slice(-2) + '16285';
  const beyondTolerance = 'Q08' + String(tooFarFutureYear).slice(-2) + '16285';

  for (const brandId of ['rheem', 'richmond', 'ruud']) {
    const decoder = api.decoderData.waterHeaters.decoders[brandId];
    assert.ok(decoder.decode(withinTolerance), brandId + ' should allow current year + 1');
    assert.equal(decoder.decode(beyondTolerance), null, brandId + ' should reject current year + 2');
    assert.equal(decoder.decode('Q08-' + String(tooFarFutureYear).slice(-2) + '-16285'), null, brandId + ' formatted current year + 2 should reject');
  }
});

test('GE and generic water-heater MMYY parsing do not gain plant-prefix WWYY support', () => {
  const ge = api.decoderData.waterHeaters.decoders.ge_water_heaters;
  const vanguard = api.decoderData.waterHeaters.decoders.vanguard;

  assert.equal(ge.decode('Q082116285'), null);
  assert.equal(vanguard.decode('Q082116285'), null);
});

test('Non-Rheem brand does not use Rheem RH prefix week/year rule', () => {
  const ruud = api.decoderData.waterHeaters.decoders.ruud;
  // Letters occupy the MMYY positions, so this is an unsupported format for
  // Ruud's Style 1 decode. It previously produced the garbage year "20A2".
  const out = ruud.decode('RHA251405618');
  assert.equal(out, null);
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

test('A.O. Smith letter-coded serial A1405618 decodes to January 2014', () => {
  const aos = api.decoderData.waterHeaters.decoders.a_o_smith;
  const out = aos.decode('A1405618');
  assert.ok(out);
  assert.equal(out.year, '2014');
  assert.equal(out.month, 'January');
  assert.equal(out.monthCode, 'A');
  assert.equal(out.yearCode, '14');
});

test('A.O. Smith letter-coded serial H1309XXXXX decodes to August 2013', () => {
  const aos = api.decoderData.waterHeaters.decoders.a_o_smith;
  const out = aos.decode('H1309XXXXX');
  assert.ok(out);
  assert.equal(out.year, '2013');
  assert.equal(out.month, 'August');
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
  // PR-1 strict parsing requires the documented leading WWYY digits, so the
  // fixture uses week 14 instead of the old XX placeholder prefix.
  const out = carrier.decode('1427XXXXX');
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
  // PR-1 strict parsing requires the documented leading WWYY digits, so the
  // fixture uses week 14 instead of the old XX placeholder prefix.
  const out = trane.decode('1427XXXXXX');
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

test('GE FR31424IN decodes to March 1984/1996/2008/2020 and stays ambiguous without a model', async () => {
  const ge = api.decoderData.appliances.decoders.ge;
  const out = ge.decode('FR31424IN');
  assert.ok(out);
  assert.equal(out.year, '1984/1996/2008/2020');
  assert.equal(out.month, 'March');

  const resolved = await api.resolveSerialYearFromModel({
    candidates: api.parseCandidateYears(out.year),
    brand: 'GE',
    model: '',
    context: '',
  });

  // Ambiguous, not incomplete: the decoder correctly returned the full
  // repeating year cycle, it simply cannot be narrowed without a model.
  assert.equal(resolved.chosenYear, null);
  assert.equal(api.computeEstimatedAge(out.year), '—');
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

test('Frigidaire FFTR2045VS0 model context resolves BA10515647 to 2021', () => {
  const frigidaire = api.decoderData.appliances.decoders.frigidaire;
  const out = frigidaire.decode('BA10515647', 'FFTR2045VS0');

  assert.ok(out);
  assert.equal(out.year, '2021');
  assert.equal(out.month, 'Week 05 (see notes for decade)');
  assert.match(out.modelRefinementNote, /model context/i);
});

test('Frigidaire FFTR2045VSO trailing O typo still resolves BA10515647 to 2021', () => {
  const frigidaire = api.decoderData.appliances.decoders.frigidaire;
  const out = frigidaire.decode('BA10515647', 'FFTR2045VSO');

  assert.ok(out);
  assert.equal(out.year, '2021');
  assert.equal(out.modelNormalized, 'FFTR2045VS0');
});

test('Electrolux decoder uses the same FFTR2045VS model-era context', () => {
  const electrolux = api.decoderData.appliances.decoders.electrolux;
  const out = electrolux.decode('BA10515647', 'FFTR2045VS0');

  assert.ok(out);
  assert.equal(out.year, '2021');
});

test('Frigidaire serial-only result remains decade-ambiguous', () => {
  const frigidaire = api.decoderData.appliances.decoders.frigidaire;
  const out = frigidaire.decode('BA10515647');

  assert.ok(out);
  assert.equal(out.year, '1991/2001/2011/2021');
  assert.equal(api.parseCandidateYears(out.year).includes(2011), true);
  assert.equal(api.parseCandidateYears(out.year).includes(2021), true);
});

test('Result text sanitizer removes replacement characters from user-facing notes', () => {
  const mojibakeReplacement = '\u00EF\u00BF\u00BD';
  const replacementChar = '\uFFFD';
  const dirty = 'Decade ambiguity: ' + mojibakeReplacement + ' model/style context often needed. Bad replacement: ' + replacementChar;
  const clean = api.sanitizeAlertText(dirty);

  assert.equal(clean.includes(mojibakeReplacement), false);
  assert.equal(clean.includes(replacementChar), false);
  assert.match(clean, /Decade ambiguity: - model/);
});

test('Local model lookup preserves Frigidaire O/0 distinction', async () => {
  assert.equal(normalizeModelNumber('FFTR2045VSO'), 'fftr2045vso');
  assert.equal(normalizeModelNumber('FFTR2045VS0'), 'fftr2045vs0');

  const db = await loadLocalModelAgeDb({ forceReload: true });
  const unverified = findExactLocalModelAgeMatch(db.records, 'FFTR2045VSO', 'Frigidaire');
  const exact = findExactLocalModelAgeMatch(db.records, 'FFTR2045VS0', 'Frigidaire');
  assert.equal(unverified, null);
  assert.ok(exact);
  assert.equal(exact.record.estimatedYear, undefined);
  assert.equal(exact.record.productionRange, '2020-2024');
});

// ── PR-1 audit: strict-parse guards & honest unsupported-format state ────────

const GENERIC_MMYY_WATER_HEATER_BRANDS = [
  'ruud',
  'richmond',
  'vanguard',
  'ge_water_heaters',
  'montgomery_ward',
  'aqua_therm',
  'energy_master',
  'cimarron',
  'intertherm_miller'
];

test('Generic water-heater MMYY decoders reject letter-prefixed garbage like AB1234567', () => {
  for (const brandId of GENERIC_MMYY_WATER_HEATER_BRANDS) {
    const decoder = api.decoderData.waterHeaters.decoders[brandId];
    assert.equal(decoder.decode('AB1234567'), null, brandId + ' should reject AB1234567');
  }
});

test('Generic water-heater MMYY decoders reject invalid months 00 and 13', () => {
  for (const brandId of GENERIC_MMYY_WATER_HEATER_BRANDS) {
    const decoder = api.decoderData.waterHeaters.decoders[brandId];
    assert.equal(decoder.decode('1334567890'), null, brandId + ' should reject month 13');
    assert.equal(decoder.decode('0034567890'), null, brandId + ' should reject month 00');
  }
});

test('Generic water-heater MMYY decoders reject implausible far-future years', () => {
  for (const brandId of GENERIC_MMYY_WATER_HEATER_BRANDS) {
    const decoder = api.decoderData.waterHeaters.decoders[brandId];
    // MM=12 YY=34 would be 2034; that is not a plausible manufacture year.
    assert.equal(decoder.decode('1234567890'), null, brandId + ' should reject year 2034');
  }
});

test('Generic water-heater MMYY decoders still decode a valid MMYYXXXXXX serial', () => {
  for (const brandId of GENERIC_MMYY_WATER_HEATER_BRANDS) {
    const decoder = api.decoderData.waterHeaters.decoders[brandId];
    const out = decoder.decode('0414B76543');
    assert.ok(out, brandId + ' should decode 0414B76543');
    assert.equal(out.year, '2014');
    assert.equal(out.month, 'April');
  }
});

test('Carrier rejects letter-prefixed garbage instead of decoding AB1234567 as 2012', () => {
  const carrier = api.decoderData.hvac.decoders.carrier;
  assert.equal(carrier.decode('AB1234567'), null);
});

test('Carrier rejects invalid production weeks 00 and 54', () => {
  const carrier = api.decoderData.hvac.decoders.carrier;
  assert.equal(carrier.decode('0019XXXXX'), null);
  assert.equal(carrier.decode('5419XXXXX'), null);
});

test('Trane and American Standard reject malformed serials instead of decoding them as 2012', () => {
  const trane = api.decoderData.hvac.decoders.trane;
  const americanStandard = api.decoderData.hvac.decoders.american_standard;
  assert.equal(trane.decode('AB1234567'), null);
  assert.equal(americanStandard.decode('AB1234567'), null);
});

test('Carrier/Trane/American Standard reject implausible far-future year codes', () => {
  // 1234567890 reads as week 12, year code 34 (2034) — beyond tolerance.
  for (const brandId of ['carrier', 'trane', 'american_standard']) {
    const decoder = api.decoderData.hvac.decoders[brandId];
    assert.equal(decoder.decode('1234567890'), null, brandId + ' should reject year 2034');
  }
});

test('American Standard still decodes a conforming WWYY serial', () => {
  const out = api.decoderData.hvac.decoders.american_standard.decode('1419XXXX');
  assert.ok(out);
  assert.equal(out.year, '2019');
});

test('Rheem and Ruud HVAC no longer decode GE refrigerator serial GM028928Q', () => {
  const rheem = api.decoderData.hvac.decoders.rheem;
  const ruud = api.decoderData.hvac.decoders.ruud;
  assert.equal(rheem.decode('GM028928Q'), null);
  assert.equal(ruud.decode('GM028928Q'), null);
});

test('Rheem HVAC still decodes the documented letter+WWYY format', () => {
  const out = api.decoderData.hvac.decoders.rheem.decode('X4502XXXX');
  assert.ok(out);
  assert.equal(out.year, '2002');
  assert.equal(out.month, 'Week 45');
});

test('Bosch family never emits a fabricated year like 19AB', () => {
  for (const brandId of ['bosch', 'thermador', 'gaggenau']) {
    const decoder = api.decoderData.appliances.decoders[brandId];
    assert.equal(decoder.decode('AB1234567'), null, brandId + ' letters in FD year position');
    assert.equal(decoder.decode('1234567890'), null, brandId + ' month 34 is invalid');
    const out = decoder.decode('FD8605123456');
    assert.ok(out, brandId + ' known-good FD serial');
    assert.equal(out.year, '2006');
    assert.equal(out.month, 'May');
  }
});

test('GE returns no result instead of an "Unknown code" year value', () => {
  const ge = api.decoderData.appliances.decoders.ge;
  // B is not a GE year letter, so this must be unsupported, not a year.
  assert.equal(ge.decode('AB1234567'), null);
  const known = ge.decode('GM028928Q');
  assert.ok(known);
  assert.equal(known.year, '1983/1995/2007/2019');
});

test('Cafe (GE family) returns no result instead of an "Unknown code" year value', () => {
  const cafe = api.decoderData.appliances.decoders.cafe;
  assert.equal(cafe.decode('AB1234567'), null);
});

test('Pre-2006 Maytag family returns no result instead of an "Unknown code" year value', () => {
  const preMaytagFamily = [
    'maytag_pre_2006',
    'jenn_air_pre_2006',
    'amana_pre_2006',
    'admiral_pre_2006',
    'magic_chef',
    'speed_queen'
  ];
  for (const brandId of preMaytagFamily) {
    const decoder = api.decoderData.appliances.decoders[brandId];
    // Second-to-last character "6" is not a valid pre-2006 year letter.
    assert.equal(decoder.decode('AB1234567'), null, brandId + ' should reject digit year code');
  }
});

test('Pre-2006 Maytag family still decodes a mapped year letter', () => {
  const out = api.decoderData.appliances.decoders.maytag_pre_2006.decode('12345678WA');
  assert.ok(out);
  assert.equal(out.year, '1999/2023');
  assert.equal(out.month, 'January');
});

test('ASUS rejects short or non-alphanumeric garbage instead of returning 2010', () => {
  const asus = api.decoderData.electronics.decoders.asus;
  assert.equal(asus.decode('AB1234567'), null);
  assert.equal(asus.decode('!!invalid!!'), null);
});

test('ASUS still decodes a full-length serial with valid year and month codes', () => {
  const out = api.decoderData.electronics.decoders.asus.decode('E5N0CV123456');
  assert.ok(out);
  assert.equal(out.year, '2014');
  assert.equal(out.month, 'May');
});

test('Bradford White year map uses slash-separated candidates after normalization', () => {
  const out = api.decoderData.waterHeaters.decoders.bradford_white.decode('AC12345678');
  assert.ok(out);
  assert.equal(out.year, '1984/2004/2024');
  assert.equal(out.month, 'March');
});

test('sanitizeDecodeResult only accepts explicit year formats and approved sentinels', () => {
  const isValid = (year) => api.sanitizeDecodeResult({ year }).valid;

  assert.equal(isValid('2012'), true);
  assert.equal(isValid('1994/2024'), true);
  assert.equal(isValid('2004/2014/2024'), true);
  assert.equal(isValid('1983/1995/2007/2019'), true);
  assert.equal(isValid('2009/2029'), true, 'one candidate in plausible range is enough');
  assert.equal(isValid('Post-2021 (Randomized)'), true, 'approved Apple sentinel');

  assert.equal(isValid('Unknown code: 6'), false);
  assert.equal(isValid('19AB'), false);
  assert.equal(isValid('No year suffix found'), false);
  assert.equal(isValid('Year digit: A (decade unknown)'), false);
  assert.equal(isValid('2034'), false, 'future single year');
  assert.equal(isValid('1899'), false, 'pre-1980 single year');
  assert.equal(isValid('2040/2043'), false, 'no candidate in plausible range');
  assert.equal(isValid(''), false);
  assert.equal(isValid('1984 or 2004/2024'), false, 'legacy or-format is normalized at the source');
});

test('classifyDecodeResult distinguishes complete, incomplete, unsupported, invalid, and decoder errors', () => {
  const richmond = api.decoderData.waterHeaters.decoders.richmond;
  const rheem = api.decoderData.waterHeaters.decoders.rheem;
  const trane = api.decoderData.hvac.decoders.trane;
  const ge = api.decoderData.appliances.decoders.ge;

  assert.equal(
    api.classifyDecodeResult(richmond.decode('RMLN0711511358', '6G50-38F1'), richmond).status,
    'complete_success'
  );
  assert.equal(
    api.classifyDecodeResult(rheem.decode('Q08-21-16285', 'GG50-38F3'), rheem).status,
    'complete_success'
  );
  assert.equal(
    api.classifyDecodeResult(trane.decode('1419XXXX'), trane).status,
    'complete_success',
    'legitimate year-only decoders remain clean successes'
  );

  assert.equal(
    api.classifyDecodeResult({ year: '2016', month: 'Unknown code: Z' }, richmond).status,
    'incomplete'
  );
  assert.equal(
    api.classifyDecodeResult(ge.decode('GM028928Q'), ge).status,
    'incomplete',
    'ambiguous year candidates are not clean successes'
  );
  // GM028928Q yields four candidates, which the unpatched sanitizer accepts;
  // the five-candidate A-code path needs serial-multicycle-year-patch.js and
  // is covered end-to-end by the Playwright GE A-code test.
  const ambiguousGe = api.classifyDecodeResult(ge.decode('GM028928Q'), ge);
  assert.equal(ambiguousGe.status, 'incomplete');
  assert.equal(
    ambiguousGe.ambiguousYears,
    true,
    'multi-cycle year lists are flagged as ambiguous, not treated as bad input'
  );
  assert.equal(
    api.classifyDecodeResult({ year: '2016', month: 'Unknown code: Z' }, richmond).ambiguousYears,
    undefined,
    'genuinely incomplete dates carry no ambiguous-years flag'
  );
  assert.equal(api.classifyDecodeResult(null, richmond).status, 'unsupported');
  assert.equal(api.classifyDecodeResult({ year: '2034', month: 'April' }, richmond).status, 'invalid');
  assert.equal(
    api.classifyDecodeResult(null, richmond, { decoderError: true, reason: 'boom' }).status,
    'decoder_error'
  );
});

test('decode pipeline only emits decode_success for complete classified results', () => {
  const src = fs.readFileSync('script.js', 'utf8');
  assert.match(src, /classifyDecodeResult\(e,p\)/);
  assert.match(src, /"complete_success"===t\.status\?trackAnalyticsEvent\("decode_success"/);
  assert.match(src, /classification:t\.status/);
});

test('incomplete-result warning stays hidden for ambiguous multi-year results', () => {
  const src = fs.readFileSync('script.js', 'utf8');
  // The refinement panel is the intended UX for multi-cycle year lists; the
  // "verify your inputs" warning must not fire for that classification.
  assert.match(src, /"complete_success"!==s\.status&&!s\.ambiguousYears\|\|i/);
});

// ── Kenmore model-prefix helper (UX improvement) ─────────────────────────────

test('Kenmore prefix dropdown options come only from the existing KENMORE_PREFIX_TO_DECODER table', () => {
  const options = api.getKenmorePrefixDropdownOptions();
  const expectedPrefixes = Object.keys(api.KENMORE_PREFIX_TO_DECODER).sort((a, b) => Number(a) - Number(b));

  assert.deepEqual(Array.from(options).map((option) => option.value), expectedPrefixes);
  assert.ok(options.length > 0);

  for (const option of options) {
    const entry = api.KENMORE_PREFIX_TO_DECODER[option.value];
    assert.ok(entry, 'every dropdown option must map to an existing supported prefix');
    assert.equal(option.label, `${option.value} — ${entry.manufacturer}-built Kenmore`);
  }

  // Spot-check a couple of known entries to guard against silently dropping
  // or renaming supported prefixes.
  const byValue = Object.fromEntries(options.map((option) => [option.value, option.label]));
  assert.equal(byValue['110'], '110 — Whirlpool-built Kenmore');
  assert.equal(byValue['795'], '795 — LG-built Kenmore');
  assert.equal(byValue['362'], '362 — General Electric-built Kenmore');
});

test('Kenmore prefix fallback uses the selected dropdown prefix when the model field is blank', () => {
  const originalGetById = ctx.document.getElementById;
  ctx.document.getElementById = (id) => (id === 'kenmoreModelPrefix' ? { value: '110' } : originalGetById(id));

  const effective = api.applyKenmorePrefixFallback('');

  assert.equal(effective, '110');
  ctx.document.getElementById = originalGetById;
});

test('Typed Kenmore model number takes precedence over the dropdown prefix', () => {
  const originalGetById = ctx.document.getElementById;
  ctx.document.getElementById = (id) => (id === 'kenmoreModelPrefix' ? { value: '110' } : originalGetById(id));

  // Typed value's own prefix (795) differs from the dropdown selection
  // (110); the typed value must still win.
  const effective = api.applyKenmorePrefixFallback('795.74053.410');

  assert.equal(effective, '795.74053.410');
  ctx.document.getElementById = originalGetById;
});

test('Kenmore prefix fallback returns blank when neither a typed value nor a dropdown selection exists', () => {
  const originalGetById = ctx.document.getElementById;
  ctx.document.getElementById = (id) => (id === 'kenmoreModelPrefix' ? { value: '' } : originalGetById(id));

  assert.equal(api.applyKenmorePrefixFallback(''), '');
  ctx.document.getElementById = originalGetById;
});

test('Kenmore 795 prefix from the dropdown alone routes to LG decoding (full typed model number still works too)', () => {
  const originalGetById = ctx.document.getElementById;

  // Blank model field, dropdown prefix 795 selected.
  ctx.document.getElementById = (id) => (id === 'kenmoreModelPrefix' ? { value: '795' } : originalGetById(id));
  const fromDropdown = api.applyKenmorePrefixFallback('');
  const resolvedFromDropdown = api.resolveKenmoreDecoderFromPrefix(fromDropdown);
  assert.equal(resolvedFromDropdown.prefix, '795');
  assert.equal(resolvedFromDropdown.decoderId, 'lg');

  // Existing typed-full-model-number path must still work unchanged.
  ctx.document.getElementById = (id) => (id === 'kenmoreModelPrefix' ? { value: '' } : originalGetById(id));
  const fromTyped = api.applyKenmorePrefixFallback('795.74053.410');
  const resolvedFromTyped = api.resolveKenmoreDecoderFromPrefix(fromTyped);
  assert.equal(resolvedFromTyped.prefix, '795');
  assert.equal(resolvedFromTyped.decoderId, 'lg');

  const lg = api.decoderData.appliances.decoders[resolvedFromDropdown.decoderId];
  const out = lg.decode('410KR00219');
  assert.ok(out);
  assert.equal(out.year, '2004/2014/2024');

  ctx.document.getElementById = originalGetById;
});

test('Kenmore write-in field is no longer truncated to a 3-digit prefix', () => {
  const originalGetById = ctx.document.getElementById;
  const input = { value: '106.71774017', setAttribute() {}, removeAttribute() {}, getAttribute: () => null };
  ctx.document.getElementById = (id) => {
    if (id === 'modelNumber') return input;
    if (id === 'kenmoreModelPrefix') return { value: '' };
    return originalGetById(id);
  };

  const value = api.getCurrentSupplementalModelValue('appliances', 'kenmore');

  assert.equal(value, '106.71774017');
  assert.equal(api.extractKenmoreModelPrefix(value), '106');
  ctx.document.getElementById = originalGetById;
});

test('Kenmore decode still works without any prefix at all (falls back to documented Whirlpool default)', () => {
  const resolved = api.resolveKenmoreDecoderFromPrefix('');
  assert.equal(resolved.usedDefault, true);
  assert.equal(resolved.manufacturer, 'Whirlpool');
  assert.equal(resolved.decoderId, 'whirlpool');
  assert.match(resolved.note, /Kenmore/i);
});

// ── Maytag pre/post-2006 combined result (UX improvement) ───────────────────

test('isMaytagEraUnselected reflects the eraSelect element state', () => {
  const originalGetById = ctx.document.getElementById;

  ctx.document.getElementById = (id) => (id === 'eraSelect' ? { value: '' } : originalGetById(id));
  assert.equal(api.isMaytagEraUnselected(), true);

  ctx.document.getElementById = (id) => (id === 'eraSelect' ? { value: 'pre' } : originalGetById(id));
  assert.equal(api.isMaytagEraUnselected(), false);

  ctx.document.getElementById = (id) => (id === 'eraSelect' ? { value: 'post' } : originalGetById(id));
  assert.equal(api.isMaytagEraUnselected(), false);

  ctx.document.getElementById = originalGetById;
});

test('Maytag combined result shows both era styles when both pre-2006 and post-2006 decode validly', () => {
  const result = api.computeMaytagDualEraResult('12345678WA', '');

  assert.equal(result.supported, true);
  assert.equal(result.preValid, true);
  assert.equal(result.postValid, true);
  assert.deepEqual(Array.from(result.combinedYears), [1999, 2013, 2043]);
  assert.match(result.notesText, /Maytag pre-2006 style: 1999/);
  assert.match(result.notesText, /Maytag post-2006 style: 2013\/2043/);
  assert.match(result.notesText, /depends on whether this unit was made before or after Whirlpool/i);
});

test('Maytag combined result does not show a fake single confident age when multiple candidate years exist', () => {
  const result = api.computeMaytagDualEraResult('12345678WA', '');

  assert.equal(result.supported, true);
  assert.equal(api.hasSingleResolvedYear(result.combinedYearDisplay), false);
  assert.equal(api.computeEstimatedAge(result.combinedYearDisplay), '—');
});

test('Maytag combined result shows only the matching era style and notes the other did not match', () => {
  const result = api.computeMaytagDualEraResult('W10123456', '');

  assert.equal(result.supported, true);
  assert.equal(result.preValid, false);
  assert.equal(result.postValid, true);
  assert.deepEqual(Array.from(result.combinedYears), [2011, 2041]);
  assert.match(result.notesText, /pre-2006 style did not match/i);
  assert.match(result.notesText, /post-2006 style: 2011\/2041/);
  assert.doesNotMatch(result.notesText, /depends on whether this unit was made/i);
});

test('Maytag combined result reports unsupported when neither era style matches', () => {
  const result = api.computeMaytagDualEraResult('1234567', '');

  assert.equal(result.supported, false);
  assert.equal(result.preValid, false);
  assert.equal(result.postValid, false);
  assert.match(result.reason, /neither.*pre-2006.*post-2006/i);
});

test('Maytag pre-2006 and post-2006 decoders remain directly usable when an era is explicitly selected', () => {
  // Explicit era selection must keep using the single-decoder path
  // unchanged -- isMaytagEraUnselected() must report false so decodeSerial's
  // dual-era branch never triggers.
  const originalGetById = ctx.document.getElementById;
  ctx.document.getElementById = (id) => (id === 'eraSelect' ? { value: 'pre' } : originalGetById(id));
  assert.equal(api.isMaytagEraUnselected(), false);

  const pre = api.decoderData.appliances.decoders.maytag_pre_2006;
  const out = pre.decode('12345678WA');
  assert.ok(out);
  assert.equal(out.year, '1999/2023');

  ctx.document.getElementById = (id) => (id === 'eraSelect' ? { value: 'post' } : originalGetById(id));
  assert.equal(api.isMaytagEraUnselected(), false);

  const post = api.decoderData.appliances.decoders.maytag_post_2006;
  const postOut = post.decode('12345678WA');
  assert.ok(postOut);
  assert.equal(postOut.year, '2013/2043');

  ctx.document.getElementById = originalGetById;
});

// ── Whirlpool WFE320 model-family recall (recall/classification fix) ────────

test('foldOZeroForClientMatching folds letter-O to digit-0 only when a digit exists elsewhere', () => {
  assert.equal(api.foldOZeroForClientMatching('WFE320MOJW0'), 'WFE320M0JW0');
  assert.equal(api.foldOZeroForClientMatching('WFE320M0JW0'), 'WFE320M0JW0');
  assert.equal(api.foldOZeroForClientMatching('OVEN'), 'OVEN', 'pure-letter words must not be corrupted');
});

test('WFE320M0JW0 and WFE320MOJW0 normalize to the same client-matching key', () => {
  assert.equal(
    api.normalizeClientModelLookupValue('WFE320M0JW0'),
    api.normalizeClientModelLookupValue('WFE320MOJW0')
  );
});

test('findClientModelFamilyEvidence recognizes the Whirlpool WFE320 family for both O/0 variants', () => {
  const fromDigit = api.findClientModelFamilyEvidence('Whirlpool', 'WFE320M0JW0');
  const fromLetter = api.findClientModelFamilyEvidence('Whirlpool', 'WFE320MOJW0');
  assert.ok(fromDigit);
  assert.ok(fromLetter);
  assert.equal(fromDigit.isFamilyLevel, true);
  assert.equal(fromDigit.yearRange, fromLetter.yearRange);
});

test('findClientModelFamilyEvidence does not fire for unrelated brands or unrelated Whirlpool models', () => {
  assert.equal(api.findClientModelFamilyEvidence('LG', 'WFE320M0JW0'), null);
  assert.equal(api.findClientModelFamilyEvidence('Whirlpool', 'WRF535SWHZ'), null);
});

test('Whirlpool RX3026733 serial decodes to the documented 1990/2020 ambiguous cycle', () => {
  const whirlpool = api.decoderData.appliances.decoders.whirlpool;
  const out = whirlpool.decode('RX3026733');
  assert.ok(out);
  assert.equal(out.year, '1990/2020');
  assert.equal(out.month, 'Week 30');
});

test('Whirlpool RX3026733 with WFE320M0JW0 narrows to 2020 via the recognized model family (PR-33 intersection policy)', async () => {
  const whirlpool = api.decoderData.appliances.decoders.whirlpool;
  const candidates = api.parseCandidateYears(whirlpool.decode('RX3026733').year);
  assert.deepEqual(Array.from(candidates), [1990, 2020]);

  const resolved = await api.resolveSerialYearFromModel({ candidates, brand: 'Whirlpool', model: 'WFE320M0JW0', context: '' });

  assert.equal(resolved.chosenYear, 2020, 'must narrow via intersection, not by nearest-candidate guessing');
  assert.equal(resolved.source, 'client-family-evidence');
  assert.notEqual(resolved.summary, '', 'must not return the generic "model evidence unavailable" message when the family is recognized');
});

test('Whirlpool RX3026733 with WFE320MOJW0 (letter-O typo) produces the same resolved result', async () => {
  const whirlpool = api.decoderData.appliances.decoders.whirlpool;
  const candidates = api.parseCandidateYears(whirlpool.decode('RX3026733').year);

  const resolved = await api.resolveSerialYearFromModel({ candidates, brand: 'Whirlpool', model: 'WFE320MOJW0', context: '' });

  assert.equal(resolved.chosenYear, 2020);
  assert.equal(resolved.source, 'client-family-evidence');
});

test('Whirlpool RX3026733 with no model stays 1990/2020 ambiguous', async () => {
  const whirlpool = api.decoderData.appliances.decoders.whirlpool;
  const candidates = api.parseCandidateYears(whirlpool.decode('RX3026733').year);

  const resolved = await api.resolveSerialYearFromModel({ candidates, brand: 'Whirlpool', model: '', context: '' });

  assert.equal(resolved.chosenYear, null);
  assert.equal(resolved.source, 'none');
  assert.match(resolved.summary, /1990 or 2020/);
});

test('Whirlpool RX3026733 with unrelated model evidence does not choose a year by nearest-candidate guessing', async () => {
  const whirlpool = api.decoderData.appliances.decoders.whirlpool;
  const candidates = api.parseCandidateYears(whirlpool.decode('RX3026733').year);

  const resolved = await api.resolveSerialYearFromModel({ candidates, brand: 'Whirlpool', model: 'WTW4816FW2', context: '' });

  assert.equal(resolved.chosenYear, null, 'an unrelated/unrecognized model must never resolve to the nearest candidate');
});

// ---------------------------------------------------------------------------
// July 2026 foundation audit: invalid week/month codes and impossible future
// candidate years must never surface as confident manufacture dates.
// ---------------------------------------------------------------------------

test('Whirlpool-family decoder rejects impossible production weeks', () => {
  const whirlpool = api.decoderData.appliances.decoders.whirlpool;
  assert.equal(whirlpool.decode('995412345'), null, 'week 54 must not decode');
  assert.equal(whirlpool.decode('999912345'), null, 'week 99 must not decode');
  assert.equal(whirlpool.decode('ZZZZZZZZZZ'), null, 'non-digit week must not decode');

  const good = whirlpool.decode('C21435678');
  assert.ok(good, 'known-good Whirlpool serial still decodes');
  assert.equal(good.month, 'Week 14');

  const sibling = api.decoderData.appliances.decoders.kitchenaid;
  assert.equal(sibling.decode('995412345'), null, 'shared family helper covers siblings');
});

test('Frigidaire-family decoder rejects impossible production weeks', () => {
  const frigidaire = api.decoderData.appliances.decoders.frigidaire;
  assert.equal(frigidaire.decode('S995412345'), null, 'week 54 must not decode');

  const good = frigidaire.decode('BA13407224');
  assert.ok(good, 'known-good Frigidaire serial still decodes');
  assert.match(good.month, /Week 34/);

  const electrolux = api.decoderData.appliances.decoders.electrolux;
  assert.equal(electrolux.decode('S995412345'), null, 'family copy covers Electrolux');
});

test('Goodman-family HVAC decoder rejects invalid month codes', () => {
  const goodman = api.decoderData.hvac.decoders.goodman;
  assert.equal(goodman.decode('2352123456'), null, 'month 52 must not decode');
  assert.equal(goodman.decode('2313123456'), null, 'month 13 must not decode');

  const good = goodman.decode('1404123456');
  assert.equal(good.year, '2014');
  assert.equal(good.month, 'April');

  const amana = api.decoderData.hvac.decoders.amana;
  assert.equal(amana.decode('2352123456'), null, 'Amana shares the YYMM rule');
});

test('Rheem water heater Style 1 no longer fabricates invalid months or future years', () => {
  const rheem = api.decoderData.waterHeaters.decoders.rheem;
  assert.equal(rheem.decode('9954123456'), null, 'month 99 / year 2054 must not decode');
  assert.equal(rheem.decode('1254123456'), null, 'valid month but impossible year 2054 must not decode');

  const style1 = rheem.decode('1291A39968');
  assert.equal(style1.year, '1991');
  assert.equal(style1.month, 'December');

  const prefixed = rheem.decode('RH120512345');
  assert.equal(prefixed.year, '2005');
  assert.equal(prefixed.month, 'Week 12');
});

test('collapseImpossibleFutureYears drops future-only candidates without mutating input', () => {
  const input = { year: '2012/2042', month: 'Week 14', notes: 'n' };
  const collapsed = api.collapseImpossibleFutureYears(input);
  assert.equal(collapsed.year, '2012');
  assert.match(collapsed.notes, /2042/);
  assert.equal(input.year, '2012/2042', 'input object must not be mutated');

  const allPast = api.collapseImpossibleFutureYears({ year: '1989/1999/2009/2019' });
  assert.equal(allPast.year, '1989/1999/2009/2019', 'plausible candidate sets are untouched');

  const sentinel = api.collapseImpossibleFutureYears({ year: 'Post-2021 (Randomized)' });
  assert.equal(sentinel.year, 'Post-2021 (Randomized)', 'sentinel years are untouched');

  assert.equal(api.collapseImpossibleFutureYears(null), null);
});

test('decode pipeline applies future-year collapse before sanitization', () => {
  const src = fs.readFileSync('script.js', 'utf8');
  assert.match(src, /collapseImpossibleFutureYears\(p\.decode\(/);
});

test('decode pipeline emits sanitized analytics events (no raw serial/query to GA4)', () => {
  const src = fs.readFileSync('script.js', 'utf8');
  assert.match(src, /trackAnalyticsEvent\("decode_start"/);
  assert.match(src, /trackAnalyticsEvent\("decode_fail"/);
  assert.match(src, /trackAnalyticsEvent\("decode_success"/);
  // gtag forwarding must strip raw user inputs and only run on production hosts
  assert.match(src, /"query"!==k&&"serial"!==k&&"model"!==k/);
  assert.match(src, /decodemyitem\\.com\$\/\.test\(window\.location\.hostname\)/);
  // events must never carry the serial value itself
  assert.doesNotMatch(src, /trackAnalyticsEvent\("decode_(start|success|fail)",\{[^}]*serial:/);
});
