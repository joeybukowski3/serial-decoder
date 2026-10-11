import { getFact, numeric, resolved } from './normalize-values.js';

/**
 * Physical-fit policy (implementation semantics only; the user-facing bucket stays HARD).
 *
 *   INTRINSIC_HARD   fit is inherent to the install class (built-in, integrated, column, panel-ready):
 *                    every axis must be verified; with nothing to verify against it is UNVERIFIED.
 *   CONDITIONAL_HARD a constraint the case actually supplies (available space, required mount reuse,
 *                    documented fit): known violation -> FAIL, verified compliance -> PASS.
 *   ADVISORY         no constraint is stated: never blocks LKQ; surfaces VERIFY_FIT and lowers confidence
 *                    in proportion to how material the unknown is.
 *
 * A constraint the user STATED but that cannot be used (ambiguous, inferred, non-numeric, unparsed) is
 * never treated as "no constraint": it is UNVERIFIED and blocks LKQ. Fit is never fabricated: candidate
 * dimensions are published facts, and "fits" is only concluded from constraints the caller supplied.
 */

const EPSILON = 0.000001;
const AXES = Object.freeze([
  { axis: 'width', dimension: 'widthIn', opening: 'openingWidthIn', clearance: 'clearanceWidthIn' },
  { axis: 'height', dimension: 'heightIn', opening: 'openingHeightIn', clearance: 'clearanceHeightIn' },
  { axis: 'depth', dimension: 'depthIn', opening: 'openingDepthIn', clearance: 'clearanceDepthIn' },
]);

export const FIT_MESSAGES = Object.freeze({
  ADVISORY: 'Not verified — confirm available space before purchase',
  CONSTRAINT_UNVERIFIED: 'A fit constraint applies but cannot be verified yet',
  VERIFIED: 'Verified against the supplied fit constraints',
  VIOLATION: 'Violates a known fit constraint',
});

const positive = (value) => { const parsed = numeric(value); return parsed !== null && parsed > 0 ? parsed : null; };
const nonNegative = (value) => { const parsed = numeric(value); return parsed !== null && parsed >= 0 ? parsed : null; };
const dimension = (identity, key) => { const entry = getFact(identity, key); return resolved(entry) ? positive(entry.value) : null; };
const isStated = (identity, key) => getFact(identity, key).status !== 'UNKNOWN';
const isKnown = (identity, key) => getFact(identity, key).status === 'KNOWN' && getFact(identity, key).value !== null;
const unverified = (id, kind, detail = {}) => ({ id, kind, result: 'UNVERIFIED', detail });

/** Mount patterns compare as an unordered pair: "VESA 200x200", "200x200mm" and "200 × 200" agree; 200x100 equals 100x200. */
function patternOf(value) {
  const match = String(value).match(/(\d+)\s*[x×]\s*(\d+)/i);
  return match ? [Number(match[1]), Number(match[2])].sort((a, b) => a - b).join('x') : null;
}

function isIntrinsic(original, policy) {
  return policy.intrinsicWhen.some(({ key, values }) => {
    const entry = getFact(original, key);
    return resolved(entry) && values.some((value) => String(value).toLowerCase() === String(entry.value).toLowerCase());
  });
}

function axisConstraint(original, candidate, { axis, dimension: dimensionKey, opening, clearance }, intrinsic) {
  const id = `opening.${axis}`;
  if (!isStated(original, opening)) return intrinsic ? [unverified(id, 'INTRINSIC_HARD', { reason: 'NOT_PROVIDED' })] : [];
  const available = isKnown(original, opening) ? positive(getFact(original, opening).value) : null;
  if (available === null) return [unverified(id, 'CONDITIONAL_HARD', { reason: 'STATED_BUT_UNUSABLE' })];
  const size = dimension(candidate, dimensionKey);
  const clearanceEntry = getFact(candidate, clearance);
  const clearanceValue = resolved(clearanceEntry) ? nonNegative(clearanceEntry.value) : 0;
  if (size === null || clearanceValue === null) return [unverified(id, 'CONDITIONAL_HARD', { available })];
  const required = size + clearanceValue;
  return [{ id, kind: 'CONDITIONAL_HARD', result: required <= available + EPSILON ? 'PASS' : 'FAIL', detail: { available, size, required } }];
}

/** A required-true flag: absent or false means no constraint; any other stated value is unusable, hence unverified. */
function flagState(original, key) {
  const entry = getFact(original, key);
  if (entry.status === 'UNKNOWN' || (entry.status === 'KNOWN' && entry.value === false)) return 'NONE';
  return entry.status === 'KNOWN' && entry.value === true ? 'REQUIRED' : 'UNUSABLE';
}

function mountConstraint(original, candidate) {
  const state = flagState(original, 'mountReuseRequired');
  if (state === 'NONE') return [];
  if (state === 'UNUSABLE') return [unverified('mount-reuse', 'CONDITIONAL_HARD', { reason: 'STATED_BUT_UNUSABLE' })];
  const a = getFact(original, 'mountPattern'), b = getFact(candidate, 'mountPattern');
  const left = resolved(a) ? patternOf(a.value) : null, right = resolved(b) ? patternOf(b.value) : null;
  const result = left === null || right === null ? 'UNVERIFIED' : left === right ? 'PASS' : 'FAIL';
  return [{ id: 'mount-reuse', kind: 'CONDITIONAL_HARD', result, detail: { original: left, replacement: right } }];
}

function panelConstraint(original, candidate) {
  const state = flagState(original, 'panelReady');
  if (state === 'NONE') return [];
  if (state === 'UNUSABLE') return [unverified('panel-ready', 'INTRINSIC_HARD', { reason: 'STATED_BUT_UNUSABLE' })];
  const entry = getFact(candidate, 'panelReady');
  const result = !resolved(entry) ? 'UNVERIFIED' : entry.value === true ? 'PASS' : 'FAIL';
  return [{ id: 'panel-ready', kind: 'INTRINSIC_HARD', result, detail: {} }];
}

/**
 * A documented fit statement (`physicalFit` true OR false on the original) is satisfied only by a verified candidate
 * fit, or by a fully passing check of ALL three axes. A candidate explicitly known not to fit is always a violation.
 */
function documentedConstraint(original, candidate, envelope) {
  const candidateFit = getFact(candidate, 'physicalFit');
  if (resolved(candidateFit) && candidateFit.value === false) return [{ id: 'documented-fit', kind: 'CONDITIONAL_HARD', result: 'FAIL', detail: {} }];
  if (!isKnown(original, 'physicalFit')) return [];
  const verifiedByEnvelope = envelope.length === AXES.length && envelope.every((item) => item.result === 'PASS');
  const result = (resolved(candidateFit) && candidateFit.value === true) || verifiedByEnvelope ? 'PASS' : 'UNVERIFIED';
  return [{ id: 'documented-fit', kind: 'CONDITIONAL_HARD', result, detail: {} }];
}

/** The parser found a fit statement it could not read (feet, mm, fractions...): it must not vanish. */
function unparsedConstraint(original) {
  return isKnown(original, 'fitConstraintStated') && getFact(original, 'fitConstraintStated').value === true
    ? [unverified('stated-unparsed', 'CONDITIONAL_HARD', { reason: 'UNPARSED_STATEMENT' })]
    : [];
}

function dimensionsOf(identity, keys, read) {
  return Object.fromEntries(keys.map((key) => { const entry = getFact(identity, key); return [key, resolved(entry) ? read(entry.value) : null]; }));
}

function advisorySeverity(original, candidate, policy) {
  if (policy.advisory.always) return 'MEANINGFUL';
  const from = dimension(original, policy.advisory.largerKey), to = dimension(candidate, policy.advisory.largerKey);
  return from !== null && to !== null && to > from ? 'MEANINGFUL' : 'MILD';
}

function statusOf(constraints) {
  if (constraints.some((item) => item.result === 'FAIL')) return 'VIOLATION';
  if (constraints.some((item) => item.result === 'UNVERIFIED')) return 'CONSTRAINT_UNVERIFIED';
  return constraints.length ? 'VERIFIED' : 'ADVISORY';
}

/** Returns null for profiles without a fitPolicy, which keep the generic boolean-match behaviour. */
export function evaluateFit(original, candidate, profile) {
  const policy = profile.fitPolicy;
  if (!policy) return null;
  const intrinsic = isIntrinsic(original, policy);
  const envelope = AXES.flatMap((axis) => axisConstraint(original, candidate, axis, intrinsic));
  const constraints = [
    ...envelope,
    ...unparsedConstraint(original),
    ...(policy.supportsMount ? mountConstraint(original, candidate) : []),
    ...(policy.supportsPanel ? panelConstraint(original, candidate) : []),
    ...documentedConstraint(original, candidate, envelope),
  ];
  const status = statusOf(constraints);
  return {
    status,
    intrinsic,
    constraints,
    message: FIT_MESSAGES[status],
    dimensions: {
      original: dimensionsOf(original, AXES.map(({ dimension: key }) => key), positive),
      replacement: dimensionsOf(candidate, AXES.map(({ dimension: key }) => key), positive),
      replacementClearance: dimensionsOf(candidate, AXES.map(({ clearance }) => clearance), nonNegative),
    },
    advisory: status === 'ADVISORY' ? { reasonCode: 'VERIFY_FIT', severity: advisorySeverity(original, candidate, policy), message: FIT_MESSAGES.ADVISORY } : null,
  };
}

/** Assessment/reason pair for the `physicalFit` hard row. */
export function fitOutcome(fit) {
  switch (fit.status) {
    case 'VIOLATION': return { assessment: 'FAIL', reasonCode: 'HARD_FIT_VIOLATION' };
    case 'VERIFIED': return { assessment: 'MATCH', reasonCode: 'HARD_FIT_VERIFIED' };
    case 'CONSTRAINT_UNVERIFIED': return { assessment: 'UNVERIFIED', reasonCode: 'HARD_FIT_UNVERIFIED' };
    default: return { assessment: 'UNVERIFIED', reasonCode: 'VERIFY_FIT' };
  }
}
