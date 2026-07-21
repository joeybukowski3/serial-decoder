import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findLocalRefinementEvidence } from '../../lib/serial-refinement/local-evidence.js';

async function createDb() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'serial-refinement-db-'));
  const dbPath = path.join(dir, 'db.json');
  await writeFile(dbPath, JSON.stringify({ records: [{
    brand: 'Frigidaire',
    model: 'FFTR2045VS0',
    aliases: ['Frigidaire FFTR2045VS0'],
    refinementEvidence: [{
      type: 'local-db',
      title: 'Verified structured record',
      quality: 'official',
      verified: true,
      productionStart: 2020,
      productionEnd: 2024,
    }],
  }, {
    brand: 'GE',
    model: 'JB258DM1WW',
    aliases: ['JB258'],
    productionRange: '2018-2020',
  }, {
    brand: 'GE',
    model: 'PFD87ESPVRS',
    exactAliases: ['PFD87ESPV0RS'],
    refinementEvidence: [{
      type: 'local-db',
      title: 'GE PFD87ESPVRS official production-start record',
      quality: 'official',
      verified: true,
      productionStart: 2024,
      productionEnd: null,
    }],
  }, {
    brand: 'GE',
    model: 'GFW850SPNDG',
    exactAliases: ['GFW850SPN0DG'],
    refinementEvidence: [{
      type: 'local-db',
      title: 'GE GFW850SPNDG official production-window record',
      quality: 'official',
      verified: true,
      productionStart: 2019,
      productionEnd: 2021,
    }],
  }] }), 'utf8');
  return dbPath;
}

test('exact model returns structured evidence', async () => {
  const dbPath = await createDb();
  const result = await findLocalRefinementEvidence({ brand: 'Frigidaire', model: 'FFTR2045VS0', dbPath });
  assert.equal(result.record.model, 'FFTR2045VS0');
  assert.equal(result.evidence[0].verified, true);
  assert.equal(result.normalization.usedValidatedAlternative, false);
});

test('O to zero alternative is disclosed and used only after structured validation', async () => {
  const dbPath = await createDb();
  const result = await findLocalRefinementEvidence({ brand: 'Frigidaire', model: 'FFTR2045VSO', dbPath });
  assert.equal(result.record.model, 'FFTR2045VS0');
  assert.equal(result.normalization.usedValidatedAlternative, true);
  assert.equal(result.normalization.validatedAlternative.value, 'FFTR2045VS0');
});

test('short family alias cannot behave as an exact model', async () => {
  const dbPath = await createDb();
  const result = await findLocalRefinementEvidence({ brand: 'GE', model: 'JB258', dbPath });
  assert.equal(result.record, null);
  assert.deepEqual(result.evidence, []);
});

test('GE label revision and official base model share only their validated exact record', async () => {
  const dbPath = await createDb();
  const base = await findLocalRefinementEvidence({ brand: 'GE', model: '  pfd87espvrs  ', dbPath });
  const label = await findLocalRefinementEvidence({ brand: 'GE', model: 'PFD87ESPV0RS', dbPath });
  const unsafeRemoval = await findLocalRefinementEvidence({ brand: 'GE', model: 'PFD87ESPVR0', dbPath });

  assert.equal(base.record.model, 'PFD87ESPVRS');
  assert.equal(label.record.model, 'PFD87ESPVRS');
  assert.equal(label.evidence[0].productionStart, 2024);
  assert.equal(unsafeRemoval.record, null);
});


test('GE GFW850 label variant resolves to the canonical family record with an inserted zero (not a stripped zero)', async () => {
  const dbPath = await createDb();
  const label = await findLocalRefinementEvidence({ brand: 'GE', model: 'GFW850SPN0DG', dbPath });
  const family = await findLocalRefinementEvidence({ brand: 'GE', model: 'GFW850SPNDG', dbPath });

  assert.equal(label.record.model, 'GFW850SPNDG');
  assert.equal(family.record.model, 'GFW850SPNDG');
  assert.equal(label.evidence[0].productionStart, 2019);
  assert.equal(label.evidence[0].productionEnd, 2021);
  assert.equal(label.normalization.usedValidatedAlternative, true);
  assert.equal(label.normalization.validatedAlternative.value, 'GFW850SPNDG');
  // Preserve exact label identity: the original user-entered value is never
  // silently overwritten before it is checked against known models.
  assert.equal(label.normalization.original, 'GFW850SPN0DG');
});

test('GE GFW850 label variant is safe under case, spacing, and whitespace formatting', async () => {
  const dbPath = await createDb();
  for (const model of ['gfw850spn0dg', 'GFW 850 SPN0 DG', '  GFW850SPN0DG  ']) {
    const result = await findLocalRefinementEvidence({ brand: 'GE', model, dbPath });
    assert.equal(result.record.model, 'GFW850SPNDG', model);
    assert.equal(result.evidence[0].productionStart, 2019, model);
  }
});

test('a GFW850 near-miss token never aliases silently (no fuzzy matching)', async () => {
  const dbPath = await createDb();
  const wrongLetter = await findLocalRefinementEvidence({ brand: 'GE', model: 'GFW850SPNXDG', dbPath });
  const wrongPositionZero = await findLocalRefinementEvidence({ brand: 'GE', model: 'GFW8500SPNDG', dbPath });
  assert.equal(wrongLetter.record, null);
  assert.deepEqual(wrongLetter.evidence, []);
  assert.equal(wrongPositionZero.record, null);
});

test('GFW850 exact alias does not affect unrelated GE or non-GE records', async () => {
  const dbPath = await createDb();
  const unrelatedGe = await findLocalRefinementEvidence({ brand: 'GE', model: 'JB258DM1WW', dbPath });
  const otherBrand = await findLocalRefinementEvidence({ brand: 'Frigidaire', model: 'GFW850SPN0DG', dbPath });
  // Querying an unrelated GE model still resolves to its own record, not the
  // new GFW850 family -- adding GFW850SPN0DG as an exact alias must not
  // reroute or shadow any other GE record's own exact match.
  assert.equal(unrelatedGe.record.model, 'JB258DM1WW');
  // Brand-scoped: GE's exact alias never leaks to a different brand.
  assert.equal(otherBrand.record, null);
});

test('a long family alias without the complete revision cannot behave as exact', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'serial-refinement-db-'));
  const dbPath = path.join(dir, 'db.json');
  await writeFile(dbPath, JSON.stringify({ records: [{
    brand: 'Whirlpool',
    model: 'WMH31017HS12',
    aliases: ['WMH31017HS'],
    refinementEvidence: [{ type: 'local-db', quality: 'official', verified: true, productionStart: 2023, productionEnd: 2025 }],
  }] }), 'utf8');
  const result = await findLocalRefinementEvidence({ brand: 'Whirlpool', model: 'WMH31017HS', dbPath });
  assert.equal(result.record, null);
});

// --- Real production database (data/model-age-db.json), no dbPath override --

test('production DB: GE GFW850SPN0DG label resolves to the GFW850SPNDG family record', async () => {
  const result = await findLocalRefinementEvidence({ brand: 'GE', model: 'GFW850SPN0DG' });
  assert.equal(result.record.model, 'GFW850SPNDG');
  assert.equal(result.evidence[0].productionStart, 2019);
  assert.equal(result.evidence[0].productionEnd, 2021);
  assert.equal(result.evidence[0].quality, 'official');
  assert.equal(result.evidence[0].verified, true);
});

test('production DB: GE PFD87ESPV0RS/PFD87ESPVRS regression is unaffected by the GFW850 addition', async () => {
  const label = await findLocalRefinementEvidence({ brand: 'GE', model: 'PFD87ESPV0RS' });
  const base = await findLocalRefinementEvidence({ brand: 'GE', model: 'PFD87ESPVRS' });
  assert.equal(label.record.model, 'PFD87ESPVRS');
  assert.equal(base.record.model, 'PFD87ESPVRS');
  assert.equal(label.evidence[0].productionStart, 2024);
});
