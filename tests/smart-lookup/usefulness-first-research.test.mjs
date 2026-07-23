import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySmartLookupQuery, isDecoderBackedBrand } from '../../lib/smart-lookup/normalize.js';
import { buildAgeProviderPrompt, buildGroundedAgeProviderPrompt } from '../../lib/smart-lookup/provider.js';

// Regression cover for the usefulness-first routing defect: Smart Lookup
// returned brand/category clarification cards for queries that already named
// a real product, because deterministic classification acted as a gatekeeper
// on research rather than as a hint provider.

test('a named commercial product with no model code still reaches research', () => {
  for (const query of ['Nintendo Switch 2', 'nintendo switch 2']) {
    const r = classifySmartLookupQuery(query);
    assert.equal(r.brand, 'Nintendo', `${query}: brand must be recognized`);
    assert.equal(r.researchEligible, true, `${query}: must reach research`);
    assert.equal(r.providerEligible, true, `${query}: must be provider eligible`);
    assert.equal(r.groundedEligible, true, `${query}: must be grounded eligible`);
  }
});

test('an explicit brand anywhere in the query is preserved, including brands with no serial decoder', () => {
  for (const query of ['H4080BM miele oven', 'Miele H4080BM']) {
    const r = classifySmartLookupQuery(query);
    assert.equal(r.brand, 'Miele', `${query}: literal brand must not be lost`);
    assert.equal(r.model, 'H4080BM', `${query}: model token must be preserved verbatim`);
    assert.equal(r.researchEligible, true, `${query}: must reach research`);
  }
});

test('Miele is recognizable for research but is not treated as decoder-backed', () => {
  assert.equal(classifySmartLookupQuery('Miele H4080BM').brand, 'Miele');
  assert.equal(isDecoderBackedBrand('Miele'), false);
  // A decoder-backed brand must keep reporting as such.
  assert.equal(isDecoderBackedBrand('Whirlpool'), true);
});

test('a bare model-like token alone triggers research instead of a brand-needed dead end', () => {
  const r = classifySmartLookupQuery('H4080BM');
  assert.equal(r.model, 'H4080BM');
  assert.equal(r.researchEligible, true);
  assert.equal(r.providerEligible, true);
});

test('representative product queries all reach research', () => {
  const queries = [
    'Sony X90L', 'Dell XPS 15 9530', 'LG WM3900HWA', 'Carrier 24ABC636A003',
    'Generac Guardian 22kW', 'PlayStation 5 Slim', 'KitchenAid mixer KSM150',
    'old GE refrigerator',
  ];
  for (const query of queries) {
    assert.equal(classifySmartLookupQuery(query).researchEligible, true, `${query} must reach research`);
  }
});

// General-search-first: local classification is a speed/confidence hint, not
// an eligibility gate. A bare recognized brand or bare recognized category
// now reaches research too (there is still a useful brand/category-history
// answer to give, and the deterministic card remains the fallback if
// research fails) -- only genuinely unusable/empty input is withheld.
test('a bare brand or bare category now reaches research', () => {
  for (const query of ['Whirlpool', 'refrigerator', 'washer', 'gaming laptop']) {
    const r = classifySmartLookupQuery(query);
    assert.equal(r.researchEligible, true, `${JSON.stringify(query)} must reach research`);
    assert.equal(r.providerEligible, true, `${JSON.stringify(query)} must be provider eligible`);
  }
});

test('empty and meaningless input never reach research', () => {
  for (const query of ['', '   ', '!!!!', 'asdkjhqwe']) {
    const r = classifySmartLookupQuery(query);
    assert.equal(r.researchEligible, false, `${JSON.stringify(query)} must not reach research`);
    assert.equal(r.providerEligible, false, `${JSON.stringify(query)} must not be provider eligible`);
  }
});

test('both age prompts carry the usefulness-first policy', () => {
  const queryInfo = classifySmartLookupQuery('Nintendo Switch 2');
  for (const [name, prompt] of [
    ['closed-book', buildAgeProviderPrompt(queryInfo)],
    ['grounded', buildGroundedAgeProviderPrompt(queryInfo)],
  ]) {
    assert.match(prompt, /Answer usefulness-first/, `${name} prompt must state the policy`);
    assert.match(prompt, /never a reason to withhold one/, `${name} prompt must allow caveated answers`);
    assert.match(prompt, /alternativeMatches/, `${name} prompt must allow candidate matches`);
    assert.match(prompt, /identityConfidence/, `${name} prompt must request identity confidence`);
    assert.match(prompt, /is a SUCCESS/, `${name} prompt must treat identity-without-unit-date as success`);
  }
});

test('the brand-category prompt block instructs identification of a named product', () => {
  const prompt = buildGroundedAgeProviderPrompt(classifySmartLookupQuery('Nintendo Switch 2'));
  assert.match(prompt, /IDENTIFY THAT PRODUCT/);
  assert.match(prompt, /given, not invented/);
  assert.match(prompt, /do NOT ask for a model number for a product that is already uniquely identified by name/i);
  // The anti-fabrication constraints must survive alongside the new instruction.
  assert.match(prompt, /do not invent a product family that was not part of the query/i);
  assert.match(prompt, /service life and product age are different things/);
});

test('the complete original query is always passed through to the provider prompt', () => {
  const query = 'H4080BM miele oven';
  const prompt = buildGroundedAgeProviderPrompt(classifySmartLookupQuery(query));
  assert.ok(prompt.includes(query), 'the verbatim user query must reach the provider');
});
