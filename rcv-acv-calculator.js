import { calculateRcvAcv } from '/lib/calculators/rcv-acv.js';
import { CONFIRMED_ITEMS, UNDETERMINED_ITEMS, OTHER_CUSTOM_ITEM, findRcvAcvItem } from '/lib/calculators/rcv-acv-items.js';

const DEFAULT_RATE_HINT = 'Select an Item Type above to load its reference rate, or enter a rate directly.';
const NO_RATE_HINT = 'No verified insurance reference rate is available for this item. Enter the annual depreciation rate required by your claim or estimating methodology.';
const CLAIMS_PAGES_RATE_LABEL = 'Claims Pages reference rate';
const CUSTOM_RATE_LABEL = 'Custom rate';

// Sanity bound for an age arriving via URL query parameter. This is a defensive guard on
// untrusted input, not a change to the calculator's own age validation (calculateRcvAcv
// itself accepts any non-negative finite age).
const MAX_PREFILL_AGE_YEARS = 150;

const PREFILL_SOURCES = new Set(['serial-decoder', 'smart-lookup']);

const PREFILL_DISCLOSURE_TEXT = {
  deterministic: 'Age pre-filled from your Decode My Item serial-number result.',
  estimated: 'Age pre-filled from your Smart Lookup estimate. Review it before calculating.',
};

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatPct(value) {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

function buildItemTypeOptions(selectEl) {
  const groups = [];
  for (const item of CONFIRMED_ITEMS) {
    let group = groups.find((g) => g.label === item.group);
    if (!group) {
      group = { label: item.group, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  for (const group of groups) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    for (const item of group.items) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.item} (${item.annualDepreciationRate.toFixed(2)}%/yr)`;
      optgroup.appendChild(option);
    }
    selectEl.appendChild(optgroup);
  }

  const undeterminedGroup = document.createElement('optgroup');
  undeterminedGroup.label = 'Not Yet Verified (Manual Rate Required)';
  for (const item of UNDETERMINED_ITEMS) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.item;
    undeterminedGroup.appendChild(option);
  }
  selectEl.appendChild(undeterminedGroup);

  const otherOption = document.createElement('option');
  otherOption.value = OTHER_CUSTOM_ITEM.id;
  otherOption.textContent = OTHER_CUSTOM_ITEM.item;
  selectEl.appendChild(otherOption);
}

function initRcvAcvCalculator() {
  const els = {
    itemType: document.getElementById('calcItemType'),
    sourceDisplay: document.getElementById('calcSourceDisplay'),
    sourceRateValue: document.getElementById('calcSourceRateValue'),
    sourceNameValue: document.getElementById('calcSourceNameValue'),
    sourceLink: document.getElementById('calcSourceLink'),
    annualRate: document.getElementById('calcAnnualRate'),
    annualRateHint: document.getElementById('calcAnnualRateHint'),
    replacementCost: document.getElementById('calcReplacementCost'),
    ageYears: document.getElementById('calcAgeYears'),
    agePrefillNote: document.getElementById('calcAgePrefillNote'),
    maxDepreciationSelect: document.getElementById('calcMaxDepreciation'),
    maxDepreciationCustom: document.getElementById('calcMaxDepreciationCustom'),
    manualAdjustment: document.getElementById('calcManualAdjustment'),
    calculateBtn: document.getElementById('calcCalculateBtn'),
    resultsPanel: document.getElementById('calcResults'),
    emptyState: document.getElementById('calcEmptyState'),
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

  let hasCalculated = false;
  let currentRateLabel = 'Annual rate';
  let prefilledAgeValue = null;

  function hideAgePrefillNote() {
    if (!els.agePrefillNote) return;
    els.agePrefillNote.hidden = true;
    els.agePrefillNote.textContent = '';
    prefilledAgeValue = null;
  }

  function showAgePrefillNote(basis) {
    if (!els.agePrefillNote) return;
    els.agePrefillNote.textContent = PREFILL_DISCLOSURE_TEXT[basis] || PREFILL_DISCLOSURE_TEXT.estimated;
    els.agePrefillNote.hidden = false;
  }

  buildItemTypeOptions(els.itemType);

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

  function applyItemType() {
    const item = findRcvAcvItem(els.itemType.value);

    if (!item) {
      els.sourceDisplay.hidden = true;
      els.annualRateHint.textContent = DEFAULT_RATE_HINT;
      currentRateLabel = 'Annual rate';
      return;
    }

    if (item.confidence === 'CONFIRMED') {
      els.annualRate.value = item.annualDepreciationRate;
      els.sourceDisplay.hidden = false;
      els.sourceRateValue.textContent = `${item.annualDepreciationRate.toFixed(2)}% per year`;
      els.sourceNameValue.textContent = item.sourceName;
      els.sourceLink.href = item.sourceUrl;
      els.sourceLink.hidden = false;
      els.annualRateHint.textContent = 'Loaded from Claims Pages. You can edit this rate if you have a reason to use a different one.';
      currentRateLabel = CLAIMS_PAGES_RATE_LABEL;
    } else {
      els.annualRate.value = '';
      els.sourceDisplay.hidden = true;
      els.annualRateHint.textContent = NO_RATE_HINT;
      currentRateLabel = CUSTOM_RATE_LABEL;
    }
  }

  function render() {
    const result = calculateRcvAcv({
      replacementCost: els.replacementCost.value,
      ageYears: els.ageYears.value,
      annualDepreciationRatePct: els.annualRate.value,
      maxTotalDepreciationPct: getMaxDepreciationPct(),
      manualAdjustmentPct: els.manualAdjustment.value,
      rateLabel: currentRateLabel,
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

    els.primaryValue.textContent = formatCurrency(result.acv);
    els.rcvValue.textContent = formatCurrency(result.replacementCost);
    els.depPctValue.textContent = formatPct(result.depreciationPct);
    els.depAmountValue.textContent = formatCurrency(result.depreciationAmount);
    els.diffValue.textContent = formatCurrency(result.difference);
    els.detailText.textContent = result.detailText;

    return result;
  }

  function renderIfCalculated() {
    if (hasCalculated) render();
  }

  els.itemType.addEventListener('change', () => {
    applyItemType();
    renderIfCalculated();
  });

  ['input', 'change'].forEach((evt) => {
    els.annualRate.addEventListener(evt, renderIfCalculated);
    els.replacementCost.addEventListener(evt, renderIfCalculated);
    els.ageYears.addEventListener(evt, renderIfCalculated);
    els.maxDepreciationCustom.addEventListener(evt, renderIfCalculated);
    els.manualAdjustment.addEventListener(evt, renderIfCalculated);
  });

  els.ageYears.addEventListener('input', () => {
    if (prefilledAgeValue !== null && els.ageYears.value !== prefilledAgeValue) hideAgePrefillNote();
  });

  els.maxDepreciationSelect.addEventListener('change', () => {
    syncCustomFieldVisibility();
    renderIfCalculated();
  });

  els.calculateBtn.addEventListener('click', () => {
    hasCalculated = true;
    render();
  });

  els.resetBtn.addEventListener('click', () => {
    els.itemType.value = '';
    els.sourceDisplay.hidden = true;
    els.annualRateHint.textContent = DEFAULT_RATE_HINT;
    currentRateLabel = 'Annual rate';
    els.annualRate.value = '';
    els.replacementCost.value = '';
    els.ageYears.value = '';
    els.maxDepreciationSelect.value = '75';
    els.maxDepreciationCustom.value = '';
    els.manualAdjustment.value = '';
    syncCustomFieldVisibility();
    hideAgePrefillNote();
    hasCalculated = false;
    els.emptyState.hidden = false;
    els.errorBox.hidden = true;
    els.resultBody.hidden = true;
    els.resultsPanel.classList.add('is-empty');
    els.copyBtn.disabled = true;
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

  applyQueryPrefill();

  // Reads and validates ?age, ?item, ?source, ?basis from the URL (e.g. a link from a
  // Serial Decoder or Smart Lookup result). Every value is validated against the
  // calculator's own rules before use; unknown/invalid values are silently ignored.
  // The annual rate is never read from the URL — it always comes from findRcvAcvItem()
  // via applyItemType(), so a query string can never inject a rate for a confirmed item.
  function applyQueryPrefill() {
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }

    const source = params.get('source');
    const basisParam = params.get('basis');
    const basis = basisParam === 'estimated' ? 'estimated' : 'deterministic';

    let ageWasApplied = false;

    const ageParam = params.get('age');
    if (ageParam !== null && ageParam !== '') {
      const ageNum = Number(ageParam);
      if (Number.isFinite(ageNum) && ageNum >= 0 && ageNum <= MAX_PREFILL_AGE_YEARS) {
        const ageStr = String(ageNum);
        els.ageYears.value = ageStr;
        prefilledAgeValue = ageStr;
        ageWasApplied = true;
      }
    }

    const itemParam = params.get('item');
    if (itemParam) {
      const optionExists = Array.from(els.itemType.options).some((option) => option.value === itemParam);
      if (optionExists) {
        els.itemType.value = itemParam;
        applyItemType();
      }
    }

    if (ageWasApplied && PREFILL_SOURCES.has(source)) {
      showAgePrefillNote(basis);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRcvAcvCalculator);
} else {
  initRcvAcvCalculator();
}
