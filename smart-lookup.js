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

  window.runSmartLookup = runSmartLookup;

  document.addEventListener('DOMContentLoaded', function () {
    var input = getInput();
    var results = getResults();
    if (!input || !results) return;
    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') runSmartLookup();
    });
  });
})();