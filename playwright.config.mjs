import { defineConfig } from '@playwright/test';
import { PLAYWRIGHT_CONTEXT_OPTIONS } from './tests/helpers/analytics-blocking.mjs';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  use: {
    ...PLAYWRIGHT_CONTEXT_OPTIONS,
  },
});
