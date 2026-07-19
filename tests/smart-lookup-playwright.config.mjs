import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: 'smart-lookup-ui.spec.js',
  use: {
    baseURL: 'http://127.0.0.1:3001',
  },
  webServer: {
    // This config owns the server lifecycle. CI must not pre-start anything
    // on 3001 (a second bind aborts Playwright before test collection). The
    // suite mocks every API call, so CI only needs the static site; local
    // runs keep vercel dev for parity with production routes.
    command: process.env.CI ? 'python3 -m http.server 3001' : 'npx vercel dev --listen 3001',
    // Playwright defaults the command cwd to this config's directory
    // (tests/), which would serve the wrong tree; serve the repo root.
    cwd: repoRoot,
    url: 'http://127.0.0.1:3001/smart-lookup.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
