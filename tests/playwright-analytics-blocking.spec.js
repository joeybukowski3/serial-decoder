import { test, expect } from './helpers/playwright.mjs';

test('automated contexts abort Google Analytics and Google Tag Manager traffic', async ({ page, context }) => {
  const analyticsUrls = [
    'https://google-analytics.com/g/collect',
    'https://region1.google-analytics.com/g/collect',
    'https://googletagmanager.com/gtm.js?id=GTM-TEST',
    'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
  ];
  const failedRequests = new Map();
  const successfulResponses = [];

  context.on('requestfailed', (request) => {
    if (analyticsUrls.includes(request.url())) {
      failedRequests.set(request.url(), request.failure()?.errorText || 'request failed');
    }
  });
  context.on('response', (response) => {
    if (analyticsUrls.includes(response.url())) successfulResponses.push(response.url());
  });

  await page.evaluate(async (urls) => Promise.all(urls.map((url) => (
    fetch(url, { mode: 'no-cors', keepalive: true })
  ))), analyticsUrls);

  await expect.poll(() => failedRequests.size).toBe(analyticsUrls.length);
  expect(successfulResponses).toEqual([]);
  for (const url of analyticsUrls) {
    expect(failedRequests.get(url)).toMatch(/net::ERR_(?:BLOCKED_BY_CLIENT|ABORTED)/);
  }
});
