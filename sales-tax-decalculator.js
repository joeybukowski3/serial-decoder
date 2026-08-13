import { calculateSalesTaxDecalc } from '/lib/calculators/sales-tax-decalc.js';

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatPct(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return `${Number.isInteger(rounded) ? rounded : rounded}%`;
}

function initSalesTaxDecalculator() {
  const els = {
    total: document.getElementById('calcTotal'),
    rate: document.getElementById('calcRate'),
    calculateBtn: document.getElementById('calcCalculateBtn'),
    resultsPanel: document.getElementById('calcResults'),
    emptyState: document.getElementById('calcEmptyState'),
    errorBox: document.getElementById('calcError'),
    resultBody: document.getElementById('calcResultBody'),
    primaryValue: document.getElementById('calcPrimaryValue'),
    taxValue: document.getElementById('calcTaxValue'),
    totalValue: document.getElementById('calcTotalValue'),
    rateValue: document.getElementById('calcRateValue'),
    copyBtn: document.getElementById('calcCopyBtn'),
    resetBtn: document.getElementById('calcResetBtn'),
  };

  if (!els.total) return; // not on this page

  let hasCalculated = false;

  function render() {
    const result = calculateSalesTaxDecalc({
      totalIncludingTax: els.total.value,
      taxRatePct: els.rate.value,
    });

    els.emptyState.hidden = true;

    if (!result.valid) {
      els.errorBox.textContent = result.error;
      els.errorBox.hidden = false;
      els.resultBody.hidden = true;
      els.resultsPanel.classList.add('is-empty');
      els.copyBtn.disabled = true;
      return null;
    }

    els.errorBox.hidden = true;
    els.resultBody.hidden = false;
    els.resultsPanel.classList.remove('is-empty');
    els.copyBtn.disabled = false;

    els.primaryValue.textContent = formatCurrency(result.preTaxAmount);
    els.taxValue.textContent = formatCurrency(result.embeddedTax);
    els.totalValue.textContent = formatCurrency(result.totalIncludingTax);
    els.rateValue.textContent = formatPct(result.taxRatePct);

    return result;
  }

  function renderIfCalculated() {
    if (hasCalculated) render();
  }

  ['input', 'change'].forEach((evt) => {
    els.total.addEventListener(evt, renderIfCalculated);
    els.rate.addEventListener(evt, renderIfCalculated);
  });

  els.calculateBtn.addEventListener('click', () => {
    hasCalculated = true;
    render();
  });

  els.resetBtn.addEventListener('click', () => {
    els.total.value = '';
    els.rate.value = '';
    hasCalculated = false;
    els.emptyState.hidden = false;
    els.errorBox.hidden = true;
    els.resultBody.hidden = true;
    els.resultsPanel.classList.add('is-empty');
    els.copyBtn.disabled = true;
    els.total.focus();
  });

  els.copyBtn.addEventListener('click', async () => {
    const result = render();
    if (!result) return;
    const lines = [
      `Pre-Tax Amount: ${formatCurrency(result.preTaxAmount)}`,
      `Sales Tax Included: ${formatCurrency(result.embeddedTax)}`,
      `Original Total: ${formatCurrency(result.totalIncludingTax)}`,
      `Tax Rate Used: ${formatPct(result.taxRatePct)}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      const original = els.copyBtn.textContent;
      els.copyBtn.textContent = 'Copied';
      setTimeout(() => { els.copyBtn.textContent = original; }, 1600);
    } catch {
      // Clipboard API unavailable — silently ignore, the values remain visible on screen.
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSalesTaxDecalculator);
} else {
  initSalesTaxDecalculator();
}
