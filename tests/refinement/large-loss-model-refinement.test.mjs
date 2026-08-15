import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRefineSerialDateHandler } from '../../api/refine-serial-date.js';
import { loadLargeLossContext } from '../helpers/large-loss-context.mjs';

const GE_ROW = {
  category: 'appliances',
  brand: 'ge',
  brandLabel: 'GE',
  era: '',
  serial: 'FR31424IN',
  model: '',
};

const GE_CANDIDATES = [1984, 1996, 2008, 2020];
const GE_MODEL = 'GFW850SPN0DG';

function installRefinementStub(ctx, refine) {
  ctx.window.SerialRefinementController = { refine };
}

function loadController(fetchImpl, harness = {}) {
  const elements = harness.elements || {};
  const document = {
    readyState: 'complete',
    addEventListener() {},
    getElementById(id) { return elements[id] || null; },
  };
  const window = {
    decodeSerial() {},
    resolveSerialYearFromModel() {},
    ...harness.window,
  };
  const context = {
    AbortController,
    clearTimeout,
    console,
    document,
    fetch: fetchImpl,
    setTimeout,
    window,
  };
  window.document = document;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('src/browser/serial-refinement-controller.js', 'utf8'), context);
  return window.SerialRefinementController;
}

function createHandlerFetch() {
  const handler = createRefineSerialDateHandler({
    providerLookup: async () => ({ evidence: [] }),
    redisFactory: () => null,
    logger: { info() {}, error() {}, warn() {} },
  });
  return async (_url, options) => {
    const response = {
      statusCode: 200,
      payload: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.payload = value; return this; },
    };
    await handler({
      method: 'POST',
      headers: { 'x-request-id': 'large-loss-parity', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.parse(options.body),
    }, response);
    return {
      ok: response.statusCode >= 200 && response.statusCode < 300,
      status: response.statusCode,
      text: async () => JSON.stringify(response.payload),
    };
  };
}

function installRealRefinementController(ctx, harness) {
  const controller = loadController(createHandlerFetch(), harness);
  ctx.window.SerialRefinementController = controller;
  return controller;
}

test('ambiguous Large Loss serial without a model preserves every serial-valid year', async () => {
  const { LLD, ctx } = loadLargeLossContext();
  let calls = 0;
  installRefinementStub(ctx, async () => { calls += 1; });

  const result = await LLD.decodeSerial({ ...GE_ROW });

  assert.equal(result.year, '1984/1996/2008/2020');
  assert.equal(result.estimatedYear, '1984/1996/2008/2020');
  assert.equal(calls, 0);
});

test('existing GE GFW850 fixture produces identical canonical single-item and Large Loss refinement', async () => {
  const { LLD, ctx } = loadLargeLossContext();
  const singleItemYear = { textContent: GE_CANDIDATES.join('/') };
  const controller = installRealRefinementController(ctx, {
    elements: {
      serial: { value: GE_ROW.serial },
      modelNumber: { value: GE_MODEL },
      resultMonth: { textContent: 'March' },
      resultYear: singleItemYear,
      resultNotes: { textContent: '' },
    },
    window: {
      getActiveDecoderCategory: () => GE_ROW.category,
      lastSerialResolutionState: {
        candidates: GE_CANDIDATES.slice(),
        baseNotes: '',
      },
    },
  });
  const singleItemResult = await controller.start({
    brand: GE_ROW.brandLabel,
    model: GE_MODEL,
    candidates: GE_CANDIDATES,
  });
  const largeLossResult = await LLD.decodeSerial({ ...GE_ROW, model: GE_MODEL });

  assert.equal(singleItemResult.status, 'resolved');
  assert.deepEqual(Array.from(singleItemResult.candidateYears), GE_CANDIDATES);
  assert.deepEqual(Array.from(singleItemResult.remainingCandidateYears), [2020]);
  assert.equal(singleItemResult.chosenYear, 2020);
  assert.equal(singleItemResult.provider, 'local-db');
  assert.equal(singleItemYear.textContent, '2020');
  assert.equal(largeLossResult.year, singleItemYear.textContent);
  assert.equal(largeLossResult.estimatedYear, String(singleItemResult.chosenYear));
  assert.equal(largeLossResult.yearCode, GE_CANDIDATES.join('/'));
  assert.equal(largeLossResult.refinementStatus, singleItemResult.status);
  assert.deepEqual(Array.from(largeLossResult.refinementResponse.remainingCandidateYears), [2020]);
  assert.match(largeLossResult.notes, /2020/);
});

test('unhelpful model evidence does not narrow an ambiguous Large Loss result', async () => {
  const { LLD, ctx } = loadLargeLossContext();
  installRealRefinementController(ctx);

  const result = await LLD.decodeSerial({ ...GE_ROW, model: 'NOT-A-USEFUL-MODEL' });

  assert.equal(result.year, '1984/1996/2008/2020');
  assert.equal(result.estimatedYear, '1984/1996/2008/2020');
  assert.equal(result.refinementStatus, 'unavailable');
});

test('deterministic single-year Large Loss serial remains unchanged and skips refinement', async () => {
  const { LLD, ctx } = loadLargeLossContext();
  let calls = 0;
  installRefinementStub(ctx, async () => { calls += 1; });

  const result = await LLD.decodeSerial({
    category: 'hvac',
    brand: 'carrier',
    brandLabel: 'Carrier',
    era: '',
    serial: '1419XXXXX',
    model: '24ABC636A003',
  });

  assert.equal(result.year, '2019');
  assert.equal(calls, 0);
});

test('model refinement remains isolated between Large Loss rows', async () => {
  const { LLD, ctx } = loadLargeLossContext();
  installRealRefinementController(ctx);

  const resolved = await LLD.decodeSerial({ ...GE_ROW, model: GE_MODEL });
  const ambiguous = await LLD.decodeSerial({ ...GE_ROW, model: 'UNHELPFUL' });

  assert.equal(resolved.year, '2020');
  assert.equal(ambiguous.year, '1984/1996/2008/2020');
  assert.notEqual(resolved.refinementResponse, ambiguous.refinementResponse);
});

test('Large Loss Explain includes the refined result and canonical refinement summary', async () => {
  const { LLD, ctx } = loadLargeLossContext();
  installRealRefinementController(ctx);
  const row = { ...GE_ROW, model: GE_MODEL };
  row.result = await LLD.decodeSerial(row);
  const container = { innerHTML: '' };

  LLD.populateExpansionFields(row, container);

  assert.match(container.innerHTML, /Estimated Age[\s\S]*2020/);
  assert.match(container.innerHTML, /Year Code[\s\S]*1984\/1996\/2008\/2020/);
  assert.match(container.innerHTML, /Model Refinement/);
  assert.match(container.innerHTML, /2020/);
});
