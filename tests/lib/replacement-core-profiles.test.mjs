import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile } from '../../lib/replacement-core/profile-validator.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';
import { refrigeratorProfile } from '../../lib/replacement-core/profiles/refrigerator.js';

for (const profile of [televisionProfile, refrigeratorProfile]) {
  test(`${profile.category} profile has exactly three buckets and registered comparators`, () => {
    assert.deepEqual(validateProfile(profile), []);
    assert.deepEqual([...new Set(profile.rules.map((rule) => rule.bucket))].sort(), ['HARD', 'SECONDARY', 'STRONG']);
    assert.ok(profile.rules.filter((rule) => rule.bucket === 'HARD').length >= 3);
    assert.ok(profile.rules.filter((rule) => rule.bucket === 'STRONG' && rule.weightClass === 'HIGH').length >= 3);
  });
}

test('profile validation rejects duplicate keys, unregistered comparator, and missing hard behavior', () => {
  const profile = { ...televisionProfile, rules: [...televisionProfile.rules, { ...televisionProfile.rules[0], comparator: 'guess', hardRule: null }] };
  const errors = validateProfile(profile).join(' ');
  assert.match(errors, /duplicate rule/);
  assert.match(errors, /unregistered comparator/);
  assert.match(errors, /hard rule needs/);
});

test('future-category hard behaviors fit the same profile contract', () => {
  const hardComparators = new Set(televisionProfile.rules.concat(refrigeratorProfile.rules).filter((rule) => rule.bucket === 'HARD').map((rule) => rule.hardRule));
  assert.deepEqual([...hardComparators].sort(), ['MATCH', 'MINIMUM']);
});

test('refrigerator capacity comparator cannot be installed on a television profile', () => {
  const profile = { ...televisionProfile, rules: televisionProfile.rules.map((rule) => rule.key === 'screenSizeIn'
    ? { ...rule, comparator: 'refrigerator-capacity-minimum' } : rule) };
  assert.match(validateProfile(profile).join(' '), /refrigerator capacity comparator requires refrigerator total capacity/);
});
