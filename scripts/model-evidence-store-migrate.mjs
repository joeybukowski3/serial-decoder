#!/usr/bin/env node
/**
 * Apply the persistent model evidence store migrations (and optionally the
 * shadow test seed) to a PostgreSQL database.
 *
 * Usage:
 *   node scripts/model-evidence-store-migrate.mjs                 # migrations only
 *   node scripts/model-evidence-store-migrate.mjs --seed          # + test seed
 *   node scripts/model-evidence-store-migrate.mjs --url <url>
 *   node scripts/model-evidence-store-migrate.mjs --verify        # report only
 *
 * Connection URL resolution order:
 *   --url <url>
 *   MODEL_EVIDENCE_MIGRATION_URL   (direct connection; preferred for DDL)
 *   MODEL_EVIDENCE_TEST_DB_URL     (CI / local Docker)
 *   MODEL_EVIDENCE_DB_URL          (runtime pooler URL; DDL may be rejected)
 *
 * NOTE ON POOLERS: run migrations against a DIRECT connection (Supabase port
 * 5432), not the transaction pooler (6543). The runtime read path uses the
 * pooler; DDL does not work reliably through transaction-mode pooling.
 *
 * Every statement is read from the checked-in .sql files. This script contains
 * no schema of its own, so the files under db/ stay the single source of truth.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'db', 'migrations');
const SEED_DIR = path.join(REPO_ROOT, 'db', 'seed');

function parseArgs(argv) {
  const args = { seed: false, verify: false, url: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--seed') args.seed = true;
    else if (value === '--verify') args.verify = true;
    else if (value === '--url') { args.url = argv[index + 1]; index += 1; }
  }
  return args;
}

export function resolveMigrationUrl(env = process.env, explicit = null) {
  return String(
    explicit
    || env.MODEL_EVIDENCE_MIGRATION_URL
    || env.MODEL_EVIDENCE_TEST_DB_URL
    || env.MODEL_EVIDENCE_DB_URL
    || '',
  ).trim();
}

export async function readSqlFiles(directory) {
  const entries = await readdir(directory).catch(() => []);
  const files = entries.filter((name) => name.endsWith('.sql')).sort();
  return Promise.all(files.map(async (name) => ({
    name,
    sql: await readFile(path.join(directory, name), 'utf8'),
  })));
}

/**
 * Apply every .sql file in `directory`, in filename order.
 *
 * Each file runs in its own transaction via sql.file-style unsafe execution:
 * the content is a checked-in migration, never user input, and multi-statement
 * DDL cannot be sent through a parameterized template.
 */
export async function applySqlDirectory(sql, directory, logger = console) {
  const files = await readSqlFiles(directory);
  const applied = [];
  for (const file of files) {
    await sql.unsafe(file.sql);
    applied.push(file.name);
    logger.log?.(`  applied ${file.name}`);
  }
  return applied;
}

export async function verifySchema(sql) {
  const [tables, indexes, constraints, rls] = await Promise.all([
    sql`SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('products','product_aliases','evidence_claims','evidence_sources','claim_sources')
         ORDER BY table_name`,
    sql`SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename IN ('products','product_aliases','evidence_claims','evidence_sources','claim_sources')
         ORDER BY indexname`,
    sql`SELECT conname FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname IN ('products','product_aliases','evidence_claims','evidence_sources','claim_sources')
           AND c.contype = 'c'
         ORDER BY conname`,
    sql`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname IN ('products','product_aliases','evidence_claims','evidence_sources','claim_sources')
         ORDER BY relname`,
  ]);

  return {
    tables: tables.map((row) => row.table_name),
    indexes: indexes.map((row) => row.indexname),
    checkConstraints: constraints.map((row) => row.conname),
    rls: rls.map((row) => ({
      table: row.relname,
      enabled: row.relrowsecurity === true,
      forced: row.relforcerowsecurity === true,
    })),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = resolveMigrationUrl(process.env, args.url);
  if (!url) {
    console.error('No database URL. Set MODEL_EVIDENCE_MIGRATION_URL or pass --url.');
    process.exitCode = 1;
    return;
  }

  // Never print the URL: it carries credentials.
  console.log('Connecting to the model evidence store database...');
  const sql = postgres(url, { max: 1, prepare: false, fetch_types: false, onnotice: () => {} });

  try {
    if (!args.verify) {
      console.log('Applying migrations from db/migrations:');
      await applySqlDirectory(sql, MIGRATIONS_DIR);

      if (args.seed) {
        console.log('Applying TEST seed from db/seed (not production data):');
        await applySqlDirectory(sql, SEED_DIR);
      }
    }

    const report = await verifySchema(sql);
    console.log('\nSchema verification');
    console.log(`  tables            : ${report.tables.length}/5 (${report.tables.join(', ')})`);
    console.log(`  indexes           : ${report.indexes.length}`);
    console.log(`  check constraints : ${report.checkConstraints.length}`);
    for (const entry of report.rls) {
      console.log(`  rls ${entry.table.padEnd(17)}: enabled=${entry.enabled} forced=${entry.forced}`);
    }

    const missing = ['products', 'product_aliases', 'evidence_claims', 'evidence_sources', 'claim_sources']
      .filter((table) => !report.tables.includes(table));
    if (missing.length) {
      console.error(`\nMISSING TABLES: ${missing.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    console.log('\nOK');
  } catch (error) {
    // Print the driver message but never the connection string.
    console.error(`\nMigration failed: ${error?.message || 'unknown error'}`);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('model-evidence-store-migrate.mjs')) {
  await main();
}
