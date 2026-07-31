import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadVizioGenerationRegistry,
  resolveVizioModelGeneration,
  validateVizioGenerationRegistry,
} from '../../lib/vizio/model-generation-resolver.js';
import { normalizeVizioModelEntry } from '../../lib/vizio/model-normalization.js';

test('production VIZIO generation registry passes every integrity rule', async () => {
  const registry = await loadVizioGenerationRegistry({ forceReload: true });
  assert.deepEqual(validateVizioGenerationRegistry(registry), { valid: true, errors: [] });
});

test('registry validation rejects malformed and conflicting data', async () => {
  const production = await loadVizioGenerationRegistry();
  const base = {
    schemaVersion: 1,
    evidence: [{ id: 'e1' }],
    exactModels: [{
      canonicalModel: 'M1-A1', aliases: ['ALIAS'], modelYear: 2014,
      productionRange: { start: 2014, end: 2015 },
      estimateBasis: 'verified-model-generation', evidenceIds: ['e1'],
    }],
    generationPatterns: [{
      id: 'p1', pattern: '^M1-A1$', canonicalModels: ['M1-A1', 'M2-A1'], modelYear: 2015,
      productionRange: { start: 2016, end: 2015 },
      estimateBasis: 'unsupported', evidenceIds: ['missing'],
    }],
  };
  const invalid = validateVizioGenerationRegistry(base);
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /does not match its pattern/);
  assert.match(invalid.errors.join('\n'), /conflicts with pattern/);
  assert.match(invalid.errors.join('\n'), /end is before start/);
  assert.match(invalid.errors.join('\n'), /unsupported estimateBasis/);
  assert.match(invalid.errors.join('\n'), /missing evidence reference/);

  const malformedRegex = structuredClone(production);
  malformedRegex.generationPatterns[0].pattern = '[';
  assert.match(validateVizioGenerationRegistry(malformedRegex).errors.join('\n'), /invalid regex/);

  const duplicateCanonical = structuredClone(production);
  duplicateCanonical.exactModels.push(structuredClone(duplicateCanonical.exactModels[0]));
  assert.match(validateVizioGenerationRegistry(duplicateCanonical).errors.join('\n'), /duplicate canonical model/);

  const duplicateAlias = structuredClone(production);
  duplicateAlias.exactModels[1].aliases.push('M32li-A2');
  assert.match(validateVizioGenerationRegistry(duplicateAlias).errors.join('\n'), /belongs to multiple models/);

  const overlappingPatterns = structuredClone(production);
  overlappingPatterns.generationPatterns.push({
    id: 'conflicting-overlap', pattern: '^M(?:401i-A3|999i-A3)$',
    canonicalModels: ['M401i-A3', 'M999i-A3'], modelYear: 2014,
    productionRange: { start: 2014, end: 2015 },
    estimateBasis: 'verified-lineup-generation', evidenceIds: ['vizio-2013-m-series'],
  });
  assert.match(validateVizioGenerationRegistry(overlappingPatterns).errors.join('\n'), /overlaps patterns with different years/);
});

test('representative exact and constrained VIZIO models resolve to verified generations', async () => {
  const cases = [
    ['XVTPRO720SV', 2010, 'XVT Pro Series', 'verified-lineup-generation'],
    ['M321i-A2', 2013, 'M-Series', 'verified-model-generation'],
    ['M401i-A3', 2013, 'M-Series', 'verified-lineup-generation'],
    ['M801d-A3', 2013, 'M-Series', 'verified-lineup-generation'],
    ['M322i-B1', 2014, 'M-Series', 'verified-model-generation'],
    ['M492i-B2', 2014, 'M-Series', 'verified-model-generation'],
    ['M602i-B3', 2014, 'M-Series', 'verified-model-generation'],
    ['M801i-A3', 2014, 'M-Series', 'verified-model-generation'],
    ['RS65-B2', 2015, 'Reference Series', 'verified-model-generation'],
    ['D55u-D1', 2015, 'D-Series', 'verified-lineup-generation'],
    ['P65-C1', 2016, 'P-Series', 'verified-lineup-generation'],
    ['PQ65-F1', 2018, 'P-Series Quantum', 'verified-model-generation'],
    ['M65-F0', 2018, 'M-Series', 'verified-lineup-generation'],
    ['V505-G9', 2019, 'V-Series', 'verified-lineup-generation'],
    ['M558-G1', 2019, 'M-Series Quantum', 'verified-lineup-generation'],
    ['OLED65-H1', 2021, 'OLED', 'verified-lineup-generation'],
    ['M65Q7-J01', 2022, 'M-Series Quantum', 'verified-lineup-generation'],
    ['V435-J01', 2022, 'V-Series', 'verified-lineup-generation'],
    ['VQP75C-84', 2023, 'Quantum Pro', 'verified-lineup-generation'],
  ];

  for (const [model, year, series, basis] of cases) {
    const result = await resolveVizioModelGeneration(model);
    assert.equal(result.canonicalModel, model, model);
    assert.equal(result.bestEstimateYear, year, model);
    assert.equal(result.series, series, model);
    assert.equal(result.estimateBasis, basis, model);
    assert.equal(result.estimatedYearType, 'model-production', model);
    assert.equal(result.individualManufactureYear, null, model);
  }
});

test('M801i-A3 is a verified 2014 exception rather than suffix arithmetic', async () => {
  const exception = await resolveVizioModelGeneration('M801i-A3');
  assert.equal(exception.bestEstimateYear, 2014);
  assert.match(exception.notes, /known 2014.*exception/i);
  assert.equal(await resolveVizioModelGeneration('M801i-B3'), null);
  assert.equal(await resolveVizioModelGeneration('M322i-A3'), null);
});

test('VIZIO normalization is registry-constrained and exposes diagnostics', async () => {
  const cases = [
    ['m322i-b1', 'M322i-B1', 'canonical-model', ['case']],
    ['M322i B1', 'M322i-B1', 'canonical-model', ['separator']],
    ['M322iB1', 'M322i-B1', 'canonical-model', ['separator']],
    ['M32LI-A2', 'M321i-A2', 'exact-alias', ['character-ambiguity']],
    ['oled65 h1', 'OLED65-H1', 'constrained-lineup-pattern', ['case', 'separator']],
  ];
  for (const [entered, canonical, matchedBy, steps] of cases) {
    const result = await resolveVizioModelGeneration(entered);
    assert.equal(result.enteredModel, entered);
    assert.equal(result.canonicalModel, canonical);
    assert.equal(result.matchedBy, matchedBy);
    assert.deepEqual(result.normalizationApplied.sort(), steps.sort());
  }

  const tinyKnownSet = [{ canonicalModel: 'M321i-A2', aliases: ['M32li-A2'] }];
  assert.equal(normalizeVizioModelEntry('random-l1', tinyKnownSet), null);
});

test('unsupported VIZIO-looking models do not receive deterministic years', async () => {
  for (const model of ['M321i-Z9', 'M322i-B9', 'M801i-B3', 'P65-D1', 'V505-Z9', 'OLED75-H1', 'VQP85C-84']) {
    assert.equal(await resolveVizioModelGeneration(model), null, model);
  }
});
