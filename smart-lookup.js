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
    if (!input || !results) return;
    if (input.getAttribute('data-smart-lookup-bound') === '1') return;
    input.setAttribute('data-smart-lookup-bound', '1');
    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') runSmartLookup();
    });
  }

  window.runSmartLookup = runSmartLookup;
  window.initSmartLookupPage = initSmartLookupPage;

  document.addEventListener('DOMContentLoaded', function () {
    initSmartLookupPage();
  });
})();
