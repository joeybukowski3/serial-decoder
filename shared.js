/* ═══════════════════════════════════════════════
   Item Assist — shared.js
   Include at bottom of every page body:
   <script src="shared.js"></script>
   ═══════════════════════════════════════════════ */

/* ─── NAV: mark current page link as active ─── */
(function () {
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

(function loadBoltAiAssistBubble() {
  var path = window.location.pathname || '';
  if (path === '/assistant' || path.endsWith('/assistant.html') || path.endsWith('assistant.html')) return;
  if (document.getElementById('bolt-ai-bubble-script')) return;
  var script = document.createElement('script');
  script.id = 'bolt-ai-bubble-script';
  script.src = '/components/chat/chat-bubble.js';
  document.body.appendChild(script);
})();
