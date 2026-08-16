import { test, expect } from './helpers/playwright.mjs';

const BASE_URL = 'http://localhost:3001';

async function openLargeLoss(page) {
  await page.goto(`${BASE_URL}/large-loss-decoder.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('row-1') && window.decoderData);
}

test.describe('Large Loss brand combobox keyboard accessibility', () => {
  test('typing a brand, ArrowDown, then Enter commits the highlighted brand', async ({ page }) => {
    await openLargeLoss(page);
    const input = page.locator('#brand-input-row-1');
    await input.click();
    await page.keyboard.type('LG', { delay: 30 });
    await expect(page.locator('#lldBrandListbox')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', 'lld-brand-opt-0');
    await page.keyboard.press('Enter');

    await expect(input).toHaveValue('LG');
    const committed = await page.evaluate(() => LLD.rows.find((r) => r.id === 'row-1'));
    expect(committed.brand).toBe('lg');
    expect(committed.brandLabel).toBe('LG');
  });

  test('Decode All after keyboard selection does not report "Please select a brand"', async ({ page }) => {
    await openLargeLoss(page);
    const input = page.locator('#brand-input-row-1');
    await input.click();
    await page.keyboard.type('LG', { delay: 30 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await page.fill('#serial-row-1', '410KR00219');
    await page.click('#decodeAllBtn');
    await expect(page.locator('#row-1 .result-status')).not.toContainText('Pending', { timeout: 10000 });

    const result = await page.evaluate(() => LLD.rows.find((r) => r.id === 'row-1').result);
    expect(result?.error).not.toBe('Please select a brand');
  });

  test('ArrowDown/ArrowUp move aria-activedescendant across visible options', async ({ page }) => {
    await openLargeLoss(page);
    const input = page.locator('#brand-input-row-1');
    await input.click();
    await page.keyboard.type('GE', { delay: 30 });
    const optionCount = await page.locator('#lldBrandListbox li[data-index]').count();
    expect(optionCount).toBeGreaterThan(1);

    await page.keyboard.press('ArrowDown');
    const first = await input.getAttribute('aria-activedescendant');
    expect(first).toBe('lld-brand-opt-0');

    await page.keyboard.press('ArrowDown');
    const second = await input.getAttribute('aria-activedescendant');
    expect(second).toBe('lld-brand-opt-1');
    expect(second).not.toBe(first);

    await page.keyboard.press('ArrowUp');
    const backToFirst = await input.getAttribute('aria-activedescendant');
    expect(backToFirst).toBe(first);
  });

  test('the active option exposes aria-selected=true and siblings are false', async ({ page }) => {
    await openLargeLoss(page);
    const input = page.locator('#brand-input-row-1');
    await input.click();
    await page.keyboard.type('GE', { delay: 30 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    const states = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#lldBrandListbox li[role="option"]')).map((li) => ({
        id: li.id,
        selected: li.getAttribute('aria-selected'),
      })),
    );
    const selected = states.filter((s) => s.selected === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe('lld-brand-opt-1');
    expect(states.filter((s) => s.selected === 'false')).toHaveLength(states.length - 1);
  });

  test('Escape closes the list without committing a different brand', async ({ page }) => {
    await openLargeLoss(page);
    const input = page.locator('#brand-input-row-2');
    await input.click();
    await page.keyboard.type('not-a-real-brand', { delay: 20 });
    await expect(page.locator('#lldBrandListbox')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.locator('#lldBrandListbox')).toBeHidden();
    const row = await page.evaluate(() => LLD.rows.find((r) => r.id === 'row-2'));
    expect(row.brand).toBe('');
  });

  test('mouse selection still commits a brand the same way as before', async ({ page }) => {
    await openLargeLoss(page);
    const input = page.locator('#brand-input-row-1');
    await input.click();
    await page.keyboard.type('GE', { delay: 30 });
    await page.locator('#lldBrandListbox li[data-index]').first().click();

    const committed = await page.evaluate(() => LLD.rows.find((r) => r.id === 'row-1'));
    expect(committed.brand).toBeTruthy();
    expect(committed.brandLabel).toBeTruthy();
    await expect(input).toHaveValue(committed.brandLabel);
  });

  test('two rows keep independent active and committed brand state', async ({ page }) => {
    await openLargeLoss(page);

    const row1Input = page.locator('#brand-input-row-1');
    await row1Input.click();
    await page.keyboard.type('LG', { delay: 30 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    const row2Input = page.locator('#brand-input-row-2');
    await row2Input.click();
    await page.keyboard.type('GE', { delay: 30 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    const rows = await page.evaluate(() =>
      LLD.rows.filter((r) => ['row-1', 'row-2'].includes(r.id)).map((r) => ({ id: r.id, brand: r.brand, brandLabel: r.brandLabel })),
    );
    const row1 = rows.find((r) => r.id === 'row-1');
    const row2 = rows.find((r) => r.id === 'row-2');
    expect(row1.brand).toBe('lg');
    expect(row2.brand).not.toBe('lg');
    expect(row2.brand).toBeTruthy();
  });

  test('typing filters the visible option list', async ({ page }) => {
    await openLargeLoss(page);
    const input = page.locator('#brand-input-row-1');
    await input.click();
    await page.keyboard.type('LG', { delay: 30 });
    const options = page.locator('#lldBrandListbox li[data-index]');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveText('LG');
  });

  test('Tab leaves the brand field without trapping focus', async ({ page }) => {
    await openLargeLoss(page);
    const input = page.locator('#brand-input-row-1');
    await input.click();
    await page.keyboard.type('LG', { delay: 30 });
    await page.keyboard.press('Tab');

    const focusedId = await page.evaluate(() => document.activeElement.id);
    expect(focusedId).toBe('serial-row-1');
  });
});
