import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateReplacement } from '../../lib/replacement-core/evaluate.js';
import { refrigeratorProfile } from '../../lib/replacement-core/profiles/refrigerator.js';
import { televisionProfile } from '../../lib/replacement-core/profiles/television.js';
import { interpretReplacementSearch } from '../../lib/replacement-discovery/interpret.js';

const tvCases = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/television-cases.json', import.meta.url)));
const fridgeCases = JSON.parse(fs.readFileSync(new URL('../fixtures/replacement-core/refrigerator-cases.json', import.meta.url)));
const fact = (value, status = 'KNOWN') => ({ status, value, evidenceRefs: ['test'] });

function fridge(originalFacts = {}, candidateFacts = {}) {
  const entry = structuredClone(fridgeCases.complete25);
  entry.original.facts.physicalFit = { status: 'UNKNOWN', value: null, evidenceRefs: [] };
  delete entry.candidate.identity.facts.physicalFit;
  Object.assign(entry.original.facts, originalFacts);
  Object.assign(entry.candidate.identity.facts, { widthIn: fact(41), heightIn: fact(70), depthIn: fact(33), ...candidateFacts });
  return evaluateReplacement({ ...entry, profile: refrigeratorProfile });
}
function tv(originalFacts = {}, candidateFacts = {}) {
  const entry = structuredClone(tvCases.complete65);
  entry.original.facts.physicalFit = { status: 'UNKNOWN', value: null, evidenceRefs: [] };
  delete entry.candidate.identity.facts.physicalFit;
  Object.assign(entry.original.facts, originalFacts);
  Object.assign(entry.candidate.identity.facts, candidateFacts);
  return evaluateReplacement({ ...entry, profile: televisionProfile });
}
const blocked = (result) => assert.deepEqual([result.fitAssessment.status, result.classification], ['CONSTRAINT_UNVERIFIED', 'UNCONFIRMED']);

test('a STATED constraint that is ambiguous, inferred, assumed or non-numeric blocks as unverified; it never vanishes', () => {
  for (const value of [fact(null, 'UNKNOWN')]) assert.equal(fridge({ openingWidthIn: value }).fitAssessment.status, 'ADVISORY');
  blocked(fridge({ openingWidthIn: { status: 'AMBIGUOUS', value: null, alternatives: [36, 30], evidenceRefs: ['user-input'] } }));
  blocked(fridge({ openingWidthIn: fact(30, 'INFERRED') }));
  blocked(fridge({ openingWidthIn: fact(30, 'ASSUMED') }));
  blocked(fridge({ openingWidthIn: fact('36 in') }));
  blocked(fridge({ openingWidthIn: fact(-5) }));
  blocked(fridge({ openingHeightIn: fact(0) }));
  blocked(fridge({ fitConstraintStated: fact(true) }));
});

test('an ambiguous axis cannot be hidden by a passing axis', () => {
  const result = fridge({ openingWidthIn: { status: 'AMBIGUOUS', value: null, alternatives: [36, 30], evidenceRefs: ['user-input'] }, openingHeightIn: fact(80) });
  blocked(result);
  assert.equal(fridge({ openingWidthIn: fact(36), openingHeightIn: fact(80) }).classification, 'NOT_LKQ', 'a real violation still fails outright');
});

test('unusable required-mount and panel flags are unverified, not ignored', () => {
  blocked(tv({ mountReuseRequired: { status: 'AMBIGUOUS', value: null, alternatives: [true, false], evidenceRefs: ['user-input'] } }));
  blocked(tv({ mountReuseRequired: fact('true') }));
  blocked(tv({ mountReuseRequired: fact(true, 'INFERRED') }));
  assert.equal(tv({ mountReuseRequired: fact(false), mountPattern: fact('400x400') }, { mountPattern: fact('600x400') }).classification, 'LKQ');
  assert.equal(fridge({ installationType: fact('built-in'), panelReady: fact('yes') }, { installationType: fact('built-in') }).fitAssessment.status, 'CONSTRAINT_UNVERIFIED');
});

test('intrinsic installs need EVERY axis verified; one passing axis is not enough', () => {
  const builtIn = { installationType: fact('built-in') };
  const candidate = { installationType: fact('built-in'), widthIn: fact(35), heightIn: fact(80), depthIn: fact(24) };
  const widthOnly = fridge({ ...builtIn, openingWidthIn: fact(36) }, candidate);
  blocked(widthOnly);
  assert.deepEqual(widthOnly.fitAssessment.constraints.filter((item) => item.result === 'UNVERIFIED').map((item) => item.id), ['opening.height', 'opening.depth']);
  blocked(fridge({ ...builtIn, openingWidthIn: fact(36), openingHeightIn: fact(84) }, candidate));
  const all = fridge({ ...builtIn, openingWidthIn: fact(36), openingHeightIn: fact(84), openingDepthIn: fact(26) }, candidate);
  assert.deepEqual([all.fitAssessment.status, all.classification], ['VERIFIED', 'LKQ']);
});

test('a documented fit is satisfied only by a verified candidate fit or by all three axes', () => {
  const documented = { physicalFit: fact(true), openingWidthIn: fact(50) };
  blocked(fridge(documented, { widthIn: fact(35) }));
  assert.equal(fridge(documented, { widthIn: fact(35), physicalFit: fact(true) }).fitAssessment.status, 'VERIFIED');
  assert.equal(fridge({ physicalFit: fact(true), openingWidthIn: fact(50), openingHeightIn: fact(80), openingDepthIn: fact(40) }, { widthIn: fact(35), heightIn: fact(70), depthIn: fact(33) }).fitAssessment.status, 'VERIFIED');
});

test('`physicalFit: false` on the original is a stated fit statement, not silence', () => {
  blocked(fridge({ physicalFit: fact(false) }));
  assert.equal(fridge({ physicalFit: fact(false) }, { physicalFit: fact(true) }).fitAssessment.status, 'VERIFIED');
  assert.equal(fridge({ physicalFit: fact(false) }, { physicalFit: fact(false) }).classification, 'NOT_LKQ');
});

test('mount patterns compare as unordered number pairs', () => {
  const same = (a, b) => tv({ mountReuseRequired: fact(true), mountPattern: fact(a) }, { mountPattern: fact(b) }).fitAssessment.status;
  assert.equal(same('VESA 200x200', '200x200'), 'VERIFIED');
  assert.equal(same('200x200mm', '200 × 200'), 'VERIFIED');
  assert.equal(same('200x100', '100x200'), 'VERIFIED');
  assert.equal(same('200x200', '400x200'), 'VIOLATION');
  assert.equal(same('VESA', '200x200'), 'CONSTRAINT_UNVERIFIED');
});

test('negative or non-numeric dimensions and clearances can never verify a fit', () => {
  const opening = { openingWidthIn: fact(36) };
  blocked(fridge(opening, { widthIn: fact(37), clearanceWidthIn: fact(-2) }));
  blocked(fridge(opening, { widthIn: fact(-1) }));
  blocked(fridge(opening, { widthIn: fact('40 in') }));
  assert.equal(fridge(opening, { widthIn: fact(35), clearanceWidthIn: fact(0.5) }).fitAssessment.status, 'VERIFIED');
});

const facts = (query, notes = '') => interpretReplacementSearch({ query, notes }).normalizedOriginal.facts;
const openings = (notes, query = 'LG french door refrigerator') => Object.fromEntries(Object.entries(facts(query, notes)).filter(([key]) => /^opening/.test(key)).map(([key, entry]) => [key, entry.status === 'KNOWN' ? entry.value : entry.status]));

test('parser: dimensions never cross-pair, in either order or with no punctuation', () => {
  const expected = { openingWidthIn: 36, openingHeightIn: 70, openingDepthIn: 30 };
  assert.deepEqual(openings('opening 36 wide 70 high 30 deep'), expected);
  assert.deepEqual(openings('opening width 36 height 70 depth 30'), expected);
  assert.deepEqual(openings('opening: 36 wide, 70 high, 30 deep'), expected);
  assert.deepEqual(openings('cabinet opening 36 in wide and 70 in high'), { openingWidthIn: 36, openingHeightIn: 70 });
});

test('parser: conflicting statements are AMBIGUOUS, and ambiguity blocks rather than disappears', () => {
  assert.deepEqual(openings('space for it is 36 inches wide, but the cabinet is 30 wide'), { openingWidthIn: 'AMBIGUOUS' });
  assert.deepEqual(openings('opening width 36 and a max width of 35.5'), { openingWidthIn: 'AMBIGUOUS' });
  const original = interpretReplacementSearch({ query: 'LG french door refrigerator', notes: 'opening width 36 and a max width of 35.5' }).normalizedOriginal;
  const entry = structuredClone(fridgeCases.complete25);
  entry.original = { ...original, facts: { ...entry.original.facts, openingWidthIn: original.facts.openingWidthIn, physicalFit: { status: 'UNKNOWN', value: null, evidenceRefs: [] } } };
  delete entry.candidate.identity.facts.physicalFit;
  blocked(evaluateReplacement({ ...entry, profile: refrigeratorProfile }));
});

test('parser: a descriptor next to a far cue is not a constraint', () => {
  assert.deepEqual(openings('current unit is 36 inches wide, need same size or bigger capacity, max 70 inches tall'), { openingHeightIn: 70 });
  assert.deepEqual(openings('old one was 36 inch wide; cabinet above'), {});
  assert.deepEqual(openings('the old fridge is 36 inches wide. need more space'), {});
  assert.deepEqual(openings('', 'LG 36 inch wide french door refrigerator'), {});
  assert.deepEqual(openings('no more than 36 inches wide'), { openingWidthIn: 36 });
});

test('parser: statements it cannot read are flagged as stated-unparsed instead of dropped', () => {
  for (const notes of ['opening 36 1/2 inches wide', 'opening 3 ft wide', 'opening is 914 mm wide', 'opening 36w x 84h', 'cabinet opening 2.5 meters wide']) {
    assert.equal(facts('LG french door refrigerator', notes).fitConstraintStated?.value, true, notes);
  }
  for (const notes of ['space for a 65 inch tv', 'opening 36 wide 70 high', 'must fit a 58 inch wide cabinet', 'current unit is 36 inches wide']) {
    assert.equal(facts('LG french door refrigerator', notes).fitConstraintStated, undefined, notes);
  }
});

test('parser: negation is honored for mount reuse and panel-ready', () => {
  const tvFacts = (notes) => facts('65 Samsung QLED TV', notes);
  assert.equal(tvFacts('must reuse existing wall mount').mountReuseRequired.value, true);
  assert.equal(tvFacts('no need to reuse existing mount').mountReuseRequired.value, false);
  assert.equal(tvFacts("don't want to keep the existing mount").mountReuseRequired.value, false);
  const fridgeFacts = (notes) => facts('LG refrigerator', notes);
  assert.equal(fridgeFacts('panel-ready').panelReady.value, true);
  assert.equal(fridgeFacts('not panel ready').panelReady.value, false);
  assert.equal(fridgeFacts('does not need custom panel').panelReady.value, false);
});

test('parser: only the first 2000 characters are read', () => {
  assert.deepEqual(openings('opening 36 wide'), { openingWidthIn: 36 });
  assert.deepEqual(openings(`${'x '.repeat(1100)}opening 36 wide`), {});
});

test('parser: hostile whitespace and length cannot stall it', () => {
  const started = Date.now();
  for (const notes of ['opening 12' + ' '.repeat(100000) + 'x', 'must fit ' + ' '.repeat(100000) + '58 inch wide', 'opening ' + '9'.repeat(100000) + ' wide', 'cabinet ' + '- '.repeat(50000) + 'wide', 'opening ' + 'width '.repeat(20000)]) {
    facts('LG french door refrigerator', notes);
  }
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started}ms`);
});
