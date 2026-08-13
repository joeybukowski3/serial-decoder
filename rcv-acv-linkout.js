// Adds an "RCV / ACV Calculator" sidebar card directly under the Item Assist card in the
// Serial Decoder's right-side result column, deep-linking into /rcv-acv-calculator with a
// pre-filled item age (when one can be determined responsibly) and, occasionally, a
// matching item type.
//
// Smart Lookup's own equivalent sidebar card lives directly in
// src/browser/smart-lookup-controller.js (mountRcvAcvLinkout), next to the actual
// age-result renderer and its own Item Assist mount (#smartLookupItemAssistMount) — that
// is the code path smart-lookup.html and decoder-tool.html's embedded Smart Lookup
// actually use, confirmed via live browser QA.
//
// This file intentionally does not modify decoder logic, Smart Lookup scoring, or the
// verified Claims Pages rate dataset. It only reads already-rendered result data and
// appends a card. All matching/age/copy logic lives in lib/rcv-acv-linkout-helpers.js so
// it can be unit tested without a DOM.
import {
  hasSingleResolvedYear,
  parseCandidateYears,
  ageFromYear,
  mapDecoderCategoryToItemId,
  buildRcvAcvUrl,
  getRcvAcvSidebarCopy,
} from '/lib/rcv-acv-linkout-helpers.js';

function buildRcvAcvSidebarCard(url, basis) {
  const card = document.createElement('div');
  card.className = 'rcv-acv-sidebar-card';
  card.innerHTML =
    '<div class="rcv-acv-sidebar-header">' +
      '<span class="rcv-acv-sidebar-icon" aria-hidden="true">🧮</span>' +
      '<h4 class="rcv-acv-sidebar-title">RCV / ACV CALCULATOR</h4>' +
    '</div>' +
    `<p class="rcv-acv-sidebar-body"></p>` +
    '<a class="rcv-acv-sidebar-cta">Estimate RCV / ACV</a>';
  card.querySelector('.rcv-acv-sidebar-body').textContent = getRcvAcvSidebarCopy(basis);
  const cta = card.querySelector('.rcv-acv-sidebar-cta');
  cta.href = url;
  return card;
}

// ─── Serial Decoder ───────────────────────────────────────────────────────────────

function getActiveDecoderCategory() {
  const activeTab = document.querySelector('.search-tab.active[data-cat]');
  return activeTab ? activeTab.getAttribute('data-cat') : '';
}

function handleDecoderResult(summaryLayerNode) {
  // #itemAssistMount is the right-column mount (see .rs-primary-row in result-shell.css)
  // that already holds the Item Assist card; the sidebar card is appended as its next
  // sibling so it reads as "directly underneath" that card, not a separate location.
  const mount = summaryLayerNode.querySelector('#itemAssistMount');
  if (!mount) return;

  const existing = mount.querySelector('.rcv-acv-sidebar-card');
  if (existing) existing.remove();

  const resultYearEl = document.getElementById('resultYear');
  const yearText = resultYearEl ? resultYearEl.textContent : '';
  if (!yearText || !yearText.trim()) return; // no-match / fallback state — card would be misleading

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
  // the card is still shown (still useful), just without a guessed age.

  const itemId = mapDecoderCategoryToItemId(getActiveDecoderCategory());
  const url = buildRcvAcvUrl({ age, item: itemId, source: 'serial-decoder', basis });

  mount.appendChild(buildRcvAcvSidebarCard(url, basis));
}

// #serialSummaryLayer is a persistent node that the decoder repopulates via innerHTML on
// every decode/refinement (it is not removed and re-added), so this observes that node's
// own subtree directly rather than waiting for the node itself to appear. The
// disconnect/reconnect pair around handleDecoderResult prevents the card we append from
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
    // Never let card wiring break the decoder page.
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────────

function init() {
  initDecoderObserver();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
