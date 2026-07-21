import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findLocalModelAgeResult } from '../../lib/smart-lookup/age-legacy.js';

const db = JSON.parse(await readFile(new URL('../../data/model-age-db.json', import.meta.url), 'utf8'));
const record = db.records.find((entry) => entry.normalizedModel === 'qn65q60rafxza');

// "Q60" spans several unrelated generations (Q60R=2019, Q60T=2020, Q60A=2021),
// so this record is scoped to one exact model and must never widen into a
// generation-spanning pattern.

test('the Samsung Q60R record is an exact, source-backed model record', () => {
  assert.ok(record, 'QN65Q60RAFXZA record must exist');
  assert.equal(record.brand, 'Samsung');
  assert.equal(record.category, 'television');
  assert.equal(record.yearStart, 2019);
  assert.equal(record.yearEnd, 2020);
  const evidence = record.refinementEvidence?.[0];
  assert.equal(evidence.quality, 'official');
  assert.equal(evidence.verified, true);
  assert.match(evidence.sourceUrl, /^https:\/\/www\.samsung\.com\//);
});

test('the record never carries a generation-spanning alias', () => {
  const aliases = [...(record.aliases || []), ...(record.exactAliases || [])].map((a) => a.toUpperCase());
  assert.ok(!aliases.includes('Q60'), 'a bare Q60 alias would match unrelated generations');
  assert.ok(!aliases.includes('Q60R'), 'a bare Q60R alias would match other screen sizes');
  assert.ok(aliases.every((alias) => alias.startsWith('QN65Q60RA')));
});

test('the exact model resolves from local evidence, with and without the brand', async () => {
  for (const query of ['Samsung QN65Q60RAFXZA', 'QN65Q60RAFXZA']) {
    const result = await findLocalModelAgeResult(query);
    assert.ok(result, `${query} must resolve locally`);
    assert.equal(result.model, 'QN65Q60RAFXZA');
  }
});

test('unrelated Q60 generations and screen sizes never match this record', async () => {
  for (const query of [
    'Samsung QN65Q60TAFXZA', // 2020 T generation
    'Samsung QN65Q60AAFXZA', // 2021 A generation
    'Samsung Q60',           // generation-spanning family term
    'Samsung QN55Q60RAFXZA', // same generation, different screen size
  ]) {
    const result = await findLocalModelAgeResult(query);
    assert.ok(
      !result || result.model !== 'QN65Q60RAFXZA',
      `${query} must not resolve to the 65" Q60R record`,
    );
  }
});

test('pre-existing GE records are unchanged', () => {
  for (const model of ['GFW850SPNDG', 'PFD87ESPVRS']) {
    const entry = db.records.find((r) => r.model === model);
    assert.ok(entry, `${model} record must still exist`);
    assert.equal(entry.brand, 'GE');
  }
});

test('production-range evidence is documented as model-era, not a unit manufacture date', () => {
  assert.match(record.notes, /does not establish the manufacture date of an individual unit/i);
});
