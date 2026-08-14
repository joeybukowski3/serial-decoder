import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { PLAYWRIGHT_CONTEXT_OPTIONS } from './helpers/analytics-blocking.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: 'smart-lookup-ui.spec.js',
  use: {
    ...PLAYWRIGHT_CONTEXT_OPTIONS,
    baseURL: 'http://127.0.0.1:3001',
  },
  webServer: {
    // This config owns the server lifecycle. CI must not pre-start anything
    // on 3001 (a second bind aborts Playwright before test collection). The
    // suite mocks every API call, so it only needs the static site.
    command: 'node tests/helpers/static-server.mjs . 3001',
    // Playwright defaults the command cwd to this config's directory
    // (tests/), which would serve the wrong tree; serve the repo root.
    cwd: repoRoot,
    url: 'http://127.0.0.1:3001/smart-lookup.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
