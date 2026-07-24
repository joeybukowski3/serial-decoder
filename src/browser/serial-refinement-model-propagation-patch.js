(function () {
  'use strict';

  var installAttempts = 0;

  function safeValue(element) {
    return String(element && element.value || '').trim();
  }

  function syncModelInput(preferredModel) {
    var mainModel = document.getElementById('modelNumber');
    var narrowModel = document.getElementById('narrowModelInput');
    var model = String(preferredModel || safeValue(narrowModel) || safeValue(mainModel)).trim();
    if (narrowModel && !safeValue(narrowModel) && model) narrowModel.value = model;
    return model;
  }

  function wrapEnsureRefinementPanel() {
    var original = window.ensureRefinementPanel;
    if (typeof original !== 'function' || original.__modelPropagationPatch) return;
    var wrapped = function () {
      var panel = original.apply(this, arguments);
      syncModelInput();
      return panel;
    };
    wrapped.__modelPropagationPatch = true;
    window.ensureRefinementPanel = wrapped;
  }

  function wrapResolver() {
    var original = window.resolveSerialYearFromModel;
    if (typeof original !== 'function' || original.__modelPropagationPatch) return;
    var wrapped = function (options) {
      var next = Object.assign({}, options || {});
      next.model = syncModelInput(next.model);
      return original.call(this, next);
    };
    wrapped.__modelPropagationPatch = true;
    window.resolveSerialYearFromModel = wrapped;
  }

  function wrapControllerStart() {
    var controller = window.SerialRefinementController;
    if (!controller || typeof controller.start !== 'function' || controller.start.__modelPropagationPatch) return;
    var original = controller.start;
    var wrapped = function (options, forceRetry) {
      var next = Object.assign({}, options || {});
      next.model = syncModelInput(next.model);
      return original.call(this, next, forceRetry);
    };
    wrapped.__modelPropagationPatch = true;
    controller.start = wrapped;
  }

  function install() {
    wrapEnsureRefinementPanel();
    wrapResolver();
    wrapControllerStart();
    syncModelInput();

    installAttempts += 1;
    if (installAttempts < 100 && (
      typeof window.ensureRefinementPanel !== 'function'
      || typeof window.resolveSerialYearFromModel !== 'function'
      || !window.SerialRefinementController
    )) setTimeout(install, 50);
  }

  document.addEventListener('click', function () { syncModelInput(); }, true);
  document.addEventListener('input', function (event) {
    if (event.target && event.target.id === 'modelNumber') syncModelInput(event.target.value);
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
}());
