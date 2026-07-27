import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEvidencePolicy } from '../../lib/serial-refinement/evidence-policy.js';

test('one verified official local record is sufficient', () => {
  const result = evaluateEvidencePolicy([{
    type: 'local-db',
    title: 'Verified model record',
    quality: 'official',
    verified: true,
    productionStart: 2023,
    productionEnd: 2025,
  }]);
  assert.equal(result.sufficient, true);
  assert.equal(result.confidence, 'high');
  assert.deepEqual(result.range, { start: 2023, end: 2025, conflict: false });
});

test('uncited provider claim is rejected even when it declares official quality', () => {
  const result = evaluateEvidencePolicy([{
    type: 'manufacturer',
    title: 'Claim without citation',
    quality: 'official',
    productionStart: 2023,
    productionEnd: 2025,
  }]);
  assert.equal(result.sufficient, false);
});

test('two independent strong secondary sources are sufficient', () => {
  const result = evaluateEvidencePolicy([
    { type: 'retailer', title: 'Retailer A', sourceUrl: 'https://a.example/model', quality: 'strong-secondary', availabilityStart: 2018, availabilityEnd: 2020 },
    { type: 'review', title: 'Review B', sourceUrl: 'https://b.example/review', quality: 'strong-secondary', availabilityStart: 2019, availabilityEnd: 2021 },
  ]);
  assert.equal(result.sufficient, true);
  assert.equal(result.confidence, 'medium');
  assert.deepEqual(result.range, { start: 2019, end: 2020, conflict: false });
});

test('two distinct Gemini grounding sources sharing the same redirect host still count as independent', () => {
  const result = evaluateEvidencePolicy([
    {
      type: 'retailer', title: 'Listing at Lowe\'s', sourceName: 'Lowe\'s',
      sourceUrl: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA',
      quality: 'strong-secondary', availabilityStart: 2018, availabilityEnd: 2020,
    },
    {
      type: 'manual', title: 'User manual', sourceName: 'manua.ls',
      sourceUrl: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB',
      quality: 'strong-secondary', availabilityStart: 2019, availabilityEnd: 2021,
    },
  ]);
  assert.equal(result.sufficient, true);
  assert.equal(result.confidence, 'medium');
  assert.deepEqual(result.range, { start: 2019, end: 2020, conflict: false });
});

test('two grounding sources with the same sourceName are still treated as one source', () => {
  const result = evaluateEvidencePolicy([
    {
      type: 'retailer', title: 'Listing A', sourceName: 'Lowe\'s',
      sourceUrl: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA',
      quality: 'strong-secondary', availabilityStart: 2018, availabilityEnd: 2020,
    },
    {
      type: 'retailer', title: 'Listing B', sourceName: 'Lowe\'s',
      sourceUrl: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB',
      quality: 'strong-secondary', availabilityStart: 2019, availabilityEnd: 2021,
    },
  ]);
  assert.equal(result.sufficient, false);
});

test('heuristic-only evidence is displayable but not sufficient to resolve', () => {
  const result = evaluateEvidencePolicy([{
    type: 'heuristic',
    title: 'Family prefix range',
    quality: 'heuristic',
    yearRange: '2010-2020',
  }]);
  assert.equal(result.sufficient, false);
  assert.equal(result.evidence.length, 1);
});

test('should narrow candidates with two independent secondary-quality sources', () => {
  const result = evaluateEvidencePolicy([
    {
      type: 'review',
      title: 'Lowe\'s Product Page',
      sourceName: 'Lowe\'s',
      sourceUrl: 'https://www.lowes.com/example',
      productionStart: 2020,
      productionEnd: 2024,
      quality: 'secondary',
      verified: true,
    },
    {
      type: 'manual',
      title: 'User Manual GE JGB735SP1SS',
      sourceName: 'GE Support',
      sourceUrl: 'https://www.ge.com/appliances/support/manual',
      productionStart: 2020,
      productionEnd: 2024,
      quality: 'secondary',
      verified: true,
    },
  ]);
  assert.equal(result.sufficient, true);
  assert.equal(result.confidence, 'medium');
  assert.deepEqual(result.range, { start: 2020, end: 2024, conflict: false });
  assert.equal(result.reason, 'independent-secondary-evidence');
});

test('manual publication date is used only as an availability boundary supplied by evidence', () => {
  const result = evaluateEvidencePolicy([{
    type: 'manual',
    title: 'Official manual',
    sourceUrl: 'https://manufacturer.example/manual.pdf',
    quality: 'official',
    availabilityStart: 2014,
    supports: 'Manual publication establishes the model existed by 2014.',
  }]);
  assert.equal(result.sufficient, true);
  assert.deepEqual(result.range, { start: 2014, end: null, conflict: false });
});
