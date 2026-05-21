/* ═══════════════════════════════════════════════
   Item Assist — shared.js
   Include at bottom of every page body:
   <script src="shared.js"></script>
   ═══════════════════════════════════════════════ */

/* ─── NAV: mark current page link as active ─── */
(function () {
  if (document.querySelector('nav ul li a.nav-active')) return;
  const links = document.querySelectorAll('nav ul li a');
  links.forEach(link => {
    if (link.href === window.location.href || window.location.pathname.includes(link.dataset.page)) {
      link.classList.add('active');
    }
  });
})();

/* ─── SEARCH BOX TAB SWITCHER ─── */
/* Brand lists per category */
const BRANDS = {
  appliances:   ['GE','Whirlpool','Samsung','LG','Bosch','Maytag','KitchenAid','Frigidaire','Electrolux','Amana','Kenmore','Hotpoint'],
  hvac:         ['Carrier','Trane','Lennox','Rheem','York','Bryant','Goodman','American Standard','Daikin','Heil','Ruud','Payne'],
  electronics:  ['Samsung','LG','Sony','Panasonic','Vizio','TCL','Hisense','Philips','Sharp','Insignia','Toshiba','JVC'],
  waterheaters: ['Rheem','AO Smith','Bradford White','State','American','Kenmore','GE','Navien','Rinnai','Noritz','Lochinvar','Weil-McLain']
};

function setTab(el, tab) {
  document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');

  const decoderPanel = document.getElementById('panel-decoder');
  const smartPanel   = document.getElementById('panel-smart');

  if (!decoderPanel || !smartPanel) return;

  if (tab === 'smart') {
    decoderPanel.style.display = 'none';
    smartPanel.style.display   = 'block';
  } else {
    decoderPanel.style.display = 'block';
    smartPanel.style.display   = 'none';
    const sel    = document.getElementById('brand-select');
    const brands = (BRANDS[tab] || []).slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    if (sel) {
      sel.innerHTML = '<option value="">-- Select Brand --</option>' +
        brands.map(b => `<option>${b}</option>`).join('');
    }
  }
}

/* ─── MOBILE HAMBURGER ─── */
(function() {
  var btn = document.getElementById('hamburgerBtn');
  var nav = document.querySelector('nav ul');
  if (!btn || !nav) return;

  function closeMenu() {
    btn.classList.remove('active');
    nav.classList.remove('open');
    btn.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('nav-menu-open');
  }

  function openMenu() {
    btn.classList.add('active');
    nav.classList.add('open');
    btn.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('nav-menu-open');
  }

  btn.addEventListener('click', function() {
    if (nav.classList.contains('open')) closeMenu();
    else openMenu();
  });
  nav.querySelectorAll('a').forEach(function(link) {
    link.addEventListener('click', function() {
      var href = this.getAttribute('href');
      // Never intercept absolute navigation links.
      if (href && (href.indexOf('/') === 0 || href.indexOf('http') === 0)) return;
      closeMenu();
    });
  });
  document.addEventListener('click', function(e) {
    if (!btn.contains(e.target) && !nav.contains(e.target)) {
      closeMenu();
    }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeMenu();
  });
})();

/* ─── RESOURCES DROPDOWN ─── */
(function () {
  function closeAllDropdowns() {
    document.querySelectorAll('.nav-dropdown-toggle').forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.nav-dropdown-panel').forEach(function (panel) {
      panel.classList.remove('open');
    });
  }

  document.querySelectorAll('.nav-dropdown-toggle').forEach(function (toggle) {
    var panel = toggle.nextElementSibling;
    if (!panel || !panel.classList.contains('nav-dropdown-panel')) return;

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = panel.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) {
        panel.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Close when clicking outside
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav-dropdown-item')) {
      closeAllDropdowns();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAllDropdowns();
  });
})();

/* --- Internal version timestamp badge (obfuscated) --- */
(function () {
  function pad2(n) { return String(n).padStart(2, '0'); }

  var now = new Date();
  // Format example: 6/1204 => day-of-month / HHMM
  var code = now.getDate() + '/' + pad2(now.getHours()) + pad2(now.getMinutes());

  var badge = document.createElement('div');
  badge.className = 'internal-version-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = code;
  document.body.appendChild(badge);
})();

(function enhanceLandingPageCards() {
  if (!document.body || document.body.dataset.pageKind !== 'landing') return;
  document.querySelectorAll('.prose').forEach(function (prose) {
    if (!prose || prose.dataset.cardified === 'true') return;

    var children = Array.from(prose.children);
    if (!children.length) return;

    var fragment = document.createDocumentFragment();
    var currentCard = null;

    children.forEach(function (node) {
      var tag = (node.tagName || '').toUpperCase();
      if (tag === 'H2') {
        currentCard = document.createElement('section');
        currentCard.className = 'landing-info-card';
        fragment.appendChild(currentCard);
      }

      if (!currentCard) {
        currentCard = document.createElement('section');
        currentCard.className = 'landing-info-card';
        fragment.appendChild(currentCard);
      }

      if (tag === 'UL') node.classList.add('landing-bullet-list');
      if (node.classList.contains('cta-block')) node.classList.add('landing-cta-card');
      currentCard.appendChild(node);
    });

    prose.appendChild(fragment);
    prose.dataset.cardified = 'true';
  });
})();

(function enhanceBrandPageToolCards() {
  if (!document.body) return;
  if (!document.querySelector('.brand-helper-wrap')) return;

  var decoderPanel = document.getElementById('panel-decoder');
  var smartPanel = document.getElementById('panel-smart');
  var powerBar = document.querySelector('.power-bar');
  if (!decoderPanel || !smartPanel || !powerBar) return;

  document.body.classList.add('brand-tool-layout-active');

  function ensureButton(panel, selector, text, className, handlerName, id) {
    if (!panel) return;
    var slot = panel.querySelector('.panel-action-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'panel-action-slot';
      panel.appendChild(slot);
    }
    var btn = slot.querySelector(selector);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = className;
      if (id) btn.id = id;
      btn.textContent = text;
      btn.addEventListener('click', function () {
        if (typeof window[handlerName] === 'function') window[handlerName]();
      });
      slot.appendChild(btn);
    }
    return btn;
  }

  var decodeBtn = ensureButton(decoderPanel, '.panel-decode-btn', 'Decode Serial Number', 'btn-primary power-btn panel-decode-btn', 'decodeSerial', 'brandPanelDecodeBtn');
  var searchBtn = ensureButton(smartPanel, '.panel-search-btn', 'Search', 'btn-amber power-btn panel-search-btn', 'runLKQLookup', 'brandPanelSearchBtn');

  function syncDecodeDisabled() {
    var source = document.getElementById('decodeBtn');
    if (source && decodeBtn) decodeBtn.disabled = !!source.disabled;
  }

  syncDecodeDisabled();
  var observerTarget = document.getElementById('decodeBtn');
  if (observerTarget && !observerTarget.dataset.brandMirrorBound) {
    observerTarget.dataset.brandMirrorBound = '1';
    new MutationObserver(syncDecodeDisabled).observe(observerTarget, { attributes: true, attributeFilter: ['disabled', 'class'] });
  }
})();

(function loadBoltAiAssistBubble() {
  var path = window.location.pathname || '';
  if (path === '/assistant' || path.endsWith('/assistant.html') || path.endsWith('assistant.html')) return;
  if (document.getElementById('bolt-ai-bubble-script')) return;
  var script = document.createElement('script');
  script.id = 'bolt-ai-bubble-script';
  script.src = '/components/chat/chat-bubble.js';
  document.body.appendChild(script);
})();
