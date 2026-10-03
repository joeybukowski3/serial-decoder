#!/usr/bin/env node
/** Manual, isolated proof. One process, at most two original and four candidate searches, one original and six candidate fetches. */
import { loadEnvLocal } from '../lib/serper/env-loader.js';
import { runRetrievalProof, TEST_QUERY } from '../lib/replacement-discovery/retrieval-first.js';

if (!process.argv.includes('--live') || process.argv.length !== 3) {
  console.log('Dry run only. Run: node scripts/retrieval-first-proof.mjs --live');
  process.exit(0);
}
loadEnvLocal();
const report = await runRetrievalProof({ query: TEST_QUERY });
console.log(JSON.stringify(report, null, 2));
