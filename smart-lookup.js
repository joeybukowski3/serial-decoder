(function () {
  function getInput() {
    return document.getElementById('smart-lookup-input');
  }

  function getResults() {
    return document.getElementById('smart-lookup-results');
  }

  function runSmartLookup() {
    var input = getInput();
    if (!input) return;
    if (typeof window.estimateAge === 'function') window.estimateAge();
  }

  function initSmartLookupPage() {
    var input = getInput();
    var results = getResults();
    if (!input) return;
    if (input.getAttribute('data-smart-lookup-bound') === '1') return;
    input.setAttribute('data-smart-lookup-bound', '1');
    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') runSmartLookup();
    });

    // Wire up any button on the page that should trigger Smart Lookup
    var buttons = document.querySelectorAll('[onclick*="estimateAge"], [onclick*="runSmartLookup"], #smartLookupBtn, .smart-lookup-btn, .alt-btn');
    buttons.forEach(function(btn) {
      if (btn.getAttribute('data-sl-bound') === '1') return;
      btn.setAttribute('data-sl-bound', '1');
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        runSmartLookup();
      });
    });
  }

  window.runSmartLookup = runSmartLookup;
  window.initSmartLookupPage = initSmartLookupPage;

  document.addEventListener('DOMContentLoaded', function () {
    initSmartLookupPage();
  });
})();
