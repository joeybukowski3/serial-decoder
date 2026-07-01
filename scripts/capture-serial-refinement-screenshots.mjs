import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const baseUrl = 'http://localhost:3001';
const outputDir = 'artifacts/serial-refinement-preview';
await mkdir(outputDir, { recursive: true });

function response(overrides = {}) {
  return {
    status: 'resolved',
    candidateYears: [2004, 2014, 2024],
    remainingCandidateYears: [2014],
    chosenYear: 2014,
    confidence: 'high',
    resolutionBasis: 'serial-plus-model',
    modelProductionRange: { start: 2013, end: 2016 },
    modelNormalization: null,
    evidence: [{
      type: 'manufacturer-support',
      title: 'Mocked manufacturer support record',
      sourceUrl: 'https://example.com/model',
      quality: 'official',
      productionStart: 2013,
      productionEnd: 2016,
      supports: 'Mocked evidence for screenshot validation only.',
    }],
    summary: 'Model evidence leaves 2014.',
    cacheStatus: 'bypass',
    provider: 'local-db',
    timings: { localMs: 1, cacheMs: 0, onlineLookupMs: 0, totalMs: 1 },
    errorCode: null,
    ...overrides,
  };
}

async function assertVisible(locator, label) {
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible`);
}

async function fillDecode(page, brand, serial, model) {
  await page.selectOption('#brand', brand);
  await page.fill('#serial', serial);
  await page.fill('#modelNumber', model || '');
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await desktop.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const providerRequests = [];
  page.on('console', message => { if (message.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|doubleclick|googlesyndication/i.test(message.text())) consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => { if (/generativelanguage\.googleapis\.com|api\.groq\.com/i.test(request.url())) providerRequests.push(request.url()); });

  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/refine-serial-date', async route => {
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response()) });
  });

  await page.goto(`${baseUrl}/index.html?cat=appliances`, { waitUntil: 'networkidle' });
  await assertVisible(page.locator('#decodeBtn'), 'Decode button');
  await assertVisible(page.locator('#smartLookupBtn'), 'Smart Lookup button');

  await page.click('#smartLookupBtn');
  await assertVisible(page.locator('#smartLookupModal'), 'Smart Lookup modal');
  await page.click('#smartLookupClose');

  await fillDecode(page, 'lg', '412TATG1H105', 'WM3470HWA');
  await page.click('#decodeBtn');
  await page.locator('#serialResults').waitFor({ state: 'visible' });
  await page.locator('#resultYear').waitFor();
  if ((await page.locator('#resultYear').textContent())?.trim() !== '2004/2014/2024') throw new Error('Immediate ambiguous candidates did not render');
  await page.screenshot({ path: `${outputDir}/01-immediate-ambiguous-result.png`, fullPage: true });

  await page.locator('.serial-refinement-status--checking').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${outputDir}/02-refinement-loading.png`, fullPage: true });

  release();
  await page.locator('.serial-refinement-status--resolved').waitFor({ state: 'visible' });
  if ((await page.locator('#resultYear').textContent())?.trim() !== '2014') throw new Error('Mocked resolution did not select 2014');
  await assertVisible(page.locator('.serial-refinement-evidence summary'), 'Evidence used summary');
  await assertVisible(page.locator('#replaceAction'), 'Replacement/LKQ action');
  await page.screenshot({ path: `${outputDir}/03-successful-mocked-resolution.png`, fullPage: true });

  await page.selectOption('#brand', 'kenmore');
  await assertVisible(page.locator('#kenmoreModelField'), 'Kenmore model-prefix field');
  await page.fill('#kenmoreModelPrefix', '401');

  const unavailable = await desktop.newPage();
  await unavailable.route('**/api/refine-serial-date', async route => {
    const body = route.request().postDataJSON();
    const candidates = body.candidateYears || [1994, 2024];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({
        status: 'unavailable',
        candidateYears: candidates,
        remainingCandidateYears: candidates,
        chosenYear: null,
        confidence: null,
        modelProductionRange: null,
        evidence: [],
        summary: 'Model evidence could not be checked.',
        provider: 'none',
        errorCode: 'REFINEMENT_TIMEOUT',
      })),
    });
  });
  await unavailable.goto(`${baseUrl}/index.html?cat=appliances`, { waitUntil: 'networkidle' });
  await fillDecode(unavailable, 'whirlpool', 'TRD3481274', 'WMH31017HS12');
  await unavailable.click('#decodeBtn');
  await unavailable.locator('[data-serial-refinement-retry="1"]').waitFor({ state: 'visible' });
  if ((await unavailable.locator('#resultYear').textContent())?.trim() !== '1994/2024') throw new Error('Unavailable state did not preserve candidates');
  await unavailable.screenshot({ path: `${outputDir}/04-unavailable-retry.png`, fullPage: true });

  const electronics = await desktop.newPage();
  await electronics.goto(`${baseUrl}/index.html?cat=electronics`, { waitUntil: 'networkidle' });
  await electronics.selectOption('#brand', 'vizio');
  await electronics.fill('#serial', 'LSPATBH4026090');
  await electronics.fill('#modelNumber', 'VW32L HDTV10A');
  await electronics.click('#decodeBtn');
  await electronics.locator('#serialResults').waitFor({ state: 'visible' });
  if (!/2007/.test((await electronics.locator('#resultYear').textContent()) || '')) throw new Error('Vizio model-primary behavior did not remain available');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.route('**/api/refine-serial-date', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response()) });
  });
  await mobilePage.goto(`${baseUrl}/index.html?cat=appliances`, { waitUntil: 'networkidle' });
  await fillDecode(mobilePage, 'lg', '412TATG1H105', 'WM3470HWA');
  await mobilePage.click('#decodeBtn');
  await mobilePage.locator('.serial-refinement-status--resolved').waitFor({ state: 'visible' });
  await assertVisible(mobilePage.locator('#serialResults'), 'Mobile results');
  await mobilePage.screenshot({ path: `${outputDir}/05-mobile-result.png`, fullPage: true });

  if (consoleErrors.length) throw new Error(`Unexpected console errors: ${consoleErrors.join(' | ')}`);
  if (pageErrors.length) throw new Error(`Unexpected page errors: ${pageErrors.join(' | ')}`);
  if (providerRequests.length) throw new Error(`Unexpected live provider requests: ${providerRequests.join(' | ')}`);

  await mobile.close();
  await desktop.close();
  console.log('Final-build smoke checks and five screenshot captures passed.');
} finally {
  await browser.close();
}
