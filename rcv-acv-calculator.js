import { calculateRcvAcv } from '/lib/calculators/rcv-acv.js';

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatPct(value) {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

function initRcvAcvCalculator() {
  const els = {
    replacementCost: document.getElementById('calcReplacementCost'),
    ageYears: document.getElementById('calcAgeYears'),
    usefulLifeYears: document.getElementById('calcUsefulLife'),
    maxDepreciationSelect: document.getElementById('calcMaxDepreciation'),
    maxDepreciationCustom: document.getElementById('calcMaxDepreciationCustom'),
    manualAdjustment: document.getElementById('calcManualAdjustment'),
    resultsPanel: document.getElementById('calcResults'),
    errorBox: document.getElementById('calcError'),
    resultBody: document.getElementById('calcResultBody'),
    primaryValue: document.getElementById('calcPrimaryValue'),
    rcvValue: document.getElementById('calcRcvValue'),
    depPctValue: document.getElementById('calcDepPctValue'),
    depAmountValue: document.getElementById('calcDepAmountValue'),
    diffValue: document.getElementById('calcDiffValue'),
    detailText: document.getElementById('calcDetailText'),
    copyBtn: document.getElementById('calcCopyBtn'),
    resetBtn: document.getElementById('calcResetBtn'),
  };

  if (!els.replacementCost) return; // not on this page

  function getMaxDepreciationPct() {
    if (els.maxDepreciationSelect.value === 'custom') {
      return els.maxDepreciationCustom.value;
    }
    return els.maxDepreciationSelect.value;
  }

  function syncCustomFieldVisibility() {
    const isCustom = els.maxDepreciationSelect.value === 'custom';
    els.maxDepreciationCustom.hidden = !isCustom;
    if (isCustom) els.maxDepreciationCustom.focus();
  }

  function render() {
    const result = calculateRcvAcv({
      replacementCost: els.replacementCost.value,
      ageYears: els.ageYears.value,
      usefulLifeYears: els.usefulLifeYears.value,
      maxDepreciationPct: getMaxDepreciationPct(),
      manualAdjustmentPct: els.manualAdjustment.value,
    });

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

    els.primaryValue.textContent = formatCurrency(result.acv);
    els.rcvValue.textContent = formatCurrency(result.replacementCost);
    els.depPctValue.textContent = formatPct(result.depreciationPct);
    els.depAmountValue.textContent = formatCurrency(result.depreciationAmount);
    els.diffValue.textContent = formatCurrency(result.difference);
    els.detailText.textContent = result.detailText;

    return result;
  }

  ['input', 'change'].forEach((evt) => {
    els.replacementCost.addEventListener(evt, render);
    els.ageYears.addEventListener(evt, render);
    els.usefulLifeYears.addEventListener(evt, render);
    els.maxDepreciationCustom.addEventListener(evt, render);
    els.manualAdjustment.addEventListener(evt, render);
  });

  els.maxDepreciationSelect.addEventListener('change', () => {
    syncCustomFieldVisibility();
    render();
  });

  els.resetBtn.addEventListener('click', () => {
    els.replacementCost.value = '';
    els.ageYears.value = '';
    els.usefulLifeYears.value = '';
    els.maxDepreciationSelect.value = '25';
    els.maxDepreciationCustom.value = '';
    els.manualAdjustment.value = '';
    syncCustomFieldVisibility();
    render();
    els.replacementCost.focus();
  });

  els.copyBtn.addEventListener('click', async () => {
    const result = render();
    if (!result) return;
    const lines = [
      `Estimated ACV: ${formatCurrency(result.acv)}`,
      `Replacement Cost (RCV): ${formatCurrency(result.replacementCost)}`,
      `Estimated Depreciation: ${formatPct(result.depreciationPct)} (${formatCurrency(result.depreciationAmount)})`,
      `RCV – ACV Difference: ${formatCurrency(result.difference)}`,
      `Calculation: ${result.detailText}`,
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

  syncCustomFieldVisibility();
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRcvAcvCalculator);
} else {
  initRcvAcvCalculator();
}
