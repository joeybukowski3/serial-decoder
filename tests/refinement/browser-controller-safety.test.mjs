import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadController() {
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
    fetch: async () => ({ ok: false, text: async () => '' }),
    setTimeout,
    window,
  };
  window.document = document;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('src/browser/serial-refinement-controller.js', 'utf8'), context);
  return window.SerialRefinementController;
}

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

test('refinement fingerprint changes when context or decoded period changes', () => {
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
  assert.notEqual(controller.fingerprint(base), controller.fingerprint({ ...base, decodedMonth: 'June' }));
});
