export const PLAYWRIGHT_CONTEXT_OPTIONS = Object.freeze({
  serviceWorkers: 'block',
});

const BLOCKED_ANALYTICS_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
];

export function isBlockedAnalyticsUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return BLOCKED_ANALYTICS_DOMAINS.some((domain) => (
      hostname === domain || hostname.endsWith(`.${domain}`)
    ));
  } catch {
    return false;
  }
}

export async function installAnalyticsBlocking(context) {
  await context.route(
    (url) => isBlockedAnalyticsUrl(url.href),
    async (route) => route.abort('blockedbyclient'),
  );
}

export async function createAnalyticsBlockingContext(browser, options = {}) {
  const context = await browser.newContext({
    ...options,
    ...PLAYWRIGHT_CONTEXT_OPTIONS,
  });
  await installAnalyticsBlocking(context);
  return context;
}
