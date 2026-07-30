import { existsSync, readFileSync } from 'node:fs';

/**
 * Minimal dependency-free .env.local loader for standalone Node scripts
 * (e.g. `node --test`, the Serper POC runner) that are not launched through
 * `vercel dev`, which loads .env.local automatically on its own. Never logs
 * or returns parsed values; it only assigns them into process.env.
 *
 * @param {{ path?: string }} [options]
 * @returns {{ loaded: boolean, path: string }}
 */
export function loadEnvLocal(options = {}) {
  const path = options.path || new URL('../../.env.local', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  if (!existsSync(path)) return { loaded: false, path };

  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }

  return { loaded: true, path };
}
