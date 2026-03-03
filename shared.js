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
    const brands = BRANDS[tab] || [];
    if (sel) {
      sel.innerHTML = '<option value="">-- Select Brand --</option>' +
        brands.map(b => `<option>${b}</option>`).join('');
    }
  }
}
