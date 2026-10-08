#!/usr/bin/env node
import { loadEnvLocal } from '../lib/serper/env-loader.js';
import { runRefrigeratorProof } from '../lib/replacement-discovery/refrigerator-retrieval.js';

if (!process.argv.includes('--live') || process.argv.length !== 3) {
  console.log('Dry run only. Run: node scripts/refrigerator-retrieval-proof.mjs --live');
  process.exit(0);
}
loadEnvLocal();
console.log(JSON.stringify(await runRefrigeratorProof(), null, 2));
