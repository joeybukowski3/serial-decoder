import { test, expect } from './helpers/playwright.mjs';

test('automated contexts abort Google Analytics and Google Tag Manager traffic', async ({ page, context }) => {
  const analyticsUrls = [
    'https://google-analytics.com/g/collect',
    'https://region1.google-analytics.com/g/collect',
    'https://googletagmanager.com/gtm.js?id=GTM-TEST',
    'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
  ];
  const successfulResponses = [];

  context.on('response', (response) => {
    if (analyticsUrls.includes(response.url())) successfulResponses.push(response.url());
  });

  for (const url of analyticsUrls) {
    await expect(page.goto(url), url).rejects.toThrow(/net::ERR_BLOCKED_BY_CLIENT/);
    expect(successfulResponses, url).not.toContain(url);
  }
  expect(successfulResponses).toEqual([]);
});
