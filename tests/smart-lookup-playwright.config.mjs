import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'smart-lookup-ui.spec.js',
  use: {
    baseURL: 'http://127.0.0.1:3001',
  },
  webServer: {
    command: 'npx vercel dev --listen 3001',
    url: 'http://127.0.0.1:3001/smart-lookup.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
