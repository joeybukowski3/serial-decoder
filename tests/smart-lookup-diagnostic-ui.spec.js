import { test, expect } from './helpers/playwright.mjs';

test('rendered Smart Lookup card acknowledges the text actually displayed', async ({ page }) => {
  let requestBody = null;
  let acknowledgement = null;
  await page.route('http://dmi.test/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/age-lookup') {
      requestBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        auditId: '851e61c9-9dec-401e-af85-02b6e57ca056',
        brand: 'LG', productFamily: 'C3 OLED TV', status: 'partial-success',
        yearContext: { type: 'model-year-family', value: 2023, label: 'Model-year family', confidence: 'high' },
      }) });
    }
    if (url.pathname === '/api/smart-lookup-audit-ack') {
      acknowledgement = route.request().postDataJSON();
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<input id="smart-lookup-input"><button id="smartLookupBtn">Search</button><div id="smart-lookup-results"></div>' });
  });
  await page.goto('http://dmi.test/');
  await page.addScriptTag({ path: 'src/browser/smart-lookup-controller.js' });
  await page.locator('#smart-lookup-input').fill('  LG   C3 TV  ');
  await page.locator('#smartLookupBtn').click();
  await expect(page.locator('#smart-lookup-age-panel')).toContainText('2023');
  await expect.poll(() => acknowledgement).not.toBeNull();
  expect(requestBody.query).toBe('LG C3 TV');
  expect(requestBody.rawQuery).toBeUndefined();
  expect(acknowledgement.displayStatus).toBe('success');
  expect(acknowledgement.displayedResultText).toContain('2023');
  expect(acknowledgement.rendererVersion).toBe('smart-lookup-controller-v1');
  expect(acknowledgement.rawQuery).toBe('  LG   C3 TV  ');
});
