// ===== ROUTE NORMALIZATION =====
(function normalizeHtmlRoutes() {
  var path = window.location.pathname;
  if (path === '/' || path.endsWith('.html') || path.indexOf('.') !== -1) return;
  var normalized = path.replace(/\/$/, '') + '.html';
  window.location.replace(normalized + window.location.search);
})();

// ===== ERA & CYCLING BRAND CONFIG =====
var CYCLING_BRANDS = {
  appliances: {
    'admiral':   { label: 'Admiral',    post: 'admiral_post_2006',  pre: 'admiral_pre_2006',  type: 'split' },
    'amana':     { label: 'Amana',      post: 'amana_post_2006',    pre: 'amana_pre_2006',    type: 'split' },
    'jenn_air':  { label: 'Jenn-Air',   post: 'jenn_air_post_2006', pre: 'jenn_air_pre_2006', type: 'split' },
    'maytag':    { label: 'Maytag',     post: 'maytag_post_2006',   pre: 'maytag_pre_2006',   type: 'split' },
    'whirlpool':   { label: 'Whirlpool',    single: 'whirlpool',    type: 'advisory' },
    'kitchenaid':  { label: 'KitchenAid',   single: 'kitchenaid',   type: 'advisory' },
    'roper':       { label: 'Roper',        single: 'roper',        type: 'advisory' },
    'estate':      { label: 'Estate',       single: 'estate',       type: 'advisory' },
    'inglis':      { label: 'Inglis',       single: 'inglis',       type: 'advisory' },
    'ge':          { label: 'GE',           single: 'ge',           type: 'advisory' },
    'ge_caf':      { label: 'GE Cafe',      single: 'ge_caf',       type: 'advisory' },
    'ge_profile':  { label: 'GE Profile',   single: 'ge_profile',   type: 'advisory' },
    'ge_monogram': { label: 'GE Monogram',  single: 'ge_monogram',  type: 'advisory' },
    'hotpoint':    { label: 'Hotpoint',     single: 'hotpoint',     type: 'advisory' },
  },
  waterHeaters: {
    'bradford_white': { label: 'Bradford White', single: 'bradford_white', type: 'advisory' },
  },
  electronics: {
    'apple':         { label: 'Apple',                    single: 'apple',         type: 'advisory' },
    'samsung_tv':    { label: 'Samsung (TVs)',             single: 'samsung_tv',    type: 'advisory' },
    'samsung_phone': { label: 'Samsung (Phones)',          single: 'samsung_phone', type: 'advisory' },
    'lg_tv':         { label: 'LG',                       single: 'lg_tv',         type: 'advisory' },
    'hp':            { label: 'HP',                       single: 'hp',            type: 'advisory' },
    'asus':          { label: 'ASUS',                     single: 'asus',          type: 'advisory' },
    'google_pixel':  { label: 'Google Pixel',             single: 'google_pixel',  type: 'advisory' },
    'sony':          { label: 'Sony',                     single: 'sony',          type: 'advisory' },
    'vizio':         { label: 'Vizio',                    single: 'vizio',         type: 'advisory' },
    'panasonic':     { label: 'Panasonic',                single: 'panasonic',     type: 'advisory' },
  },
  hvac: {},
};

var ERA_ID_TO_BASE = {};
(function() {
  Object.keys(CYCLING_BRANDS).forEach(function(cat) {
    Object.keys(CYCLING_BRANDS[cat]).forEach(function(baseId) {
      var cfg = CYCLING_BRANDS[cat][baseId];
      if (cfg.type === 'split') {
        ERA_ID_TO_BASE[cfg.post] = baseId;
        ERA_ID_TO_BASE[cfg.pre]  = baseId;
      }
    });
  });
})();

// ===== BRAND LOGO DOMAINS =====
var BRAND_LOGOS = {
  'whirlpool': 'whirlpool.com',
  'kitchenaid': 'kitchenaid.com',
  'admiral': 'admiralproducts.com',
  'admiral_post_2006': 'admiralproducts.com',
  'admiral_pre_2006':  'admiralproducts.com',
  'amana': 'amana.com',
  'amana_post_2006': 'amana.com',
  'amana_pre_2006':  'amana.com',
  'jenn_air': 'jennair.com',
  'jenn_air_post_2006': 'jennair.com',
  'jenn_air_pre_2006':  'jennair.com',
  'maytag': 'maytag.com',
  'maytag_post_2006': 'maytag.com',
  'maytag_pre_2006':  'maytag.com',
  'ge': 'geappliances.com',
  'ge_caf': 'cafeappliances.com',
  'ge_profile': 'geappliances.com',
  'ge_monogram': 'geappliances.com',
  'ge_water_heaters': 'geappliances.com',
  'frigidaire': 'frigidaire.com',
  'electrolux': 'electroluxappliances.com',
  'bosch': 'bosch-home.com',
  'thermador': 'thermador.com',
  'samsung': 'samsung.com',
  'lg': 'lg.com',
  'kenmore': 'kenmore.com',
  'samsung_tv': 'samsung.com',
  'lg_tv': 'lg.com',
  'hotpoint': 'hotpointservice.com',
  'roper': 'whirlpool.com',
  'estate': 'whirlpool.com',
  'inglis': 'whirlpool.com',
  'norcold': 'whirlpool.com',
  'sub_zero': 'whirlpool.com',
  'hampton_bay': 'whirlpool.com',
  'conquest': 'whirlpool.com',
  'coolerator': 'whirlpool.com',
  'crystal_tips': 'whirlpool.com',
  'partners_plus': 'whirlpool.com',
  'jordan': 'whirlpool.com',
  'sinkguard': 'whirlpool.com',
  'caloric': 'maytag.com',
  'hardwick': 'maytag.com',
  'norge': 'maytag.com',
  'speed_queen': 'maytag.com',
  'magic_chef': 'maytag.com',
  'modern_maid': 'maytag.com',
  'glenwood': 'maytag.com',
  'sunray': 'maytag.com',
  'litton': 'maytag.com',
  'menumaster': 'maytag.com',
  'bravos': 'maytag.com',
  'maycor': 'maytag.com',
  'neptune': 'maytag.com',
  'imperial': 'maytag.com',
  'philco': 'electroluxappliances.com',
  'rheem': 'rheem.com',
  'ruud': 'ruud.com',
  'a_o_smith': 'hotwater.com',
  'bradford_white': 'bradfordwhite.com',
  'american_water_heater_company': 'americanwaterheater.com',
  'state_industries': 'statewaterheaters.com',
  'apple':         'apple.com',
  'samsung_phone': 'samsung.com',
  'hp':            'hp.com',
  'asus':          'asus.com',
  'google_pixel':  'store.google.com',
  'sony':          'sony.com',
  'vizio':         'vizio.com',
  'panasonic':     'panasonic.com',
  'goodman':       'goodmanmfg.com',
  'carrier':       'carrier.com',
  'bryant':        'bryant.com',
  'payne':         'payne.com',
  'amana':         'amana-hac.com',
  'trane':         'trane.com',
  'lennox':        'lennox.com',
  'york':          'york.com',
  'american_standard': 'americanstandardair.com',
};

// ===== STATE =====
var currentCategory = 'appliances';

function toggleSidebar() {
  document.body.classList.toggle('sidebar-open');
}
var currentFeedbackContext = {};
var CURRENT_YEAR = new Date().getFullYear();
var KENMORE_DEFAULT_NOTE = 'Prefix not recognized \u2014 defaulting to Whirlpool method. Results may vary.';
// Kenmore does not manufacture its own appliances. The serial decode method depends entirely on
// who actually made the unit, identified by the first 3 digits of the MODEL number.
// cycle = years in the manufacturer's repeating serial date cycle.
var KENMORE_PREFIX_TO_DECODER = {
  // Whirlpool method (char 2 = year letter, chars 3-4 = week) — 30-year cycle
  '106': { manufacturer: 'Whirlpool', decoderId: 'whirlpool', cycle: 30 },
  '110': { manufacturer: 'Whirlpool', decoderId: 'whirlpool', cycle: 30 },
  '198': { manufacturer: 'Whirlpool', decoderId: 'whirlpool', cycle: 30 },
  '562': { manufacturer: 'Whirlpool', decoderId: 'whirlpool', cycle: 30 },
  '564': { manufacturer: 'Whirlpool', decoderId: 'whirlpool', cycle: 30 },
  '565': { manufacturer: 'Whirlpool', decoderId: 'whirlpool', cycle: 30 },
  '566': { manufacturer: 'Whirlpool', decoderId: 'whirlpool', cycle: 30 },
  '568': { manufacturer: 'Whirlpool', decoderId: 'whirlpool', cycle: 30 },
  '664': { manufacturer: 'Whirlpool', decoderId: 'whirlpool', cycle: 30 },
  '665': { manufacturer: 'Whirlpool', decoderId: 'whirlpool', cycle: 30 },
  // Roper method (same as Whirlpool) — 30-year cycle
  '103': { manufacturer: 'Roper', decoderId: 'roper', cycle: 30 },
  '155': { manufacturer: 'Roper', decoderId: 'roper', cycle: 30 },
  '278': { manufacturer: 'Roper', decoderId: 'roper', cycle: 30 },
  '647': { manufacturer: 'Roper', decoderId: 'roper', cycle: 30 },
  '835': { manufacturer: 'Roper', decoderId: 'roper', cycle: 30 },
  '911': { manufacturer: 'Roper', decoderId: 'roper', cycle: 30 },
  '917': { manufacturer: 'Roper', decoderId: 'roper', cycle: 30 },
  // GE method (char 1 = month letter, char 2 = year letter using GE codes) — 12-year cycle
  '362': { manufacturer: 'General Electric', decoderId: 'ge', cycle: 12 },
  '363': { manufacturer: 'General Electric', decoderId: 'ge', cycle: 12 },
  '464': { manufacturer: 'General Electric', decoderId: 'ge', cycle: 12 },
  // Frigidaire/Electrolux method (2 letters, then digit 1 = year last digit, digits 2-3 = week) — 10-year cycle
  '119': { manufacturer: 'Frigidaire', decoderId: 'frigidaire', cycle: 10 },
  '253': { manufacturer: 'Frigidaire', decoderId: 'frigidaire', cycle: 10 },
  '417': { manufacturer: 'Frigidaire', decoderId: 'frigidaire', cycle: 10 },
  '580': { manufacturer: 'Frigidaire', decoderId: 'frigidaire', cycle: 10 },
  '592': { manufacturer: 'Frigidaire', decoderId: 'frigidaire', cycle: 10 },
  '628': { manufacturer: 'Frigidaire', decoderId: 'frigidaire', cycle: 10 },
  '662': { manufacturer: 'Frigidaire', decoderId: 'frigidaire', cycle: 10 },
  '790': { manufacturer: 'Frigidaire', decoderId: 'frigidaire', cycle: 10 },
  '791': { manufacturer: 'Frigidaire', decoderId: 'frigidaire', cycle: 10 },
  '970': { manufacturer: 'Frigidaire', decoderId: 'frigidaire', cycle: 10 },
  // Kelvinator (uses Frigidaire decode method) — 10-year cycle
  '416': { manufacturer: 'Kelvinator', decoderId: 'frigidaire', cycle: 10 },
  '473': { manufacturer: 'Kelvinator', decoderId: 'frigidaire', cycle: 10 },
  '622': { manufacturer: 'Kelvinator', decoderId: 'frigidaire', cycle: 10 },
  '630': { manufacturer: 'Kelvinator', decoderId: 'frigidaire', cycle: 10 },
  '683': { manufacturer: 'Kelvinator', decoderId: 'frigidaire', cycle: 10 },
  // Amana (Whirlpool post-2006 for modern units) — 30-year cycle
  '335': { manufacturer: 'Amana', decoderId: 'amana_post_2006', cycle: 30 },
  '596': { manufacturer: 'Amana', decoderId: 'amana_post_2006', cycle: 30 },
  // LG method (char 1 = year last digit, chars 2-3 = month as two digits) — 10-year cycle
  '795': { manufacturer: 'LG', decoderId: 'lg', cycle: 10 },
  '796': { manufacturer: 'LG', decoderId: 'lg', cycle: 10 },
  // Samsung method — 10-year cycle
  '401': { manufacturer: 'Samsung', decoderId: 'samsung', cycle: 10 },
  // Jenn-Air (post-2006 Whirlpool era) — 30-year cycle
  '629': { manufacturer: 'Jenn-Air', decoderId: 'jenn_air_post_2006', cycle: 30 },
  // Maytag-family: Maycor / Speed Queen / Litton / Caloric / Hardwick — 30-year cycle
  '174': { manufacturer: 'Caloric',     decoderId: 'maytag_pre_2006', cycle: 30 },
  '587': { manufacturer: 'Speed Queen', decoderId: 'maytag_pre_2006', cycle: 30 },
  '651': { manufacturer: 'Speed Queen', decoderId: 'maytag_pre_2006', cycle: 30 },
  '747': { manufacturer: 'Litton',      decoderId: 'maytag_pre_2006', cycle: 30 },
  '789': { manufacturer: 'Hardwick',    decoderId: 'maytag_pre_2006', cycle: 30 },
  '925': { manufacturer: 'Maycor',      decoderId: 'maytag_pre_2006', cycle: 30 },
  '960': { manufacturer: 'Caloric',     decoderId: 'maytag_pre_2006', cycle: 30 },
};
var SIDEBAR_EXPANDED_KEY = 'sidebarExpandedCategories';
var LAST_CATEGORY_KEY = 'lastSelectedCategory';
var SIDEBAR_BRAND_CATEGORY_MAP = {
  'goodman': 'HVAC',
  'carrier': 'HVAC',
  'rheem': 'HVAC',
  'trane': 'HVAC',
  'ge': 'Appliances',
  'samsung': 'Appliances',
  'lg': 'Appliances',
  'bosch': 'Appliances',
  'maytag': 'Appliances',
  'frigidaire': 'Appliances',
  'kenmore': 'Appliances',
  'whirlpool': 'Appliances',
  'apple': 'Electronics',
  'hp': 'Electronics',
  'asus': 'Electronics',
  'google-pixel': 'Electronics',
  'sony': 'Electronics',
  'vizio': 'Electronics',
  'panasonic': 'Electronics'
};
var CATEGORY_KEY_TO_NAME = {
  'hvac': 'HVAC',
  'water-heaters': 'Water Heaters',
  'waterheaters': 'Water Heaters',
  'waterHeaters': 'Water Heaters',
  'appliances': 'Appliances',
  'electronics': 'Electronics'
};
var CATEGORY_PAGE_BY_KEY = {
  'hvac': '/hvac.html',
  'appliances': '/appliances.html',
  'electronics': '/electronics.html',
  'water-heaters': '/water-heaters.html',
  'smart-lookup': '/smart-lookup.html'
};
var BRAND_PAGE_BY_ID = {
  'goodman': 'goodman',
  'carrier': 'carrier',
  'rheem': 'rheem',
  'trane': 'trane',
  'ge': 'ge',
  'samsung': 'samsung',
  'lg': 'lg',
  'bosch': 'bosch',
  'maytag': 'maytag',
  'frigidaire': 'frigidaire',
  'kenmore': 'kenmore',
  'whirlpool': 'whirlpool',
  'apple': 'apple',
  'hp': 'hp',
  'asus': 'asus',
  'google_pixel': 'google-pixel',
  'sony': 'sony',
  'vizio': 'vizio',
  'panasonic': 'panasonic'
};
var MORE_BRANDS_BY_CATEGORY = {
  HVAC: [
    { id: 'amana', label: 'Amana' },
    { id: 'bryant', label: 'Bryant' },
    { id: 'lennox', label: 'Lennox' },
    { id: 'york', label: 'York' },
    { id: 'payne', label: 'Payne' },
    { id: 'ruud', label: 'Ruud' },
    { id: 'american_standard', label: 'American Standard' }
  ],
  Appliances: [
    { id: 'electrolux', label: 'Electrolux' },
    { id: 'hotpoint', label: 'Hotpoint' },
    { id: 'kitchenaid', label: 'KitchenAid' },
    { id: 'amana', label: 'Amana' },
    { id: 'thermador', label: 'Thermador' }
  ],
  Electronics: [
    { id: 'samsung_phone', label: 'Samsung (Phones)' },
    { id: 'samsung_tv', label: 'Samsung (TVs)' },
    { id: 'lg_tv', label: 'LG (TVs)' },
    { id: 'google_pixel', label: 'Google Pixel' }
  ],
  'Water Heaters': []
};
var PRIMARY_BRANDS_VISIBLE = {
  HVAC: 3,
  'Water Heaters': 4,
  Appliances: 6,
  Electronics: 4
};
var WATER_HEATER_BRANDS = [
  { id: 'rheem', label: 'Rheem' },
  { id: 'bradford_white', label: 'Bradford White' },
  { id: 'a_o_smith', label: 'A.O. Smith' },
  { id: 'state_industries', label: 'State' }
];
var WATER_HEATER_BRAND_IDS = WATER_HEATER_BRANDS.map(function(brand) { return brand.id; });
var BRAND_CATEGORY_BY_ID = null;
var CATEGORY_TO_BRANDS = null;
var STATIC_SIDEBAR_RENDERED = false;
var TOP_BRANDS_BY_CATEGORY = {
  'appliances': ['whirlpool', 'ge', 'frigidaire', 'lg', 'samsung', 'maytag', 'kenmore'],
  'hvac': ['goodman', 'carrier', 'trane', 'rheem', 'lennox', 'york', 'ruud'],
  'electronics': ['samsung', 'sony', 'lg', 'apple', 'hp', 'vizio', 'panasonic'],
  'water-heaters': ['rheem', 'a_o_smith', 'bradford_white', 'state_industries', 'whirlpool_water_heaters', 'ruud', 'richmond']
};
var SIDEBAR_CATEGORY_LABELS = {
  'appliances': 'Appliances ️',
  'hvac': 'HVAC ️',
  'electronics': 'Electronics ',
  'water-heaters': 'Water Heaters '
};
var BRAND_SLUG_OVERRIDES = {
  'whirlpool_water_heaters': 'whirlpool',
  'ge_water_heaters': 'ge'
};
var BRAND_NAME_OVERRIDES = {
  'whirlpool_water_heaters': 'Whirlpool',
  'ge_water_heaters': 'GE'
};

function isBrandPage() {
  return !!sidebarCategoryForSlug(getBrandPageSlug());
}

function getDecodeDom() {
  var scope = document.querySelector('.decoder-card') || document.querySelector('.main-card') || document;
  var brandEl = document.getElementById('brand') ||
    scope.querySelector('select#brand, select[name="brand"], .form-area select.form-select');
  var serialEl = document.getElementById('serial') ||
    scope.querySelector('input#serial, input[name="serial"], .form-area input.form-input[type="text"]');
  var btnEl = document.getElementById('decodeBtn') ||
    scope.querySelector('button#decodeBtn, button.decode-btn[onclick*="decodeSerial"]');
  return { brandEl: brandEl, serialEl: serialEl, btnEl: btnEl };
}

function ensureSmartLookupDom() {
  var legacyInput = document.getElementById('altQuery');
  if (legacyInput && !document.getElementById('smart-lookup-input')) {
    legacyInput.id = 'smart-lookup-input';
  }
  var legacyResults = document.getElementById('ageResultsBody');
  if (legacyResults && !document.getElementById('smart-lookup-results')) {
    legacyResults.id = 'smart-lookup-results';
  }
}

function getSmartLookupInputEl() {
  return document.getElementById('smart-lookup-input') || document.getElementById('altQuery');
}

function getSmartLookupResultsEl() {
  return document.getElementById('smart-lookup-results') || document.getElementById('ageResultsBody');
}

function getBrandPageSlug() {
  var parts = (window.location.pathname || '')
    .split('/')
    .filter(Boolean);
  if (parts.length === 0) return '';
  return parts[parts.length - 1].replace(/\.html$/i, '');
}

function getSidebarExpandedCategories() {
  try {
    var raw = localStorage.getItem(SIDEBAR_EXPANDED_KEY);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function setSidebarExpandedCategories(categories) {
  try {
    localStorage.setItem(SIDEBAR_EXPANDED_KEY, JSON.stringify(categories || []));
  } catch (_) {}
}

function sidebarCategoryForSlug(slug) {
  if (!slug) return null;
  return SIDEBAR_BRAND_CATEGORY_MAP[slug] || null;
}

function categoryNameToKey(name) {
  if (!name) return 'appliances';
  var s = String(name).toLowerCase();
  if (s === 'hvac') return 'hvac';
  if (s === 'waterheaters' || s === 'water-heaters' || s === 'water heaters') return 'water-heaters';
  if (s === 'electronics') return 'electronics';
  return 'appliances';
}

function getSavedCategoryKey() {
  try {
    return categoryNameToKey(localStorage.getItem(LAST_CATEGORY_KEY) || '');
  } catch (_) {
    return 'appliances';
  }
}

function saveCategoryKey(catKey) {
  try {
    localStorage.setItem(LAST_CATEGORY_KEY, categoryNameToKey(catKey || ''));
  } catch (_) {}
}

function categoryPageHrefByKey(catKey) {
  var key = categoryNameToKey(catKey || '');
  return CATEGORY_PAGE_BY_KEY[key] || '/';
}

function normalizeDecoderCategory(catKey) {
  var key = String(catKey || '').trim();
  if (!key) return 'appliances';
  if (key === 'water-heaters') return 'waterHeaters';
  return key;
}

function setSidebarGroupOpen(groupEl, open) {
  var btn = groupEl ? groupEl.querySelector('.sidebar-group-toggle') : null;
  var links = groupEl ? groupEl.querySelector('.sidebar-group-links') : null;
  if (!groupEl || !btn || !links) return;
  groupEl.classList.toggle('open', !!open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  links.hidden = !open;
}

function persistSidebarOpenState(sidebarRoot) {
  if (!sidebarRoot) return;
  var openNames = [];
  sidebarRoot.querySelectorAll('.sidebar-brand-group.open').forEach(function(group) {
    var name = group.getAttribute('data-category');
    if (name) openNames.push(name);
  });
  setSidebarExpandedCategories(openNames);
}

function expandSidebarCategory(categoryName) {
  if (!categoryName) return;
  var sidebarRoot = document.querySelector('.sidebar-brand-groups');
  if (!sidebarRoot) return;
  var target = sidebarRoot.querySelector('.sidebar-brand-group[data-category="' + categoryName + '"]');
  if (!target) return;
  setSidebarGroupOpen(target, true);
}

function moveSidebarCategoryToTop(categoryName) {
  if (!categoryName) return;
  var container = document.querySelector('.sidebar-brand-groups');
  if (!container) return;
  var target = container.querySelector('.sidebar-brand-group[data-category="' + categoryName + '"]');
  if (!target) return;
  container.insertBefore(target, container.firstChild);
}

function setWaterHeaterTopTierExpanded(active) {
  var container = document.querySelector('.sidebar-brand-groups');
  if (!container) return;
  var group = container.querySelector('.sidebar-brand-group[data-category="Water Heaters"]');
  if (!group) return;
  var primaryList = group.querySelector('.sidebar-group-links');
  var moreWrap = group.querySelector('.sidebar-more-brands');
  var moreBtn = moreWrap ? moreWrap.querySelector('.sidebar-more-toggle') : null;
  var moreList = moreWrap ? moreWrap.querySelector('.sidebar-more-list') : null;
  if (!primaryList || !moreWrap || !moreList) return;

  if (active) {
    Array.prototype.slice.call(moreList.querySelectorAll('a.sidebar-link')).forEach(function(link) {
      link.setAttribute('data-promoted-from-more', '1');
      primaryList.appendChild(link);
    });
    moreWrap.hidden = true;
    moreWrap.classList.remove('open');
    moreList.hidden = true;
    if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
    return;
  }

  Array.prototype.slice.call(primaryList.querySelectorAll('a[data-promoted-from-more="1"]')).forEach(function(link) {
    link.removeAttribute('data-promoted-from-more');
    moreList.appendChild(link);
  });
  moreWrap.hidden = moreList.children.length === 0;
}

function prioritizeSidebarCategory(catKey) {
  var normalizedKey = categoryNameToKey(catKey);
  var categoryName = CATEGORY_KEY_TO_NAME[normalizedKey] || 'Appliances';
  expandSidebarCategory(categoryName);
}

function ensureBrandCategoryMap() {
  if (BRAND_CATEGORY_BY_ID && CATEGORY_TO_BRANDS) return BRAND_CATEGORY_BY_ID;
  var map = {};
  var byCategory = { 'appliances': [], 'hvac': [], 'electronics': [], 'water-heaters': [] };
  var seenBrand = {};
  try {
    Object.keys(decoderData || {}).forEach(function(catKey) {
      var normalizedKey = categoryNameToKey(catKey);
      var group = decoderData[catKey];
      if (!group || !group.brands) return;
      group.brands.forEach(function(brand) {
        if (!brand || !brand.id) return;
        if (seenBrand[brand.id] && seenBrand[brand.id] !== normalizedKey) {
          console.warn('Brand appears in multiple categories:', brand.id, seenBrand[brand.id], normalizedKey);
        }
        seenBrand[brand.id] = normalizedKey;
        map[brand.id] = normalizedKey;
        if (byCategory[normalizedKey]) byCategory[normalizedKey].push(brand.id);
      });
    });
  } catch (_) {}
  WATER_HEATER_BRAND_IDS.forEach(function(id) {
    map[id] = 'water-heaters';
    if (byCategory['water-heaters']) byCategory['water-heaters'].push(id);
  });
  BRAND_CATEGORY_BY_ID = map;
  CATEGORY_TO_BRANDS = byCategory;
  Object.keys(byCategory).forEach(function(key) {
    if (!byCategory[key] || byCategory[key].length === 0) {
      console.warn('Category has no brands:', key);
    }
  });
  return map;
}

function categoryKeyForBrandId(brandId) {
  if (!brandId) return currentCategory || 'appliances';
  var map = ensureBrandCategoryMap();
  var raw = map[brandId];
  if (raw) return categoryNameToKey(raw);
  return currentCategory || 'appliances';
}

function brandTargetHref(brandId) {
  if (!brandId) return '/';
  var slug = BRAND_SLUG_OVERRIDES[brandId] || BRAND_PAGE_BY_ID[brandId] || '';
  if (!slug) return '';
  return '/' + slug;
}

function categoryBrandHref(catKey, brandId) {
  if (!brandId) return categoryPageHrefByKey(catKey);
  var base = categoryPageHrefByKey(catKey);
  return base + (base.indexOf('?') === -1 ? '?' : '&') + 'brand=' + encodeURIComponent(brandId);
}

function brandLinkHrefFromSlug(slug) {
  if (!slug) return '';
  var brandId = slugToBrandId(slug);
  return brandTargetHref(brandId);
}

function rewriteBrandLinks(root) {
  var scope = root || document;
  if (scope.closest && scope.closest('.sidebar')) return;
  var brandSlugs = {};
  Object.keys(BRAND_PAGE_BY_ID).forEach(function(key) {
    brandSlugs[BRAND_PAGE_BY_ID[key]] = true;
  });
  Array.prototype.slice.call(scope.querySelectorAll('a[href]')).forEach(function(link) {
    var href = link.getAttribute('href') || '';
    if (!href || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;
    try {
      var url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      var slug = url.pathname.replace(/\/+$/, '').split('/').pop().replace(/\.html$/i, '');
      if (!brandSlugs[slug]) return;
      var target = brandLinkHrefFromSlug(slug);
      if (target) link.setAttribute('href', target);
      link.setAttribute('data-brand', slugToBrandId(slug));
    } catch (_) {}
  });
}

function getCategoryGroupData(catKey) {
  var normalized = categoryNameToKey(catKey);
  var decoderKey = normalized === 'water-heaters' ? 'waterHeaters' : normalized;
  var group = decoderData && decoderData[decoderKey];
  if (!group || !group.brands) return [];
  var canonical = {};
  group.brands.forEach(function(brand) {
    if (!brand || !brand.id) return;
    var canonId = canonicalizeBrandId(brand.id);
    var canonName = canonicalizeBrandName(brand.name || canonId);
    if (!canonId || !canonName) return;
    if (!canonical[canonId]) {
      canonical[canonId] = { id: canonId, name: canonName };
    }
  });
  return Object.keys(canonical).map(function(key) { return canonical[key]; });
}

function getBrandDisplayName(brand) {
  if (!brand) return '';
  return BRAND_NAME_OVERRIDES[brand.id] || brand.name || '';
}

function canonicalizeBrandId(id) {
  var raw = String(id || '');
  if (!raw) return '';
  return raw
    .replace(/(_pre_?\d{4}|_post_?\d{4})$/i, '')
    .replace(/(_pre|_post|_before|_after|_era_[a-z0-9]+)$/i, '')
    .replace(/-pre\d{4}$/i, '')
    .replace(/-post\d{4}$/i, '');
}

function canonicalizeBrandName(name) {
  var raw = String(name || '').trim();
  if (!raw) return '';
  return raw
    .replace(/\((pre|post)[^)]+\)/gi, '')
    .replace(/\b(pre|post)\s*\d{4}\b/gi, '')
    .replace(/\b(pre|post)\b/gi, '')
    .replace(/\bera\b/gi, '')
    .replace(/\s*-\s*(pre|post|before|after)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPageSlugForBrand(brandId) {
  return BRAND_SLUG_OVERRIDES[brandId] || BRAND_PAGE_BY_ID[brandId] || '';
}

function renderStaticSidebar() {
  if (STATIC_SIDEBAR_RENDERED) return;
  var sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  var categoriesSection = null;
  var brandsSection = null;
  sidebar.querySelectorAll('.sidebar-section').forEach(function(section) {
    var title = section.querySelector('.sidebar-title');
    if (!title) return;
    var text = title.textContent.trim().toLowerCase();
    if (text === 'categories') categoriesSection = section;
    if (text === 'brands') brandsSection = section;
  });

  if (categoriesSection) {
    categoriesSection.innerHTML = '<div class="sidebar-title">Categories</div>';
    var catLinks = [
      { key: 'appliances', label: 'Appliances', href: '/appliances' },
      { key: 'hvac', label: 'HVAC', href: '/hvac' },
      { key: 'electronics', label: 'Electronics', href: '/electronics' },
      { key: 'water-heaters', label: 'Water Heaters', href: '/water-heaters' },
      { key: 'smart-lookup', label: 'Smart Lookup ✨', href: '/smart-lookup' }
    ];
    catLinks.forEach(function(item) {
      var a = document.createElement('a');
      a.className = 'sidebar-link sidebar-category-link';
      a.href = item.href;
      a.setAttribute('data-category', item.key);
      var label = SIDEBAR_CATEGORY_LABELS[item.key] || item.label;
      a.textContent = label;
      categoriesSection.appendChild(a);
    });
  }

  if (brandsSection) {
    brandsSection.innerHTML = '<div class="sidebar-title">Brands</div>';
    var container = document.createElement('div');
    container.className = 'sidebar-brand-groups';
    var categoryOrder = ['appliances', 'hvac', 'electronics', 'water-heaters'];
    var CAT_BUTTON_LABELS = {
      'appliances':    'Appliance Brands',
      'hvac':          'HVAC Brands',
      'electronics':   'Electronics Brands',
      'water-heaters': 'Water Heater Brands'
    };
    var expandedCategories = getSidebarExpandedCategories();

    categoryOrder.forEach(function(catKey) {
      var brandData = getCategoryGroupData(catKey);
      if (!brandData.length) return;

      var topIds = (TOP_BRANDS_BY_CATEGORY[catKey] || []).filter(function(id) {
        return brandData.some(function(b) { return b.id === id; });
      });
      var topSet = {};
      topIds.forEach(function(id) { topSet[id] = true; });

      var remaining = brandData.filter(function(b) { return !topSet[b.id]; });
      remaining.sort(function(a, b) {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      var catLabel = CAT_BUTTON_LABELS[catKey] || (CATEGORY_KEY_TO_NAME[catKey] || catKey) + ' Brands';
      var isExpanded = expandedCategories.indexOf(catKey) !== -1;

      var group = document.createElement('div');
      group.className = 'sidebar-brand-group' + (isExpanded ? ' open' : '');
      group.setAttribute('data-category', CATEGORY_KEY_TO_NAME[catKey] || catKey);

      // Clickable header — entire row toggles the group
      var header = document.createElement('div');
      header.className = 'sidebar-group-header';

      var toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'sidebar-group-link';
      toggleBtn.setAttribute('aria-expanded', String(isExpanded));
      toggleBtn.textContent = (isExpanded ? '\u2013 ' : '+ ') + catLabel;

      var arrow = document.createElement('span');
      arrow.className = 'sidebar-group-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '\u25b8';

      header.appendChild(toggleBtn);
      header.appendChild(arrow);
      group.appendChild(header);

      // Top-7 brand links — hidden until category is expanded
      var list = document.createElement('div');
      list.className = 'sidebar-group-links';
      if (!isExpanded) list.hidden = true;
      topIds.forEach(function(id) {
        var brand = brandData.find(function(b) { return b.id === id; });
        if (!brand) return;
        var a = document.createElement('a');
        a.className = 'sidebar-link sidebar-brand-link';
        a.href = categoryBrandHref(catKey, brand.id);
        a.textContent = getBrandDisplayName(brand);
        a.setAttribute('data-brand', brand.id);
        a.setAttribute('data-category', catKey);
        list.appendChild(a);
      });
      group.appendChild(list);

      // "+ All Brands" section for remaining brands
      var moreWrap = null;
      var moreList = null;
      if (remaining.length) {
        moreWrap = document.createElement('div');
        moreWrap.className = 'sidebar-more-brands';
        if (!isExpanded) moreWrap.hidden = true;

        var moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'sidebar-more-toggle';
        moreBtn.innerHTML = '<span class="more-brands-icon" aria-hidden="true"></span><span class="more-brands-text">+ All Brands</span>';

        moreList = document.createElement('div');
        moreList.className = 'sidebar-more-list';
        moreList.hidden = true;
        remaining.forEach(function(brand) {
          var a = document.createElement('a');
          a.className = 'sidebar-link sidebar-link-secondary sidebar-brand-link';
          a.href = categoryBrandHref(catKey, brand.id);
          a.textContent = getBrandDisplayName(brand);
          a.setAttribute('data-brand', brand.id);
          a.setAttribute('data-category', catKey);
          moreList.appendChild(a);
        });

        moreBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          var open = !moreList.hidden;
          moreList.hidden = open;
          moreWrap.classList.toggle('open', !open);
          moreBtn.querySelector('.more-brands-text').textContent = open ? '+ All Brands' : '\u2013 All Brands';
        });

        moreWrap.appendChild(moreBtn);
        moreWrap.appendChild(moreList);
        group.appendChild(moreWrap);
      }

      // Header click: toggle category open/closed
      header.addEventListener('click', function() {
        var nowOpen = list.hidden; // if currently hidden, we're opening
        list.hidden = !nowOpen;
        group.classList.toggle('open', nowOpen);
        toggleBtn.setAttribute('aria-expanded', String(nowOpen));
        toggleBtn.textContent = (nowOpen ? '\u2013 ' : '+ ') + catLabel;
        if (moreWrap) moreWrap.hidden = !nowOpen;

        // Collapse "All Brands" when category collapses
        if (!nowOpen && moreWrap && moreList) {
          moreList.hidden = true;
          moreWrap.classList.remove('open');
          var moreText = moreWrap.querySelector('.more-brands-text');
          if (moreText) moreText.textContent = '+ All Brands';
        }

        // Persist expanded state
        var expanded = getSidebarExpandedCategories();
        if (nowOpen) {
          if (expanded.indexOf(catKey) === -1) expanded.push(catKey);
        } else {
          expanded = expanded.filter(function(k) { return k !== catKey; });
        }
        setSidebarExpandedCategories(expanded);
      });

      container.appendChild(group);
    });

    brandsSection.appendChild(container);
  }

  STATIC_SIDEBAR_RENDERED = true;
}

function enhanceSidebarNavigation() {
  var brandsSection = null;
  document.querySelectorAll('.sidebar .sidebar-section').forEach(function(section) {
    var title = section.querySelector('.sidebar-title');
    if (!title) return;
    if (title.textContent.trim().toLowerCase() === 'brands') brandsSection = section;
  });
  if (!brandsSection) return;
  var existingGroups = brandsSection.querySelector('.sidebar-brand-groups');

  var brandLinks = Array.prototype.slice.call(brandsSection.querySelectorAll('a.sidebar-link'));
  if (!brandLinks.length) return;

  var grouped = { Appliances: [], HVAC: [], Electronics: [], 'Water Heaters': [] };
  brandLinks.forEach(function(link) {
    var brandId = link.getAttribute('data-brand') || '';
    var slug = '';
    var href = link.getAttribute('href') || '';
    if (!brandId) {
      try {
        var url = new URL(href, window.location.origin);
        brandId = url.searchParams.get('brand') || '';
        slug = url.pathname.replace(/\/+$/, '').split('/').pop().replace(/\.html$/i, '');
      } catch (_) {
        slug = href.replace(/\/+$/, '').split('/').pop().replace(/\.html$/i, '');
      }
    }
    if (!brandId && slug) brandId = slugToBrandId(slug);
    var catKey = categoryKeyForBrandId(brandId);
    var cat = CATEGORY_KEY_TO_NAME[catKey] || 'Appliances';
    if (!grouped[cat]) cat = 'Appliances';
    var clone = link.cloneNode(true);
    if (brandId) clone.setAttribute('data-brand', brandId);
    grouped[cat].push(clone);
  });

  var order = ['Appliances', 'HVAC', 'Electronics', 'Water Heaters'];
  var persisted = getSidebarExpandedCategories();
  var currentSlug = getBrandPageSlug();
  var currentSidebarCategory = sidebarCategoryForSlug(currentSlug);
  var activeCategoryKey = null;
  try {
    var params = new URLSearchParams(window.location.search || '');
    activeCategoryKey = categoryNameToKey(params.get('cat') || '');
  } catch (_) {}
  if (!activeCategoryKey) activeCategoryKey = categoryNameToKey(currentCategory);
  if (!activeCategoryKey && currentSidebarCategory) activeCategoryKey = categoryNameToKey(currentSidebarCategory);
  var container = document.createElement('div');
  container.className = 'sidebar-brand-groups';

  order.forEach(function(catName) {
    var links = (grouped[catName] || []).slice();
    if (catName === 'Water Heaters') {
      WATER_HEATER_BRANDS.forEach(function(wb) {
        var wa = document.createElement('a');
        wa.className = 'sidebar-link';
        wa.href = brandTargetHref(wb.id);
        wa.textContent = wb.label;
        wa.setAttribute('data-brand', wb.id);
        wa.setAttribute('data-category', 'water-heaters');
        links.push(wa);
      });
    }
    if (!links || !links.length) return;
    var primaryCount = PRIMARY_BRANDS_VISIBLE[catName] || links.length;
    var primaryLinks = links.slice(0, primaryCount);
    var overflowLinks = links.slice(primaryCount);

    var group = document.createElement('div');
    group.className = 'sidebar-brand-group';
    group.setAttribute('data-category', catName);

    var header = document.createElement('div');
    header.className = 'sidebar-group-header';
    var link = document.createElement('button');
    link.type = 'button';
    link.className = 'sidebar-group-link';
    var catKey = categoryNameToKey(catName);
    link.textContent = catName;
    link.addEventListener('click', function() {
      var isOpen = group.classList.contains('open');
      container.querySelectorAll('.sidebar-brand-group').forEach(function(other) {
        if (other !== group) setSidebarGroupOpen(other, false);
      });
      setSidebarGroupOpen(group, !isOpen);
      persistSidebarOpenState(container);
    });

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-group-toggle';
    btn.setAttribute('aria-label', 'Toggle ' + catName + ' brands');
    btn.innerHTML = '<span class="sidebar-group-arrow" aria-hidden="true">&#9654;</span>';

    var list = document.createElement('div');
    list.className = 'sidebar-group-links';
    primaryLinks.forEach(function(a) { list.appendChild(a); });

    var primarySlugs = {};
    primaryLinks.forEach(function(a) {
      a.setAttribute('data-category', categoryNameToKey(catName));
      var href = a.getAttribute('href') || '';
      var slug = href.replace(/\/+$/, '').split('/').pop().replace(/\.html$/i, '');
      var targetHref = brandLinkHrefFromSlug(slug);
      if (targetHref) a.setAttribute('href', targetHref);
      if (slug) a.setAttribute('data-brand', slugToBrandId(slug));
      if (slug) primarySlugs[slug] = true;
    });

    var extras = MORE_BRANDS_BY_CATEGORY[catName] || [];
    var remaining = overflowLinks.map(function(a) {
      var href = a.getAttribute('href') || '';
      var slug = href.replace(/\/+$/, '').split('/').pop().replace(/\.html$/i, '');
      var targetHref = brandLinkHrefFromSlug(slug) || href;
      return { slug: slug, label: a.textContent || slug, href: targetHref };
    });
    extras.forEach(function(item) {
      var slug = (BRAND_PAGE_BY_ID[item.id] || item.id).replace(/_/g, '-');
      if (!primarySlugs[slug]) {
        remaining.push({ slug: slug, label: item.label, href: brandTargetHref(item.id) });
      }
    });
    var seenRemaining = {};
    remaining = remaining.filter(function(item) {
      if (!item.slug || seenRemaining[item.slug]) return false;
      seenRemaining[item.slug] = true;
      return true;
    });

    var moreWrap = null;
    if (remaining.length > 0) {
      moreWrap = document.createElement('div');
      moreWrap.className = 'sidebar-more-brands';

      var moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'sidebar-more-toggle';
      moreBtn.innerHTML = '<span class="more-brands-icon" aria-hidden="true"></span><span class="more-brands-text">More Brands</span>';
      moreBtn.setAttribute('aria-expanded', 'false');

      var moreList = document.createElement('div');
      moreList.className = 'sidebar-more-list';
      moreList.hidden = true;

      remaining.forEach(function(item) {
        var a = document.createElement('a');
        a.className = 'sidebar-link sidebar-link-secondary';
        a.href = item.href;
        a.textContent = item.label;
        a.setAttribute('data-category', categoryNameToKey(catName));
        moreList.appendChild(a);
      });

      moreBtn.addEventListener('click', function() {
        var isOpen = moreWrap.classList.contains('open');
        moreWrap.classList.toggle('open', !isOpen);
        moreList.hidden = isOpen;
        moreBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      });

      moreWrap.appendChild(moreBtn);
      moreWrap.appendChild(moreList);
    }

    var shouldOpen = true;
    if (persisted && persisted.length) {
      shouldOpen = persisted.indexOf(catName) !== -1;
    } else if (currentSidebarCategory) {
      shouldOpen = currentSidebarCategory === catName;
    } else if (activeCategoryKey) {
      shouldOpen = categoryNameToKey(catName) === activeCategoryKey;
    }
    setSidebarGroupOpen(group, shouldOpen);

    btn.addEventListener('click', function() {
      var isOpen = group.classList.contains('open');
      container.querySelectorAll('.sidebar-brand-group').forEach(function(other) {
        if (other !== group) setSidebarGroupOpen(other, false);
      });
      setSidebarGroupOpen(group, !isOpen);
      persistSidebarOpenState(container);
    });

    header.appendChild(link);
    header.appendChild(btn);
    group.appendChild(header);
    group.appendChild(list);
    if (moreWrap) group.appendChild(moreWrap);
    container.appendChild(group);
  });

  brandLinks.forEach(function(link) { link.remove(); });
  if (existingGroups) existingGroups.remove();
  brandsSection.appendChild(container);
  if (activeCategoryKey) prioritizeSidebarCategory(activeCategoryKey);
}

function syncSidebarActiveState() {
  var slug = getBrandPageSlug();
  var activeBrandSlug = slug && sidebarCategoryForSlug(slug) ? slug : '';
  var activeCategoryKey = getActiveTopCategoryKey();
  var activeBrandId = '';
  try {
    var params = new URLSearchParams(window.location.search || '');
    activeBrandId = params.get('brand') || '';
  } catch (_) {}

  document.querySelectorAll('.sidebar-link, .sidebar-group-link, .cat-tab-link, .sidebar-category-link, .sidebar-brand-link').forEach(function(el) {
    el.classList.remove('active');
  });

  var activeCatLink = document.querySelector('.sidebar-category-link[data-category="' + activeCategoryKey + '"]');
  if (activeCatLink) activeCatLink.classList.add('active');

  if (activeBrandId) {
    var brandLink = document.querySelector('.sidebar-brand-link[data-brand="' + activeBrandId + '"][data-category="' + activeCategoryKey + '"]');
    if (!brandLink) {
      brandLink = document.querySelector('.sidebar-brand-link[data-brand="' + activeBrandId + '"]');
    }
    if (brandLink) brandLink.classList.add('active');
    return;
  }

  if (activeBrandSlug) {
    var brandId = slugToBrandId(activeBrandSlug);
    var brandLink = document.querySelector('.sidebar-brand-link[data-brand="' + brandId + '"]');
    if (brandLink) brandLink.classList.add('active');
  }
}

function enhanceSmartLookupSidebarTop() {
  var sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  if (sidebar.querySelector('.sidebar-smart-top')) return;

  var section = document.createElement('div');
  section.className = 'sidebar-section sidebar-smart-top';
  section.innerHTML =
    '<a class="sidebar-link sidebar-smart-top-link" href="/smart-lookup">' +
    'Smart Lookup <span class="new-badge">NEW</span>' +
    '</a>' +
    '<a class="sidebar-link sidebar-smart-sub-link" href="/">' +
    'Serial Number Decoder' +
    '</a>';

  var firstSection = sidebar.querySelector('.sidebar-section');
  if (firstSection && firstSection.parentNode) {
    firstSection.parentNode.insertBefore(section, firstSection);
  } else {
    sidebar.appendChild(section);
  }
}

function addGuidedSearchButtonToBrandDecoderCard() {
  if (!isBrandPage()) return;
  var formArea = document.querySelector('.decoder-card .form-area') || document.querySelector('.main-card .form-area');
  if (!formArea) return;
  if (formArea.querySelector('.guided-search-btn')) return;

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'guided-search-btn';
  btn.textContent = 'Smart Lookup';
  btn.addEventListener('click', function() {
    var altSection = document.getElementById('altSection');
    var altQuery = getSmartLookupInputEl();
    var slug = getBrandPageSlug();
    if (altSection && !altSection.classList.contains('open')) {
      altSection.classList.add('open');
    }
    if (altQuery) {
      if (!altQuery.value && slug) altQuery.value = slug.replace(/-/g, ' ') + ' model number';
      altQuery.focus();
    }
    var smartWrap = document.querySelector('.smart-lookup-standalone') || altSection;
    if (smartWrap && smartWrap.scrollIntoView) {
      smartWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  var note = document.createElement('p');
  note.className = 'guided-search-note';
  note.textContent = 'Serial not recognized yet? Use Smart Lookup for model-based help.';

  formArea.appendChild(btn);
  formArea.appendChild(note);
}

function enhanceHeaderBranding() {
  var header = document.querySelector('.header');
  if (!header) return;
  if (header.getAttribute('data-ia-header-ready') === '1') return;
  var oldTag = header.querySelector('.header-center-tagline');
  if (oldTag) oldTag.remove();
  var oldBrand = header.querySelector('.header-brand');
  if (oldBrand) oldBrand.remove();
  var oldWrap = header.querySelector('.ia-header-wrap');
  if (oldWrap) oldWrap.remove();

  var wrap = document.createElement('div');
  wrap.className = 'ia-header-wrap';
  wrap.innerHTML = '' +
    '<nav class="ia-header-nav ia-header-nav-center" aria-label="Site navigation">' +
      '<a class="ia-header-nav-link" href="/">Serial Number Decoder</a>' +
      '<a class="ia-header-nav-link" href="/smart-lookup">Smart Lookup</a>' +
      '<a class="ia-header-nav-link" href="/methodology">Methodology</a>' +
      '<a class="ia-header-nav-link" href="/contact">Contact</a>' +
      '<a class="ia-header-nav-link ia-header-nav-security" href="/privacy-policy#security">Security &amp; Data Notice</a>' +
    '</nav>';
  header.appendChild(wrap);
  header.setAttribute('data-ia-header-ready', '1');
}
function enhanceSidebarLogo() {
  var logo = document.querySelector('.sidebar-logo');
  if (!logo) return;
  if (logo.querySelector('.ia-sidebar-logo')) return;
  if (logo.querySelector('.ia-sidebar-brand')) return;
  logo.innerHTML = '' +
    '<span class="ia-sidebar-brand">' +
      '<img class="ia-sidebar-logo" src="/assets/item-assist-logo.png" width="110" height="110" alt="Item Assist logo">' +
    '</span>';
}

function injectHeroBanner() {
  var existingTop = document.querySelector('.ia-top-banner');
  if (existingTop) existingTop.remove();
  var existingInline = document.querySelector('.ia-inline-banner');
  if (existingInline) existingInline.remove();
}

function enhanceSidebarCategoryLinks() {
  var section = null;
  document.querySelectorAll('.sidebar .sidebar-section').forEach(function(node) {
    var title = node.querySelector('.sidebar-title');
    if (title && title.textContent.trim().toLowerCase() === 'categories') section = node;
  });
  if (!section) return;
  if (section.querySelector('.cat-tab-link')) return;

  var slug = getBrandPageSlug();
  var activeKey = null;
  try {
    var urlCatRaw = new URLSearchParams(window.location.search).get('cat') || '';
    if (urlCatRaw) activeKey = categoryNameToKey(urlCatRaw);
  } catch (_) {}
  if (!activeKey && (slug === 'hvac' || slug === 'appliances' || slug === 'electronics' || slug === 'water-heaters')) {
    activeKey = categoryNameToKey(slug);
  }
  if (!activeKey) {
    var byBrand = sidebarCategoryForSlug(slug);
    if (byBrand) activeKey = categoryNameToKey(byBrand);
  }
  if (!activeKey && window.DEFAULT_CATEGORY) activeKey = categoryNameToKey(window.DEFAULT_CATEGORY);
  if (!activeKey) activeKey = getSavedCategoryKey();

  var cats = [
    { key: 'hvac', label: 'HVAC' },
    { key: 'appliances', label: 'Appliances' },
    { key: 'electronics', label: 'Electronics' },
    { key: 'water-heaters', label: 'Water Heaters' }
  ];

  section.querySelectorAll('.cat-tab, .cat-tab-link').forEach(function(el) { el.remove(); });
  cats.forEach(function(cat) {
    var a = document.createElement('a');
    a.className = 'cat-tab cat-tab-link';
    if (activeKey === cat.key) a.classList.add('active');
    a.href = categoryPageHrefByKey(cat.key);
    a.textContent = cat.label;
    section.appendChild(a);
  });
}

function getActiveTopCategoryKey() {
  var slug = getBrandPageSlug();
  if (slug === 'smart-lookup') return 'smart-lookup';
  if (slug === 'hvac' || slug === 'appliances' || slug === 'electronics' || slug === 'water-heaters') {
    return categoryNameToKey(slug);
  }

  var brandCat = sidebarCategoryForSlug(slug);
  if (brandCat) return categoryNameToKey(brandCat);

  try {
    var cat = new URLSearchParams(window.location.search || '').get('cat');
    if (cat) return categoryNameToKey(cat);
  } catch (_) {}

  // Use currentCategory (in-page selection) as the source of truth when URL has no hint
  if (currentCategory) {
    var key = categoryNameToKey(currentCategory);
    if (key) return key;
  }
  return 'appliances';
}

function enhanceGlobalCategoryTabs() {
  // Intentionally disabled to avoid duplicate top category rows.
}

function slugToBrandId(slug) {
  if (!slug) return '';
  if (slug === 'google-pixel') return 'google_pixel';
  return slug.replace(/-/g, '_');
}

function openEmbeddedBrandDecoder(panel, triggerEl) {
  if (!panel) return;
  panel.hidden = false;
  panel.classList.add('open');
  var serialInput = getDecodeDom().serialEl;
  if (serialInput && serialInput.focus) {
    setTimeout(function() { serialInput.focus(); }, 120);
  }
  if (triggerEl && triggerEl.scrollIntoView) {
    triggerEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function syncGlobalCategoryTabs(activeKey) {
  var key = categoryNameToKey(activeKey || getActiveTopCategoryKey());
  document.querySelectorAll('.category-tab-link').forEach(function(tab) {
    var href = tab.getAttribute('href') || '';
    var tabKey = href.replace(/^\//, '').replace(/\.html$/i, '').replace(/\/+$/, '');
    tab.classList.toggle('active', tabKey === key);
  });
}

function syncHeaderNavActive() {
  var slug = getBrandPageSlug();
  var activeKey = slug || 'index';
  if (activeKey === '') activeKey = 'index';

  var map = {
    'index': '/',
    'smart-lookup': '/smart-lookup',
    'methodology': '/methodology',
    'contact': '/contact'
  };
  var activeHref = map[activeKey] || null;
  // Also look in .ia-hw-right for the new layout
  var navLinks = document.querySelectorAll('.ia-header-nav .ia-header-nav-link, .ia-hw-right .ia-header-nav-link');
  navLinks.forEach(function(link) {
    var href = link.getAttribute('href') || '';
    link.classList.toggle('active', !!activeHref && href === activeHref);
  });
}

function enhanceBrandPageEmbeddedDecoder() {
  var decoderCard = document.querySelector('.main-card.decoder-card');
  var staticCard = document.querySelector('.static-card');
  if (!decoderCard || !staticCard) return;
  if (document.querySelector('.embedded-brand-decoder')) return;

  var smartCard = document.querySelector('.smart-lookup-standalone');
  var ageLoading = document.getElementById('ageLoading');
  var serialResults = document.getElementById('serialResults');
  var ageResults = document.getElementById('ageResults');

  var panel = document.createElement('section');
  panel.className = 'embedded-brand-decoder';
  panel.hidden = false;

  var ctaBlock = staticCard.querySelector('.cta-block');
  if (ctaBlock) ctaBlock.appendChild(panel);
  else staticCard.insertAdjacentElement('afterbegin', panel);

  panel.appendChild(decoderCard);
  if (smartCard) panel.appendChild(smartCard);
  if (ageLoading) panel.appendChild(ageLoading);
  if (serialResults) panel.appendChild(serialResults);
  if (ageResults) panel.appendChild(ageResults);
  panel.classList.add('open');

  Array.prototype.slice.call(staticCard.querySelectorAll('.cta-btn')).forEach(function(btn) {
    btn.remove();
  });
}

function updateMainPageSmartLookupHelperText() {
  var slug = getBrandPageSlug();
  if (slug !== '' && slug !== 'index') return;
  var input = document.getElementById('smart-lookup-input');
  if (!input) return;
  var formGroup = input.closest('.form-group');
  if (!formGroup) return;
  var helper = formGroup.querySelector('.helper-text');
  if (!helper) return;
  helper.textContent = 'Enter a model number, brand + model, brand + series, or general description to estimate the age. The more information you provide, the better the result.';
}

function titleForCategoryKey(key, slug) {
  if (slug === '' || slug === 'index') return 'Serial Number Decoder';
  if (key === 'hvac') return 'HVAC Serial Number Decoder';
  if (key === 'electronics') return 'Electronics Serial Number Decoder';
  if (key === 'water-heaters') return 'Water Heater Serial Number Decoder';
  if (key === 'smart-lookup') return 'Smart Lookup';
  return 'Appliances Serial Number Decoder';
}

function buildCategoryTabBarHtml(activeKey) {
  var tabs = [
    { key: 'appliances', label: 'Appliances', href: '/appliances' },
    { key: 'hvac', label: 'HVAC', href: '/hvac' },
    { key: 'electronics', label: 'Electronics', href: '/electronics' },
    { key: 'water-heaters', label: 'Water Heaters', href: '/water-heaters' },
    { key: 'smart-lookup', label: '⭐ Smart Lookup', href: '/smart-lookup' }
  ];
  return tabs.map(function(t) {
    return '<a href="' + t.href + '" class="category-tab-link' + (t.key === activeKey ? ' active' : '') + '">' + t.label + '</a>';
  }).join('');
}

function ensurePageTitleAndCategoryTabs() {
  var app = document.querySelector('.app-container');
  if (!app) return;
  var slug = getBrandPageSlug();
  var allowed = {
    '': true,
    'index': true,
    'hvac': true,
    'appliances': true,
    'electronics': true,
    'water-heaters': true,
    'smart-lookup': true
  };
  if (!allowed[slug]) return;
  var activeKey = getActiveTopCategoryKey();
  var mainCard = app.querySelector('.main-card');
  if (!mainCard) return;

  var head = app.querySelector('.category-page-head');
  if (!head) {
    head = document.createElement('section');
    head.className = 'category-page-head';
    mainCard.parentNode.insertBefore(head, mainCard);
  }
  head.innerHTML = '' +
    '<h1>' + titleForCategoryKey(activeKey, slug) + '</h1>' +
    '<nav class="category-tab-bar" aria-label="Category Navigation">' +
      buildCategoryTabBarHtml(activeKey) +
    '</nav>';
}

function applyBrandDefaultFromSlug() {
  if (!isBrandPage()) return;
  var slug = getBrandPageSlug();
  var brandId = slugToBrandId(slug);
  var categoryName = sidebarCategoryForSlug(slug);
  var categoryKey = categoryName ? categoryNameToKey(categoryName) : '';
  var dom = getDecodeDom();
  if (!dom.brandEl) return;

  if (categoryKey && decoderData[normalizeDecoderCategory(categoryKey)]) {
    currentCategory = normalizeDecoderCategory(categoryKey);
    populateBrands(currentCategory);
    syncGlobalCategoryTabs(categoryKey);
  }

  var hasBrandOption = false;
  for (var i = 0; i < dom.brandEl.options.length; i++) {
    if (dom.brandEl.options[i].value === brandId) {
      hasBrandOption = true;
      break;
    }
  }
  if (!hasBrandOption) return;

  dom.brandEl.value = brandId;
  if (typeof onBrandChange === 'function') onBrandChange();
  if (typeof updateDecodeBtn === 'function') updateDecodeBtn();
}

function smartLookupAboutInnerHtml() {
  return '' +
    '<h2>About Smart Lookup</h2>' +
    '<p class="technical-methodology-subhead">Intelligent Data Aggregation</p>' +
    '<p class="technical-methodology-copy">When serial numbers are missing, incomplete, or unreadable, Smart Lookup applies research intelligence across model patterns, manufacturer timelines, and known product release cycles to estimate manufacture windows with practical confidence.</p>' +
    '<ul class="technical-methodology-list">' +
      '<li><strong>Broad Search Tier:</strong> Interprets general product descriptions to identify likely era ranges and historical launch periods.</li>' +
      '<li><strong>Professional Search Tier:</strong> Uses brand, model family, series, and variant-level clues to refine results for precise age estimates.</li>' +
    '</ul>' +
    '<p class="technical-methodology-copy">For best results, include the brand, full model number, and any visible version or series details from the data plate.</p>' +
    '<p class="technical-methodology-note">Designed for equipment age research and lifecycle documentation.</p>';
}

function mountSharedSmartLookupAboutSection() {
  var slug = getBrandPageSlug();
  var existing = document.querySelector('.technical-methodology-card');
  if (slug === 'smart-lookup') {
    if (existing) existing.innerHTML = smartLookupAboutInnerHtml();
    return;
  }
  if (slug !== '' && slug !== 'index') return;
  if (existing) return;
  var mainCard = document.querySelector('.main-card');
  if (!mainCard || !mainCard.parentNode) return;
  var card = document.createElement('section');
  card.className = 'technical-methodology-card';
  card.innerHTML = smartLookupAboutInnerHtml();
  mainCard.insertAdjacentElement('afterend', card);
}

// ===== FOOTER BRANDING UPDATE (Task 7) =====
function updateFooterBranding() {
  document.querySelectorAll('.footer p').forEach(function(p) {
    if (p.innerHTML.indexOf('\u00a9') !== -1 || p.innerHTML.indexOf('&copy;') !== -1 || p.innerHTML.indexOf('©') !== -1) {
      p.innerHTML = p.innerHTML.replace(/Serial Number Decoder/g, 'Item Assist');
    }
  });
}

function ensureFooterPrivacyPolicyLink() {
  document.querySelectorAll('.footer-links').forEach(function(links) {
    if (links.querySelector('a[href="/privacy-policy"], a[href="/privacy-policy.html"]')) return;
    var sep = document.createElement('span');
    sep.className = 'footer-sep';
    sep.textContent = '|';
    var a = document.createElement('a');
    a.href = '/privacy-policy';
    a.textContent = 'Privacy Policy';
    links.appendChild(sep);
    links.appendChild(a);
  });
}

function pulseGuidedSearchButton() {
  var btn = document.querySelector('.guided-search-btn');
  if (!btn) return;
  btn.classList.add('pulse');
  setTimeout(function() { btn.classList.remove('pulse'); }, 1600);
}

// ===== BRAND CONTEXT (brand pages) =====
function loadBrandContext() {
  try {
    var slug = getBrandPageSlug();
    if (!slug) return;
    var BRAND_PAGE_MAP = {
      'goodman': { name: 'Goodman', category: 'hvac', brandId: 'goodman' },
      'carrier': { name: 'Carrier', category: 'hvac', brandId: 'carrier' },
      'rheem': { name: 'Rheem', category: 'hvac', brandId: 'rheem' },
      'trane': { name: 'Trane', category: 'hvac', brandId: 'trane' },
      'ge': { name: 'GE', category: 'appliances', brandId: 'ge' },
      'samsung': { name: 'Samsung', category: 'appliances', brandId: 'samsung' },
      'lg': { name: 'LG', category: 'appliances', brandId: 'lg' },
      'bosch': { name: 'Bosch', category: 'appliances', brandId: 'bosch' },
      'maytag': { name: 'Maytag', category: 'appliances', brandId: 'maytag' },
      'frigidaire': { name: 'Frigidaire', category: 'appliances', brandId: 'frigidaire' },
      'kenmore': { name: 'Kenmore', category: 'appliances', brandId: 'kenmore' },
      'whirlpool': { name: 'Whirlpool', category: 'appliances', brandId: 'whirlpool' },
      'apple': { name: 'Apple', category: 'electronics', brandId: 'apple' },
      'hp': { name: 'HP', category: 'electronics', brandId: 'hp' },
      'asus': { name: 'ASUS', category: 'electronics', brandId: 'asus' },
      'google-pixel': { name: 'Google Pixel', category: 'electronics', brandId: 'google_pixel' },
      'sony': { name: 'Sony', category: 'electronics', brandId: 'sony' },
      'vizio': { name: 'Vizio', category: 'electronics', brandId: 'vizio' },
      'panasonic': { name: 'Panasonic', category: 'electronics', brandId: 'panasonic' },
    };
    var ctx = BRAND_PAGE_MAP[slug];
    if (!ctx) return;
    if (ctx.brandId) {
      var sidebarCat = sidebarCategoryForSlug(ctx.brandId);
      if (sidebarCat) expandSidebarCategory(sidebarCat);
    }

    var dom = getDecodeDom();
    var brandSelect = dom.brandEl;
    if (!brandSelect) return;

    if (ctx.category) {
      var tabBtn = document.querySelector('.cat-tab[data-cat="' + ctx.category + '"]');
      if (tabBtn && typeof selectCategory === 'function') {
        selectCategory(ctx.category, tabBtn);
      } else if (typeof populateBrands === 'function') {
        currentCategory = ctx.category;
        populateBrands(ctx.category);
      }
    }

    var matched = false;
    for (var i = 0; i < brandSelect.options.length; i++) {
      if (brandSelect.options[i].value === ctx.brandId) {
        brandSelect.value = ctx.brandId;
        if (typeof onBrandChange === 'function') onBrandChange();
        if (typeof updateDecodeBtn === 'function') updateDecodeBtn();
        matched = true;
        break;
      }
    }
    if (!matched && brandSelect.getAttribute('data-brand-retry') !== '1') {
      brandSelect.setAttribute('data-brand-retry', '1');
      setTimeout(loadBrandContext, 150);
    }

    var serialInput = dom.serialEl;
    if (serialInput && serialInput.focus) {
      setTimeout(function() { serialInput.focus(); }, 120);
    }
  } catch (_) {}
}

function ensureMainContentShell() {
  var app = document.querySelector('.app-container');
  if (!app) return null;
  var main = app.querySelector('#ia-main');
  if (main) return main;
  var header = app.querySelector('.header');
  main = document.createElement('div');
  main.id = 'ia-main';
  main.className = 'ia-main';

  if (!header) {
    while (app.firstChild) {
      main.appendChild(app.firstChild);
    }
    app.appendChild(main);
    return main;
  }

  while (header.nextSibling) {
    main.appendChild(header.nextSibling);
  }
  header.insertAdjacentElement('afterend', main);
  return main;
}

function syncDocumentMetadata(doc) {
  if (doc && doc.title) document.title = doc.title;
  var currentCanonical = document.querySelector('link[rel="canonical"]');
  var nextCanonical = doc ? doc.querySelector('link[rel="canonical"]') : null;
  if (currentCanonical && nextCanonical && nextCanonical.getAttribute('href')) {
    currentCanonical.setAttribute('href', nextCanonical.getAttribute('href'));
  }
  var currentDesc = document.querySelector('meta[name="description"]');
  var nextDesc = doc ? doc.querySelector('meta[name="description"]') : null;
  if (currentDesc && nextDesc && nextDesc.getAttribute('content')) {
    currentDesc.setAttribute('content', nextDesc.getAttribute('content'));
  }
  if (doc && doc.body) document.body.className = doc.body.className || '';
}

function syncDefaultCategoryFromDoc(doc) {
  var scripts = doc ? doc.querySelectorAll('script') : [];
  var found = null;
  Array.prototype.slice.call(scripts).forEach(function(script) {
    if (script.src) return;
    var text = script.textContent || '';
    var match = text.match(/window\.DEFAULT_CATEGORY\s*=\s*["']([^"']+)["']/);
    if (match && match[1]) found = match[1];
  });
  if (found) window.DEFAULT_CATEGORY = found;
  else delete window.DEFAULT_CATEGORY;
}

function normalizeScriptSrc(src) {
  try {
    var url = new URL(src, window.location.origin);
    return url.pathname + url.search;
  } catch (_) {
    return src;
  }
}

function collectLoadedScripts() {
  var loaded = {};
  document.querySelectorAll('script[src]').forEach(function(script) {
    var key = normalizeScriptSrc(script.getAttribute('src'));
    loaded[key] = true;
  });
  return loaded;
}

function loadScript(src) {
  return new Promise(function(resolve, reject) {
    var script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = function() { resolve(); };
    script.onerror = function() { reject(new Error('Failed to load ' + src)); };
    document.body.appendChild(script);
  });
}

function ensureScriptsForDoc(doc) {
  var loaded = window.__iaLoadedScripts || (window.__iaLoadedScripts = collectLoadedScripts());
  var scripts = doc ? doc.querySelectorAll('script[src]') : [];
  var toLoad = [];
  Array.prototype.slice.call(scripts).forEach(function(script) {
    var src = script.getAttribute('src');
    if (!src) return;
    if (src.indexOf('script.js') !== -1) return;
    var key = normalizeScriptSrc(src);
    if (loaded[key]) return;
    loaded[key] = true;
    toLoad.push(src);
  });
  if (!toLoad.length) return Promise.resolve();
  return toLoad.reduce(function(chain, src) {
    return chain.then(function() { return loadScript(src); });
  }, Promise.resolve());
}

function extractMainContentFromDoc(doc) {
  var app = doc ? doc.querySelector('.app-container') : null;
  if (!app) return '';
  var header = app.querySelector('.header');
  var temp = doc.createElement('div');
  if (!header) {
    temp.innerHTML = app.innerHTML;
    var strayHeader = temp.querySelector('.header');
    if (strayHeader) strayHeader.remove();
    return temp.innerHTML;
  }
  var node = header.nextSibling;
  while (node) {
    temp.appendChild(node.cloneNode(true));
    node = node.nextSibling;
  }
  return temp.innerHTML;
}

function initPage() {
  ensureSmartLookupDom();
  enhanceHeaderBranding();
  enhanceSidebarLogo();
  injectHeroBanner();
  ensurePageTitleAndCategoryTabs();
  enhanceSmartLookupSidebarTop();
  renderStaticSidebar();
  document.body.classList.toggle('brand-page', isBrandPage());
  document.body.classList.toggle('methodology-page', getBrandPageSlug() === 'methodology');
  syncSidebarActiveState();
  syncHeaderNavActive();
  enhanceBrandPageEmbeddedDecoder();
  updateMainPageSmartLookupHelperText();
  mountSharedSmartLookupAboutSection();
  ensureFooterPrivacyPolicyLink();
  updateFooterBranding();
  addGuidedSearchButtonToBrandDecoderCard();
  rewriteBrandLinks();
  var dom = getDecodeDom();
  var brandSelect = dom.brandEl;
  var serialInput = dom.serialEl;
  var eraSelect   = document.getElementById('eraSelect');
  var altQuery    = getSmartLookupInputEl();

  if (brandSelect && serialInput) {
    var initialCategory = 'appliances';
    try {
      var initParams = new URLSearchParams(window.location.search || '');
      var initCat = initParams.get('cat');
      if (initCat) initialCategory = categoryNameToKey(initCat);
      else if (window.DEFAULT_CATEGORY) initialCategory = categoryNameToKey(window.DEFAULT_CATEGORY);
      else initialCategory = getSavedCategoryKey() || 'appliances';
    } catch (_) {
      initialCategory = getSavedCategoryKey() || 'appliances';
    }
    currentCategory = normalizeDecoderCategory(initialCategory);
    populateBrands(currentCategory);
    syncGlobalCategoryTabs(initialCategory);
    saveCategoryKey(initialCategory);
    applyBrandDefaultFromSlug();
    if (brandSelect.getAttribute('data-brand-bound') !== '1') {
      brandSelect.setAttribute('data-brand-bound', '1');
      brandSelect.addEventListener('change', function() {
        onBrandChange();
        var selected = brandSelect.value || '';
        if (selected) {
          var clean = selected.replace(/_/g, '-');
          var sidebarCat = sidebarCategoryForSlug(clean) || sidebarCategoryForSlug(selected);
          if (sidebarCat) expandSidebarCategory(sidebarCat);
        }
        updateDecodeBtn();
        syncSidebarActiveState();
      });
    }
    if (serialInput.getAttribute('data-serial-bound') !== '1') {
      serialInput.setAttribute('data-serial-bound', '1');
      serialInput.addEventListener('input', updateDecodeBtn);
      serialInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') decodeSerial();
      });
    }
    if (eraSelect && eraSelect.getAttribute('data-era-bound') !== '1') {
      eraSelect.setAttribute('data-era-bound', '1');
      eraSelect.addEventListener('change', updateDecodeBtn);
    }

    // URL parameter: pre-select brand/category from brand landing pages
    // e.g. index.html?brand=ge&cat=appliances
    try {
      var params = new URLSearchParams(window.location.search);
      var catParam   = params.get('cat');
      var brandParam = params.get('brand');
      brandParam = normalizeBrandId(brandParam);
      if (!catParam && window.DEFAULT_CATEGORY) catParam = window.DEFAULT_CATEGORY;
      if (catParam) {
        var tabBtn = document.querySelector('.cat-tab[data-cat="' + catParam + '"]');
        if (tabBtn) selectCategory(catParam, tabBtn);
        else if (decoderData[normalizeDecoderCategory(catParam)]) {
          currentCategory = normalizeDecoderCategory(catParam);
          saveCategoryKey(catParam);
          populateBrands(currentCategory);
          prioritizeSidebarCategory(catParam);
          syncGlobalCategoryTabs(catParam);
          syncSidebarActiveState();
          updateDecodeBtn();
        }
      }
      if (brandParam) {
        var sel = getDecodeDom().brandEl;
        if (sel) {
          for (var i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === brandParam) {
              sel.value = brandParam;
              onBrandChange();
              updateDecodeBtn();
              setTimeout(function() {
                var s = getDecodeDom().serialEl;
                if (s && s.focus) s.focus();
              }, 150);
              break;
            }
          }
        }
      }
    } catch (e) {}
  }

  if (altQuery) {
    if (altQuery.getAttribute('data-alt-bound') !== '1') {
      altQuery.setAttribute('data-alt-bound', '1');
      altQuery.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') estimateAge();
      });
      altQuery.addEventListener('focus', showAltDisclaimer);
      altQuery.addEventListener('input', showAltDisclaimer);
    }
  }

  loadBrandContext();
  ensureDidYouKnowBlock();
  syncSidebarActiveState();

  try {
    var q = new URLSearchParams(window.location.search || '');
    var serialParam = q.get('serial');
    if (serialParam && dom.serialEl) {
      dom.serialEl.value = serialParam;
      updateDecodeBtn();
    }
  } catch (_) {}
}

function initSpaNavigation() {
  if (window.__iaSpaInit) return;
  window.__iaSpaInit = true;

  document.addEventListener('click', function(event) {
    var link = event.target.closest('a');
    if (!link) return;
    if (link.target && link.target !== '_self') return;
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var href = link.getAttribute('href') || '';
    if (!href || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;
    if (href.indexOf('javascript:') === 0) return;
    if (link.hasAttribute('download')) return;
    if (href.indexOf('#') === 0) return;
    var url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    navigateSpa(url.href, { replace: false, scroll: true });
  });

  window.addEventListener('popstate', function() {
    navigateSpa(window.location.href, { replace: true, scroll: false });
  });
}

function navigateSpa(url, options) {
  if (window.__iaSpaLoading) return;
  window.__iaSpaLoading = true;
  var target = new URL(url, window.location.origin);

  fetch(target.pathname + target.search, { credentials: 'same-origin' })
    .then(function(res) {
      if (!res.ok) throw new Error('Fetch failed');
      return res.text();
    })
    .then(function(html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      return ensureScriptsForDoc(doc).then(function() { return doc; });
    })
    .then(function(doc) {
      var main = ensureMainContentShell();
      if (!main) throw new Error('Missing main container');
      main.innerHTML = extractMainContentFromDoc(doc);
      var nestedHeader = main.querySelector('.header');
      if (nestedHeader) nestedHeader.remove();
      syncDocumentMetadata(doc);
      syncDefaultCategoryFromDoc(doc);
      if (!options || !options.replace) {
        history.pushState({}, '', target.pathname + target.search);
      }
      if (options && options.scroll) window.scrollTo(0, 0);
      initPage();
      if (typeof window.initSmartLookupPage === 'function') {
        window.initSmartLookupPage();
      }
    })
    .catch(function() {
      window.location.href = target.href;
    })
    .finally(function() {
      window.__iaSpaLoading = false;
    });
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
  ensureMainContentShell();
  initSpaNavigation();
  initPage();
  if (typeof window.initSmartLookupPage === 'function') {
    window.initSmartLookupPage();
  }
});

// ===== CATEGORY SELECTION =====
function selectCategory(cat, btn) {
  currentCategory = normalizeDecoderCategory(cat);
  saveCategoryKey(cat);
  document.querySelectorAll('.cat-tab').forEach(function(t) { t.classList.remove('active'); });
  if (btn && btn.classList) btn.classList.add('active');
  syncGlobalCategoryTabs(cat);
  prioritizeSidebarCategory(cat);
  syncSidebarActiveState();
  populateBrands(currentCategory);
  var serialEl = getDecodeDom().serialEl;
  if (serialEl) serialEl.value = '';
  document.getElementById('serialResults').classList.add('hidden');
  document.getElementById('ageResults').classList.add('hidden');
  hideEraGroup();
  updateDecodeBtn();
}

// ===== BRAND DROPDOWN =====
function populateBrands(category) {
  var sel = document.getElementById('brand');
  var brands = decoderData[category].brands;
  var cyclingCat = CYCLING_BRANDS[category] || {};

  var seenBase = {};
  var consolidated = [];
  brands.forEach(function(b) {
    var baseId = ERA_ID_TO_BASE[b.id];
    if (baseId && cyclingCat[baseId]) {
      if (!seenBase[baseId]) {
        seenBase[baseId] = true;
        consolidated.push({ id: baseId, name: cyclingCat[baseId].label, cycling: true });
      }
    } else if (cyclingCat[b.id] && cyclingCat[b.id].type === 'advisory') {
      consolidated.push({ id: b.id, name: b.name, cycling: true });
    } else {
      consolidated.push({ id: b.id, name: b.name, cycling: false });
    }
  });

  consolidated.sort(function(a, b) {
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  sel.innerHTML = '<option value="">-- Select Brand --</option>';
  consolidated.forEach(function(b) {
    var opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    if (b.cycling) opt.dataset.cycling = '1';
    sel.appendChild(opt);
  });
}

// ===== ERA DROPDOWN =====
function onBrandChange() {
  var sel = document.getElementById('brand');
  var opt = sel.options[sel.selectedIndex];
  var brandId = opt ? opt.value : '';
  var cyclingCat = CYCLING_BRANDS[currentCategory] || {};
  var cfg = cyclingCat[brandId];
  // Era dropdown no longer required — split brands now auto-decode both eras simultaneously
  hideEraGroup();
  document.getElementById('eraSelect').value = '';
  updateModelFieldVisibility(brandId);
  updateKenmorePrefixVisibility(brandId);
}

function showEraGroup() {
  document.getElementById('eraGroup').classList.remove('hidden');
}

function hideEraGroup() {
  document.getElementById('eraGroup').classList.add('hidden');
  document.getElementById('eraSelect').value = '';
}

function normalizeBrandId(brandId) {
  if (!brandId) return '';
  var raw = String(brandId).trim();
  var s = raw.toLowerCase();
  var cleaned = s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  var normalized = cleaned;
  if (normalized.normalize) {
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  if (normalized === 'cafe') return 'cafe';
  if (normalized === 'ge cafe' || normalized === 'ge caf') return 'cafe';
  if (cleaned === 'ge monogram' || cleaned === 'monogram') return 'ge';
  if (cleaned === 'ge profile' || cleaned === 'profile') return 'ge';
  if (cleaned === 'hotpoint' || cleaned === 'rca') return 'ge';
  if (cleaned === 'ge') return 'ge';

  if (s === 'ge_caf') return 'cafe';
  if (s === 'ge_profile' || s === 'ge_monogram' || s === 'hotpoint' || s === 'rca') return 'ge';
  return brandId;
}

function resolveDecoderId(metaBrandId) {
  metaBrandId = normalizeBrandId(metaBrandId);
  var cyclingCat = CYCLING_BRANDS[currentCategory] || {};
  var cfg = cyclingCat[metaBrandId];
  if (!cfg) return metaBrandId;
  if (cfg.type === 'split') {
    var era = document.getElementById('eraSelect').value;
    if (era === 'post') return cfg.post;
    if (era === 'pre')  return cfg.pre;
    return null;
  }
  return cfg.single;
}

function updateDecodeBtn() {
  var dom = getDecodeDom();
  var brandEl  = dom.brandEl;
  var serialEl = dom.serialEl;
  var btnEl    = dom.btnEl;
  if (!brandEl || !serialEl || !btnEl) return;
  var brand  = brandEl.value;
  var serial = serialEl.value.trim();
  var decoderId = brand ? resolveDecoderId(brand) : null;
  // Split brands (Amana/Maytag/Admiral/Jenn-Air) decode both eras at once — no era selection needed
  var isSplitBrand = false;
  if (brand && !decoderId) {
    var _scc = CYCLING_BRANDS[currentCategory] || {};
    var _sCfg = _scc[brand] || _scc[normalizeBrandId(brand)];
    isSplitBrand = !!(_sCfg && _sCfg.type === 'split');
  }
  // Kenmore also requires a model prefix to be selected before decoding
  var kenmorePrefixOk = true;
  if (brand && normalizeBrandId(brand) === 'kenmore') {
    var _prefixEl = document.getElementById('kenmoreModelPrefix');
    kenmorePrefixOk = !!(_prefixEl && _prefixEl.value);
  }
  btnEl.disabled = !(brand && serial && (decoderId || isSplitBrand) && kenmorePrefixOk);
}

// ===== YEAR CAP (never return future dates) =====
function capYear(yearStr) {
  if (!yearStr) return yearStr;
  var str = String(yearStr).trim();

  // Dual-year format: "1992/2022" or "2010/2040"
  if (/^\d{4}\/\d{4}$/.test(str)) {
    var parts = str.split('/');
    var valid = parts.filter(function(p) { return parseInt(p) <= CURRENT_YEAR; });
    if (valid.length === 2) return str;          // Both valid, return both
    if (valid.length === 1) return valid[0];     // Only one valid year
    return str;                                  // Both future — return original (edge case)
  }

  // Single 4-digit year
  if (/^\d{4}$/.test(str)) {
    var y = parseInt(str);
    if (y > CURRENT_YEAR) return CURRENT_YEAR.toString();
  }

  return str;
}

// ===== AGE HELPER =====
function computeEstimatedAge(displayedYear) {
  if (!displayedYear) return '—';
  var s = String(displayedYear).trim();
  // Dual year "1992/2022"
  if (/^\d{4}\/\d{4}$/.test(s)) {
    var parts = s.split('/');
    var a1 = CURRENT_YEAR - parseInt(parts[0]);
    var a2 = CURRENT_YEAR - parseInt(parts[1]);
    if (a2 < 0) return a1 + ' years';
    return a2 + ' or ' + a1 + ' years';
  }
  // Single year
  if (/^\d{4}$/.test(s)) {
    var age = CURRENT_YEAR - parseInt(s);
    return age >= 0 ? age + ' year' + (age !== 1 ? 's' : '') : '—';
  }
  return '—';
}

// ===== SANITY CHECK =====
function sanitizeDecodeResult(result) {
  if (!result) return { valid: false, reason: 'No result from decoder' };
  var yearStr = String(result.year || '').trim();
  // Non-numeric or empty year strings (e.g. "Post-2021 (Randomized)") — pass through
  if (!yearStr || !/^\d/.test(yearStr)) return { valid: true };
  // Dual-year "YYYY/YYYY"
  if (/^\d{4}\/\d{4}$/.test(yearStr)) {
    var parts = yearStr.split('/').map(Number);
    var anyValid = parts.some(function(y) { return y >= 1980 && y <= CURRENT_YEAR; });
    if (!anyValid) return { valid: false, reason: 'Decoded years ' + yearStr + ' both outside plausible range (1980\u2013' + CURRENT_YEAR + ')' };
    return { valid: true };
  }
  // Single 4-digit year
  if (/^\d{4}$/.test(yearStr)) {
    var y = parseInt(yearStr);
    if (y < 1980 || y > CURRENT_YEAR) {
      return { valid: false, reason: 'Decoded year ' + yearStr + ' is outside plausible range (1980\u2013' + CURRENT_YEAR + ')' };
    }
  }
  return { valid: true };
}

// ===== DECODE FALLBACK ALERT (fire-and-forget) =====
function fireFallbackAlert(brand, serial, category, reason) {
  try {
    fetch('/api/decode-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: brand, serial: serial, category: category, reason: reason, timestamp: new Date().toISOString() })
    }).catch(function() {});
  } catch (_) {}
}

// ===== DECODE FALLBACK DISPLAY =====
function showDecodeFallback(decoder, serial, brandId, reason, overrideNotes) {
  var refinePanel = document.querySelector('.narrow-date-panel');
  if (refinePanel) refinePanel.classList.add('hidden');
  var monthRow = document.getElementById('resultMonthRow');
  if (monthRow) monthRow.style.display = 'none';
  var yearEl = document.getElementById('resultYear');
  if (yearEl) {
    yearEl.textContent = '';
    if (yearEl.closest) { var yearRow = yearEl.closest('.result-row'); if (yearRow) yearRow.style.display = 'none'; }
  }
  var ageEl = document.getElementById('resultEstimatedAge');
  if (ageEl) {
    ageEl.textContent = '\u2014';
    if (ageEl.closest) { var ageRow = ageEl.closest('.result-row'); if (ageRow) ageRow.style.display = 'none'; }
  }
  document.getElementById('resultBrand').textContent  = decoder.name;
  document.getElementById('resultMethod').textContent = decoder.method || decoder.serialLengthNote || 'Check the product label and ensure the full serial number is entered.';
  document.getElementById('resultNotes').textContent  = overrideNotes ||
    'We\u2019re sorry, our system is having trouble decoding that number. Please refer to the decoding method above.\n\nSerial entered: ' + serial;
  updateSearchQueryLine();
  updateResultWarning({ year: 'Unknown', month: '' }, brandId);
  showBrandLogo('serialBrandLogo', brandId, decoder.name);
  currentFeedbackContext = { brand: decoder.name, serial: serial };
  fireFallbackAlert(decoder.name, serial, currentCategory, reason);
  pulseGuidedSearchButton();
  setLoadingSuccess(function() {
    document.getElementById('serialResults').classList.remove('hidden');
    document.getElementById('serialResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

// ===== ERA YEAR FILTERING (Task 1) =====
function filterYearsByEra(yearStr, era) {
  var candidates = parseCandidateYears(yearStr);
  if (!candidates.length) return yearStr; // non-numeric or unparseable — pass through
  var filtered;
  if (era === 'post') {
    filtered = candidates.filter(function(y) { return y >= 2006; });
  } else if (era === 'pre') {
    filtered = candidates.filter(function(y) { return y <= 2005; });
  } else {
    return yearStr;
  }
  if (!filtered.length) return null; // no valid candidates for this era
  if (filtered.length === 1) return String(filtered[0]);
  return filtered.join('/');
}

function parseCandidateYears(yearText) {
  var matches = String(yearText || '').match(/\b(19|20)\d{2}\b/g) || [];
  var seen = {};
  return matches
    .map(function(y) { return parseInt(y, 10); })
    .filter(function(y) {
      if (seen[y]) return false;
      seen[y] = true;
      return true;
    });
}

function isAmbiguousResultYear(yearText) {
  var years = parseCandidateYears(yearText);
  return years.length > 1 || String(yearText || '').indexOf('/') !== -1 || /\bor\b/i.test(String(yearText || ''));
}

function ensureRefinementPanel() {
  var serialResults = document.getElementById('serialResults');
  if (!serialResults) return null;
  var panel = serialResults.querySelector('.narrow-date-panel');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.className = 'narrow-date-panel hidden';
  panel.innerHTML = '' +
    '<h4>Narrow the Date (Recommended)</h4>' +
    '<p class="narrow-date-note">Multiple possible dates were found. Add model/context to refine.</p>' +
    '<div class="narrow-date-fields">' +
      '<input type="text" id="narrowModelInput" class="form-input" placeholder="Model number">' +
      '<input type="text" id="narrowContextInput" class="form-input" placeholder="Optional description/context">' +
      '<button type="button" id="narrowDateBtn" class="decode-btn">Refine Result</button>' +
    '</div>' +
    '<div id="narrowDateOutput" class="narrow-date-output"></div>';
  var resultsBody = serialResults.querySelector('.results-body');
  if (resultsBody) {
    var queryLine = resultsBody.querySelector('.result-query');
    if (queryLine) queryLine.insertAdjacentElement('afterend', panel);
    else resultsBody.insertAdjacentElement('afterbegin', panel);
  } else {
    var moreOptions = serialResults.querySelector('.more-options-section');
    if (moreOptions) moreOptions.insertAdjacentElement('beforebegin', panel);
    else serialResults.appendChild(panel);
  }
  panel.querySelector('#narrowDateBtn').addEventListener('click', refineAmbiguousResult);
  return panel;
}

function ensureSearchQueryLine() {
  var serialResults = document.getElementById('serialResults');
  if (!serialResults) return null;
  var resultsBody = serialResults.querySelector('.results-body');
  if (!resultsBody) return null;
  var line = resultsBody.querySelector('.result-query');
  if (line) return line;
  line = document.createElement('div');
  line.className = 'result-query';
  resultsBody.insertAdjacentElement('afterbegin', line);
  return line;
}

function buildSearchQueryText() {
  var dom = getDecodeDom();
  var brandEl = dom.brandEl;
  var serialEl = dom.serialEl;
  var modelEl = document.getElementById('modelNumber');
  var narrowModelEl = document.getElementById('narrowModelInput');
  var narrowContextEl = document.getElementById('narrowContextInput');
  var brandText = '';
  if (brandEl && brandEl.selectedIndex >= 0) {
    brandText = brandEl.options[brandEl.selectedIndex].textContent || brandEl.value || '';
  }
  var serialText = serialEl ? serialEl.value.trim() : '';
  var modelText = modelEl ? modelEl.value.trim() : '';
  var narrowModel = narrowModelEl ? narrowModelEl.value.trim() : '';
  var narrowContext = narrowContextEl ? narrowContextEl.value.trim() : '';
  var parts = [];
  if (brandText) parts.push('Brand=' + brandText);
  if (serialText) parts.push('Serial=' + serialText);
  if (modelText) parts.push('Model=' + modelText);
  if (narrowModel || narrowContext) {
    var narrowParts = [];
    if (narrowModel) narrowParts.push('Model=' + narrowModel);
    if (narrowContext) narrowParts.push('Context=' + narrowContext);
    parts.push('Narrow Date=' + narrowParts.join(', '));
  }
  return 'Search Query: ' + parts.join(' | ');
}

function updateSearchQueryLine() {
  var line = ensureSearchQueryLine();
  if (!line) return;
  line.textContent = buildSearchQueryText();
}

function ensureResultWarningBlock() {
  var serialResults = document.getElementById('serialResults');
  if (!serialResults) return null;
  var resultsBody = serialResults.querySelector('.results-body');
  if (!resultsBody) return null;
  var block = resultsBody.querySelector('.result-warning');
  if (block) return block;
  block = document.createElement('div');
  block.className = 'info-block warning result-warning hidden';
  block.innerHTML = '<h4>Incomplete Result</h4><p></p>';
  var panel = resultsBody.querySelector('.narrow-date-panel');
  var queryLine = resultsBody.querySelector('.result-query');
  if (panel && panel.parentNode) {
    panel.insertAdjacentElement('afterend', block);
  } else if (queryLine) {
    queryLine.insertAdjacentElement('afterend', block);
  } else {
    resultsBody.insertAdjacentElement('afterbegin', block);
  }
  return block;
}

function isIncompleteResult(result) {
  if (!result) return true;
  var yearStr = String(result.year || '').trim();
  var monthStr = String(result.month || '').trim();
  var text = (yearStr + ' ' + monthStr).toLowerCase();
  // Dual-year format like "1992/2022" is a valid result — do NOT flag as incomplete
  if (/^\d{4}\/\d{4}$/.test(yearStr)) return false;
  if (text.indexOf('unknown') !== -1) return true;
  if (text.indexOf('ambiguous') !== -1) return true;
  if (text.indexOf('unable') !== -1) return true;
  if (text.indexOf('non-numeric') !== -1) return true;
  return false;
}

function updateResultWarning(result, brandId) {
  var block = ensureResultWarningBlock();
  if (!block) return;
  var modelEl = document.getElementById('modelNumber');
  var modelMissing = requiresModelForBrand(brandId)
    && (!modelEl || !modelEl.value.trim());
  if (isIncompleteResult(result) || modelMissing) {
    block.classList.remove('hidden');
    var p = block.querySelector('p');
    if (p) {
      p.textContent = 'Incomplete result � please verify your inputs (brand/serial/model). If the result is still incorrect after verifying inputs, report an issue.';
    }
  } else {
    block.classList.add('hidden');
  }
}

function ensureKenmorePrefixField() {
  var formArea = document.querySelector('.form-area');
  if (!formArea) return null;
  if (document.getElementById('kenmoreModelPrefix')) return document.getElementById('kenmoreModelPrefix');
  var serialInput = document.getElementById('serial');
  var serialGroup = serialInput ? serialInput.closest('.form-group') : null;
  // Build <optgroup> sections from KENMORE_PREFIX_TO_DECODER, grouped by manufacturer
  var byMfr = {};
  Object.keys(KENMORE_PREFIX_TO_DECODER).forEach(function(prefix) {
    var mfr = KENMORE_PREFIX_TO_DECODER[prefix].manufacturer;
    if (!byMfr[mfr]) byMfr[mfr] = [];
    byMfr[mfr].push(prefix);
  });
  Object.keys(byMfr).forEach(function(mfr) {
    byMfr[mfr].sort(function(a, b) { return parseInt(a, 10) - parseInt(b, 10); });
  });
  var optgroupsHtml = Object.keys(byMfr).sort().map(function(mfr) {
    var opts = byMfr[mfr].map(function(p) {
      return '<option value="' + p + '">' + p + ' \u2014 ' + mfr + '</option>';
    }).join('');
    return '<optgroup label="' + mfr + '">' + opts + '</optgroup>';
  }).join('');

  var group = document.createElement('div');
  group.className = 'form-group kenmore-prefix-group hidden';
  group.innerHTML = '' +
    '<label class="step-label" for="kenmoreModelPrefix">Kenmore Model Prefix (first 3 digits of model number)</label>' +
    '<select id="kenmoreModelPrefix" class="form-select">' +
      '<option value="">-- Select model prefix --</option>' +
      optgroupsHtml +
    '</select>' +
    '<div class="helper-text kenmore-prefix-note">Select the first 3 digits of your Kenmore model number to identify who manufactured it.</div>';
  if (serialGroup && serialGroup.parentNode) {
    serialGroup.insertAdjacentElement('afterend', group);
  } else {
    formArea.appendChild(group);
  }
  var input = document.getElementById('kenmoreModelPrefix');
  if (input && input.getAttribute('data-prefix-bound') !== '1') {
    input.setAttribute('data-prefix-bound', '1');
    input.addEventListener('change', updateDecodeBtn);
  }
  return input;
}

function updateKenmorePrefixVisibility(brandId) {
  var prefixInput = ensureKenmorePrefixField();
  if (!prefixInput) return;
  var group = prefixInput.closest('.kenmore-prefix-group');
  if (!group) return;
  var key = String(normalizeBrandId(brandId) || '').toLowerCase();
  if (key === 'kenmore') group.classList.remove('hidden');
  else group.classList.add('hidden');
}

function resolveKenmoreDecoderFromPrefix() {
  var prefixEl = document.getElementById('kenmoreModelPrefix');
  var prefix = prefixEl ? String(prefixEl.value || '').replace(/\D/g, '').substring(0, 3) : '';
  if (!prefix) {
    return {
      noPrefix: true,
      decoderId: 'whirlpool',
      manufacturer: 'Whirlpool',
      usedDefault: true,
      cycle: 30,
      note: 'For Kenmore appliances, the model number prefix (first 3 digits) is required to decode accurately. Please enter the first 3 digits of your model number.'
    };
  }
  var match = KENMORE_PREFIX_TO_DECODER[prefix];
  if (!match) {
    return {
      prefix: prefix,
      decoderId: 'whirlpool',
      manufacturer: 'Whirlpool',
      usedDefault: true,
      cycle: 30,
      note: 'Prefix ' + prefix + ' not recognized \u2014 defaulting to Whirlpool method. Results may vary.'
    };
  }
  return {
    prefix: prefix,
    decoderId: match.decoderId,
    manufacturer: match.manufacturer,
    usedDefault: false,
    cycle: match.cycle,
    note: ''
  };
}

function ensureModelField() {
  var formArea = document.querySelector('.form-area');
  if (!formArea) return null;
  if (document.getElementById('modelNumber')) return document.getElementById('modelNumber');
  var serialInput = document.getElementById('serial');
  var serialGroup = serialInput ? serialInput.closest('.form-group') : null;
  var group = document.createElement('div');
  group.className = 'form-group model-group hidden';
  group.innerHTML = '' +
    '<label class="step-label" for="modelNumber">Model Number (optional)</label>' +
    '<input type="text" id="modelNumber" class="form-input" placeholder="Enter model number (optional)">' +
    '<div class="helper-text model-note">If possible, include a model number to narrow the search result.</div>';
  if (serialGroup && serialGroup.parentNode) {
    serialGroup.insertAdjacentElement('afterend', group);
  } else {
    formArea.appendChild(group);
  }
  return document.getElementById('modelNumber');
}

function updateModelFieldVisibility(brandId) {
  var modelInput = ensureModelField();
  if (!modelInput) return;
  var group = modelInput.closest('.model-group');
  if (!group) return;
  var key = String(normalizeBrandId(brandId) || '').toLowerCase();
  var showBrands = {
    samsung: true,
    sony: true,
    vizio: true,
    ge: true,
    cafe: true,
    ge_caf: true,
    ge_profile: true,
    ge_monogram: true,
    hotpoint: true,
    rca: true,
    frigidaire: true,
    electrolux: true,
    insignia: true,
    hisense: true
  };
  if (showBrands[key]) group.classList.remove('hidden');
  else group.classList.add('hidden');
}

function requiresModelForBrand(brandId) {
  var key = String(normalizeBrandId(brandId) || '').toLowerCase();
  return key === 'lg';
}

function deterministicRefinement(candidates, model, context) {
  var combined = (model + ' ' + context).trim();
  var yearsMentioned = parseCandidateYears(combined);
  if (yearsMentioned.length) {
    var target = yearsMentioned[0];
    var best = candidates.reduce(function(prev, cur) {
      return Math.abs(cur - target) < Math.abs(prev - target) ? cur : prev;
    }, candidates[0]);
    return {
      chosenYear: best,
      summary: 'Using your provided year clue (' + target + '), the nearest serial-valid option is ' + best + '.',
      confidence: 'Heuristic'
    };
  }
  return {
    chosenYear: null,
    summary: 'Not enough model/context detail to confidently narrow the date. Keep current candidates and add more specifics.',
    confidence: 'Low'
  };
}

function chooseCandidateFromLookup(candidates, lookupData) {
  if (!lookupData) return null;
  var targetYears = [];
  if (lookupData.estimatedYear) {
    targetYears = targetYears.concat(parseCandidateYears(String(lookupData.estimatedYear)));
  }
  if (lookupData.yearRange) {
    targetYears = targetYears.concat(parseCandidateYears(String(lookupData.yearRange)));
  }
  if (!targetYears.length || !candidates.length) return null;
  var target = targetYears[0];
  var best = candidates.reduce(function(prev, cur) {
    return Math.abs(cur - target) < Math.abs(prev - target) ? cur : prev;
  }, candidates[0]);
  return {
    chosenYear: best,
    summary: 'Smart Lookup suggests around ' + target + '; closest serial-valid candidate is ' + best + '.',
    confidence: 'Medium'
  };
}

async function refineAmbiguousResult() {
  var output = document.getElementById('narrowDateOutput');
  var modelEl = document.getElementById('narrowModelInput');
  var contextEl = document.getElementById('narrowContextInput');
  var yearEl = document.getElementById('resultYear');
  var brandEl = document.getElementById('resultBrand');
  if (!output || !yearEl) return;

  var model = modelEl ? modelEl.value.trim() : '';
  var context = contextEl ? contextEl.value.trim() : '';
  var candidates = parseCandidateYears(yearEl.textContent);
  if (!candidates.length) return;

  output.innerHTML = '<p>Refining...</p>';
  var query = (brandEl ? brandEl.textContent : '') + ' ' + model + ' ' + context + ' candidate years: ' + candidates.join(', ');
  var selected = null;

  try {
    var res = await fetch('/api/age-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim() })
    });
    var data = await parseJsonResponseSafe(res, 'refine-ambiguous');
    selected = chooseCandidateFromLookup(candidates, data);
    if (!selected) selected = deterministicRefinement(candidates, model, context);
    output.innerHTML =
      '<div class="info-block refinement">' +
        '<h4>How we decided</h4>' +
        '<p>' + esc(selected.summary) + '</p>' +
        '<p><strong>Confidence:</strong> ' + esc(selected.confidence) + '</p>' +
        (selected.chosenYear ? '<p><strong>Recommended date:</strong> ' + esc(String(selected.chosenYear)) + '</p>' : '') +
      '</div>';
  } catch (e) {
    console.error('[Refinement] Failed to refine candidates:', e);
    selected = deterministicRefinement(candidates, model, context);
    output.innerHTML =
      '<div class="info-block refinement">' +
        '<h4>How we decided</h4>' +
        '<p>' + esc(selected.summary) + '</p>' +
        '<p><strong>Confidence:</strong> ' + esc(selected.confidence) + '</p>' +
      '</div>';
  }

  if (selected && selected.chosenYear) {
    yearEl.textContent = String(selected.chosenYear);
    var ageEl = document.getElementById('resultEstimatedAge');
    if (ageEl) ageEl.textContent = computeEstimatedAge(String(selected.chosenYear));
  }
  updateSearchQueryLine();
  var monthEl = document.getElementById('resultMonth');
  updateResultWarning({ year: yearEl.textContent, month: monthEl ? monthEl.textContent : '' }, (getDecodeDom().brandEl ? getDecodeDom().brandEl.value : ''));
}

// ===== SERIAL LENGTH REQUIREMENTS =====
var SERIAL_LENGTH_REQUIREMENTS = {
  appliances: {
    // Whirlpool family — strict 9 or 10 characters
    'whirlpool':  { typical: [9, 10], minDecode: 9 },
    'kitchenaid': { typical: [9, 10], minDecode: 9 },
    'roper':      { typical: [9, 10], minDecode: 9 },
    'estate':     { typical: [9, 10], minDecode: 9 },
    'inglis':     { typical: [9, 10], minDecode: 9 },
    'crosley':    { typical: [9, 10], minDecode: 9 },
    // GE family — 2 chars to decode, typically 8–10
    'ge':   { typical: [8, 9, 10], minDecode: 2 },
    'cafe': { typical: [8, 9, 10], minDecode: 2 },
    // Frigidaire/Electrolux family — 5 chars to decode, typically 8–10
    'frigidaire':                        { typical: [8, 9, 10], minDecode: 5 },
    'electrolux':                        { typical: [8, 9, 10], minDecode: 5 },
    'philco':                            { typical: [8, 9, 10], minDecode: 5 },
    'tappan':                            { typical: [8, 9, 10], minDecode: 5 },
    'kelvinator':                        { typical: [8, 9, 10], minDecode: 5 },
    'gibson':                            { typical: [8, 9, 10], minDecode: 5 },
    'white_westinghouse':                { typical: [8, 9, 10], minDecode: 5 },
    'white_consolidated_industries_wci': { typical: [8, 9, 10], minDecode: 5 },
    // Samsung — strict 11 or 15 characters
    'samsung': { typical: [11, 15], minDecode: 11 },
    // LG — 3 chars to decode, typically 8–12
    'lg': { typical: [8, 9, 10, 11, 12], minDecode: 3 },
    // Bosch family — must start with 'FD', typically 9–12
    'bosch':     { typical: [9, 10, 11, 12], minDecode: 4, prefix: 'FD' },
    'thermador': { typical: [9, 10, 11, 12], minDecode: 4, prefix: 'FD' },
    'gaggenau':  { typical: [9, 10, 11, 12], minDecode: 4, prefix: 'FD' },
    // Maytag/Jenn-Air/Amana/Admiral post-2006 — 2nd alpha char, typically 8–10
    'maytag_post_2006':   { typical: [8, 9, 10], minDecode: 2 },
    'jenn_air_post_2006': { typical: [8, 9, 10], minDecode: 2 },
    'amana_post_2006':    { typical: [8, 9, 10], minDecode: 2 },
    'admiral_post_2006':  { typical: [8, 9, 10], minDecode: 2 },
    // Maytag/Jenn-Air/Amana/Admiral pre-2006 — 2nd alpha char, typically 8–10
    'maytag_pre_2006':   { typical: [8, 9, 10], minDecode: 2 },
    'jenn_air_pre_2006': { typical: [8, 9, 10], minDecode: 2 },
    'amana_pre_2006':    { typical: [8, 9, 10], minDecode: 2 },
    'admiral_pre_2006':  { typical: [8, 9, 10], minDecode: 2 },
    // Last-2-char family (year+month at end) — typically 7–10
    'caloric':     { typical: [7, 8, 9, 10], minDecode: 2 },
    'hardwick':    { typical: [7, 8, 9, 10], minDecode: 2 },
    'norge':       { typical: [7, 8, 9, 10], minDecode: 2 },
    'speed_queen': { typical: [7, 8, 9, 10], minDecode: 2 },
    'magic_chef':  { typical: [7, 8, 9, 10], minDecode: 2 },
    'modern_maid': { typical: [7, 8, 9, 10], minDecode: 2 },
    'glenwood':    { typical: [7, 8, 9, 10], minDecode: 2 },
    'sunray':      { typical: [7, 8, 9, 10], minDecode: 2 },
    'litton':      { typical: [7, 8, 9, 10], minDecode: 2 },
    'menumaster':  { typical: [7, 8, 9, 10], minDecode: 2 },
    'bravos':      { typical: [7, 8, 9, 10], minDecode: 2 },
    'maycor':      { typical: [7, 8, 9, 10], minDecode: 2 },
    'neptune':     { typical: [7, 8, 9, 10], minDecode: 2 },
    'imperial':    { typical: [7, 8, 9, 10], minDecode: 2 },
    // Other 2-letter decode brands — typically 8–10
    'norcold':       { typical: [8, 9, 10], minDecode: 2 },
    'sub_zero':      { typical: [8, 9, 10], minDecode: 2 },
    'hampton_bay':   { typical: [8, 9, 10], minDecode: 2 },
    'conquest':      { typical: [8, 9, 10], minDecode: 2 },
    'coolerator':    { typical: [8, 9, 10], minDecode: 2 },
    'crystal_tips':  { typical: [8, 9, 10], minDecode: 2 },
    'partners_plus': { typical: [8, 9, 10], minDecode: 2 },
    'jordan':        { typical: [8, 9, 10], minDecode: 2 },
    'sinkguard':     { typical: [8, 9, 10], minDecode: 2 },
    'kenmore':       { typical: [8, 9, 10], minDecode: 2 }
  },
  waterHeater: {
    // Rheem family — MMYYXXXXXX = 10 digits
    'rheem':                         { typical: [10], minDecode: 4 },
    'ruud':                          { typical: [10], minDecode: 4 },
    'richmond':                      { typical: [10], minDecode: 4 },
    'vanguard':                      { typical: [10], minDecode: 4 },
    'ge_water_heaters':              { typical: [10], minDecode: 4 },
    'montgomery_ward':               { typical: [10], minDecode: 4 },
    'aqua_therm':                    { typical: [10], minDecode: 4 },
    'energy_master':                 { typical: [10], minDecode: 4 },
    'cimarron':                      { typical: [10], minDecode: 4 },
    // AO Smith family — variable pre/post 2008, typically 9–10
    'a_o_smith':                     { typical: [9, 10], minDecode: 3 },
    'state_industries':              { typical: [9, 10], minDecode: 3 },
    'reliance_water_heaters':        { typical: [9, 10], minDecode: 3 },
    'american_water_heater_company': { typical: [9, 10], minDecode: 3 },
    'u_s_craftmaster':               { typical: [9, 10], minDecode: 3 },
    'gsw':                           { typical: [9, 10], minDecode: 3 },
    'intertherm_miller':             { typical: [9, 10], minDecode: 3 },
    // Whirlpool water heaters — strict 9 or 10
    'whirlpool_water_heaters': { typical: [9, 10], minDecode: 9 },
    // Bradford White — 6 or 15 characters
    'bradford_white': { typical: [6, 15], minDecode: 6 }
  },
  hvac: {
    // Goodman/Amana HVAC — YYMM format, typically 9–11
    'goodman': { typical: [9, 10, 11], minDecode: 4 },
    'amana':   { typical: [9, 10, 11], minDecode: 4 },
    // Carrier/Bryant/Payne — WWYY format, typically 9–11
    'carrier': { typical: [9, 10, 11], minDecode: 4 },
    'bryant':  { typical: [9, 10, 11], minDecode: 4 },
    'payne':   { typical: [9, 10, 11], minDecode: 4 },
    // Rheem/Ruud HVAC — XWWYY format, typically 9–11
    'rheem': { typical: [9, 10, 11], minDecode: 5 },
    'ruud':  { typical: [9, 10, 11], minDecode: 5 },
    // Trane/American Standard — positions 3–4, typically 9–11
    'trane':             { typical: [9, 10, 11], minDecode: 4 },
    'american_standard': { typical: [9, 10, 11], minDecode: 4 },
    // Lennox — 6 chars to decode, typically 8–11
    'lennox': { typical: [8, 9, 10, 11], minDecode: 6 },
    // York — 3 chars to decode, typically 8–11
    'york': { typical: [8, 9, 10, 11], minDecode: 3 }
  },
  electronics: {
    // Samsung TV — strict 11 or 15 characters
    'samsung_tv': { typical: [11, 15], minDecode: 11 },
    // LG TV — 3 chars to decode, typically 8–12
    'lg_tv': { typical: [8, 9, 10, 11, 12], minDecode: 3 },
    // Apple — strict 10 (post-2021) or 12 (pre-2021)
    'apple': { typical: [10, 12], minDecode: 10 },
    // Samsung phone — 6 chars to decode, typically 9–11
    'samsung_phone': { typical: [9, 10, 11], minDecode: 6 },
    // HP — 6 or 15 characters
    'hp': { typical: [6, 15], minDecode: 6 },
    // Asus — 2 chars to decode, typically 9–12
    'asus': { typical: [9, 10, 11, 12], minDecode: 2 },
    // Google Pixel — 3 chars to decode, typically 9–11
    'google_pixel': { typical: [9, 10, 11], minDecode: 3 },
    // Vizio — 5 chars to decode, typically 9–11
    'vizio': { typical: [9, 10, 11], minDecode: 5 },
    // Panasonic — 2 chars to decode, typically 9–11
    'panasonic': { typical: [9, 10, 11], minDecode: 2 }
    // Sony is model-based — no serial length check needed
  }
};

function getSerialLengthReq(category, brandId) {
  var catMap = SERIAL_LENGTH_REQUIREMENTS[category];
  return catMap ? (catMap[brandId] || null) : null;
}

function formatTypicalLengths(typical) {
  if (!typical || typical.length === 0) return 'standard length';
  var sorted = typical.slice().sort(function(a, b) { return a - b; });
  if (sorted.length === 1) return sorted[0] + ' characters';
  var isConsecutive = sorted.every(function(v, i) { return i === 0 || v === sorted[i - 1] + 1; });
  if (isConsecutive && sorted.length > 2) return sorted[0] + ' to ' + sorted[sorted.length - 1] + ' characters';
  if (sorted.length === 2) return sorted[0] + ' and ' + sorted[1] + ' characters';
  return sorted.slice(0, -1).join(', ') + ', and ' + sorted[sorted.length - 1] + ' characters';
}

function showSerialLengthError(decoder, serial, brandId, req) {
  var monthRow = document.getElementById('resultMonthRow');
  if (monthRow) monthRow.style.display = 'none';
  var yearEl = document.getElementById('resultYear');
  if (yearEl) {
    yearEl.textContent = '';
    if (yearEl.closest) { var yr = yearEl.closest('.result-row'); if (yr) yr.style.display = 'none'; }
  }
  var ageEl = document.getElementById('resultEstimatedAge');
  if (ageEl) {
    ageEl.textContent = '\u2014';
    if (ageEl.closest) { var ar = ageEl.closest('.result-row'); if (ar) ar.style.display = 'none'; }
  }
  var refinePanel = document.querySelector('.narrow-date-panel');
  if (refinePanel) refinePanel.classList.add('hidden');

  var lenStr = formatTypicalLengths(req.typical);
  var prefixNote = req.prefix ? ' Serial numbers for this brand must begin with \u2018' + req.prefix + '\u2019.' : '';
  document.getElementById('resultBrand').textContent  = decoder.name;
  document.getElementById('resultMethod').textContent = decoder.method || decoder.serialLengthNote || '';
  document.getElementById('resultNotes').textContent  =
    'This brand uses serial numbers that are ' + lenStr + ' in length.' + prefixNote +
    ' Search again or use Smart Lookup.';

  updateResultWarning({ year: 'Unknown', month: '' }, brandId);
  showBrandLogo('serialBrandLogo', brandId, decoder.name);
  updateSearchQueryLine();
  currentFeedbackContext = { brand: decoder.name, serial: serial };

  document.getElementById('ageResults').classList.add('hidden');
  document.getElementById('serialResults').classList.remove('hidden');
  document.getElementById('serialResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===== DUAL-ERA RESULT (split brands: Amana, Maytag, Admiral, Jenn-Air) =====
function buildEraBlock(era, label, tag, result, decoder) {
  var yearStr = result ? String(result.year || '') : '';
  var hasUnknown = yearStr.indexOf('Unknown') !== -1;
  var html = '<div class="era-result-block era-result-' + era + (hasUnknown || !result ? ' era-result-uncertain' : '') + '">';
  html += '<div class="era-result-heading">' + esc(label) + '<span class="era-method-tag">' + esc(tag) + '</span></div>';
  if (!result) {
    html += '<div class="era-unknown-note">This serial does not match the ' + esc(label) + ' format.</div>';
  } else {
    var displayYear = capYear(yearStr);
    html += '<div class="result-row"><span class="result-label">Manufacturer Date</span><span class="result-value">' + esc(displayYear) + '</span></div>';
    if (result.month && result.month !== 'N/A') {
      html += '<div class="result-row"><span class="result-label">Month / Period</span><span class="result-value">' + esc(result.month) + '</span></div>';
    }
    if (!hasUnknown) {
      var age = computeEstimatedAge(displayYear);
      if (age && age !== '\u2014') {
        html += '<div class="result-row"><span class="result-label">Estimated Age</span><span class="result-value">' + esc(age) + '</span></div>';
      }
    } else {
      html += '<div class="era-unknown-note">Year code not recognized \u2014 this method likely does not apply to your serial.</div>';
    }
  }
  if (decoder) {
    html += '<div class="era-method-note">' + esc(decoder.decodeMethod || decoder.serialLengthNote || '') + '</div>';
  }
  html += '</div>';
  return html;
}

function showDualEraResult(metaBrandId, cfg, serial) {
  var decoders = decoderData[currentCategory].decoders;
  var postDecoder = decoders[cfg.post];
  var preDecoder  = decoders[cfg.pre];
  var postResult  = postDecoder ? postDecoder.decode(serial) : null;
  var preResult   = preDecoder  ? preDecoder.decode(serial)  : null;
  var brandName   = cfg.label;

  var html = '';
  html += '<div class="info-block era-split-notice">';
  html += '<h4>Two Decoding Methods</h4>';
  html += '<p><strong>' + esc(brandName) + '</strong> changed its serial number format when Whirlpool acquired the brand in 2006. ';
  html += 'Both methods have been applied to your serial below.</p>';
  html += '</div>';

  html += '<div class="era-dual-results">';
  html += buildEraBlock('post', 'Post-2006', 'Whirlpool era', postResult, postDecoder);
  html += buildEraBlock('pre',  'Pre-2006',  'Legacy era',    preResult,  preDecoder);
  html += '</div>';

  html += '<details class="determination-details era-determine-guide">';
  html += '<summary>How to tell which result is correct</summary>';
  html += '<div class="determination-body">';
  html += '<p><strong>Post-2006 (Whirlpool era):</strong> Year is encoded at a fixed character position \u2014 position 2 in a 9-character serial, or position 3 in a 10-character serial. The result shows a dual year like \u201c2012/2042\u201d reflecting the 30-year repeating cycle. Units purchased in 2006 or later use this method.</p>';
  html += '<p><strong>Pre-2006 (Legacy era):</strong> Year and month are encoded as letter codes in the last two characters of the serial. If the Pre-2006 result shows \u201cYear code not recognized,\u201d that method does not apply to your serial.</p>';
  html += '<p><strong>Quick guide:</strong> If one result shows an unrecognized code and the other shows a valid year, the valid one is almost certainly correct. If you know when the appliance was purchased \u2014 before or after 2006 \u2014 use the matching result.</p>';
  html += '</div>';
  html += '</details>';

  // Inject into results-body, hiding all standard rows
  var resultsBody = document.querySelector('#serialResults .results-body');
  if (resultsBody) {
    var dualDisplay = document.getElementById('dualEraDisplay');
    if (!dualDisplay) {
      dualDisplay = document.createElement('div');
      dualDisplay.id = 'dualEraDisplay';
      resultsBody.insertBefore(dualDisplay, resultsBody.firstChild);
    }
    dualDisplay.innerHTML = html;
    dualDisplay.style.display = '';
    resultsBody.classList.add('results-body--dual');
  }

  showBrandLogo('serialBrandLogo', metaBrandId, brandName);
  currentFeedbackContext = { brand: brandName, serial: serial };

  setLoadingSuccess(function() {
    document.getElementById('serialResults').classList.remove('hidden');
    document.getElementById('serialResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

// ===== SERIAL DECODE =====
function decodeSerial() {
  var dom = getDecodeDom();
  if (!dom.brandEl || !dom.serialEl) return;
  var metaBrandId = dom.brandEl.value;
  var serialInput = dom.serialEl.value.trim();
  if (!metaBrandId || !serialInput) return;
  var serial = serialInput.replace(/[^A-Za-z0-9]/g, '');
  if (!serial) return;
  if (serial !== serialInput) dom.serialEl.value = serial;

  if (isBrandPage()) {
    var currentSlug = getBrandPageSlug();
    var targetSlug = BRAND_PAGE_BY_ID[metaBrandId] || BRAND_PAGE_BY_ID[(metaBrandId || '').replace(/-/g, '_')];
    if (targetSlug && currentSlug && targetSlug !== currentSlug) {
      window.location.href = '/' + targetSlug + '?serial=' + encodeURIComponent(serial);
      return;
    }
  }

  var brandId = resolveDecoderId(metaBrandId);
  var _splitEraConfig = null;
  if (!brandId) {
    var _ecc = CYCLING_BRANDS[currentCategory] || {};
    var _eccCfg = _ecc[metaBrandId] || _ecc[normalizeBrandId(metaBrandId)];
    if (_eccCfg && _eccCfg.type === 'split') {
      _splitEraConfig = _eccCfg;
    } else {
      showCustomAlert('Please select the manufacture era for this brand.');
      return;
    }
  }

  var isKenmore = (normalizeBrandId(metaBrandId) === 'kenmore');
  var kenmoreResolution = null;
  if (isKenmore) {
    kenmoreResolution = resolveKenmoreDecoderFromPrefix();
    if (kenmoreResolution.noPrefix) {
      // Pre-validation: no loading animation — show prompt directly
      var _km = document.getElementById('resultMonthRow'); if (_km) _km.style.display = 'none';
      var _ky = document.getElementById('resultYear'); if (_ky) { _ky.textContent = ''; var _kyr = _ky.closest ? _ky.closest('.result-row') : null; if (_kyr) _kyr.style.display = 'none'; }
      var _ka = document.getElementById('resultEstimatedAge'); if (_ka) { _ka.textContent = '\u2014'; var _kar = _ka.closest ? _ka.closest('.result-row') : null; if (_kar) _kar.style.display = 'none'; }
      var _kp = document.querySelector('.narrow-date-panel'); if (_kp) _kp.classList.add('hidden');
      document.getElementById('resultBrand').textContent  = 'Kenmore';
      document.getElementById('resultMethod').textContent = 'Model prefix required to identify OEM manufacturer';
      document.getElementById('resultNotes').textContent  = kenmoreResolution.note;
      updateSearchQueryLine();
      updateResultWarning({ year: 'Unknown', month: '' }, 'kenmore');
      showBrandLogo('serialBrandLogo', 'kenmore', 'Kenmore');
      currentFeedbackContext = { brand: 'Kenmore', serial: serial };
      document.getElementById('ageResults').classList.add('hidden');
      document.getElementById('serialResults').classList.remove('hidden');
      document.getElementById('serialResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    brandId = kenmoreResolution.decoderId;
  }

  // Era-split brands: decode both pre and post methods simultaneously
  if (_splitEraConfig) {
    updateSearchQueryLine();
    document.getElementById('serialResults').classList.add('hidden');
    document.getElementById('ageResults').classList.add('hidden');
    var _sb = document.getElementById('moreOptionsBody'); if (_sb) _sb.classList.add('hidden');
    var _sa = document.getElementById('moreOptionsArrow'); if (_sa) _sa.classList.remove('open');
    ['replacements', 'specs', 'market'].forEach(function(t) {
      var _sel = document.getElementById('ai-result-' + t);
      if (_sel) { _sel.classList.add('hidden'); _sel.textContent = ''; }
    });
    setLoadingActive();
    setTimeout(function() {
      showDualEraResult(metaBrandId, _splitEraConfig, serial);
    }, 1400);
    return;
  }

  var decoder = decoderData[currentCategory].decoders[brandId];
  if (!decoder) { showCustomAlert('Decoder not found for this brand'); return; }

  // === SERIAL LENGTH PRE-VALIDATION ===
  var _serialReq = getSerialLengthReq(currentCategory, brandId);
  if (_serialReq) {
    var _prefixFail = _serialReq.prefix &&
      serial.toUpperCase().indexOf(_serialReq.prefix.toUpperCase()) !== 0;
    if (serial.length < _serialReq.minDecode || _prefixFail) {
      showSerialLengthError(decoder, serial, brandId, _serialReq);
      return;
    }
  }

  updateSearchQueryLine();

  // Show loading animation immediately
  document.getElementById('serialResults').classList.add('hidden');
  document.getElementById('ageResults').classList.add('hidden');
  // Reset progressive disclosure state
  var _moreBody = document.getElementById('moreOptionsBody');
  if (_moreBody) _moreBody.classList.add('hidden');
  var _moreArrow = document.getElementById('moreOptionsArrow');
  if (_moreArrow) _moreArrow.classList.remove('open');
  ['replacements', 'specs', 'market'].forEach(function(t) {
    var el = document.getElementById('ai-result-' + t);
    if (el) { el.classList.add('hidden'); el.textContent = ''; }
  });
  setLoadingActive();

  // Hold the cloud for at least 1400ms so the sun transition reaches ~2 s total
  setTimeout(function() {
    // Clear dual-era mode if previous decode was a split brand
    (function() {
      var _drb = document.querySelector('#serialResults .results-body');
      if (_drb) _drb.classList.remove('results-body--dual');
      var _ded = document.getElementById('dualEraDisplay');
      if (_ded) { _ded.innerHTML = ''; _ded.style.display = 'none'; }
    })();
    // Reset row/block visibility from any previous fallback state
    (function() {
      var _yr = document.getElementById('resultYear');
      var _ae = document.getElementById('resultEstimatedAge');
      if (_yr && _yr.closest) { var r1 = _yr.closest('.result-row'); if (r1) r1.style.display = ''; }
      if (_ae && _ae.closest) { var r2 = _ae.closest('.result-row'); if (r2) r2.style.display = ''; }
    })();

    var result = decoder.decode(serial);
    var sanity  = sanitizeDecodeResult(result);
    var monthRow  = document.getElementById('resultMonthRow');

    if (!result || !sanity.valid) {
      var _reason = !result
        ? 'Decoder returned null for serial: ' + serial
        : (sanity.reason || 'Sanity check failed');
      var _failNotes = null;
      if (_serialReq && _serialReq.typical.length > 0) {
        var _lenStr = formatTypicalLengths(_serialReq.typical);
        var _pfx = _serialReq.prefix ? ' Serial numbers for this brand must begin with \u2018' + _serialReq.prefix + '\u2019.' : '';
        _failNotes = 'This brand uses serial numbers that are ' + _lenStr + ' in length.' + _pfx + ' Search again or use Smart Lookup.';
      }
      showDecodeFallback(decoder, serial, brandId, _reason, _failNotes);
      return;
    }
    if (monthRow) monthRow.style.display = '';

    // === ERA FILTERING: filter candidate years to the selected era BEFORE display ===
    var _eraEl = document.getElementById('eraSelect');
    var _eraVal = _eraEl ? _eraEl.value : '';
    if (_eraVal && result && result.year) {
      var _filteredYear = filterYearsByEra(String(result.year), _eraVal);
      if (_filteredYear === null) {
        // No candidate years match the selected era � show clear message, no age
        document.getElementById('resultBrand').textContent  = decoder.name;
        document.getElementById('resultMethod').textContent = decoder.method || decoder.serialLengthNote || 'N/A';
        document.getElementById('resultNotes').textContent  = 'No matching dates found for the selected era. Try switching to Pre-2006 or Post-2006.';
        updateResultWarning({ year: 'Unknown', month: '' }, brandId);
        var _yearEl = document.getElementById('resultYear');
        if (_yearEl) {
          _yearEl.textContent = 'N/A';
          var _yearRow = _yearEl.closest ? _yearEl.closest('.result-row') : null;
          if (_yearRow) _yearRow.style.display = '';
        }
        var _ageEl2 = document.getElementById('resultEstimatedAge');
        if (_ageEl2) {
          _ageEl2.textContent = 'N/A';
          var _ageRow2 = _ageEl2.closest ? _ageEl2.closest('.result-row') : null;
          if (_ageRow2) _ageRow2.style.display = 'none';
        }
        if (monthRow) monthRow.style.display = 'none';
        var _rp = ensureRefinementPanel();
        if (_rp) _rp.classList.add('hidden');
        showBrandLogo('serialBrandLogo', brandId, decoder.name);
        currentFeedbackContext = { brand: decoder.name, serial: serial };
        setLoadingSuccess(function() {
          document.getElementById('serialResults').classList.remove('hidden');
          document.getElementById('serialResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        return;
      }
      // Assign the era-filtered year back so all downstream display uses it
      result = Object.assign({}, result, { year: _filteredYear });
    }

    document.getElementById('resultYear').textContent    = capYear(result.year);
    document.getElementById('resultMonth').textContent   = result.month;
    document.getElementById('resultBrand').textContent   = isKenmore
      ? ('Kenmore (OEM: ' + (kenmoreResolution ? kenmoreResolution.manufacturer : decoder.name) + ')')
      : decoder.name;
    document.getElementById('resultMethod').textContent  = decoder.method || decoder.serialLengthNote || 'N/A';

    // Append decode detail (specific codes used for this decode)
    (function() {
      var parts = [];
      parts.push('Serial length: ' + serial.length);
      if (result.yearCharacterPosition !== undefined) parts.push('Year character position: ' + result.yearCharacterPosition);
      if (result.yearCode !== undefined) parts.push('Year code: ' + result.yearCode + ' \u2192 ' + capYear(result.year));
      if (result.weekDigits !== undefined) parts.push('Week: ' + result.weekDigits);
      if (result.monthCode !== undefined) parts.push('Month code: ' + result.monthCode + ' \u2192 ' + result.month);
      if (parts.length > 0) {
        var dd = document.createElement('span');
        dd.className = 'decode-detail';
        dd.textContent = parts.join('  \u00b7  ');
        document.getElementById('resultMethod').appendChild(dd);
      }
    })();

    var notesText = decoder.notes || decoder.decodeNotes || 'N/A';
    if (isKenmore && kenmoreResolution) {
      var _kenmoreBaseNote = 'Kenmore appliances are manufactured by third-party companies under contract with Sears. ' +
        'The decode method and result above are based on the OEM manufacturer (' + kenmoreResolution.manufacturer + ') identified by your model prefix. ' +
        'Results follow a ' + (kenmoreResolution.cycle || 30) + '-year repeating cycle \u2014 use appliance condition and features to confirm the decade.';
      var _kenmoreFullNote = kenmoreResolution.note
        ? kenmoreResolution.note + ' ' + _kenmoreBaseNote
        : _kenmoreBaseNote;
      notesText = _kenmoreFullNote + (notesText && notesText !== 'N/A' ? '\n\n' + notesText : '');
    }
    // Prepend a short-serial warning when the input was shorter than the brand's typical length
    if (_serialReq && _serialReq.typical.length > 0) {
      var _typicalMin = Math.min.apply(null, _serialReq.typical);
      if (serial.length < _typicalMin) {
        var _shortNote = 'Note: Serial numbers from this brand are typically ' +
          formatTypicalLengths(_serialReq.typical) + '. Please verify the information above before proceeding with this estimated age.';
        notesText = _shortNote + (notesText && notesText !== 'N/A' ? '\n\n' + notesText : '');
      }
    }
    document.getElementById('resultNotes').textContent = notesText;
    updateResultWarning(result, brandId);

    // Compute derived display fields from output shape (no decode rules exposed)
    var _displayedYear = document.getElementById('resultYear').textContent;
    document.getElementById('resultEstimatedAge').textContent = computeEstimatedAge(_displayedYear);

    showBrandLogo('serialBrandLogo', brandId, decoder.name);
    currentFeedbackContext = {
      brand: isKenmore ? ('Kenmore (OEM: ' + (kenmoreResolution ? kenmoreResolution.manufacturer : decoder.name) + ')') : decoder.name,
      serial: serial
    };

    var refinePanel = ensureRefinementPanel();
    if (refinePanel) {
      if (isAmbiguousResultYear(_displayedYear)) {
        refinePanel.classList.remove('hidden');
      } else {
        refinePanel.classList.add('hidden');
        var refineOut = document.getElementById('narrowDateOutput');
        if (refineOut) refineOut.innerHTML = '';
      }
    }

    setLoadingSuccess(function() {
      document.getElementById('serialResults').classList.remove('hidden');
      document.getElementById('serialResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, 1400);
}

// ===== COPY CLAIM FILE =====
// Copies exactly 5 labeled fields: Brand, Manufacturer Date, Month, Estimated Age, Methodology
function copyClaimFile() {
  var yearEl    = document.getElementById('resultYear');
  var monthEl   = document.getElementById('resultMonth');
  var brandEl   = document.getElementById('resultBrand');
  var ageEl     = document.getElementById('resultEstimatedAge');
  var methodEl  = document.getElementById('resultMethod');

  var year  = yearEl   ? yearEl.textContent.trim()  : '';
  var month = monthEl  ? monthEl.textContent.trim()  : '';
  var brand = brandEl  ? brandEl.textContent.trim()  : '';
  var age   = ageEl    ? ageEl.textContent.trim()    : '';

  // Get only the one-line method string — strip the decode-detail span if present
  var method = '';
  if (methodEl) {
    var methodClone = methodEl.cloneNode(true);
    var detail = methodClone.querySelector('.decode-detail');
    if (detail) detail.remove();
    method = methodClone.textContent.trim();
  }

  var monthRow = document.getElementById('resultMonthRow');
  var monthVisible = !monthRow || !window.getComputedStyle ||
    window.getComputedStyle(monthRow).display !== 'none';

  var lines = [
    'Brand: '            + (brand || 'N/A'),
    'Manufacturer Date: '+ (year  || 'N/A'),
    'Month: '            + (monthVisible && month ? month : 'N/A'),
    'Estimated Age: '    + (age && age !== '\u2014' ? age : 'N/A'),
    'Methodology: '      + (method || 'N/A'),
  ];

  var text = lines.join('\n');
  var btn = document.querySelector('.copy-btn');
  var original = btn ? btn.textContent : 'Copy Information';

  function setLabel(label) { if (btn) btn.textContent = label; }
  function resetLabel() { if (btn) setTimeout(function() { setLabel(original); }, 1600); }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(function() { setLabel('Copied!'); resetLabel(); })
      .catch(function() { setLabel('Copy Failed'); resetLabel(); });
  } else {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      setLabel(ok ? 'Copied!' : 'Copy Failed');
      resetLabel();
    } catch (e) {
      setLabel('Copy Failed');
      resetLabel();
    }
  }
}

// ===== DECODE ANOTHER ITEM =====
function decodeAnotherItem() {
  var serialResults = document.getElementById('serialResults');
  var ageResults = document.getElementById('ageResults');
  var ageLoading = document.getElementById('ageLoading');
  var serialInput = document.getElementById('serial');
  var altQuery = getSmartLookupInputEl();
  if (serialResults) serialResults.classList.add('hidden');
  if (ageResults) ageResults.classList.add('hidden');
  if (ageLoading) ageLoading.classList.add('hidden');
  if (serialInput) serialInput.value = '';
  var kenmorePrefix = document.getElementById('kenmoreModelPrefix');
  if (kenmorePrefix) kenmorePrefix.value = '';
  if (altQuery) altQuery.value = '';
  if (document.getElementById('eraGroup')) hideEraGroup();
  var refinePanel = document.querySelector('.narrow-date-panel');
  if (refinePanel) refinePanel.classList.add('hidden');
  var refineOut = document.getElementById('narrowDateOutput');
  if (refineOut) refineOut.innerHTML = '';
  updateDecodeBtn();
  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  setTimeout(function() {
    if (serialInput) serialInput.focus();
    else if (altQuery) altQuery.focus();
  }, 300);
}

function getBrandFactsKey(slug) {
  if (!slug) return '';
  if (slug === 'google-pixel') return 'google_pixel';
  return slug.replace(/-/g, '_');
}

function injectDidYouKnowBlock() {
  if (document.querySelector('.did-you-know-block')) return;
  var slug = getBrandPageSlug();
  if (!slug) return;
  var key = getBrandFactsKey(slug);
  var facts = window.BRAND_FACTS && window.BRAND_FACTS[key];
  if (!facts) return;
  var block = document.createElement('div');
  block.className = 'did-you-know-block';
  block.innerHTML =
    '<h2>Did you know?</h2>' +
    '<div class="fact-grid">' +
      '<span class="fact-label">Founded</span><span class="fact-value">' + facts.founded + '</span>' +
      '<span class="fact-label">Founder</span><span class="fact-value">' + facts.founder + '</span>' +
      '<span class="fact-label">Location</span><span class="fact-value">' + facts.location + '</span>' +
    '</div>' +
    '<p class="fact-summary">' + facts.summary + '</p>';
  var sections = document.querySelectorAll('.static-section');
  var last = sections[sections.length - 1];
  if (last && last.parentNode) last.parentNode.insertBefore(block, last);
}

function ensureDidYouKnowBlock() {
  if (document.querySelector('.did-you-know-block')) return;
  var slug = getBrandPageSlug();
  if (!slug) return;
  if (window.BRAND_FACTS) {
    injectDidYouKnowBlock();
    return;
  }
  if (typeof loadScript === 'function') {
    loadScript('facts.js')
      .then(injectDidYouKnowBlock)
      .catch(function() {});
  }
}

// ===== ALT LOOKUP TOGGLE =====
function toggleAlt() {
  var section = document.getElementById('altSection');
  var toggle  = document.querySelector('.alt-toggle');
  section.classList.toggle('open');
  toggle.classList.toggle('open');
}

// ===== EMOJI CURSOR =====
// Injected <style> tag used to override cursor on every element globally
var _cursorStyleEl = null;

function setEmojiCursor(emoji) {
  return;
}

function clearEmojiCursor() {
  return;
}

// ===== LOADING STATE (🌩️ → ☀️) =====
function setLoadingActive() {
  var emoji   = document.getElementById('loadingEmoji');
  var loading = document.getElementById('ageLoading');
  // Hide placeholder once a search has started
  var placeholder = document.getElementById('resultsPlaceholder');
  if (placeholder) placeholder.classList.add('hidden');
  document.body.style.cursor = 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\'><text y=\'28\' font-size=\'28\'>\uD83D\uDD75\uFE0F</text></svg>") 16 16, auto';
  if (emoji) {
    emoji.textContent = '🌩️';
    emoji.className   = 'loading-emoji lightning';
  }
  // Reset loading text to default (estimateAge() overrides this for AI searches)
  var lt = document.getElementById('loadingText');
  if (lt) lt.textContent = 'Researching product information...';
  loading.classList.remove('hidden');
  setEmojiCursor('🌩️');
}

function setLoadingSuccess(callback) {
  var emoji = document.getElementById('loadingEmoji');
  if (emoji) {
    emoji.textContent = '☀️';
    emoji.className   = 'loading-emoji sun';
  }
  setEmojiCursor('☀️');
  setTimeout(function() {
    document.getElementById('ageLoading').classList.add('hidden');
    clearEmojiCursor();
    document.body.style.cursor = '';
    if (callback) callback();
  }, 600);
}

function setLoadingHidden() {
  document.getElementById('ageLoading').classList.add('hidden');
  clearEmojiCursor();
  document.body.style.cursor = '';
}

// ===== BRAND LOGO =====
function showBrandLogo(containerId, brandId, brandName) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var domain = BRAND_LOGOS[brandId];
  container.innerHTML = '';
  if (domain) {
    var img = document.createElement('img');
    img.className = 'brand-logo';
    img.alt = brandName + ' logo';
    img.src = 'https://logo.clearbit.com/' + domain;
    img.onerror = function() { this.replaceWith(makeBrandBadge(brandName)); };
    container.appendChild(img);
  } else {
    container.appendChild(makeBrandBadge(brandName));
  }
  container.style.display = 'flex';
}

function makeBrandBadge(name) {
  var span = document.createElement('span');
  span.className = 'brand-badge';
  span.textContent = (name || '?').substring(0, 2).toUpperCase();
  return span;
}

// ===== SMART LOOKUP NOTICE (rate limit / capacity) =====
function showSmartLookupNotice(type, message) {
  var body = getSmartLookupResultsEl();
  var isCapacity = (type === 'capacity');
  var bg    = isCapacity ? '#fffbeb' : '#f0f9ff';
  var border = isCapacity ? '#f59e0b' : '#00b4d8';
  var color  = isCapacity ? '#92400e' : '#0c4a6e';
  if (body) {
    body.innerHTML =
      '<div style="background:' + bg + ';border-left:3px solid ' + border + ';border-radius:8px;padding:1rem 1.125rem;font-size:0.875rem;color:' + color + ';line-height:1.65;">' +
      message + '</div>';
  }
  var ageResults = document.getElementById('ageResults');
  if (ageResults) {
    ageResults.classList.remove('hidden');
    ageResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

async function parseJsonResponseSafe(res, contextLabel) {
  var contentType = (res.headers && res.headers.get('content-type')) || '';
  if (contentType.toLowerCase().indexOf('application/json') !== -1) {
    return await res.json();
  }
  var raw = '';
  try { raw = await res.text(); } catch (_) {}
  console.error('[Smart Lookup] Non-JSON response for ' + contextLabel + ':', {
    status: res.status,
    contentType: contentType,
    preview: (raw || '').slice(0, 240)
  });
  return {
    error: 'Smart Lookup is temporarily unavailable. Please try again in a moment.',
    errorCode: 'NON_JSON_RESPONSE',
    raw: raw
  };
}

// ===== SMART LOOKUP ITEM TYPE DETECTION =====
var SMART_LOOKUP_CATEGORIES = {
  appliance: ['washer', 'dryer', 'refrigerator', 'fridge', 'dishwasher', 'oven', 'range', 'microwave', 'freezer', 'ice maker', 'cooktop', 'stovetop', 'stove', 'washing machine', 'clothes washer', 'front load', 'top load', 'garbage disposal', 'trash compactor'],
  waterHeater: ['water heater', 'hot water heater', 'water tank', 'tankless', 'water boiler', 'on-demand water heater'],
  hvac: ['furnace', 'air conditioner', 'ac', 'heat pump', 'hvac', 'air handler', 'condenser', 'boiler', 'mini split', 'air purifier', 'dehumidifier', 'humidifier', 'thermostat', 'ductless'],
  electronics: ['tv', 'television', 'monitor', 'phone', 'smartphone', 'tablet', 'laptop', 'computer', 'desktop', 'printer', 'camera', 'speaker', 'soundbar', 'projector', 'headphones', 'earbuds', 'smartwatch', 'watch', 'router', 'modem', 'streaming device', 'game console', 'gaming console']
};

// ===== SUPPORTED TERMS REFERENCE =====
var SUPPORTED_TERMS = {
  appliances: ['washer', 'dryer', 'refrigerator', 'fridge', 'dishwasher', 'oven', 'range', 'microwave', 'freezer', 'ice maker', 'cooktop', 'stove', 'garbage disposal', 'trash compactor', 'washing machine', 'front load', 'top load'],
  hvac: ['furnace', 'air conditioner', 'ac', 'heat pump', 'hvac', 'air handler', 'condenser', 'boiler', 'mini split', 'air purifier', 'dehumidifier', 'humidifier', 'thermostat', 'ductless'],
  waterHeater: ['water heater', 'hot water heater', 'water tank', 'tankless', 'water boiler', 'on-demand water heater'],
  electronics: ['tv', 'television', 'monitor', 'phone', 'smartphone', 'tablet', 'laptop', 'computer', 'desktop', 'printer', 'camera', 'speaker', 'soundbar', 'projector', 'headphones', 'earbuds', 'smartwatch', 'watch', 'router', 'modem', 'streaming device', 'game console', 'gaming console'],
  brands: ['LG', 'Samsung', 'Whirlpool', 'GE', 'Frigidaire', 'Maytag', 'KitchenAid', 'Bosch', 'Electrolux', 'Sony', 'Vizio', 'Panasonic', 'Apple', 'HP', 'Asus', 'Google', 'Nintendo', 'Microsoft', 'Trane', 'Carrier', 'Goodman', 'Lennox', 'Rheem', 'Ruud', 'Bradford White', 'AO Smith', 'State', 'American Standard', 'Bryant', 'York', 'Payne', 'Amana', 'Admiral', 'Kenmore', 'Roper', 'Estate', 'Inglis', 'Thermador', 'Sub-Zero', 'Viking', 'Miele']
};

var SMART_LOOKUP_BLOCKLIST = [
  'wedding', 'birthday', 'recipe', 'baby', 'school', 'weather', 'sports', 'movie',
  'song', 'stock', 'crypto', 'horoscope', 'politics', 'election', 'concert',
  'restaurant', 'hotel', 'flight', 'dating', 'diet', 'yoga', 'meditation', 'lottery',
  'casino', 'gambling', 'tattoo', 'haircut', 'makeup', 'nail', 'perfume', 'cologne'
];

function isSupportedQuery(query) {
  var q = query.toLowerCase().trim();

  // Always pass: probable model number (6+ consecutive alphanumeric chars)
  if (/[a-zA-Z0-9]{6,}/.test(query)) return true;

  // Block clearly off-topic queries
  for (var b = 0; b < SMART_LOOKUP_BLOCKLIST.length; b++) {
    if (q.indexOf(SMART_LOOKUP_BLOCKLIST[b]) !== -1) return false;
  }

  // Pass known brands
  for (var i = 0; i < SUPPORTED_TERMS.brands.length; i++) {
    if (q.indexOf(SUPPORTED_TERMS.brands[i].toLowerCase()) !== -1) return true;
  }

  // Pass known product category keywords
  var cats = ['appliances', 'hvac', 'waterHeater', 'electronics'];
  for (var c = 0; c < cats.length; c++) {
    var keywords = SUPPORTED_TERMS[cats[c]];
    for (var k = 0; k < keywords.length; k++) {
      var kw = keywords[k];
      if (kw.length <= 2) {
        if (new RegExp('\\b' + kw + '\\b', 'i').test(q)) return true;
      } else {
        if (q.indexOf(kw) !== -1) return true;
      }
    }
  }
  return false;
}

function detectQueryItemType(query) {
  var q = query.toLowerCase();
  for (var cat in SMART_LOOKUP_CATEGORIES) {
    var keywords = SMART_LOOKUP_CATEGORIES[cat];
    for (var i = 0; i < keywords.length; i++) {
      var kw = keywords[i];
      // For very short keywords like 'ac', use boundary check to avoid false matches in 'back', 'track', etc.
      if (kw.length <= 2) {
        var re = new RegExp('\\b' + kw + '\\b', 'i');
        if (re.test(q)) return cat;
      } else {
        if (q.indexOf(kw) !== -1) return cat;
      }
    }
  }
  return null;
}

// Keywords too generic/common to reliably identify category from free-form API text
var RESULT_DETECT_EXCLUSIONS = {
  'range': true, 'oven': true, 'stove': true, 'boiler': true,
  'condenser': true, 'monitor': true, 'watch': true
};

function detectResultItemType(data) {
  var combined = ((data.notes || '') + ' ' + (data.serialRule || '') + ' ' + (data.model || '') + ' ' + (data.brand || '')).toLowerCase();
  for (var cat in SMART_LOOKUP_CATEGORIES) {
    var keywords = SMART_LOOKUP_CATEGORIES[cat];
    for (var i = 0; i < keywords.length; i++) {
      var kw = keywords[i];
      if (RESULT_DETECT_EXCLUSIONS[kw]) continue;
      if (combined.indexOf(kw) !== -1) return cat;
    }
  }
  return null;
}

// ===== QUERY SPECIFICITY & RESULT BUILDER =====

var KNOWN_BRANDS = [
  'lg', 'samsung', 'whirlpool', 'ge', 'maytag', 'bosch', 'kitchenaid', 'frigidaire', 'electrolux',
  'sony', 'vizio', 'panasonic', 'apple', 'hp', 'asus', 'google', 'nintendo', 'microsoft',
  'trane', 'carrier', 'goodman', 'lennox', 'rheem', 'ruud', 'bradford white', 'ao smith', 'state',
  'american standard', 'bryant', 'york', 'payne', 'amana', 'admiral', 'kenmore', 'roper', 'estate',
  'inglis', 'thermador', 'sub-zero', 'viking', 'miele', 'jenn-air', 'jennair', 'speed queen', 'tcl',
  'hisense', 'sharp', 'toshiba', 'haier', 'wolf', 'microsoft', 'dell', 'hp', 'lenovo', 'logitech',
  'bose', 'fisher', 'paykel'
];

// ===== CATEGORY GENERIC CONTENT BLOCKS =====
var CATEGORY_GENERIC_BLOCKS = {
  appliance: {
    description: 'Home appliances are household devices designed to assist in domestic functions such as cleaning, cooking, and food preservation. They are manufactured by many major brands and are a staple of modern residential and commercial settings.',
    origin: 'Mass-produced home appliances became widely available starting in the early 20th century, with electric models entering mainstream use through the 1940s and 1950s.',
    productionStatus: 'Still widely produced as of 2026.'
  },
  waterHeater: {
    description: 'Water heaters are appliances used to heat water for residential and commercial use, including bathing, cooking, and space conditioning. They are available in tank-based and tankless configurations.',
    origin: 'The first commercially practical water heater was patented in the 1880s. Gas and electric models became standard in American homes through the mid-20th century.',
    productionStatus: 'Still widely produced as of 2026.'
  },
  hvac: {
    description: 'HVAC equipment includes heating, ventilation, and air conditioning systems designed to regulate indoor temperature, humidity, and air quality in residential and commercial buildings.',
    origin: 'Modern forced-air heating systems emerged in the late 19th century, while central air conditioning systems became widely available for residential use in the 1950s and 1960s.',
    productionStatus: 'Still widely produced as of 2026.'
  },
  electronics: {
    description: 'Consumer electronics are electronic devices intended for personal and household use, including televisions, audio equipment, computers, and mobile devices. They are among the most rapidly evolving product categories on the market.',
    origin: 'Consumer electronics as a category began with radio receivers in the early 20th century, expanding to include televisions in the 1940s, personal computers in the 1970s, and smartphones in the 2000s.',
    productionStatus: 'Still widely produced as of 2026.'
  }
};

function deriveProductionStatus(query, data) {
  var yearRange = (data.yearRange || '').trim();
  var label = data.model || query;
  if (!yearRange) return 'Still widely produced as of 2026.';
  if (/present/i.test(yearRange)) return 'Still widely produced as of 2026.';
  var match = yearRange.match(/(\d{4})\s*[\u2013\u2014\-]+\s*(\d{4})/);
  if (match) {
    var startY = parseInt(match[1]);
    var endY   = parseInt(match[2]);
    if (endY >= 2022) return 'Still widely produced as of 2026.';
    return 'The ' + label + ' was manufactured from ' + startY + ' to ' + endY + ' and is no longer in production.';
  }
  return 'Still widely produced as of 2026.';
}

function buildGuaranteedBlocks(query, data, category) {
  var html = '';

  // Description block
  var description = (data.notes && data.notes.trim().length >= 20)
    ? data.notes.trim()
    : (category && CATEGORY_GENERIC_BLOCKS[category]
        ? CATEGORY_GENERIC_BLOCKS[category].description
        : 'This is a consumer product from a recognized brand or product category.');
  html += '<div class="info-block result-description"><h4>Description</h4><p>' + esc(description) + '</p></div>';

  // Origin block
  var origin;
  if (data.inventionSummary && data.inventionSummary.trim().length >= 20) {
    origin = data.inventionSummary.trim();
  } else if (data.estimatedYear) {
    var originLabel = (data.brand && data.model)
      ? data.brand + ' ' + data.model
      : (data.brand || data.model || query);
    origin = originLabel + ' was introduced in ' + data.estimatedYear + '.';
  } else if (category && CATEGORY_GENERIC_BLOCKS[category]) {
    origin = CATEGORY_GENERIC_BLOCKS[category].origin;
  } else {
    origin = 'The origin and introduction date of this product varies by brand and region.';
  }
  html += '<div class="info-block result-origin"><h4>Origin</h4><p>' + esc(origin) + '</p></div>';

  // Production Status block
  var productionStatus;
  if (data.yearRange) {
    productionStatus = deriveProductionStatus(query, data);
  } else if (data.estimatedYear) {
    var psLabel = data.model || query;
    var yr = parseInt(data.estimatedYear, 10);
    productionStatus = yr >= 2020
      ? 'The ' + psLabel + ' was released in ' + data.estimatedYear + ' and remains in active production as of 2026.'
      : 'The ' + psLabel + ' was introduced in ' + data.estimatedYear + '. Current production status varies by model and region.';
  } else if (category && CATEGORY_GENERIC_BLOCKS[category]) {
    productionStatus = CATEGORY_GENERIC_BLOCKS[category].productionStatus;
  } else {
    productionStatus = 'Still widely produced as of 2026.';
  }
  html += '<div class="info-block result-production-status"><h4>Production Status</h4><p>' + esc(productionStatus) + '</p></div>';

  return html;
}

function getQuerySpecificity(query) {
  var q = query.trim().toLowerCase();
  var hasBrand = KNOWN_BRANDS.some(function(b) { return q.indexOf(b) !== -1; });
  // Model pattern: adjacent letter+digit (C3, WF45R), 4+ digit number, or query ends with version number
  var hasModel = /[a-zA-Z]\d|\d[a-zA-Z]/.test(query) ||
                 /\b\d{4,}\b/.test(query) ||
                 /\s\d+$/.test(query.trim());
  if (!hasBrand) return 'general';
  if (hasBrand && !hasModel) return 'brand';
  return 'specific';
}

function buildRefineTipBox(tipText) {
  return '<div class="tip-block">' +
    '<div class="tip-row"><span class="tip-label">&#128161; Refine Your Result</span>' +
    '<span class="tip-text">' + esc(tipText) + '</span></div>' +
    '</div>';
}

function buildSmartLookupFallbackHtml(query) {
  var category = detectQueryItemType(query);
  var html = '<div class="result-query smart-search-query">Search: ' + esc(query) + '</div>';
  html += buildGuaranteedBlocks(query, {}, category);
  html += buildRefineTipBox('To get a more specific manufacture year, try adding a model number, series name, or product type to your search. Examples: \u2018LG C3 55 inch TV\u2019, \u2018Samsung QLED QN85B\u2019, \u2018Whirlpool front load washer WFW5000DW\u2019.');
  return html;
}

function buildSmartLookupResultHtml(query, data, specificity) {
  var category = detectQueryItemType(query);
  var html = '';

  html += '<div class="result-query smart-search-query">Search: ' + esc(query) + '</div>';

  // Identification rows
  if (data.brand) {
    html += '<div class="result-row"><span class="result-label">Brand</span><span class="result-value">' + esc(data.brand) + '</span></div>';
  }
  if (data.model && specificity === 'specific') {
    html += '<div class="result-row"><span class="result-label">Model</span><span class="result-value">' + esc(data.model) + '</span></div>';
  }

  // GUARANTEED MINIMUM BLOCKS: Description, Origin, Production Status
  html += buildGuaranteedBlocks(query, data, category);

  // Parse yearRange for conflict detection and span calculation
  var yearRangeStart = null, yearRangeEnd = null, yearRangeSpan = 0;
  if (data.yearRange) {
    var yrMatch = data.yearRange.match(/(\d{4})\s*[\u2013\u2014\-]+\s*(present|\d{4})/i);
    if (yrMatch) {
      yearRangeStart = parseInt(yrMatch[1], 10);
      yearRangeEnd = /present/i.test(yrMatch[2]) ? 2026 : parseInt(yrMatch[2], 10);
      yearRangeSpan = yearRangeEnd - yearRangeStart;
    }
  }

  var hasConflict = false;
  if (data.estimatedYear && yearRangeStart !== null) {
    var eYear = parseInt(data.estimatedYear, 10);
    if (!isNaN(eYear) && (eYear < yearRangeStart || eYear > yearRangeEnd)) {
      hasConflict = true;
    }
  }

  // Professional labels based on confidence
  var yearLabel = (specificity === 'specific' && !hasConflict) ? 'Confirmed Manufacture Year' : 'Estimated Manufacture Year';
  var rangeLabel = hasConflict
    ? 'Conflicting Date Information'
    : (yearRangeSpan > 4 ? 'Estimated Date Range (verify recommended)' : 'Confirmed Retail Availability');

  // Estimated year row
  if (data.estimatedYear) {
    var isPrimary = specificity === 'specific';
    html += '<div class="result-row' + (isPrimary ? ' result-row--primary' : '') + '">' +
      '<span class="result-label">' + yearLabel + '</span>' +
      '<span class="result-value">' + esc(capYear(data.estimatedYear)) + '</span></div>';
  }

  // Year range row
  if (data.yearRange) {
    html += '<div class="result-row"><span class="result-label">' + rangeLabel + '</span><span class="result-value">' + esc(data.yearRange) + '</span></div>';
  }

  // Conflict or wide-window notice
  if (hasConflict) {
    html += '<div class="info-block warning"><p><strong>Note:</strong> The estimated manufacture year (' + esc(String(data.estimatedYear)) + ') falls outside the confirmed retail availability range (' + esc(data.yearRange) + '). This may indicate limited data or a discrepancy between manufacture date and retail listing date. We recommend using the retail availability range as the primary reference.</p></div>';
  } else if (yearRangeSpan > 4) {
    html += '<div class="info-block"><p><strong>Wide Date Window:</strong> This product has a confirmed retail availability spanning ' + yearRangeSpan + ' years. The manufacture date of a specific unit may fall anywhere within this range.</p></div>';
  }

  // Thin result fallback
  var isThinResult = !data.estimatedYear && !data.yearRange && (!data.notes || data.notes.trim().length < 40);
  if (isThinResult) {
    html += '<div class="info-block tip"><h4>&#128161; Limited Information Available</h4><p>We were unable to find complete information for this search. For more specific results, try including the model number, series name, or product type. You can also try the serial number decoder if you have the appliance in front of you.</p></div>';
  }

  // Sources Checked — collapsible (Change 5)
  var hasEvidence = data.evidence && data.evidence.length > 0;
  var hasSources = !!(data.sources && (Array.isArray(data.sources) ? data.sources.length > 0 : true));
  if (hasEvidence || hasSources) {
    html += '<details class="sources-checked"><summary>Sources Checked</summary><div class="sources-checked-body">';
    if (hasEvidence) {
      html += '<div class="evidence-list">';
      data.evidence.forEach(function(item) {
        var detail = item.detail || '';
        var source = item.source || '';
        if (detail || source) {
          html += '<div class="evidence-item">';
          if (source) html += '<span class="ev-source">' + esc(source) + '</span>';
          if (detail) html += '<span>' + esc(detail) + '</span>';
          html += '</div>';
        }
      });
      html += '</div>';
    }
    if (hasSources) {
      var srcList = Array.isArray(data.sources) ? data.sources : [data.sources];
      html += '<div class="evidence-list">';
      srcList.forEach(function(src) {
        var label = typeof src === 'string' ? src : (src.name || src.url || JSON.stringify(src));
        html += '<div class="evidence-item"><span>' + esc(label) + '</span></div>';
      });
      html += '</div>';
    }
    html += '</div></details>';
  }

  // Serial hints
  if (data.serialRule) {
    html += '<div class="info-block serial-rule"><h4>Serial Number Hint</h4><p>' + esc(data.serialRule) + '</p></div>';
  }
  if (data.serialLocation) {
    html += '<div class="info-block serial-loc"><h4>Where to Find the Serial Number</h4><p>' + esc(data.serialLocation) + '</p></div>';
  }

  // Refine Your Result tip
  var isHighConfidenceSingle = (specificity === 'specific') && !!data.estimatedYear && !hasConflict;
  if (!isHighConfidenceSingle) {
    html += buildRefineTipBox('To get a more specific manufacture year, try adding a model number, series name, or product type to your search. Examples: \u2018LG C3 55 inch TV\u2019, \u2018Samsung QLED QN85B\u2019, \u2018Whirlpool front load washer WFW5000DW\u2019.');
  } else if (data.refinementSuggestion) {
    html += buildRefineTipBox(data.refinementSuggestion);
  }

  // Suggestion chips
  var queryIsSerialLike = /^[a-zA-Z0-9]{9,}$/.test(query);
  if (!queryIsSerialLike && data.exampleModelNumber) {
    html += '<div class="tip-block">';
    html += '<div class="tip-row"><span class="tip-label">&#128161; Tip</span><span class="tip-text">You\'ll get more accurate results if you enter the model number.</span></div>';
    html += '<div class="tip-chips"><button class="suggestion-chip" data-model="' + esc(data.exampleModelNumber) + '" onclick="clickSuggestion(this.dataset.model)">' + esc(data.exampleModelNumber) + '</button></div>';
    html += '</div>';
  }
  if (!queryIsSerialLike && data.suggestedModelNumbers && data.suggestedModelNumbers.length > 0) {
    html += '<div class="tip-block">';
    html += '<div class="tip-row"><span class="tip-label">&#128161;</span><span class="tip-text">Try one of these similar model numbers:</span></div>';
    html += '<div class="tip-chips">';
    data.suggestedModelNumbers.forEach(function(m) {
      html += '<button class="suggestion-chip" data-model="' + esc(m) + '" onclick="clickSuggestion(this.dataset.model)">' + esc(m) + '</button>';
    });
    html += '</div></div>';
  }

  return html;
}

// ===== ESTIMATE AGE =====
async function estimateAge() {
  var inputEl = getSmartLookupInputEl();
  if (!inputEl) return;
  var query = inputEl.value.trim();
  if (!query) return;

  var isSupported = isSupportedQuery(query);
  var queryType = detectQueryItemType(query);

  if (!isSupported) {
    var body = getSmartLookupResultsEl();
    if (body) {
      body.innerHTML = '<div class="info-block warning">That search does not match terminology within the scope of our support. Try searching another term or using the serial number decoder. If you feel you reached this message in error, please contact our team with details.</div>';
    }
    document.getElementById('ageResults').classList.remove('hidden');
    document.getElementById('ageResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  document.getElementById('ageResults').classList.add('hidden');
  var sr = document.getElementById('serialResults');
  if (sr) sr.classList.add('hidden');
  setLoadingActive();
  setEmojiCursor('🕵️');  // detective cursor for AI lookup
  var lt = document.getElementById('loadingText');
  if (lt) lt.textContent = '🕵️ Investigating...';
  document.getElementById('ageLoading').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  var loadStart = Date.now();

  try {
    var res  = await fetch('/api/age-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        researchInstructions: 'Search for this product across major retail websites including bestbuy.com, walmart.com, amazon.com, homedepot.com, lowes.com, ajmadison.com, target.com, and costco.com. Note the earliest and most recent listing dates found. Also search for the earliest online publications, blog posts, product reviews, owner manuals, and press releases for this product. Use these sources to determine the earliest confirmed availability date and the most recent confirmed listing date. These retailer listing dates are reliable indicators of production range. Do not assume a product is discontinued unless it is confirmed absent from all major retailers and all recent sources.',
      }),
    });

    // Handle structured limit responses before parsing JSON
    if (res.status === 429) {
      var limitData = {};
      try { limitData = await parseJsonResponseSafe(res, 'rate-limit'); } catch(_) {}
      if (limitData.errorCode === 'RATE_LIMIT' || res.status === 429) {
        setLoadingHidden();
        showSmartLookupNotice('limit', 'You\'ve reached the Smart Lookup usage limit. Please wait a few minutes and try again.');
        return;
      }
    }
    if (res.status === 503) {
      setLoadingHidden();
      showSmartLookupNotice('capacity', 'Wow! Due to the popular demand of this tool, the capacity of the free version has been reached. Please utilize the serial number decoder. The smart lookup function will be available again soon. Interested in utilizing smart lookup within personalized data limits? <a href="contact.html" style="color:inherit;font-weight:700;">Contact us today</a> to become a pro member.');
      return;
    }

    var data = await parseJsonResponseSafe(res, 'age-lookup');
    console.log('[Smart Lookup API Response]', JSON.stringify(data, null, 2));

    // Internal fields starting with "_" (like _source) are for tracking and MUST be hidden from UI
    for (var key in data) {
      if (key.indexOf('_') === 0) delete data[key];
    }

    if (data.errorCode === 'RATE_LIMIT') {
      setLoadingHidden();
      showSmartLookupNotice('limit', 'You\'ve reached the Smart Lookup usage limit. Please wait a few minutes and try again.');
      return;
    }
    if (data.errorCode === 'SITE_LIMIT') {
      setLoadingHidden();
      showSmartLookupNotice('capacity', 'Wow! Due to the popular demand of this tool, the capacity of the free version has been reached. Please utilize the serial number decoder. The smart lookup function will be available again soon. Interested in utilizing smart lookup within personalized data limits? <a href="contact.html" style="color:inherit;font-weight:700;">Contact us today</a> to become a pro member.');
      return;
    }

    if (data.errorCode === 'AI_UNAVAILABLE' || data.error) {
      setLoadingHidden();
      showSmartLookupNotice('limit', esc(data.message || data.error || 'Smart Lookup is temporarily unavailable.'));
      return;
    }

    // === ITEM TYPE MISMATCH CHECK ===
    var resultType = detectResultItemType(data);
    if (queryType && resultType && queryType !== resultType) {
      // Notes from a different category — suppress them to avoid cross-category bleed
      data = Object.assign({}, data, { notes: null, serialRule: null });
    }

    var body = getSmartLookupResultsEl();
    var specificity = getQuerySpecificity(query);
    body.innerHTML = buildSmartLookupResultHtml(query, data, specificity);
    var brandId = (data.brand || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    showBrandLogo('ageBrandLogo', brandId, data.brand || '');
    currentFeedbackContext = { brand: data.brand || '', serial: query };

    // Ensure the cloud shows for at least 1400ms so the full 2 s sequence completes
    var elapsed   = Date.now() - loadStart;
    var remaining = Math.max(0, 1400 - elapsed);
    setTimeout(function() {
      setLoadingSuccess(function() {
        document.getElementById('ageResults').classList.remove('hidden');
        document.getElementById('ageResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }, remaining);

  } catch (e) {
    setLoadingHidden();
    console.error('[Smart Lookup] estimateAge failed:', e);
    showSmartLookupNotice('limit', 'Smart Lookup is temporarily unavailable. Please try again.');
  }
}

// ===== GUIDE DRAWER =====
function openGuide() {
  document.getElementById('guideDrawer').classList.add('open');
  document.getElementById('guideOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeGuide() {
  document.getElementById('guideDrawer').classList.remove('open');
  document.getElementById('guideOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ===== FEEDBACK MODAL =====
function openFeedbackModal() {
  var ctx = currentFeedbackContext;
  document.getElementById('fbBrand').value   = ctx.brand  || '';
  document.getElementById('fbSerial').value  = ctx.serial || '';
  document.getElementById('fbType').value    = '';
  document.getElementById('fbDetails').value = '';
  document.getElementById('fbThanks').classList.add('hidden');
  document.getElementById('fbActions').style.display = '';
  document.getElementById('feedbackModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeFeedbackModal() {
  document.getElementById('feedbackModal').classList.add('hidden');
  document.body.style.overflow = '';
}

async function submitFeedback() {
  var brand     = document.getElementById('fbBrand').value;
  var serial    = document.getElementById('fbSerial').value;
  var issueType = document.getElementById('fbType').value;
  var details   = document.getElementById('fbDetails').value;

  try {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: brand, serial: serial, issueType: issueType, details: details }),
    });
  } catch (e) {
    // fail silently — still show thank-you
  }

  document.getElementById('fbThanks').classList.remove('hidden');
  document.getElementById('fbActions').style.display = 'none';
  setTimeout(closeFeedbackModal, 2200);
}

function showAltDisclaimer() {
  var d = document.querySelector('.alt-disclaimer');
  if (d) d.classList.remove('hidden');
}

// ===== MORE OPTIONS TOGGLE =====
function toggleMoreOptions() {
  var body  = document.getElementById('moreOptionsBody');
  var arrow = document.getElementById('moreOptionsArrow');
  if (!body) return;
  var isOpen = !body.classList.contains('hidden');
  body.classList.toggle('hidden', isOpen);
  if (arrow) arrow.classList.toggle('open', !isOpen);
}

// ===== PROGRESSIVE DISCLOSURE — AI SECTION GENERATOR =====
async function generateAISection(type, btn) {
  var brand  = currentFeedbackContext.brand  || '';
  var serial = currentFeedbackContext.serial || '';
  var year   = document.getElementById('resultYear').textContent || '';

  var queries = {
    replacements: brand + ' appliance manufactured around ' + year + ' — current replacement models and comparable units',
    specs:        brand + ' appliance serial ' + serial + ' manufactured around ' + year + ' — technical specifications and product features',
    market:       brand + ' appliance manufactured around ' + year + ' — current market pricing and availability'
  };
  var query = queries[type] || (brand + ' appliance ' + year);

  var resultEl = document.getElementById('ai-result-' + type);
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  if (resultEl) resultEl.classList.add('hidden');

  try {
    var res  = await fetch('/api/age-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query }),
    });
    var data = await parseJsonResponseSafe(res, 'ai-section-' + type);

    // Filter internal tracking fields (e.g. _source, _fallbackUsed)
    for (var key in data) {
      if (key.indexOf('_') === 0) delete data[key];
    }

    if (resultEl) {
      var lines = [];
      if (data.notes) lines.push(data.notes);
      if (data.evidence && data.evidence.length > 0) {
        data.evidence.forEach(function(ev) {
          if (ev.detail) lines.push(ev.detail);
        });
      }
      resultEl.textContent = lines.join('\n\n') || 'No additional data found for this product.';
      resultEl.classList.remove('hidden');
    }
  } catch (e) {
    if (resultEl) {
      resultEl.textContent = 'Unable to load data. Please try again.';
      resultEl.classList.remove('hidden');
    }
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '&#128161; Generate (uses AI)'; }
}

// ===== SMART LOOKUP SUGGESTION CLICK =====
function clickSuggestion(modelNum) {
  // Ensure the Smart Lookup section is expanded
  var section = document.getElementById('altSection');
  var toggle  = document.querySelector('.alt-toggle');
  if (section && !section.classList.contains('open')) {
    section.classList.add('open');
    if (toggle) toggle.classList.add('open');
  }
  var input = getSmartLookupInputEl();
  if (input) {
    // Preserve brand context so bare model numbers pass the supported-query check
    var searchTerm = modelNum;
    var brand = currentFeedbackContext && currentFeedbackContext.brand;
    if (brand && !isSupportedQuery(modelNum)) {
      searchTerm = brand + ' ' + modelNum;
    }
    input.value = searchTerm;
  }
  estimateAge();
}

// ===== UTILITY =====
function esc(s) {
  if (!s) return '';
  var div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ===== CUSTOM ALERT MODAL =====
function showCustomAlert(message) {
  var existing = document.getElementById('customAlertModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'customAlertModal';
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.background = 'rgba(0,0,0,0.45)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '9999';

  var box = document.createElement('div');
  box.style.background = '#ffffff';
  box.style.borderRadius = '12px';
  box.style.padding = '24px 20px';
  box.style.maxWidth = '420px';
  box.style.width = 'calc(100vw - 32px)';
  box.style.boxShadow = '0 16px 40px rgba(0,0,0,0.28)';
  box.style.textAlign = 'center';

  var msg = document.createElement('div');
  msg.textContent = message;
  msg.style.color = '#1f2937';
  msg.style.fontSize = '1rem';
  msg.style.lineHeight = '1.45';
  msg.style.marginBottom = '16px';

  var okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.textContent = 'OK';
  okBtn.style.minHeight = '40px';
  okBtn.style.padding = '8px 20px';
  okBtn.style.border = 'none';
  okBtn.style.borderRadius = '8px';
  okBtn.style.background = '#3182ce';
  okBtn.style.color = '#ffffff';
  okBtn.style.fontWeight = '700';
  okBtn.style.cursor = 'pointer';

  function close() {
    modal.remove();
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) {
    if (e.key === 'Escape') close();
  }

  okBtn.addEventListener('click', close);
  modal.addEventListener('click', function(e) {
    if (e.target === modal) close();
  });
  document.addEventListener('keydown', onEsc);

  box.appendChild(msg);
  box.appendChild(okBtn);
  modal.appendChild(box);
  document.body.appendChild(modal);
}









