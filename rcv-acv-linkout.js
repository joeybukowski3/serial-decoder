// Adds a secondary "Estimate RCV / ACV" link to successful Serial Decoder results,
// deep-linking into /rcv-acv-calculator with a pre-filled item age (when one can be
// determined responsibly) and, occasionally, a matching item type.
//
// Smart Lookup's own equivalent linkout lives directly in
// src/browser/smart-lookup-controller.js (mountRcvAcvLinkout), next to the actual
// age-result renderer, rather than here — verified via live browser QA that
// #smart-lookup-age-panel / mountUpsell() is the code path smart-lookup.html and
// decoder-tool.html's embedded Smart Lookup actually use. The showAgeLookupResults patch
// below is kept as an inert, try/catch-guarded fallback for script.js's separate
// "age-only" render path (queryKind: "age-only") in case that path is ever the one that
// fires instead; it has not been observed to run in the pages tested.
//
// This file intentionally does not modify decoder logic, Smart Lookup scoring, or the
// verified Claims Pages rate dataset. It only reads already-rendered result data. All
// matching/age logic lives in lib/rcv-acv-linkout-helpers.js so it can be unit tested
// without a DOM.
import {
  hasSingleResolvedYear,
  parseCandidateYears,
  ageFromYear,
  isCleanSingleYear,
  matchRcvAcvItemFromCategoryText,
  mapDecoderCategoryToItemId,
  buildRcvAcvUrl,
} from '/lib/rcv-acv-linkout-helpers.js';

function buildRcvAcvCtaElement(url) {
  const wrap = document.createElement('div');
  wrap.className = 'rcv-acv-linkout';
  const link = document.createElement('a');
  link.className = 'rcv-acv-linkout-link';
  link.href = url;
  link.textContent = 'Estimate RCV / ACV →';
  wrap.appendChild(link);
  return wrap;
}

// ─── Serial Decoder ───────────────────────────────────────────────────────────────

function getActiveDecoderCategory() {
  const activeTab = document.querySelector('.search-tab.active[data-cat]');
  return activeTab ? activeTab.getAttribute('data-cat') : '';
}

function handleDecoderResult(summaryLayerNode) {
  const existing = summaryLayerNode.querySelector('.rcv-acv-linkout');
  if (existing) existing.remove();

  const resultYearEl = document.getElementById('resultYear');
  const yearText = resultYearEl ? resultYearEl.textContent : '';
  if (!yearText || !yearText.trim()) return; // no-match / fallback state — CTA would be misleading

  let age = null;
  let basis = null;
  if (hasSingleResolvedYear(yearText)) {
    const computedAge = ageFromYear(parseCandidateYears(yearText)[0]);
    if (computedAge !== null) {
      age = computedAge;
      basis = 'deterministic';
    }
  }
  // Ambiguous / repeating-cycle / multi-year results fall through with age left null —
  // the CTA is still shown (still useful), just without a guessed age.

  const itemId = mapDecoderCategoryToItemId(getActiveDecoderCategory());
  const url = buildRcvAcvUrl({ age, item: itemId, source: 'serial-decoder', basis });

  summaryLayerNode.appendChild(buildRcvAcvCtaElement(url));
}

// #serialSummaryLayer is a persistent node that the decoder repopulates via innerHTML on
// every decode/refinement (it is not removed and re-added), so this observes that node's
// own subtree directly rather than waiting for the node itself to appear. The
// disconnect/reconnect pair around handleDecoderResult prevents the CTA we append from
// re-triggering this same observer.
function initDecoderObserver() {
  const layer = document.getElementById('serialSummaryLayer');
  if (!layer) return;
  try {
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        observer.disconnect();
        handleDecoderResult(layer);
        observer.observe(layer, { childList: true, subtree: true });
      }, 60);
    });
    observer.observe(layer, { childList: true, subtree: true });
  } catch {
    // Never let CTA wiring break the decoder page.
  }
}

// ─── Smart Lookup ─────────────────────────────────────────────────────────────────

function getSmartLookupResultsEl() {
  return document.getElementById('smart-lookup-results') || document.getElementById('ageResultsBody');
}

function handleSmartLookupAgeResult(query, result) {
  if (!result) return;
  const container = getSmartLookupResultsEl();
  if (!container) return;

  let age = null;
  let basis = null;
  // Only ever use a directly-provided single estimated year. A production range
  // (result.yearRange) never gets turned into a midpoint age here, even when it's the
  // only year information available.
  if (isCleanSingleYear(result.estimatedYear)) {
    const computedAge = ageFromYear(parseInt(result.estimatedYear, 10));
    if (computedAge !== null) {
      age = computedAge;
      basis = 'estimated';
    }
  }

  const categoryText = result.itemCategory || result.productFamily || result.category || '';
  const itemId = matchRcvAcvItemFromCategoryText(categoryText);

  const url = buildRcvAcvUrl({ age, item: itemId, source: 'smart-lookup', basis });
  container.appendChild(buildRcvAcvCtaElement(url));
}

function patchSmartLookupAgeRenderer() {
  const original = window.showAgeLookupResults;
  if (typeof original !== 'function' || original.__rcvAcvPatched) return;
  window.showAgeLookupResults = function patchedShowAgeLookupResults(query, result) {
    const returnValue = original.apply(this, arguments);
    try {
      handleSmartLookupAgeResult(query, result);
    } catch {
      // Never let CTA wiring break the Smart Lookup results renderer.
    }
    return returnValue;
  };
  window.showAgeLookupResults.__rcvAcvPatched = true;
}

// ─── Init ─────────────────────────────────────────────────────────────────────────

function init() {
  initDecoderObserver();
  patchSmartLookupAgeRenderer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
