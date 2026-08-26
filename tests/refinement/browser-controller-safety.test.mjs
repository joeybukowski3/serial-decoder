import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadController(fetchImpl) {
  const document = {
    readyState: 'complete',
    addEventListener() {},
    getElementById() { return null; },
  };
  const window = {
    decodeSerial() {},
    resolveSerialYearFromModel() {},
  };
  const context = {
    AbortController,
    clearTimeout,
    console,
    document,
    fetch: fetchImpl || (async () => ({ ok: false, text: async () => '' })),
    setTimeout,
    window,
  };
  window.document = document;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('src/browser/serial-refinement-controller.js', 'utf8'), context);
  return window.SerialRefinementController;
}

test('row-safe controller refinement uses explicit inputs and constrains the API response', async () => {
  let request;
  const controller = loadController(async (_url, options) => {
    request = JSON.parse(options.body);
    return {
      ok: true,
      text: async () => JSON.stringify({
        status: 'resolved',
        remainingCandidateYears: [2000],
        chosenYear: 2000,
        summary: 'Resolved by model evidence.',
      }),
    };
  });

  const result = await controller.refine({
    category: 'appliances',
    brand: 'GE',
    serial: 'AZ777097B',
    model: 'GSD5630D00WW',
    candidates: [1988, 2000, 2012, 2024],
    decodedMonth: 'January',
  });

  assert.deepEqual(request, {
    category: 'appliances',
    brand: 'GE',
    serial: 'AZ777097B',
    model: 'GSD5630D00WW',
    candidateYears: [1988, 2000, 2012, 2024],
    decodedMonth: 'January',
    context: '',
  });
  assert.equal(result.status, 'resolved');
  assert.equal(result.chosenYear, 2000);
  assert.deepEqual(Array.from(result.remainingCandidateYears), [2000]);
});

test('browser submits and accepts the exact GE JVM3160 refinement fixture', async () => {
  let request;
  const controller = loadController(async (_url, options) => {
    request = JSON.parse(options.body);
    return {
      ok: true,
      text: async () => JSON.stringify({
        status: 'resolved',
        candidateYears: [1988, 2000, 2012, 2024],
        remainingCandidateYears: [2024],
        chosenYear: 2024,
        summary: 'Strict model production evidence leaves 2024.',
      }),
    };
  });

  const result = await controller.refine({
    category: 'appliances',
    brand: 'GE',
    serial: 'TZ201988L',
    model: 'JVM3160RF9SS',
    candidates: [1988, 2000, 2012, 2024],
    decodedMonth: 'October',
  });

  assert.equal(request.model, 'JVM3160RF9SS');
  assert.deepEqual(request.candidateYears, [1988, 2000, 2012, 2024]);
  assert.equal(request.decodedMonth, 'October');
  assert.equal(result.status, 'resolved');
  assert.equal(result.chosenYear, 2024);
  assert.deepEqual(Array.from(result.remainingCandidateYears), [2024]);
});

test('browser controller preserves serial candidates when API selects an incompatible year', () => {
  const controller = loadController();
  const result = controller.constrainResponseToSerialCandidates({
    status: 'resolved',
    candidateYears: [1978, 1990, 2002, 2014, 2026],
    remainingCandidateYears: [2023],
    chosenYear: 2023,
    summary: 'Model research found 2023.',
  }, [1978, 1990, 2002, 2014, 2026]);

  assert.equal(result.status, 'unavailable');
  assert.equal(result.chosenYear, null);
  assert.deepEqual(Array.from(result.remainingCandidateYears), [1978, 1990, 2002, 2014, 2026]);
  assert.match(result.summary, /outside the serial-decoded candidates/i);
});

test('browser controller recognizes the documented common GE serial shape', () => {
  const controller = loadController();
  assert.equal(controller.matchesCommonGeSerialPattern('HV907351B'), true);
  assert.equal(controller.matchesCommonGeSerialPattern('RG527327B'), true);
  assert.equal(controller.matchesCommonGeSerialPattern('GDF650SYV0FS'), false);
});

test('refinement fingerprint ignores render-time month changes but preserves context identity', () => {
  const controller = loadController();
  const base = {
    category: 'appliances',
    brand: 'GE',
    serial: 'HV907351B',
    model: 'GDF650SYV0FS',
    candidateYears: [1978, 1990, 2002, 2014, 2026],
    decodedMonth: 'May',
    context: '',
  };
  assert.notEqual(controller.fingerprint(base), controller.fingerprint({ ...base, context: 'stainless finish' }));
  assert.equal(controller.fingerprint(base), controller.fingerprint({ ...base, decodedMonth: 'June' }));
});

test('browser controller preserves ranked preferred year inside serial candidates', () => {
  const controller = loadController();
  const result = controller.constrainResponseToSerialCandidates({
    status: 'ranked',
    candidateYears: [1992, 2022],
    remainingCandidateYears: [1992, 2022],
    preferredCandidateYear: 2022,
    chosenYear: null,
    summary: 'Most likely 2022',
  }, [1992, 2022]);

  assert.equal(result.status, 'ranked');
  assert.equal(result.preferredCandidateYear, 2022);
  assert.deepEqual(Array.from(result.remainingCandidateYears), [1992, 2022]);
  assert.equal(result.chosenYear, null);
});

test('browser controller treats every ranked response with a preferred year as a focal Best Estimate, regardless of confidence', () => {
  const controller = loadController();
  assert.equal(controller.isStrongRankedResponse({
    status: 'ranked', preferredCandidateYear: 2011, confidence: 'high',
  }), true);
  assert.equal(controller.isStrongRankedResponse({
    status: 'ranked', preferredCandidateYear: 2011, confidence: 'medium',
  }), true);
  assert.equal(controller.isStrongRankedResponse({
    status: 'ranked', preferredCandidateYear: 2011, confidence: 'low',
  }), true);
  assert.equal(controller.isStrongRankedResponse({
    status: 'ranked', preferredCandidateYear: null, confidence: 'high',
  }), false);
  assert.equal(controller.isStrongRankedResponse({
    status: 'ambiguous_with_era', preferredCandidateYear: 2011, confidence: 'high',
  }), false);
});

test('browser controller preserves ambiguous_with_era remaining candidates', () => {
  const controller = loadController();
  const result = controller.constrainResponseToSerialCandidates({
    status: 'ambiguous_with_era',
    candidateYears: [1992, 2022],
    remainingCandidateYears: [1992, 2022],
    modelProductionRange: { start: 2019, end: null },
  }, [1992, 2022]);

  assert.equal(result.status, 'ambiguous_with_era');
  assert.deepEqual(Array.from(result.remainingCandidateYears), [1992, 2022]);
});
