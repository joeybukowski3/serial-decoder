(function () {
  'use strict';

  var mobileExplainers = window.matchMedia('(max-width: 600px)');
  var resultScrollKeys = {};
  var serialAttempt = 0;

  function setExplainerState(toggle, expanded) {
    var details = document.getElementById(toggle.getAttribute('aria-controls'));
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (details) details.hidden = !expanded;
  }

  function syncExplainers() {
    document.querySelectorAll('[data-home-explainers] .hero-path-toggle').forEach(function (toggle) {
      if (mobileExplainers.matches) {
        toggle.removeAttribute('tabindex');
        setExplainerState(toggle, false);
      } else {
        toggle.setAttribute('tabindex', '-1');
        setExplainerState(toggle, true);
      }
    });
  }

  function bindExplainers() {
    document.querySelectorAll('[data-home-explainers] .hero-path-toggle').forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        if (!mobileExplainers.matches) return;
        setExplainerState(toggle, toggle.getAttribute('aria-expanded') !== 'true');
      });
    });
    if (typeof mobileExplainers.addEventListener === 'function') {
      mobileExplainers.addEventListener('change', syncExplainers);
    } else if (typeof mobileExplainers.addListener === 'function') {
      mobileExplainers.addListener(syncExplainers);
    }
    syncExplainers();
  }

  function stickyHeaderOffset() {
    var header = document.querySelector('nav');
    return Math.ceil(header ? header.getBoundingClientRect().height : 0) + 12;
  }

  function resultIsAlreadyVisible(target, offset) {
    var rect = target.getBoundingClientRect();
    return rect.bottom > offset && rect.top < window.innerHeight;
  }

  function scrollToResults(targetId, attemptKey) {
    var target = document.getElementById(targetId);
    var key = String(attemptKey || 'current');
    if (!target || target.classList.contains('hidden') || resultScrollKeys[targetId] === key) return false;
    resultScrollKeys[targetId] = key;

    var offset = stickyHeaderOffset();
    target.style.scrollMarginTop = offset + 'px';
    if (resultIsAlreadyVisible(target, offset)) return false;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  function runSerialResultCallback(callback) {
    var target = document.getElementById('serialResults');
    var nativeScroll = target && target.scrollIntoView;
    var legacyScrollRequested = false;
    if (target && typeof nativeScroll === 'function') {
      target.scrollIntoView = function (options) {
        if (options && options.block === 'start') return nativeScroll.call(target, options);
        legacyScrollRequested = true;
      };
    }
    try {
      if (typeof callback === 'function') callback();
    } finally {
      if (target && typeof nativeScroll === 'function') target.scrollIntoView = nativeScroll;
    }
    var year = document.getElementById('resultYear');
    var hasDecodedYear = year && /\b(?:19|20)\d{2}\b/.test(year.textContent || '');
    if (legacyScrollRequested && hasDecodedYear) {
      serialAttempt += 1;
      scrollToResults('serialResults', 'serial-' + serialAttempt);
    }
  }

  function installLegacyDecoderScrollAdapter() {
    if (typeof window.setLoadingSuccess !== 'function' || window.setLoadingSuccess.homeResultScrollAdapter) return;
    var original = window.setLoadingSuccess;
    var adapted = function (callback) {
      return original(function () { runSerialResultCallback(callback); });
    };
    adapted.homeResultScrollAdapter = true;
    window.setLoadingSuccess = adapted;
  }

  window.HomePageUI = {
    runSerialResultCallback: runSerialResultCallback,
    scrollToResults: scrollToResults,
  };

  bindExplainers();
  if (document.readyState === 'complete') {
    installLegacyDecoderScrollAdapter();
  } else {
    document.addEventListener('DOMContentLoaded', installLegacyDecoderScrollAdapter);
  }
}());
