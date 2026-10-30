#!/usr/bin/env node
// Operator-only export. Run with production Redis credentials in the environment.
// Example: node --env-file=.env.local scripts/export-smart-lookup-diagnostics.mjs 2026-10-29 ../review.csv ../restricted.csv
import { realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Redis } from '@upstash/redis';
import { collectExportRows } from '../lib/smart-lookup/diagnostic-export.js';

const [day, reviewPath, diagnosticPath] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !reviewPath || !diagnosticPath || reviewPath === diagnosticPath) {
  console.error('Usage: node --env-file=.env.local scripts/export-smart-lookup-diagnostics.mjs YYYY-MM-DD ../review.csv ../restricted.csv');
  process.exit(2);
}
const repoRoot = await realpath(fileURLToPath(new URL('../', import.meta.url)));
async function outsideRepo(value) {
  const parent = await realpath(path.dirname(path.resolve(value)));
  const relative = path.relative(repoRoot, path.join(parent, path.basename(value)));
  return relative === '..' || relative.startsWith(`..${path.sep}`);
}
if (!await outsideRepo(reviewPath) || !await outsideRepo(diagnosticPath)) {
  console.error('Export paths must be outside the site repository.');
  process.exit(2);
}
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required.');
  process.exit(2);
}

const redis = new Redis({ url, token });
const { reviewRows, diagnosticRows } = await collectExportRows(redis, day);
await writeFile(reviewPath, `${reviewRows.join('\r\n')}\r\n`, { flag: 'wx', mode: 0o600 });
await writeFile(diagnosticPath, `${diagnosticRows.join('\r\n')}\r\n`, { flag: 'wx', mode: 0o600 });
console.log(`Exported ${reviewRows.length - 1} request records.`);
