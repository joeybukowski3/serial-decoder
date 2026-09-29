/**
 * DORMANT foundation for the future AI-lookup allowance UI. Nothing loads this
 * file: it is not referenced by any page, not part of any build output, and the
 * server does not send the quota object it consumes. It exists so the copy and
 * the state mapping are reviewed and tested before any of it goes live.
 *
 * Scope of the wording (deliberate): only AI-assisted Smart Lookup is ever
 * limited. Serial number decoding, previously found results and cached answers
 * are never limited, and no copy here may imply otherwise.
 *
 * Input is the shape lib/quota/resolver.js returns (tier, remaining*, allowed).
 * Rendering is a no-op unless the caller passes { enabled: true }.
 */
(function () {
  'use strict';

  var COPY = {
    usageRemaining: function (remaining, period) {
      var noun = remaining === 1 ? 'AI-assisted lookup' : 'AI-assisted lookups';
      return remaining + ' ' + noun + ' left ' + (period === 'month' ? 'this month' : 'today');
    },
    limitReachedTitle: 'You have used your AI-assisted lookups for now',
    limitReachedBody: 'Serial number decoding and results we have already found are still available.',
    resetsDaily: 'Your allowance resets tomorrow (UTC).',
    resetsMonthly: 'Your allowance resets next month (UTC).',
    createAccountTitle: 'Want more AI-assisted lookups?',
    createAccountBody: 'Create a free account to get a larger allowance.',
    createAccountCta: 'Create free account',
    upgradeTitle: 'Need more AI-assisted lookups?',
    upgradeBody: 'Pro includes a much larger monthly allowance for AI-assisted Smart Lookup.',
    upgradeCta: 'Upgrade to Pro',
  };

  var LOW_REMAINING_THRESHOLD = 2;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function hasFiniteRemaining(quota) {
    return quota && typeof quota.remaining === 'number' && isFinite(quota.remaining);
  }

  /** Which UI states apply, in display order. Unlimited/unknown allowances show nothing. */
  function statesFor(quota) {
    if (!quota || typeof quota !== 'object') return [];
    var states = [];
    if (quota.allowed === false) {
      states.push('limit-reached');
      if (quota.tier === 'anonymous') states.push('create-account');
      else if (quota.tier === 'free') states.push('upgrade');
      return states;
    }
    if (hasFiniteRemaining(quota) && quota.remaining <= LOW_REMAINING_THRESHOLD) states.push('usage-remaining');
    return states;
  }

  function periodOf(quota) {
    // The tighter of the two limits is the one the visitor will hit first.
    if (typeof quota.remainingDaily === 'number' && (quota.remainingMonthly == null || quota.remainingDaily <= quota.remainingMonthly)) return 'day';
    return typeof quota.remainingMonthly === 'number' ? 'month' : 'day';
  }

  function renderState(kind, quota) {
    if (kind === 'usage-remaining') {
      return '<p class="sl-quota sl-quota--remaining" data-quota-state="usage-remaining">' + escapeHtml(COPY.usageRemaining(quota.remaining, periodOf(quota))) + '</p>';
    }
    if (kind === 'limit-reached') {
      var resets = periodOf(quota) === 'month' ? COPY.resetsMonthly : COPY.resetsDaily;
      return '<div class="sl-quota sl-quota--limit" data-quota-state="limit-reached"><h4>' + escapeHtml(COPY.limitReachedTitle) + '</h4><p>' + escapeHtml(COPY.limitReachedBody) + ' ' + escapeHtml(resets) + '</p></div>';
    }
    if (kind === 'create-account') {
      return '<div class="sl-quota sl-quota--account" data-quota-state="create-account"><h4>' + escapeHtml(COPY.createAccountTitle) + '</h4><p>' + escapeHtml(COPY.createAccountBody) + '</p><a class="decode-btn" href="/account">' + escapeHtml(COPY.createAccountCta) + '</a></div>';
    }
    if (kind === 'upgrade') {
      return '<div class="sl-quota sl-quota--upgrade" data-quota-state="upgrade"><h4>' + escapeHtml(COPY.upgradeTitle) + '</h4><p>' + escapeHtml(COPY.upgradeBody) + '</p><a class="decode-btn" href="/pricing">' + escapeHtml(COPY.upgradeCta) + '</a></div>';
    }
    return '';
  }

  /** Returns '' unless explicitly enabled, so merely loading this can never show anything. */
  function render(quota, options) {
    if (!options || options.enabled !== true) return '';
    return statesFor(quota).map(function (kind) { return renderState(kind, quota); }).join('');
  }

  var api = Object.freeze({ render: render, statesFor: statesFor, COPY: Object.freeze(COPY) });
  if (typeof window !== 'undefined') window.SmartLookupQuotaUI = api;
}());
