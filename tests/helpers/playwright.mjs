import { test as base } from '@playwright/test';
import { installAnalyticsBlocking } from './analytics-blocking.mjs';

export const test = base.extend({
  analyticsBlocking: [async ({ context }, use) => {
    await installAnalyticsBlocking(context);
    await use();
  }, { auto: true }],
});

export { expect, chromium } from '@playwright/test';
export { createAnalyticsBlockingContext } from './analytics-blocking.mjs';
