import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMSUNG_TV_MODEL_YEAR, SAMSUNG_TV_LETTER_ORDER, samsungTvYear, resolveLineage } from '../../lib/itemassist-research/enrich/lineage.js';
import { candidateModelYear, parseSamsungTvModel, successorModelHypotheses } from '../../lib/replacement-discovery/retrieval-first.js';

// OFFLINE ONLY. Samsung's television model-year letter table in the research route must agree with the classic replacement pipeline's registry (the two had drifted by
// one unevidenced entry). What is in it is what is evidenced; a letter that is not in it is never guessed, and a letter that repeats across decades never reaches it.
const NOW = Date.UTC(2026, 10, 11, 15);
const grammar = resolveLineage({ category: 'tv', query: 'Samsung S90C 65 inch', identity: 'Samsung S90C', candidateName: 'Samsung S90-series OLED', now: NOW }).grammar;
const yearOf = (title) => { const parsed = grammar.parse(title, 2026); return parsed ? parsed.ordinal : null; };

test('the table holds exactly the evidenced letters; N (2018) is not among them', () => {
  assert.deepEqual({ ...SAMSUNG_TV_MODEL_YEAR }, { R: 2019, T: 2020, A: 2021, B: 2022, C: 2023, D: 2024, F: 2025, H: 2026 });
  assert.equal(Object.hasOwn(SAMSUNG_TV_MODEL_YEAR, 'N'), false, 'only a parenthetical in a Q60R note mentioned N=2018; its cited Samsung page evidences R=2019 only');
  assert.equal(samsungTvYear('N'), null);
  assert.equal(samsungTvYear('E'), null, 'E and G are not used by Samsung in these lines');
  assert.equal(samsungTvYear('toString'), null, 'only own properties are letters');
  assert.equal(samsungTvYear(undefined), null);
  assert.throws(() => { 'use strict'; SAMSUNG_TV_MODEL_YEAR.N = 2018; }, TypeError, 'the table is frozen');
});

test('the release order is by model year, strictly increasing', () => {
  const years = SAMSUNG_TV_LETTER_ORDER.map((letter) => SAMSUNG_TV_MODEL_YEAR[letter]);
  assert.deepEqual(SAMSUNG_TV_LETTER_ORDER, ['R', 'T', 'A', 'B', 'C', 'D', 'F', 'H']);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
  assert.equal(new Set(years).size, years.length);
});

test('research parsing and the classic pipeline read the same year for every letter, and rank them in the same order', () => {
  for (const letter of SAMSUNG_TV_LETTER_ORDER) {
    const research = yearOf(`Samsung QN65Q80${letter}AFXZA`);
    const classic = candidateModelYear({ title: '', snippet: '' }, { baseModel: `QN65Q80${letter}` });
    // The classic pipeline accepts a subset of letters as supported models, but dates all of them from the same registry.
    assert.equal(research, SAMSUNG_TV_MODEL_YEAR[letter], `research ${letter}`);
    assert.equal(classic.year, SAMSUNG_TV_MODEL_YEAR[letter], `classic ${letter}`);
  }
  for (const letter of SAMSUNG_TV_LETTER_ORDER) {
    const later = successorModelHypotheses(parseSamsungTvModel(`QN55Q80${letter}`)).filter((model) => model.startsWith('QN55Q80')).map((model) => model.slice(-1));
    const expected = SAMSUNG_TV_LETTER_ORDER.filter((other) => SAMSUNG_TV_MODEL_YEAR[other] > SAMSUNG_TV_MODEL_YEAR[letter]);
    assert.deepEqual(later, expected, `later generations of ${letter}`);
  }
});

test('a letter outside the table is not guessed, in either pipeline', () => {
  for (const letter of ['N', 'E', 'G', 'J', 'K', 'M', 'P', 'S', 'U', 'X', 'Z']) {
    assert.equal(yearOf(`Samsung QN65Q80${letter}AFXZA`), null, `research ${letter}`);
    assert.equal(candidateModelYear({ title: '', snippet: '' }, { baseModel: `QN65Q80${letter}` }).year, null, `classic ${letter}`);
  }
  assert.deepEqual(successorModelHypotheses({ size: 55, prefix: 'Q', family: '80', generation: 'N' }), [], 'no successors are invented from a letter the registry lacks');
});

test('a letter that repeats across decades never reaches the table through an older or differently shaped model number', () => {
  // D, F and H were also model-year letters in 2011-2014 (UN55D6000, UN55F6400, UN55H6350), and a 2017-2018 Q-series used one digit (Q7F, Q7FN).
  for (const title of ['Samsung UN55D6000SF 55" LED', 'Samsung UN55F6400AF Smart TV', 'Samsung UN55H6350AF', 'Samsung QN65Q7FNAFXZA QLED', 'Samsung QN65Q9FAMFXZA', 'Samsung QN55Q6FNAFXZA']) {
    assert.equal(yearOf(title), null, title);
  }
  // Accessory and monitor codes that look like a series with a letter are not television years either.
  for (const title of ['Samsung HW-Q60D 3.1ch soundbar', 'Samsung HW-Q990F soundbar', 'Samsung ViewFinity S90PC monitor', 'Samsung Odyssey G90XF']) {
    assert.equal(yearOf(title), null, title);
  }
});

test('a model-year letter is never taken from the middle of a longer token', () => {
  assert.equal(yearOf('Samsung QN65Q80DAFXZA').valueOf(), 2024);
  assert.equal(yearOf('Samsung Q80DX kit'), null, 'Q80DX is not Q80D');
  assert.equal(yearOf('Samsung 65Q80D accessory'), null, 'a size-prefixed fragment is not a model code');
  assert.equal(yearOf('Samsung Q80D QLED 4K'), 2024);
});

test('generation ordering by year: an earlier letter never outranks a later year, and a wrapped sequence is impossible', () => {
  const order = ['QN65Q80RAFXZA', 'QN65Q80TAFXZA', 'QN65Q80AAFXZA', 'QN65Q80BAFXZA', 'QN65Q80CAFXZA', 'QN65Q80DAFXZA', 'QN65Q80FAFXZA', 'QN65Q80HAFXZA'].map(yearOf);
  assert.deepEqual(order, [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  // A is later than T although it comes earlier in the alphabet.
  assert.ok(yearOf('QN65Q80AAFXZA') > yearOf('QN65Q80TAFXZA'));
});
