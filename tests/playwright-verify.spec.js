import { test, expect, chromium } from '@playwright/test';

test.setTimeout(120000);

async function openDecoderPage(viewport) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: viewport || { width: 1440, height: 1100 }
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  const badResponses = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', request => {
    requestFailures.push({
      url: request.url(),
      error: request.failure() ? request.failure().errorText : 'request failed'
    });
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      badResponses.push({ url: response.url(), status: response.status() });
    }
  });

  await page.goto('http://localhost:3001/index.html?cat=appliances', { waitUntil: 'networkidle' });

  return { browser, context, page, consoleErrors, requestFailures, badResponses };
}

async function runDecode(page, brand, serial, model) {
  await page.selectOption('#brand', brand);
  await page.fill('#serial', serial);
  await page.fill('#modelNumber', model || '');
  await page.click('#decodeBtn');
  await page.waitForFunction(() => {
    const results = document.getElementById('serialResults');
    const loading = document.getElementById('ageLoading');
    return results && !results.classList.contains('hidden') &&
      loading && loading.classList.contains('hidden');
  }, { timeout: 20000 });
  return page.evaluate(() => {
    const yearEl = document.getElementById('resultYear');
    const notesEl = document.getElementById('resultNotes');
    const ageEl = document.getElementById('resultEstimatedAge');
    const ageRow = ageEl && ageEl.closest ? ageEl.closest('.result-row') : null;
    const refinePanel = document.querySelector('.narrow-date-panel');
    return {
      year: yearEl ? yearEl.textContent.trim() : '',
      notes: notesEl ? notesEl.textContent.trim() : '',
      age: ageEl ? ageEl.textContent.trim() : '',
      ageVisible: !!(ageRow && window.getComputedStyle(ageRow).display !== 'none'),
      refineVisible: !!(refinePanel && !refinePanel.classList.contains('hidden'))
    };
  });
}

async function runRefine(page, model, contextText) {
  await page.waitForSelector('#narrowModelInput', { timeout: 20000 });
  await page.fill('#narrowModelInput', model || '');
  await page.fill('#narrowContextInput', contextText || '');
  await page.click('#narrowDateBtn');
  await page.waitForFunction(() => {
    const output = document.getElementById('narrowDateOutput');
    const yearEl = document.getElementById('resultYear');
    return output && !/Refining\.\.\./.test(output.textContent || '') &&
      yearEl && yearEl.textContent.trim().length > 0;
  }, { timeout: 20000 });
  return page.evaluate(() => {
    const yearEl = document.getElementById('resultYear');
    const notesEl = document.getElementById('resultNotes');
    const ageEl = document.getElementById('resultEstimatedAge');
    const ageRow = ageEl && ageEl.closest ? ageEl.closest('.result-row') : null;
    return {
      year: yearEl ? yearEl.textContent.trim() : '',
      notes: notesEl ? notesEl.textContent.trim() : '',
      ageVisible: !!(ageRow && window.getComputedStyle(ageRow).display !== 'none')
    };
  });
}

function filterRelevantConsoleErrors(errors) {
  return (errors || []).filter(message => {
    return !/content security policy|err_name_not_resolved|adtrafficquality|googlesyndication|doubleclick|google-analytics/i.test(String(message || ''));
  });
}

function filterRelevantNetworkFailures(items) {
  return (items || []).filter(item => {
    var url = String((item && item.url) || '');
    var error = String((item && item.error) || '');
    if (/localhost:3001\/api\/age-lookup/i.test(url) && /err_aborted/i.test(error)) {
      return false;
    }
    return /localhost:3001|localhost:59751/i.test(url) && !/favicon\.ico$/i.test(url);
  });
}

test('decoder acceptance flow', async () => {
  const { browser, context, page, consoleErrors, requestFailures, badResponses } = await openDecoderPage();
  try {
    const lgSerialOnly = await runDecode(page, 'lg', '412TATG1H105', '');
    expect(lgSerialOnly.year).toBe('2004/2014/2024');
    expect(lgSerialOnly.ageVisible).toBe(false);
    expect(lgSerialOnly.notes).toContain('Possible manufacture years: 2004, 2014, or 2024.');

    const lgUpfrontValid = await runDecode(page, 'lg', '412TATG1H105', 'WM3470HWA');
    expect(lgUpfrontValid.year).toBe('2014');
    expect(lgUpfrontValid.ageVisible).toBe(true);
    expect(lgUpfrontValid.refineVisible).toBe(false);

    const lgUpfrontInvalid = await runDecode(page, 'lg', '412TATG1H105', 'UNKNOWNMODEL');
    expect(lgUpfrontInvalid.year).toBe('2004/2014/2024');
    expect(lgUpfrontInvalid.ageVisible).toBe(false);
    expect(lgUpfrontInvalid.notes).toContain('Model number could not confidently narrow this repeating serial cycle.');

    const whirlpoolSerialOnly = await runDecode(page, 'whirlpool', 'TRD3481274', '');
    expect(whirlpoolSerialOnly.year).toBe('1994/2024');
    expect(whirlpoolSerialOnly.ageVisible).toBe(false);

    const whirlpoolUpfrontValid = await runDecode(page, 'whirlpool', 'TRD3481274', 'WMH31017HS12');
    expect(whirlpoolUpfrontValid.year).toBe('2024');
    expect(whirlpoolUpfrontValid.ageVisible).toBe(true);

    const relevantConsoleErrors = filterRelevantConsoleErrors(consoleErrors);
    const pageFailures = filterRelevantNetworkFailures(requestFailures);
    const responseFailures = filterRelevantNetworkFailures(badResponses);

    expect(relevantConsoleErrors).toEqual([]);
    expect(pageFailures).toEqual([]);
    expect(responseFailures).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('decoder still completes on mobile width', async () => {
  const { browser, context, page, consoleErrors, requestFailures, badResponses } = await openDecoderPage({ width: 390, height: 844 });
  try {
    const mobileResult = await runDecode(page, 'lg', '412TATG1H105', 'WM3470HWA');
    expect(mobileResult.year).toBe('2014');
    expect(mobileResult.ageVisible).toBe(true);

    const relevantConsoleErrors = filterRelevantConsoleErrors(consoleErrors);
    const pageFailures = filterRelevantNetworkFailures(requestFailures);
    const responseFailures = filterRelevantNetworkFailures(badResponses);

    expect(relevantConsoleErrors).toEqual([]);
    expect(pageFailures).toEqual([]);
    expect(responseFailures).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('narrow the date refinement uses the same shared resolver', async () => {
  const { browser, context, page, consoleErrors, requestFailures, badResponses } = await openDecoderPage();
  try {
    const base = await runDecode(page, 'lg', '412TATG1H105', '');
    expect(base.year).toBe('2004/2014/2024');
    expect(base.ageVisible).toBe(false);

    await page.waitForFunction(() => {
      const panel = document.querySelector('.narrow-date-panel');
      return panel && !panel.classList.contains('hidden');
    }, { timeout: 20000 });

    const refined = await runRefine(page, 'WM3470HWA', '');
    expect(refined.year).toBe('2014');
    expect(refined.ageVisible).toBe(true);

    const relevantConsoleErrors = filterRelevantConsoleErrors(consoleErrors);
    const pageFailures = filterRelevantNetworkFailures(requestFailures);
    const responseFailures = filterRelevantNetworkFailures(badResponses);

    expect(relevantConsoleErrors).toEqual([]);
    expect(pageFailures).toEqual([]);
    expect(responseFailures).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});
