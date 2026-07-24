import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/browser/serial-refinement-model-propagation-patch.js', import.meta.url), 'utf8');

function createHarness(mainModel = '') {
  const elements = {
    modelNumber: { id: 'modelNumber', value: mainModel },
    narrowModelInput: { id: 'narrowModelInput', value: '' },
  };
  const listeners = {};
  const resolverCalls = [];
  const startCalls = [];
  const context = {
    console,
    setTimeout(fn) { fn(); return 1; },
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      addEventListener(type, handler) { listeners[type] = handler; },
    },
    window: {
      ensureRefinementPanel() { return { hidden: false }; },
      resolveSerialYearFromModel(options) { resolverCalls.push(options); return Promise.resolve(options); },
      SerialRefinementController: {
        start(options, forceRetry) { startCalls.push({ options, forceRetry }); return options; },
      },
    },
  };
  vm.runInNewContext(source, context);
  return { context, elements, listeners, resolverCalls, startCalls };
}

test('copies the submitted decoder model into the visible refiner', () => {
  const { context, elements } = createHarness('GFE29HSDCSS');
  context.window.ensureRefinementPanel();
  assert.equal(elements.narrowModelInput.value, 'GFE29HSDCSS');
});

test('passes the exact submitted model through resolver and controller requests', async () => {
  const { context, resolverCalls, startCalls } = createHarness('GFE29HSDCSS');
  await context.window.resolveSerialYearFromModel({ candidates: [1977, 1989, 2001, 2013, 2025] });
  context.window.SerialRefinementController.start({ candidates: [1977, 1989, 2001, 2013, 2025] }, false);
  assert.equal(resolverCalls[0].model, 'GFE29HSDCSS');
  assert.equal(startCalls[0].options.model, 'GFE29HSDCSS');
  assert.deepEqual(Array.from(startCalls[0].options.candidates), [1977, 1989, 2001, 2013, 2025]);
});

test('preserves an explicitly supplied refiner model and no-model behavior', async () => {
  const withExplicit = createHarness('GFE29HSDCSS');
  await withExplicit.context.window.resolveSerialYearFromModel({ model: 'CUSTOMMODEL', candidates: [2001, 2013] });
  assert.equal(withExplicit.resolverCalls[0].model, 'CUSTOMMODEL');

  const withoutModel = createHarness('');
  await withoutModel.context.window.resolveSerialYearFromModel({ candidates: [2001, 2013] });
  assert.equal(withoutModel.resolverCalls[0].model, '');
  assert.equal(withoutModel.elements.narrowModelInput.value, '');
});
