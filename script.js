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
    'ge_caf':      { label: 'GE Café',      single: 'ge_caf',       type: 'advisory' },
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
  { id: 'rheem', label: 'Rheem', href: '/universal-decoder?cat=water-heaters&brand=rheem' },
  { id: 'bradford_white', label: 'Bradford White', href: '/universal-decoder?cat=water-heaters&brand=bradford_white' },
  { id: 'a_o_smith', label: 'A.O. Smith', href: '/universal-decoder?cat=water-heaters&brand=a_o_smith' },
  { id: 'state_industries', label: 'State', href: '/universal-decoder?cat=water-heaters&brand=state_industries' }
];

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
  persistSidebarOpenState(sidebarRoot);
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
  setWaterHeaterTopTierExpanded(normalizedKey === 'water-heaters');
  var categoryName = CATEGORY_KEY_TO_NAME[normalizedKey] || 'Appliances';
  moveSidebarCategoryToTop(categoryName);
  expandSidebarCategory(categoryName);
}

function toUniversalCategoryUrl(categoryName) {
  return '/universal-decoder?cat=' + encodeURIComponent(categoryNameToKey(categoryName));
}

function brandTargetHref(brandId, categoryName) {
  const pageSlug = BRAND_PAGE_BY_ID[brandId];
  if (pageSlug) return '/' + pageSlug;
  return '/universal-decoder?cat=' + encodeURIComponent(categoryNameToKey(categoryName)) + '&brand=' + encodeURIComponent(brandId);
}

function enhanceSidebarNavigation() {
  var brandsSection = null;
  document.querySelectorAll('.sidebar .sidebar-section').forEach(function(section) {
    var title = section.querySelector('.sidebar-title');
    if (!title) return;
    if (title.textContent.trim().toLowerCase() === 'brands') brandsSection = section;
  });
  if (!brandsSection) return;
  if (brandsSection.querySelector('.sidebar-brand-groups')) return;

  var brandLinks = Array.prototype.slice.call(brandsSection.querySelectorAll('a.sidebar-link'));
  if (!brandLinks.length) return;

  var grouped = { HVAC: [], 'Water Heaters': [], Appliances: [], Electronics: [], Other: [] };
  brandLinks.forEach(function(link) {
    var href = link.getAttribute('href') || '';
    var slug = href.replace(/\/+$/, '').split('/').pop().replace(/\.html$/i, '');
    var cat = sidebarCategoryForSlug(slug) || 'Other';
    grouped[cat].push(link.cloneNode(true));
  });

  var order = ['HVAC', 'Water Heaters', 'Appliances', 'Electronics', 'Other'];
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
        wa.href = wb.href;
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
    var link = document.createElement('a');
    link.className = 'sidebar-group-link';
    link.href = toUniversalCategoryUrl(catName);
    link.textContent = catName;
    link.addEventListener('click', function() {
      prioritizeSidebarCategory(categoryNameToKey(catName));
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
      if (slug) primarySlugs[slug] = true;
    });

    var extras = MORE_BRANDS_BY_CATEGORY[catName] || [];
    var remaining = overflowLinks.map(function(a) {
      var href = a.getAttribute('href') || '';
      var slug = href.replace(/\/+$/, '').split('/').pop().replace(/\.html$/i, '');
      return { slug: slug, label: a.textContent || slug, href: href };
    });
    extras.forEach(function(item) {
      var slug = (BRAND_PAGE_BY_ID[item.id] || item.id).replace(/_/g, '-');
      if (!primarySlugs[slug]) {
        remaining.push({ slug: slug, label: item.label, href: brandTargetHref(item.id, catName) });
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

    var shouldOpen = persisted.indexOf(catName) !== -1 || (currentSidebarCategory && currentSidebarCategory === catName);
    setSidebarGroupOpen(group, shouldOpen);

    btn.addEventListener('click', function() {
      var isOpen = group.classList.contains('open');
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
  brandsSection.appendChild(container);
  if (activeCategoryKey) prioritizeSidebarCategory(activeCategoryKey);
}

function syncSidebarActiveState() {
  var slug = getBrandPageSlug();
  var activeBrandSlug = slug && sidebarCategoryForSlug(slug) ? slug : '';
  var activeCategoryKey = getActiveTopCategoryKey();

  document.querySelectorAll('.sidebar-link, .sidebar-group-link, .cat-tab-link').forEach(function(el) {
    el.classList.remove('active');
  });

  var activeCatSectionLink = document.querySelector('.cat-tab-link[href="' + categoryPageHrefByKey(activeCategoryKey) + '"]');
  if (activeCatSectionLink) activeCatSectionLink.classList.add('active');

  var activeGroup = document.querySelector('.sidebar-brand-group[data-category="' + (CATEGORY_KEY_TO_NAME[activeCategoryKey] || '') + '"] .sidebar-group-link');
  if (activeGroup) activeGroup.classList.add('active');

  if (activeBrandSlug) {
    document.querySelectorAll('.sidebar-link').forEach(function(link) {
      var href = (link.getAttribute('href') || '').replace(/\/+$/, '');
      var targetSlug = href.split('/').pop().replace(/\.html$/i, '');
      if (targetSlug === activeBrandSlug) link.classList.add('active');
    });
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
  btn.textContent = 'Smart Lookup (Powered by AI)';
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
  note.textContent = 'Serial not recognized yet? Use Smart Lookup (Powered by AI) for model-based help.';

  formArea.appendChild(btn);
  formArea.appendChild(note);
}

function enhanceHeaderBranding() {
  var header = document.querySelector('.header');
  if (!header) return;
  var oldTag = header.querySelector('.header-center-tagline');
  if (oldTag) oldTag.remove();
  var oldBrand = header.querySelector('.header-brand');
  if (oldBrand) oldBrand.remove();
  var oldWrap = header.querySelector('.ia-header-wrap');
  if (oldWrap) oldWrap.remove();

  var wrap = document.createElement('div');
  wrap.className = 'ia-header-wrap';

  wrap.innerHTML = '' +
    '<div class="ia-header-left">' +
      '<a href="/" class="ia-header-brand-link" aria-label="Item Assist home">' +
        '<span class="ia-header-title">Item Assist</span>' +
        '<span class="ia-header-subtitle">Intuitive Data Aggregation</span>' +
      '</a>' +
    '</div>' +
    '<div class="ia-header-right">' +
      '<nav class="ia-header-nav" aria-label="Top navigation">' +
        '<a class="ia-nav-primary" href="/smart-lookup">Smart Lookup</a>' +
        '<a class="ia-nav-secondary" href="/methodology">Methodology</a>' +
        '<a class="ia-nav-secondary" href="/contact">Contact</a>' +
      '</nav>' +
    '</div>';
  header.appendChild(wrap);
}

function enhanceSidebarLogo() {
  var logo = document.querySelector('.sidebar-logo');
  if (!logo) return;
  if (logo.querySelector('.ia-sidebar-brand')) return;
  logo.innerHTML = '' +
    '<span class="ia-sidebar-brand">' +
      '<img class="ia-sidebar-logo" src="/ItemAssistTransparent.png" width="124" height="124" alt="Item Assist logo">' +
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
  return 'appliances';
}

function enhanceGlobalCategoryTabs() {
  var app = document.querySelector('.app-container');
  var header = app ? app.querySelector('.header') : null;
  if (!app || !header) return;
  if (app.querySelector('.global-category-tabs')) return;

  var activeKey = getActiveTopCategoryKey();
  var tabs = [
    { key: 'hvac', label: 'HVAC', href: categoryPageHrefByKey('hvac') },
    { key: 'appliances', label: 'Appliances', href: categoryPageHrefByKey('appliances') },
    { key: 'electronics', label: 'Electronics', href: categoryPageHrefByKey('electronics') },
    { key: 'water-heaters', label: 'Water Heaters', href: categoryPageHrefByKey('water-heaters') },
    { key: 'smart-lookup', label: 'Smart Lookup', href: categoryPageHrefByKey('smart-lookup') }
  ];

  var nav = document.createElement('nav');
  nav.className = 'global-category-tabs';
  nav.setAttribute('aria-label', 'Category navigation');
  tabs.forEach(function(tab) {
    var a = document.createElement('a');
    a.className = 'global-category-tab';
    if (tab.key === activeKey) a.classList.add('active');
    a.href = tab.href;
    a.textContent = tab.label;
    a.addEventListener('click', function(e) {
      if (tab.key !== 'hvac') return;
      e.preventDefault();
      fetch(categoryPageHrefByKey('hvac'), { method: 'HEAD' })
        .then(function(res) {
          if (res && res.ok) {
            window.location.href = categoryPageHrefByKey('hvac');
            return;
          }
          window.location.href = '/?cat=hvac';
        })
        .catch(function() {
          window.location.href = '/?cat=hvac';
        });
    });
    nav.appendChild(a);
  });

  header.insertAdjacentElement('afterend', nav);
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
  document.querySelectorAll('.global-category-tab').forEach(function(tab) {
    var href = tab.getAttribute('href') || '';
    var tabKey = href.replace(/^\//, '').replace(/\.html$/i, '');
    tab.classList.toggle('active', tabKey === key);
  });
}

function enhanceBrandPageEmbeddedDecoder() {
  if (!isBrandPage()) return;
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
    '<h2>About Smart Lookup (Powered by AI)</h2>' +
    '<p class="technical-methodology-subhead">Proprietary Intelligence for Missing Data</p>' +
    '<p class="technical-methodology-copy">When serial numbers are missing, incomplete, or unreadable, Smart Lookup applies proprietary intelligence across model patterns, manufacturer timelines, and known product release cycles to estimate manufacture windows with practical confidence.</p>' +
    '<ul class="technical-methodology-list">' +
      '<li><strong>Broad Search Tier:</strong> Interprets general product descriptions to identify likely era ranges and historical launch periods.</li>' +
      '<li><strong>Professional Search Tier:</strong> Uses brand, model family, series, and variant-level clues to refine results for claim-ready age estimates.</li>' +
    '</ul>' +
    '<p class="technical-methodology-copy">For best results, include the brand, full model number, and any visible version or series details from the data plate.</p>' +
    '<p class="technical-methodology-note">Designed for insurance claim accuracy and equipment lifecycle audits.</p>';
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

    for (var i = 0; i < brandSelect.options.length; i++) {
      if (brandSelect.options[i].value === ctx.brandId) {
        brandSelect.value = ctx.brandId;
        if (typeof onBrandChange === 'function') onBrandChange();
        if (typeof updateDecodeBtn === 'function') updateDecodeBtn();
        break;
      }
    }

    var serialInput = dom.serialEl;
    if (serialInput && serialInput.focus) {
      setTimeout(function() { serialInput.focus(); }, 120);
    }
  } catch (_) {}
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
  ensureSmartLookupDom();
  enhanceHeaderBranding();
  enhanceGlobalCategoryTabs();
  enhanceSidebarLogo();
  injectHeroBanner();
  enhanceSidebarCategoryLinks();
  enhanceSmartLookupSidebarTop();
  enhanceSidebarNavigation();
  syncSidebarActiveState();
  enhanceBrandPageEmbeddedDecoder();
  updateMainPageSmartLookupHelperText();
  mountSharedSmartLookupAboutSection();
  ensureFooterPrivacyPolicyLink();
  addGuidedSearchButtonToBrandDecoderCard();
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
    serialInput.addEventListener('input', updateDecodeBtn);
    serialInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') decodeSerial();
    });
    if (eraSelect) eraSelect.addEventListener('change', updateDecodeBtn);

    // URL parameter: pre-select brand/category from brand landing pages
    // e.g. index.html?brand=ge&cat=appliances
    try {
      var params = new URLSearchParams(window.location.search);
      var catParam   = params.get('cat');
      var brandParam = params.get('brand');
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
    altQuery.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') estimateAge();
    });
    altQuery.addEventListener('focus', showAltDisclaimer);
    altQuery.addEventListener('input', showAltDisclaimer);
  }

  loadBrandContext();
  syncSidebarActiveState();

  try {
    var q = new URLSearchParams(window.location.search || '');
    var serialParam = q.get('serial');
    if (serialParam && dom.serialEl) {
      dom.serialEl.value = serialParam;
      updateDecodeBtn();
    }
  } catch (_) {}
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
  // Only show era dropdown for brands with SEPARATE pre/post-2006 decoders (type:'split')
  // Advisory brands (Whirlpool, GE, etc.) already return both possible years in their output
  if (cfg && cfg.type === 'split' && brandId) {
    showEraGroup();
  } else {
    hideEraGroup();
  }
  document.getElementById('eraSelect').value = '';
}

function showEraGroup() {
  document.getElementById('eraGroup').classList.remove('hidden');
}

function hideEraGroup() {
  document.getElementById('eraGroup').classList.add('hidden');
  document.getElementById('eraSelect').value = '';
}

function resolveDecoderId(metaBrandId) {
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
  btnEl.disabled = !(brand && serial && decoderId);
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
function showDecodeFallback(decoder, serial, brandId, reason) {
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
  var exBlock = document.getElementById('resultExampleBlock');
  if (exBlock) exBlock.style.display = 'none';
  document.getElementById('resultBrand').textContent  = decoder.name;
  document.getElementById('resultMethod').textContent = decoder.method || decoder.serialLengthNote || 'Check the product label and ensure the full serial number is entered.';
  document.getElementById('resultNotes').textContent  =
    'We\u2019re sorry, our system is having trouble decoding that number. Please refer to the decoding method above.\n\nSerial entered: ' + serial;
  showBrandLogo('serialBrandLogo', brandId, decoder.name);
  currentFeedbackContext = { brand: decoder.name, serial: serial };
  fireFallbackAlert(decoder.name, serial, currentCategory, reason);
  pulseGuidedSearchButton();
  setLoadingSuccess(function() {
    document.getElementById('serialResults').classList.remove('hidden');
    document.getElementById('serialResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
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
  var moreOptions = serialResults.querySelector('.more-options-section');
  if (moreOptions) moreOptions.insertAdjacentElement('beforebegin', panel);
  else serialResults.appendChild(panel);
  panel.querySelector('#narrowDateBtn').addEventListener('click', refineAmbiguousResult);
  return panel;
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
}

// ===== SERIAL DECODE =====
function decodeSerial() {
  var dom = getDecodeDom();
  if (!dom.brandEl || !dom.serialEl) return;
  var metaBrandId = dom.brandEl.value;
  var serial = dom.serialEl.value.trim();
  if (!metaBrandId || !serial) return;

  if (isBrandPage()) {
    var currentSlug = getBrandPageSlug();
    var targetSlug = BRAND_PAGE_BY_ID[metaBrandId] || BRAND_PAGE_BY_ID[(metaBrandId || '').replace(/-/g, '_')];
    if (targetSlug && currentSlug && targetSlug !== currentSlug) {
      window.location.href = '/' + targetSlug + '?serial=' + encodeURIComponent(serial);
      return;
    }
  }

  var brandId = resolveDecoderId(metaBrandId);
  if (!brandId) {
        showCustomAlert('Please select the manufacture era for this brand.');
        return;
      }

      var decoder = decoderData[currentCategory].decoders[brandId];
      if (!decoder) { showCustomAlert('Decoder not found for this brand'); return; }

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
    // Reset row/block visibility from any previous fallback state
    (function() {
      var _yr = document.getElementById('resultYear');
      var _ae = document.getElementById('resultEstimatedAge');
      var _ex = document.getElementById('resultExampleBlock');
      if (_yr && _yr.closest) { var r1 = _yr.closest('.result-row'); if (r1) r1.style.display = ''; }
      if (_ae && _ae.closest) { var r2 = _ae.closest('.result-row'); if (r2) r2.style.display = ''; }
      if (_ex) _ex.style.display = '';
    })();

    var result = decoder.decode(serial);
    var sanity  = sanitizeDecodeResult(result);

    var isKenmore = (brandId === 'kenmore');
    var monthRow  = document.getElementById('resultMonthRow');

    if (!result || !sanity.valid) {
      var _reason = !result
        ? 'Decoder returned null for serial: ' + serial
        : (sanity.reason || 'Sanity check failed');
      showDecodeFallback(decoder, serial, brandId, _reason);
      return;
    }
    if (monthRow) monthRow.style.display = isKenmore ? 'none' : '';

    if (isKenmore) {
      document.getElementById('resultYear').textContent   = 'Varies by Manufacturer (OEM Brand)';
      document.getElementById('resultBrand').textContent  = decoder.name;
      document.getElementById('resultMethod').textContent = 'Kenmore is manufactured by multiple OEM partners. Use the first 3 digits of the MODEL number (not the serial number) to identify the actual manufacturer, then decode using their serial format.';
      document.getElementById('resultNotes').textContent  = result.month || decoder.notes || '';
    } else {
      document.getElementById('resultYear').textContent    = capYear(result.year);
      document.getElementById('resultMonth').textContent   = result.month;
      document.getElementById('resultBrand').textContent   = decoder.name;
      document.getElementById('resultMethod').textContent  = decoder.method || decoder.serialLengthNote || 'N/A';
      // Append decode detail (specific codes used for this decode)
      (function() {
        var parts = [];
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
      document.getElementById('resultNotes').textContent   = decoder.notes  || decoder.decodeNotes     || 'N/A';
    }
    // Compute derived display fields from output shape (no decode rules exposed)
    var _displayedYear = document.getElementById('resultYear').textContent;
    document.getElementById('resultEstimatedAge').textContent = computeEstimatedAge(_displayedYear);

    document.getElementById('resultExample').textContent = decoder.exampleSerial
      ? decoder.exampleSerial + ' → ' + decoder.exampleResult
      : 'N/A';

    showBrandLogo('serialBrandLogo', brandId, decoder.name);
    currentFeedbackContext = { brand: decoder.name, serial: serial };

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
function copyClaimFile() {
  var yearEl = document.getElementById('resultYear');
  if (!yearEl) return;
  var year = yearEl.textContent.trim();
  if (!year) return;
  var monthEl = document.getElementById('resultMonth');
  var brandEl = document.getElementById('resultBrand');
  var ageEl = document.getElementById('resultEstimatedAge');
  var methodEl = document.getElementById('resultMethod');
  var notesEl = document.getElementById('resultNotes');
  var exampleEl = document.getElementById('resultExample');
  var month = monthEl ? monthEl.textContent.trim() : '';
  var brand = brandEl ? brandEl.textContent.trim() : '';
  var age = ageEl ? ageEl.textContent.trim() : '';
  var method = methodEl ? methodEl.textContent.trim() : '';
  var notes = notesEl ? notesEl.textContent.trim() : '';
  var example = exampleEl ? exampleEl.textContent.trim() : '';
  var monthRow = document.getElementById('resultMonthRow');
  var monthVisible = true;
  if (monthRow && window.getComputedStyle) {
    monthVisible = window.getComputedStyle(monthRow).display !== 'none';
  }

  var lines = [
    'Decoded Results',
    'Brand: ' + brand,
    'Manufacture Date: ' + year,
  ];
  if (monthVisible && month) lines.push('Month / Period: ' + month);
  if (age) lines.push('Estimated Age: ' + age);
  if (method) lines.push('Methodology: ' + method);
  if (notes) lines.push('Important Notes: ' + notes);
  if (example) lines.push('Example: ' + example);

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
  if (altQuery) altQuery.value = '';
  if (document.getElementById('eraGroup')) hideEraGroup();
  var refinePanel = document.querySelector('.narrow-date-panel');
  if (refinePanel) refinePanel.classList.add('hidden');
  var refineOut = document.getElementById('narrowDateOutput');
  if (refineOut) refineOut.innerHTML = '';
  updateDecodeBtn();
  var main = document.querySelector('.main-card');
  if (main && main.scrollIntoView) {
    main.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  setTimeout(function() {
    if (serialInput) serialInput.focus();
    else if (altQuery) altQuery.focus();
  }, 300);
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
  try {
    var size = 48;
    var canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.font         = (size - 4) + 'px serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'center';
    ctx.fillText(emoji, size / 2, size / 2);
    var dataUrl  = canvas.toDataURL();
    var hotspot  = Math.round(size / 2);
    var cursorCSS = 'url(' + dataUrl + ') ' + hotspot + ' ' + hotspot + ', auto';
    // Inject/update a global <style> so !important overrides every element's
    // own cursor rule (buttons, inputs, selects, links, etc.)
    if (!_cursorStyleEl) {
      _cursorStyleEl = document.createElement('style');
      document.head.appendChild(_cursorStyleEl);
    }
    _cursorStyleEl.textContent = '* { cursor: ' + cursorCSS + ' !important; }';
  } catch (e) {
    document.body.style.cursor = 'wait';
  }
}

function clearEmojiCursor() {
  document.body.style.cursor = '';
  if (_cursorStyleEl) { _cursorStyleEl.textContent = ''; }
}

// ===== LOADING STATE (🌩️ → ☀️) =====
function setLoadingActive() {
  var emoji   = document.getElementById('loadingEmoji');
  var loading = document.getElementById('ageLoading');
  // Hide placeholder once a search has started
  var placeholder = document.getElementById('resultsPlaceholder');
  if (placeholder) placeholder.classList.add('hidden');
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
    if (callback) callback();
  }, 600);
}

function setLoadingHidden() {
  document.getElementById('ageLoading').classList.add('hidden');
  clearEmojiCursor();
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

// ===== ESTIMATE AGE =====
async function estimateAge() {
  var inputEl = getSmartLookupInputEl();
  if (!inputEl || !document.getElementById('smart-lookup-input')) return;
  var query = inputEl.value.trim();
  if (!query) return;

  document.getElementById('ageResults').classList.add('hidden');
  document.getElementById('serialResults').classList.add('hidden');
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
      body: JSON.stringify({ query: query }),
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

    if (data.error) {
      setLoadingHidden();
      showSmartLookupNotice('limit', esc(data.error));
      return;
    }

    var body = getSmartLookupResultsEl();
    var html = '';

    // Invention summary for generic/category-only queries
    if (data.inventionSummary) {
      html += '<div class="info-block invention-summary"><h4>About This Product Category</h4><p>' + esc(data.inventionSummary) + '</p></div>';
    }

    if (data.brand) {
      html += '<div class="result-row"><span class="result-label">Brand</span><span class="result-value">' + esc(data.brand) + '</span></div>';
    }
    if (data.model) {
      html += '<div class="result-row"><span class="result-label">Model</span><span class="result-value">' + esc(data.model) + '</span></div>';
    }
    if (data.estimatedYear) {
      html += '<div class="result-row"><span class="result-label">Estimated Year</span><span class="result-value">' + esc(capYear(data.estimatedYear)) + '</span></div>';
    }
    if (data.yearRange) {
      html += '<div class="result-row"><span class="result-label">Production Range</span><span class="result-value">' + esc(data.yearRange) + '</span></div>';
    }
    if (data.notes) {
      html += '<div class="info-block notes"><h4>Notes</h4><p>' + esc(data.notes) + '</p></div>';
    }
    if (data.serialLocation) {
      html += '<div class="info-block serial-loc"><h4>Where to Find the Serial Number</h4><p>' + esc(data.serialLocation) + '</p></div>';
    }
    if (data.serialRule) {
      html += '<div class="info-block serial-rule"><h4>Serial Number Decoding Hint</h4><p>' + esc(data.serialRule) + '</p></div>';
    }
    if (data.refinementSuggestion) {
      html += '<div class="info-block refinement"><h4>Get More Accurate Results</h4><p>' + esc(data.refinementSuggestion) + '</p></div>';
    }
    // Suppress model tips if query looks like a serial number (9+ compact alphanumeric, no spaces)
    var queryIsSerialLike = /^[a-zA-Z0-9]{9,}$/.test(query);

    // Tip: generic description → show one example model number as a clickable chip
    if (!queryIsSerialLike && data.exampleModelNumber) {
      html += '<div class="tip-block">';
      html += '<div class="tip-row"><span class="tip-label">&#128161; Tip</span><span class="tip-text">You\'ll get more accurate results if you enter the model number.</span></div>';
      html += '<div class="tip-chips"><button class="suggestion-chip" data-model="' + esc(data.exampleModelNumber) + '" onclick="clickSuggestion(this.dataset.model)">' + esc(data.exampleModelNumber) + '</button></div>';
      html += '</div>';
    }

    // Tip: partial model prefix → show 2–3 completions as clickable chips
    if (!queryIsSerialLike && data.suggestedModelNumbers && data.suggestedModelNumbers.length > 0) {
      html += '<div class="tip-block">';
      html += '<div class="tip-row"><span class="tip-label">&#128161;</span><span class="tip-text">Try one of these similar model numbers:</span></div>';
      html += '<div class="tip-chips">';
      data.suggestedModelNumbers.forEach(function(m) {
        html += '<button class="suggestion-chip" data-model="' + esc(m) + '" onclick="clickSuggestion(this.dataset.model)">' + esc(m) + '</button>';
      });
      html += '</div></div>';
    }

    body.innerHTML = html;
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
  if (input) input.value = modelNum;
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
