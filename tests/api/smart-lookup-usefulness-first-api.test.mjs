import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgeLookupHandler } from '../../api/age-lookup.js';

function req(query, extra = {}) {
  return { method: 'POST', body: { query, ...extra }, headers: { 'x-forwarded-for': '127.0.0.1' }, socket: {} };
}
function res() {
  return {
    statusCode: 0, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {},
  };
}
const redisMiss = {
  get: async () => null, set: async () => {}, eval: async () => [1, 1, 1],
  incrby: async (_key, amount) => amount, expire: async () => 1,
};

function harness(providerResult, { groundedEnabled = true } = {}) {
  const calls = { grounded: 0, closedBook: 0, prompts: [] };
  const handler = createAgeLookupHandler({
    groundedEnabled,
    localLookup: async () => null,
    redisFactory: () => redisMiss,
    groundedProviderLookup: async (queryInfo) => {
      calls.grounded += 1;
      calls.prompts.push(queryInfo.query);
      return providerResult(queryInfo);
    },
    providerLookup: async (queryInfo) => {
      calls.closedBook += 1;
      calls.prompts.push(queryInfo.query);
      return providerResult(queryInfo);
    },
  });
  return { handler, calls };
}

test('a named-product query reaches the provider instead of returning brand guidance', async () => {
  const { handler, calls } = harness((qi) => ({
    brand: qi.brand, model: null, specificityLevel: 'partial', notes: 'researched',
  }));
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls.grounded, 1, 'Nintendo Switch 2 must reach grounded research');
});

test('an explicit-brand model query reaches the provider with the complete original query', async () => {
  const { handler, calls } = harness((qi) => ({
    brand: qi.brand, model: qi.modelIdentity, specificityLevel: 'partial',
  }));
  const out = res();
  await handler(req('H4080BM miele oven'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls.grounded, 1, 'the Miele query must reach research');
  assert.equal(calls.prompts[0], 'H4080BM miele oven', 'the provider must receive the complete original query');
});

test('a bare model token reaches the provider rather than dead-ending on brand-needed', async () => {
  const { handler, calls } = harness(() => ({ brand: 'Unknown', model: 'H4080BM', specificityLevel: 'partial' }));
  const out = res();
  await handler(req('H4080BM'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls.grounded, 1);
});

// Research must not depend on the grounding flag: whether live web search is
// configured decides HOW the provider is called, never WHETHER a query with
// real product signal is researched at all.
test('research still runs for a named product when grounded search is disabled', async () => {
  const { handler, calls } = harness(() => ({ brand: 'Nintendo', model: null, specificityLevel: 'partial' }), { groundedEnabled: false });
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls.grounded, 0, 'grounded research must not run when the flag is off');
  assert.equal(calls.closedBook, 1, 'closed-book research must still run');
});

test('bare brand and bare category still short-circuit and spend no provider call', async () => {
  for (const query of ['Whirlpool', 'refrigerator']) {
    const { handler, calls } = harness(() => { throw new Error('provider must not run'); });
    const out = res();
    await handler(req(query), out);
    assert.equal(out.statusCode, 200, `${query} must still answer`);
    assert.equal(calls.grounded + calls.closedBook, 0, `${query} must not call the provider`);
  }
});

// The deterministic card is now a reserve rather than a gate, so a failed
// research attempt must still degrade to it instead of returning nothing.
test('a research failure degrades to the deterministic reserve, not an empty result', async () => {
  const { handler } = harness(() => { throw new Error('provider exploded'); });
  const out = res();
  await handler(req('Nintendo Switch 2'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.brand, 'Nintendo', 'the reserve must still name what was recognized');
  assert.ok(
    String(out.payload.fallbackKind).startsWith('deterministic-'),
    `expected a deterministic reserve, got ${out.payload.fallbackKind}`,
  );
});

test('a strong local family result still wins over research and spends no provider call', async () => {
  const { handler, calls } = harness(() => { throw new Error('provider must not run'); });
  const out = res();
  await handler(req('Samsung - 65" Class Q60 Series LED 4K UHD Smart Tizen TV'), out);
  assert.equal(out.statusCode, 200);
  assert.equal(calls.grounded + calls.closedBook, 0, 'high-confidence local evidence must win');
  assert.equal(out.payload.productFamily, 'Q60 Series');
});
