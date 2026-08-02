/**
 * Pure-unit tests for store normalization and freshness policy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MIN_EXACT_TOKEN_LENGTH } from '../../lib/model-evidence/exact-model-match.js';
import { buildSharedModelIdentity } from '../../lib/model-evidence/shared-model-identity.js';
import {
  buildStoreLookupTokens,
  IDENTITY_BEARING_ALIAS_TYPES,
  isSafeTranscriptionAlias,
  normalizeSourceUrl,
  searchQueryHash,
  urlDomain,
  urlHash,
} from '../../lib/model-evidence-store/normalization.js';
import {
  aggregateFreshness,
  claimAgeDays,
  classifyFreshness,
  oldestLifecycleAgeDays,
} from '../../lib/model-evidence-store/freshness.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 2);

function claim(overrides = {}) {
  return {
    claimType: 'production_start',
    evidenceQuality: 'strong',
    pointYear: 2019,
    startYear: null,
    endYear: null,
    lastVerifiedAt: new Date(NOW - 10 * DAY).toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Lookup tokens
// ---------------------------------------------------------------------------

test('lookup tokens reuse the shared identity, including the O/0 alternative', () => {
  const identity = buildSharedModelIdentity({
    brand: 'Whirlpool', model: 'WED4850HWO', category: 'appliances',
  });
  const tokens = buildStoreLookupTokens(identity, 'WED4850HWO');

  assert.ok(tokens.includes('WED4850HW0'), 'the canonical O->0 form must be searched');
  assert.ok(tokens.includes('WED4850HWO'), 'the entered form must also be searched');
  assert.deepEqual(tokens, [...new Set(tokens)], 'tokens must be unique');
});

test('tokens shorter than MIN_EXACT_TOKEN_LENGTH are dropped', () => {
  assert.equal(MIN_EXACT_TOKEN_LENGTH, 6);
  assert.deepEqual(buildStoreLookupTokens({ canonicalModel: 'WED48' }), []);
  assert.deepEqual(buildStoreLookupTokens({ canonicalModel: 'C3' }), []);
  assert.deepEqual(buildStoreLookupTokens({ canonicalModel: 'WED485' }), ['WED485']);
});

test('tokens are compacted the same way the rest of the repository compacts them', () => {
  assert.deepEqual(buildStoreLookupTokens({ canonicalModel: 'M321i-A2' }), ['M321IA2']);
  assert.deepEqual(buildStoreLookupTokens({ canonicalModel: 'wed 4850 hw0' }), ['WED4850HW0']);
});

test('tokens are ordered longest first for deterministic queries', () => {
  const tokens = buildStoreLookupTokens({
    canonicalModel: 'SHORTER1',
    searchModels: ['MUCHLONGERMODEL1', 'SHORTER1'],
  });
  assert.deepEqual(tokens, ['MUCHLONGERMODEL1', 'SHORTER1']);
});

// ---------------------------------------------------------------------------
// Alias safety
// ---------------------------------------------------------------------------

test('only bounded transcription substitutions count as safe aliases', () => {
  assert.equal(isSafeTranscriptionAlias('WED4850HW0', 'WED4850HWO'), true);
  assert.equal(isSafeTranscriptionAlias('M321IA2', 'M32LIA2'), true);
  // Not equal length, or more than one substitution, or a real revision change.
  assert.equal(isSafeTranscriptionAlias('WED4850HW0', 'WED4850HW'), false);
  assert.equal(isSafeTranscriptionAlias('WED4850HW0', 'WED4850HW1'), false);
  assert.equal(isSafeTranscriptionAlias('WED4850HW0', 'WEDO85OHWO'), false);
  // Identical is not an alias.
  assert.equal(isSafeTranscriptionAlias('WED4850HW0', 'WED4850HW0'), false);
  // Too short to carry an identity claim.
  assert.equal(isSafeTranscriptionAlias('WED48', 'WED4B'), false);
});

test('identity-bearing alias types exclude family, retailer and user-observed', () => {
  assert.deepEqual([...IDENTITY_BEARING_ALIAS_TYPES].sort(), [
    'manufacturer_alias', 'revision_variant', 'transcription_variant',
  ]);
  for (const unsafe of ['family_alias', 'retailer_alias', 'legacy_model_number', 'user_observed_variant']) {
    assert.equal(IDENTITY_BEARING_ALIAS_TYPES.includes(unsafe), false, `${unsafe} must not be identity-bearing`);
  }
});

// ---------------------------------------------------------------------------
// Source URL normalization
// ---------------------------------------------------------------------------

test('only https public URLs are storable', () => {
  assert.equal(normalizeSourceUrl('http://example.com/a'), null);
  assert.equal(normalizeSourceUrl('javascript:alert(1)'), null);
  assert.equal(normalizeSourceUrl('data:text/html,x'), null);
  assert.equal(normalizeSourceUrl('file:///etc/passwd'), null);
  assert.equal(normalizeSourceUrl('https://localhost/a'), null);
  assert.equal(normalizeSourceUrl('https://127.0.0.1/a'), null);
  assert.equal(normalizeSourceUrl('https://10.0.0.5/a'), null);
  assert.equal(normalizeSourceUrl('https://192.168.1.1/a'), null);
  assert.equal(normalizeSourceUrl('https://169.254.169.254/latest/meta-data'), null);
  assert.equal(normalizeSourceUrl(`https://example.com/${'x'.repeat(3000)}`), null);
  assert.equal(normalizeSourceUrl('not a url'), null);
  assert.ok(normalizeSourceUrl('https://www.vizio.com/en/press/2013'));
});

test('URL normalization deduplicates tracking parameters and fragments', () => {
  const a = normalizeSourceUrl('https://Example.com/spec?b=2&a=1&utm_source=x#frag');
  const b = normalizeSourceUrl('https://example.com/spec?a=1&b=2&gclid=abc');
  assert.equal(a, b, 'tracking params, ordering, casing and fragments must not create two rows');
  assert.equal(urlHash(a), urlHash(b));
  assert.match(urlHash(a), /^[0-9a-f]{64}$/, 'hash must satisfy evidence_sources_hash_shape');
  assert.equal(urlDomain(a), 'example.com');
});

test('the search query hash never carries raw text', () => {
  const hash = searchQueryHash(['WED4850HW0', 'WED4850HWO']);
  assert.match(hash, /^[0-9a-f]{64}$/);
  // Order-independent, so the same logical search always produces one hash.
  assert.equal(hash, searchQueryHash(['WED4850HWO', 'WED4850HW0']));
  assert.equal(searchQueryHash([]), null);
});

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

test('curated verified evidence never goes stale', () => {
  const old = claim({ evidenceQuality: 'verified', lastVerifiedAt: new Date(NOW - 5000 * DAY).toISOString() });
  assert.equal(classifyFreshness(old, NOW), 'fresh');
});

test('a closed historical window stays fresh far longer than an open one', () => {
  const closed = claim({
    claimType: 'production_range', startYear: 2013, endYear: 2014, pointYear: null,
    lastVerifiedAt: new Date(NOW - 200 * DAY).toISOString(),
  });
  const open = claim({ lastVerifiedAt: new Date(NOW - 200 * DAY).toISOString() });

  assert.equal(classifyFreshness(closed, NOW), 'fresh', 'a closed window does not decay at 200 days');
  assert.equal(classifyFreshness(open, NOW), 'stale', 'an open start claim goes stale at 180 days');
});

test('weaker evidence decays faster', () => {
  const at60 = (quality) => classifyFreshness(
    claim({ evidenceQuality: quality, lastVerifiedAt: new Date(NOW - 60 * DAY).toISOString() }),
    NOW,
  );
  assert.equal(at60('strong'), 'fresh');
  assert.equal(at60('supported'), 'fresh');
  assert.equal(at60('weak'), 'stale');
  assert.equal(at60('conflicting'), 'stale');
});

test('expiry is distinct from staleness', () => {
  const supported = (days) => classifyFreshness(
    claim({ evidenceQuality: 'supported', lastVerifiedAt: new Date(NOW - days * DAY).toISOString() }),
    NOW,
  );
  assert.equal(supported(30), 'fresh');
  assert.equal(supported(100), 'stale');
  assert.equal(supported(600), 'expired');
});

test('an unreadable verification timestamp degrades to expired, never fresh', () => {
  assert.equal(classifyFreshness(claim({ lastVerifiedAt: null }), NOW), 'expired');
  assert.equal(classifyFreshness(claim({ lastVerifiedAt: 'not-a-date' }), NOW), 'expired');
  assert.equal(claimAgeDays(claim({ lastVerifiedAt: null }), NOW), null);
});

test('aggregate freshness takes the weakest lifecycle claim', () => {
  const fresh = claim();
  const stale = claim({ lastVerifiedAt: new Date(NOW - 200 * DAY).toISOString() });
  const expired = claim({ evidenceQuality: 'weak', lastVerifiedAt: new Date(NOW - 900 * DAY).toISOString() });

  assert.equal(aggregateFreshness([fresh], NOW), 'fresh');
  assert.equal(aggregateFreshness([fresh, stale], NOW), 'stale');
  assert.equal(aggregateFreshness([fresh, stale, expired], NOW), 'expired');
  assert.equal(aggregateFreshness([], NOW), 'unknown');
  // Non-lifecycle claims do not participate.
  assert.equal(aggregateFreshness([{ claimType: 'category', evidenceQuality: 'weak' }], NOW), 'unknown');
});

test('the oldest lifecycle claim age is reported for telemetry', () => {
  const claims = [
    claim({ lastVerifiedAt: new Date(NOW - 5 * DAY).toISOString() }),
    claim({ lastVerifiedAt: new Date(NOW - 120 * DAY).toISOString() }),
  ];
  assert.equal(oldestLifecycleAgeDays(claims, NOW), 120);
  assert.equal(oldestLifecycleAgeDays([], NOW), null);
});
