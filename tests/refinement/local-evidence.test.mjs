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
