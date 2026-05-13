// ===== ROUTE NORMALIZATION =====
(function normalizeHtmlRoutes() {
  var path = window.location.pathname;
  var cleanRoutes = [
    '/decoder-tool', '/smart-lookup', '/assistant',
    '/ge', '/whirlpool', '/samsung', '/lg', '/bosch', '/maytag', '/frigidaire', '/kenmore',
    '/apple', '/hp', '/asus', '/google-pixel', '/sony', '/vizio', '/panasonic',
    '/carrier', '/goodman', '/trane', '/rheem',
    '/methodology', '/contact', '/feedback', '/security', '/privacy-policy',
    '/about', '/brands', '/hvac', '/appliances', '/electronics', '/water-heaters',
    '/universal-decoder', '/disclaimer', '/replacement-lookup', '/appliance-age-estimator',
    '/tv-replacement-guide', '/hvac-replacement-guide'
  ];
  if (path === '/' || path.endsWith('.html') || path.indexOf('.') !== -1) return;
  if (cleanRoutes.some(function(r) { return path === r || path.startsWith(r + '/'); })) return;
  var normalized = path.replace(/\/$/, '') + '.html';
  if (path === '/' || path.includes('index')) {
    window.location.replace(normalized + window.location.search);
  }
})();

(function loadBoltAiAssistBubble() {
  var path = window.location.pathname || '';
  if (path === '/assistant' || path.endsWith('/assistant.html') || path.endsWith('assistant.html')) return;
  if (document.getElementById('bolt-ai-bubble-script')) return;
  var script = document.createElement('script');
  script.id = 'bolt-ai-bubble-script';
  script.src = '/components/chat/chat-bubble.js';
  document.head.appendChild(script);
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

// ===== MOBILE BRAND-FIRST CATEGORY FLOW =====
var MOBILE_BRAND_CATEGORIES = null;
var BRAND_CATEGORIES = {};
var NORMALIZED_BRAND_CACHE = null;

var MOBILE_CAT_LABELS = {
  appliances:   '🏠 Appliances',
  waterHeaters: '💧 Water Heaters',
  hvac:         '❄️ HVAC',
  electronics:  '📺 Electronics'
};

var BRAND_CATEGORY_LABELS = {
  appliances: 'Appliances',
  waterHeaters: 'Water Heaters',
  hvac: 'HVAC',
  electronics: 'Electronics'
};

var BRAND_DIRECTORY_LOGOS = {
  'apple': { src: 'https://cdn.simpleicons.org/apple', alt: 'Apple logo', type: 'symbol' },
  'asus': { src: 'https://cdn.simpleicons.org/asus', alt: 'ASUS logo', type: 'wordmark' },
  'bosch': { src: 'https://cdn.simpleicons.org/bosch', alt: 'Bosch logo', type: 'wordmark' },
  'ge': { src: 'https://cdn.simpleicons.org/generalelectric', alt: 'GE logo', type: 'symbol' },
  'ge_monogram': { src: 'https://cdn.simpleicons.org/generalelectric', alt: 'GE Monogram logo', type: 'symbol' },
  'ge_profile': { src: 'https://cdn.simpleicons.org/generalelectric', alt: 'GE Profile logo', type: 'symbol' },
  'google_pixel': { src: 'https://cdn.simpleicons.org/google', alt: 'Google logo', type: 'symbol' },
  'hp': { src: 'https://cdn.simpleicons.org/hp', alt: 'HP logo', type: 'symbol' },
  'lg': { src: 'https://cdn.simpleicons.org/lg', alt: 'LG logo', type: 'symbol' },
  'maytag': { src: 'https://cdn.simpleicons.org/maytag', alt: 'Maytag logo', type: 'wordmark' },
  'panasonic': { src: 'https://cdn.simpleicons.org/panasonic', alt: 'Panasonic logo', type: 'wordmark' },
  'samsung': { src: 'https://cdn.simpleicons.org/samsung', alt: 'Samsung logo', type: 'wordmark' },
  'sony': { src: 'https://cdn.simpleicons.org/sony', alt: 'Sony logo', type: 'wordmark' }
};

var BRAND_DIRECTORY_PRIMARY_CATEGORY_OVERRIDES = {
  amana: 'appliances',
  ge: 'appliances',
  lg: 'appliances',
  rheem: 'waterHeaters',
  ruud: 'hvac',
  samsung: 'appliances',
  whirlpool: 'appliances'
};

var BRAND_DIRECTORY_CATEGORY_PRIORITY = ['appliances', 'electronics', 'hvac', 'waterHeaters'];
var BRAND_DIRECTORY_CACHE = null;

var BRAND_NORMALIZER_PRESERVE_IDS = {
  whirlpool_water_heaters: true
};

function isMobileView() {
  return window.innerWidth <= 768;
}

function getBrandCategoryLabel(categoryKey) {
  return BRAND_CATEGORY_LABELS[normalizeDecoderCategory(categoryKey)] || String(categoryKey || '');
}

function slugifyUiBrandId(name, fallbackId) {
  var raw = String(name || '').trim().toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return raw || String(fallbackId || '').trim().toLowerCase();
}

function getNormalizedBrandMeta(brand, categoryKey) {
  var rawName = String((brand && brand.name) || '').trim();
  var brandId = String((brand && brand.id) || '').trim();
  var baseName = rawName;

  if (!BRAND_NORMALIZER_PRESERVE_IDS[brandId]) {
    if (normalizeDecoderCategory(categoryKey) === 'waterHeaters' && /\s+Water Heaters$/i.test(baseName)) {
      baseName = baseName.replace(/\s+Water Heaters$/i, '').trim();
    } else if (normalizeDecoderCategory(categoryKey) === 'electronics') {
      var match = baseName.match(/^(.*?)\s+\(([^)]+)\)$/);
      if (match && /(tv|monitor|phone|tablet)/i.test(match[2])) {
        baseName = match[1].trim();
      }
    }
  }

  return {
    uiId: slugifyUiBrandId(baseName, brandId),
    displayName: baseName || rawName || brandId,
    categoryLabel: getBrandCategoryLabel(categoryKey)
  };
}

function getNormalizedBrandCatalog() {
  if (NORMALIZED_BRAND_CACHE) return NORMALIZED_BRAND_CACHE;
  if (!hasDecoderData()) return { byCategory: {}, byUiId: {}, brandCategories: {} };
  syncDecoderDataRef();

  var byCategory = {};
  var byUiId = {};
  var brandCategories = {};

  Object.keys(decoderData).forEach(function(categoryKey) {
    var category = decoderData[categoryKey];
    if (!category || !category.brands) return;

    var categoryEntries = {};
    category.brands.forEach(function(brand) {
      if (!brand || !brand.id) return;

      var meta = getNormalizedBrandMeta(brand, categoryKey);
      var resolvedDecoderId = brand.id;
      if (!category.decoders[resolvedDecoderId]) {
        var fallbackDecoderId = normalizeBrandId(brand.id);
        if (category.decoders[fallbackDecoderId]) resolvedDecoderId = fallbackDecoderId;
      }
      if (!categoryEntries[meta.uiId]) {
        categoryEntries[meta.uiId] = {
          id: meta.uiId,
          name: meta.displayName,
          categoryKey: categoryKey,
          categoryLabel: meta.categoryLabel,
          decoderIds: [],
          primaryDecoderId: ''
        };
      }

      var entry = categoryEntries[meta.uiId];
      if (entry.decoderIds.indexOf(resolvedDecoderId) === -1) entry.decoderIds.push(resolvedDecoderId);
      if (!entry.primaryDecoderId) entry.primaryDecoderId = resolvedDecoderId;

      if (!byUiId[meta.uiId]) {
        byUiId[meta.uiId] = { id: meta.uiId, name: meta.displayName, categories: [] };
      }
      if (byUiId[meta.uiId].categories.indexOf(categoryKey) === -1) {
        byUiId[meta.uiId].categories.push(categoryKey);
      }

      if (!brandCategories[meta.displayName]) brandCategories[meta.displayName] = [];
      if (brandCategories[meta.displayName].indexOf(meta.categoryLabel) === -1) {
        brandCategories[meta.displayName].push(meta.categoryLabel);
      }
    });

    byCategory[categoryKey] = Object.keys(categoryEntries).map(function(key) {
      return categoryEntries[key];
    }).sort(function(a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
  });

  Object.keys(byUiId).forEach(function(uiId) {
    byUiId[uiId].categories.sort(function(a, b) {
      return String(getBrandCategoryLabel(a)).localeCompare(String(getBrandCategoryLabel(b)), undefined, { sensitivity: 'base' });
    });
  });
  Object.keys(brandCategories).forEach(function(name) {
    brandCategories[name].sort(function(a, b) {
      return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    });
  });

  BRAND_CATEGORIES = brandCategories;
  NORMALIZED_BRAND_CACHE = {
    byCategory: byCategory,
    byUiId: byUiId,
    brandCategories: brandCategories
  };
  return NORMALIZED_BRAND_CACHE;
}

function getNormalizedBrandEntry(categoryKey, uiBrandId) {
  var catalog = getNormalizedBrandCatalog();
  var list = catalog.byCategory[normalizeDecoderCategory(categoryKey)] || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === uiBrandId) return list[i];
  }
  return null;
}

function getCategoryDropdownBrands(categoryKey) {
  var normalizedCategory = normalizeDecoderCategory(categoryKey);
  var catalog = getNormalizedBrandCatalog();
  var entries = catalog.byCategory[normalizedCategory] || [];
  var cyclingCat = CYCLING_BRANDS[normalizedCategory] || {};
  var seen = {};
  var brands = [];

  entries.forEach(function(entry) {
    var displayId = entry.id;
    var displayName = entry.name;
    var isCycling = false;

    Object.keys(cyclingCat).forEach(function(baseId) {
      var cfg = cyclingCat[baseId];
      if (!cfg) return;
      var decoderIds = entry.decoderIds || [];
      if (decoderIds.indexOf(cfg.post) !== -1 || decoderIds.indexOf(cfg.pre) !== -1 || decoderIds.indexOf(cfg.single) !== -1) {
        displayId = baseId;
        displayName = cfg.label || entry.name;
        isCycling = true;
      }
    });

    if (!seen[displayId]) {
      seen[displayId] = true;
      brands.push({ id: displayId, name: displayName, cycling: isCycling });
    }
  });

  brands.sort(function(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  });
  return brands;
}

function getCategoryControlId(categoryKey, rawBrandId) {
  var normalizedCategory = normalizeDecoderCategory(categoryKey);
  var cyclingCat = CYCLING_BRANDS[normalizedCategory] || {};
  var controlId = rawBrandId;
  Object.keys(cyclingCat).forEach(function(baseId) {
    var cfg = cyclingCat[baseId];
    if (!cfg) return;
    if (cfg.post === rawBrandId || cfg.pre === rawBrandId || cfg.single === rawBrandId) {
      controlId = baseId;
    }
  });
  return controlId;
}

function normalizeBrandDirectoryName(rawName, categoryKey) {
  var name = String(rawName || '').trim();
  if (normalizeDecoderCategory(categoryKey) === 'waterHeaters') {
    name = name.replace(/\s+Water Heaters$/i, '').trim();
  }
  if (normalizeDecoderCategory(categoryKey) === 'electronics') {
    var match = name.match(/^(.*?)\s+\(([^)]+)\)$/);
    if (match && /(tv|monitor|phone|tablet)/i.test(match[2])) {
      name = match[1].trim();
    }
  }
  name = name.replace(/\s+\((?:post|pre)-\d{4}\)$/i, '').trim();
  return name;
}

function slugifyBrandDirectoryKey(name, fallbackId) {
  return slugifyUiBrandId(name, fallbackId).replace(/^a_o_/, 'a_o_');
}

function getBrandDirectoryCategorySummary(categories) {
  return categories.map(function(categoryKey) {
    return getBrandCategoryLabel(categoryKey);
  }).join(' • ');
}

function getBrandDirectoryLogoMeta(item) {
  var logo = BRAND_DIRECTORY_LOGOS[item.slug] || null;
  if (logo) return logo;
  if (item.slug === 'google_pixel' && BRAND_DIRECTORY_LOGOS.google_pixel) return BRAND_DIRECTORY_LOGOS.google_pixel;
  return { src: '', alt: '', type: 'none' };
}

function getBrandDirectoryItems() {
  if (BRAND_DIRECTORY_CACHE) return BRAND_DIRECTORY_CACHE;
  if (!hasDecoderData()) return [];
  syncDecoderDataRef();

  var map = {};

  Object.keys(decoderData).forEach(function(categoryKey) {
    var category = decoderData[categoryKey];
    if (!category || !category.brands) return;

    category.brands.forEach(function(brand) {
      if (!brand || !brand.id) return;

      var name = normalizeBrandDirectoryName(brand.name, categoryKey);
      var controlId = getCategoryControlId(categoryKey, brand.id);
      var slug = slugifyBrandDirectoryKey(name, controlId || brand.id);
      if (!map[slug]) {
        map[slug] = {
          slug: slug,
          name: name,
          href: '#decoder-tool',
          categories: [],
          categorySet: {},
          prefillByCategory: {}
        };
      }

      if (!map[slug].categorySet[categoryKey]) {
        map[slug].categorySet[categoryKey] = true;
        map[slug].categories.push(categoryKey);
      }
      if (!map[slug].prefillByCategory[categoryKey]) {
        map[slug].prefillByCategory[categoryKey] = controlId || brand.id;
      }
    });
  });

  BRAND_DIRECTORY_CACHE = Object.keys(map).map(function(slug) {
    var item = map[slug];
    item.categories.sort(function(a, b) {
      return BRAND_DIRECTORY_CATEGORY_PRIORITY.indexOf(a) - BRAND_DIRECTORY_CATEGORY_PRIORITY.indexOf(b);
    });

    var preferredCategory = BRAND_DIRECTORY_PRIMARY_CATEGORY_OVERRIDES[slug];
    if (!preferredCategory || item.categories.indexOf(preferredCategory) === -1) {
      preferredCategory = item.categories[0];
    }
    item.prefillCat = preferredCategory;
    item.prefillBrand = item.prefillByCategory[preferredCategory] || '';
    item.categorySummary = getBrandDirectoryCategorySummary(item.categories);

    var logo = getBrandDirectoryLogoMeta(item);
    item.logoSrc = logo.src || '';
    item.logoAlt = logo.alt || '';
    item.logoType = logo.type || 'none';
    return item;
  }).sort(function(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  });

  return BRAND_DIRECTORY_CACHE;
}

function buildMobileBrandCategoriesMap() {
  if (MOBILE_BRAND_CATEGORIES) return MOBILE_BRAND_CATEGORIES;
  var map = {};
  Object.keys(decoderData || {}).forEach(function(categoryKey) {
    getCategoryDropdownBrands(categoryKey).forEach(function(brand) {
      if (!map[brand.id]) map[brand.id] = [];
      if (map[brand.id].indexOf(categoryKey) === -1) map[brand.id].push(categoryKey);
    });
  });
  MOBILE_BRAND_CATEGORIES = map;
  return map;
}

function populateMobileBrands() {
  var sel = document.getElementById('brand');
  if (!sel || !hasDecoderData()) return;
  var seen = {};
  var allBrands = [];
  Object.keys(decoderData || {}).forEach(function(categoryKey) {
    getCategoryDropdownBrands(categoryKey).forEach(function(brand) {
      if (seen[brand.id]) return;
      seen[brand.id] = true;
      allBrands.push({ id: brand.id, name: brand.name });
    });
  });
  allBrands.sort(function(a, b) {
    return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
  });
  sel.innerHTML = '<option value="">-- Select Brand --</option>';
  allBrands.forEach(function(b) {
    var opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    sel.appendChild(opt);
  });
}

function getMobileItemTypeSelect() {
  return document.getElementById('mobileItemType');
}

function ensureMobileItemTypeSelect() {
  var existing = getMobileItemTypeSelect();
  if (existing) return existing;
  var brandSel = document.getElementById('brand');
  if (!brandSel) return null;
  var sel = document.createElement('select');
  sel.id = 'mobileItemType';
  sel.className = 'search-select';
  sel.style.display = 'none';
  sel.setAttribute('aria-label', 'Item Type');
  sel.addEventListener('change', onMobileItemTypeChange);
  brandSel.parentNode.insertBefore(sel, brandSel.nextSibling);
  return sel;
}

function onMobileItemTypeChange() {
  var sel = getMobileItemTypeSelect();
  if (!sel || !sel.value) return;
  var cat = sel.value;
  currentCategory = normalizeDecoderCategory(cat);
  document.querySelectorAll('.cat-tab').forEach(function(t) {
    t.classList.toggle('active', t.getAttribute('data-cat') === cat);
  });
  updateDecodeBtn();
}

function updateMobileItemTypeDropdown(brandId) {
  var itSel = getMobileItemTypeSelect();
  if (!brandId) {
    if (itSel) itSel.style.display = 'none';
    return;
  }
  var map = buildMobileBrandCategoriesMap();
  var cats = map[brandId] || ['appliances'];
  if (cats.length >= 2) {
    var sel = ensureMobileItemTypeSelect();
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Item Type --</option>';
    cats.forEach(function(cat) {
      var opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = MOBILE_CAT_LABELS[cat] || cat;
      sel.appendChild(opt);
    });
    sel.value = cats[0];
    currentCategory = normalizeDecoderCategory(cats[0]);
    document.querySelectorAll('.cat-tab').forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-cat') === cats[0]);
    });
    sel.style.display = '';
  } else {
    var cat = cats[0];
    currentCategory = normalizeDecoderCategory(cat);
    document.querySelectorAll('.cat-tab').forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-cat') === cat);
    });
    if (itSel) itSel.style.display = 'none';
  }
}

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
var decoderData = window.decoderData || null;
var DECODER_DATA_SCRIPT_ID = 'decoder-data-script';
var decoderDataLoadCallbacks = [];

function toggleSidebar() {
  document.body.classList.toggle('sidebar-open');
}
var currentFeedbackContext = {};
var CURRENT_YEAR = new Date().getFullYear();

function trackAnalyticsEvent(name, payload) {
  try {
    if (window.ItemAssistAnalytics && typeof window.ItemAssistAnalytics.track === 'function') {
      window.ItemAssistAnalytics.track(name, payload || {});
    }
  } catch (_) {}
}

function trackSmartLookupEvent(name, payload) {
  var inputEl = getSmartLookupInputEl ? getSmartLookupInputEl() : null;
  var query = payload && payload.query ? payload.query : normalizeSmartLookupQuery((inputEl && inputEl.value) || '');
  trackAnalyticsEvent(name, Object.assign({
    context: 'smart-lookup',
    query: query,
    mobile: !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches)
  }, payload || {}));
}
var KENMORE_DEFAULT_NOTE = 'For more accurate results, please enter the first 3 digits of your Kenmore model number.';
var DECODER_FORM_STATE = {
  appliances: { brand: '', model: '' },
  waterHeaters: { brand: '', model: '' },
  hvac: { brand: '', model: '' },
  electronics: { brand: '', model: '' }
};
var KENMORE_PREFIX_TO_DECODER = {
  '106': { manufacturer: 'Whirlpool', decoderId: 'whirlpool' },
  '110': { manufacturer: 'Whirlpool', decoderId: 'whirlpool' },
  '198': { manufacturer: 'Whirlpool', decoderId: 'whirlpool' },
  '562': { manufacturer: 'Whirlpool', decoderId: 'whirlpool' },
  '665': { manufacturer: 'Whirlpool', decoderId: 'whirlpool' },
  '103': { manufacturer: 'Roper', decoderId: 'roper' },
  '155': { manufacturer: 'Roper', decoderId: 'roper' },
  '278': { manufacturer: 'Roper', decoderId: 'roper' },
  '647': { manufacturer: 'Roper', decoderId: 'roper' },
  '835': { manufacturer: 'Roper', decoderId: 'roper' },
  '911': { manufacturer: 'Roper', decoderId: 'roper' },
  '596': { manufacturer: 'Amana', decoderId: 'amana_post_2006' },
  '174': { manufacturer: 'Caloric', decoderId: 'maytag_pre_2006' },
  '960': { manufacturer: 'Caloric', decoderId: 'maytag_pre_2006' },
  '629': { manufacturer: 'Jenn-Air', decoderId: 'jenn_air_pre_2006' },
  '747': { manufacturer: 'Litton', decoderId: 'maytag_pre_2006' },
  '925': { manufacturer: 'Maycor', decoderId: 'maytag_pre_2006' },
  '651': { manufacturer: 'Speed Queen', decoderId: 'maytag_pre_2006' },
  '253': { manufacturer: 'Gibson', decoderId: 'gibson' },
  '417': { manufacturer: 'Kelvinator', decoderId: 'kelvinator' },
  '662': { manufacturer: 'Kelvinator', decoderId: 'kelvinator' },
  '628': { manufacturer: 'Kelvinator', decoderId: 'kelvinator' },
  '795': {
    manufacturer: 'LG',
    decoderId: 'lg',
    productCategory: 'Refrigerator',
    notes: 'LG-built Kenmore refrigerators use LG appliance serial rules. The year digit repeats every 10 years, so model era and features help resolve the decade.'
  },
  '791': { manufacturer: 'Tappan', decoderId: 'tappan' },
  '790': { manufacturer: 'WCI', decoderId: 'white_consolidated_industries_wci' },
  '362': { manufacturer: 'General Electric', decoderId: 'ge' },
  '363': { manufacturer: 'General Electric', decoderId: 'ge' }
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
  'samsung-tv-serial-number-decoder': 'Electronics',
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
  'samsung_tv': 'samsung-tv-serial-number-decoder',
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
  'appliances': ['whirlpool', 'ge', 'frigidaire', 'lg', 'samsung'],
  'hvac': ['goodman', 'carrier', 'trane', 'rheem', 'lennox'],
  'electronics': ['samsung', 'sony', 'lg', 'vizio', 'panasonic'],
  'water-heaters': ['rheem', 'a_o_smith', 'bradford_white', 'state_industries', 'whirlpool_water_heaters']
};
var MOST_COMMON_APPLIANCE_BRANDS = {
  amana: true,
  bosch: true,
  cafe: true,
  electrolux: true,
  frigidaire: true,
  ge: true,
  hotpoint: true,
  kenmore: true,
  kitchenaid: true,
  lg: true,
  maytag: true,
  samsung: true,
  whirlpool: true
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

function hasDecoderData() {
  return !!(window.decoderData && typeof window.decoderData === 'object');
}

function syncDecoderDataRef() {
  if (hasDecoderData()) {
    decoderData = window.decoderData;
  }
  return decoderData;
}

function flushDecoderDataCallbacks(error) {
  var callbacks = decoderDataLoadCallbacks.slice();
  decoderDataLoadCallbacks = [];
  callbacks.forEach(function(cb) {
    if (typeof cb !== 'function') return;
    try {
      cb(error || null);
    } catch (_) {}
  });
}

function ensureDecoderDataLoaded(callback) {
  if (typeof callback === 'function') {
    decoderDataLoadCallbacks.push(callback);
  }
  if (hasDecoderData()) {
    syncDecoderDataRef();
    flushDecoderDataCallbacks(null);
    return;
  }
  if (document.getElementById('decoder-data-script')) {
    return; // already loading
  }
  var s = document.createElement('script');
  s.id = 'decoder-data-script';
  s.src = '/decoder-data.js';
  s.onload = function() {
    syncDecoderDataRef();
    flushDecoderDataCallbacks(null);
  };
  s.onerror = function() {
    flushDecoderDataCallbacks(new Error('decoder-data.js failed to load'));
  };
  document.head.appendChild(s);
}

function initializeDecoderUiWhenReady() {
  if (!hasDecoderData()) return;
  syncDecoderDataRef();

  var dom = getDecodeDom();
  var brandSelect = dom.brandEl;
  var serialInput = dom.serialEl;
  var eraSelect = document.getElementById('eraSelect');
  if (!brandSelect || !serialInput) return;
  if (brandSelect.getAttribute('data-decoder-ui-ready') === '1') {
    updateDecodeBtn();
    return;
  }

  brandSelect.setAttribute('data-decoder-ui-ready', '1');

  var initialCategory = 'appliances';
  var resetHomeSearch = shouldResetHomePageSearch();
  try {
    var initParams = new URLSearchParams(window.location.search || '');
    var initCat = initParams.get('cat');
    if (resetHomeSearch) initialCategory = 'appliances';
    else if (initCat) initialCategory = categoryNameToKey(initCat);
    else if (window.DEFAULT_CATEGORY) initialCategory = categoryNameToKey(window.DEFAULT_CATEGORY);
    else initialCategory = getSavedCategoryKey() || 'appliances';
  } catch (_) {
    initialCategory = getSavedCategoryKey() || 'appliances';
  }

  currentCategory = normalizeDecoderCategory(initialCategory);
  if (isMobileView()) {
    populateMobileBrands();
    ensureMobileItemTypeSelect();
  } else {
    populateBrands(currentCategory);
  }
  syncGlobalCategoryTabs(initialCategory);
  saveCategoryKey(initialCategory);
  applyBrandDefaultFromSlug();
  ensureBrandAliasSearch();

  if (brandSelect.getAttribute('data-brand-bound') !== '1') {
    brandSelect.setAttribute('data-brand-bound', '1');
    brandSelect.addEventListener('change', function() {
      clearDecodeEntryFields({ categoryKey: getActiveDecoderCategory(), clearEra: true });
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

  try {
    var params = new URLSearchParams(window.location.search);
    var catParam = params.get('cat');
    var brandParam = params.get('brand');
    brandParam = normalizeBrandId(brandParam);
    if (!resetHomeSearch && !catParam && window.DEFAULT_CATEGORY) catParam = window.DEFAULT_CATEGORY;
    if (!resetHomeSearch && catParam) {
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
    if (!resetHomeSearch && brandParam) {
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
  } catch (_) {}

  if (resetHomeSearch) {
    resetHomePageSearch();
  }

  updateDecodeBtn();
}

function bindDecoderDataLoadTriggers() {
  var dom = getDecodeDom();
  var brandSelect = dom.brandEl;
  var serialInput = dom.serialEl;
  var decodeBtn = dom.btnEl;

  var onInteraction = function(event) {
    if (event && event.isTrusted === false) return;
    ensureDecoderDataLoaded(function(error) {
      if (error) return;
      initializeDecoderUiWhenReady();
    });
  };

  if (serialInput && serialInput.getAttribute('data-decoder-load-bound') !== '1') {
    serialInput.setAttribute('data-decoder-load-bound', '1');
    serialInput.addEventListener('focus', onInteraction);
    serialInput.addEventListener('click', onInteraction);
  }

  if (brandSelect && brandSelect.getAttribute('data-decoder-load-bound') !== '1') {
    brandSelect.setAttribute('data-decoder-load-bound', '1');
    brandSelect.addEventListener('focus', onInteraction);
    brandSelect.addEventListener('click', onInteraction);
  }

  if (decodeBtn && decodeBtn.getAttribute('data-decoder-load-bound') !== '1') {
    decodeBtn.setAttribute('data-decoder-load-bound', '1');
    decodeBtn.addEventListener('click', onInteraction);
  }

  document.querySelectorAll('.cat-tab').forEach(function(tab) {
    if (tab.getAttribute('data-decoder-load-bound') === '1') return;
    tab.setAttribute('data-decoder-load-bound', '1');
    tab.addEventListener('click', onInteraction);
  });
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

function getDecoderCategoryState(catKey) {
  var key = normalizeDecoderCategory(catKey);
  if (!DECODER_FORM_STATE[key]) DECODER_FORM_STATE[key] = { brand: '', model: '' };
  return DECODER_FORM_STATE[key];
}

function getActiveDecoderCategory() {
  var activeTab = document.querySelector('.cat-tab.active');
  var activeCat = activeTab ? activeTab.getAttribute('data-cat') : '';
  return normalizeDecoderCategory(activeCat || currentCategory || 'appliances');
}

function getSelectedBrandForCategory(catKey) {
  return getDecoderCategoryState(catKey).brand || '';
}

function setSelectedBrandForCategory(catKey, brandId) {
  getDecoderCategoryState(catKey).brand = brandId || '';
}

function getStoredSupplementalModel(catKey) {
  return getDecoderCategoryState(catKey).model || '';
}

function setStoredSupplementalModel(catKey, value) {
  getDecoderCategoryState(catKey).model = value || '';
}

function clearDecodeEntryFields(options) {
  options = options || {};
  var category = options.categoryKey || getActiveDecoderCategory();
  var dom = getDecodeDom();
  var serialEl = dom.serialEl;
  var modelEl = document.getElementById('modelNumber');
  var eraEl = document.getElementById('eraSelect');
  var kenmorePrefixEl = document.getElementById('kenmoreModelPrefix');

  if (serialEl) serialEl.value = '';
  setStoredSupplementalModel(category, '');
  if (modelEl) modelEl.value = '';
  if (kenmorePrefixEl) kenmorePrefixEl.value = '';
  if (options.clearEra && eraEl) eraEl.value = '';
  clearSupplementalModelError();
}

function extractKenmoreModelPrefix(modelValue) {
  return String(modelValue || '').replace(/\D/g, '').substring(0, 3);
}

function clearSupplementalModelError() {
  var errorEl = document.getElementById('modelFieldError');
  var inputEl = document.getElementById('modelNumber');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
  if (inputEl) {
    inputEl.removeAttribute('aria-invalid');
    inputEl.removeAttribute('aria-describedby');
  }
}

function showSupplementalModelError(message) {
  var errorEl = document.getElementById('modelFieldError');
  var inputEl = document.getElementById('modelNumber');
  if (!errorEl || !inputEl) return;
  errorEl.textContent = sanitizeAlertText(message || 'This field is required.');
  errorEl.classList.remove('hidden');
  inputEl.setAttribute('aria-invalid', 'true');
  inputEl.setAttribute('aria-describedby', 'modelFieldError');
}

function getSupplementalModelConfig(category, brandId) {
  var catKey = normalizeDecoderCategory(category);
  var key = String(normalizeBrandId(brandId) || '').toLowerCase();
  var optionalBrands = {
    samsung: true,
    sony: true,
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

  if (catKey === 'electronics' && key === 'vizio') {
    return {
      visible: true,
      required: true,
      useModelAsPrimaryInput: true,
      label: 'Model',
      placeholder: 'Enter Vizio model number (e.g., V505-J09)',
      note: 'Vizio electronics require a model number to decode the manufacture year.',
      missingMessage: 'Model is required for Vizio electronics.'
    };
  }

  if (key === 'kenmore') {
    return {
      visible: true,
      required: true,
      useModelAsPrimaryInput: false,
      label: 'Model Prefix',
      placeholder: 'Enter first 3 digits of Kenmore model number (e.g., 106)',
      note: 'Kenmore requires the first 3 digits of the model number to identify the OEM decoder.',
      inputMode: 'numeric',
      maxLength: 3,
      pattern: '[0-9]*',
      sanitize: function(value) {
        return extractKenmoreModelPrefix(value);
      },
      missingMessage: 'Model Prefix is required for Kenmore.'
    };
  }

  if (catKey === 'waterHeaters' && (key === 'rheem' || key === 'ruud' || key === 'richmond')) {
    return {
      visible: true,
      required: false,
      useModelAsPrimaryInput: false,
      label: 'Model Number (optional)',
      placeholder: 'Enter model number (e.g., E40 2 RH95)',
      note: 'If available, include the model number to help resolve alternate Rheem-family serial layouts.'
    };
  }

  if (optionalBrands[key]) {
    return {
      visible: true,
      required: false,
      useModelAsPrimaryInput: false,
      label: 'Model Number (optional)',
      placeholder: 'Enter model number (optional)',
      note: 'If available, include a model number to narrow the result.'
    };
  }

  return {
    visible: false,
    required: false,
    useModelAsPrimaryInput: false,
    label: 'Model Number',
    placeholder: 'Enter model number',
    note: ''
  };
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

function homeResetHref() {
  return '/?reset=1';
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
      if (link.classList && link.classList.contains('brand-tile')) {
        var prefillCat = link.getAttribute('data-prefill-cat');
        var prefillBrand = link.getAttribute('data-prefill-brand');
        if (prefillCat && prefillBrand) {
          link.setAttribute('href', homeResetHref() + '&cat=' + encodeURIComponent(prefillCat) + '&brand=' + encodeURIComponent(prefillBrand));
        } else {
          link.setAttribute('href', homeResetHref());
        }
        link.setAttribute('data-brand-reset-link', '1');
        return;
      }
      var slug = url.pathname.replace(/\/+$/, '').split('/').pop().replace(/\.html$/i, '');
      if (!brandSlugs[slug]) return;
      var target = brandLinkHrefFromSlug(slug);
      if (target) link.setAttribute('href', target);
      link.setAttribute('data-brand', slugToBrandId(slug));
    } catch (_) {}
  });
}

function shouldResetHomePageSearch() {
  try {
    var slug = getBrandPageSlug();
    if (slug !== '' && slug !== 'index') return false;
    var params = new URLSearchParams(window.location.search || '');
    return params.get('reset') === '1';
  } catch (_) {
    return false;
  }
}

function resetHomePageSearch() {
  var slug = getBrandPageSlug();
  if (slug !== '' && slug !== 'index') return;

  // Check for prefill parameters from brand tile clicks
  var params = new URLSearchParams(window.location.search);
  var prefillCat = params.get('cat');
  var prefillBrand = params.get('brand');

  // Select the correct category tab
  var targetCat = prefillCat || 'appliances';
  var tabBtn = document.querySelector('.cat-tab[data-cat="' + targetCat + '"]');
  if (typeof selectCategory === 'function') {
    selectCategory(targetCat, tabBtn);
  }

  var dom = getDecodeDom();
  var brandSelect = dom.brandEl;
  var serialInput = dom.serialEl;
  var altQuery = getSmartLookupInputEl();
  var eraSelect = document.getElementById('eraSelect');
  var kenmorePrefix = document.getElementById('kenmoreModelPrefix');
  var ageLoading = document.getElementById('ageLoading');
  var serialResults = document.getElementById('serialResults');
  var ageResults = document.getElementById('ageResults');
  var serialLkqResults = document.getElementById('serialLkqResults');
  var serialModelInput = document.getElementById('serial-lkq-model-input');
  var refinePanel = document.querySelector('.narrow-date-panel');
  var refineOut = document.getElementById('narrowDateOutput');

  if (serialInput) serialInput.value = '';
  if (altQuery) altQuery.value = '';
  if (eraSelect) eraSelect.value = '';
  if (kenmorePrefix) kenmorePrefix.value = '';
  if (serialModelInput) serialModelInput.value = '';
  if (serialResults) serialResults.classList.add('hidden');
  if (ageResults) ageResults.classList.add('hidden');
  if (ageLoading) ageLoading.classList.add('hidden');
  if (serialLkqResults) serialLkqResults.classList.add('hidden');
  if (refinePanel) refinePanel.classList.add('hidden');
  if (refineOut) refineOut.innerHTML = '';
  if (document.getElementById('eraGroup')) hideEraGroup();

  LKQEngine.clearInstance('serial-decoder');
  LKQEngine.clearInstance('smart-lookup');
  clearSmartLookupAssist();

  // Pre-fill brand if provided, otherwise clear it
  if (prefillBrand && brandSelect) {
    // Wait for category change to populate the brand dropdown
    setTimeout(function() {
      var dom2 = getDecodeDom();
      var bs = dom2.brandEl;
      if (bs) {
        // Try to find and select the brand
        for (var i = 0; i < bs.options.length; i++) {
          if (bs.options[i].value.toLowerCase() === prefillBrand.toLowerCase()) {
            bs.value = bs.options[i].value;
            if (typeof onBrandChange === 'function') onBrandChange();
            break;
          }
        }
      }
      updateDecodeBtn();
      // Clean up the URL parameters
      try {
        history.replaceState({}, '', '/');
      } catch (_) {}
    }, 100);
  } else {
    if (brandSelect) {
      brandSelect.value = '';
      if (typeof onBrandChange === 'function') onBrandChange();
    }
    updateDecodeBtn();
    try {
      history.replaceState({}, '', '/');
    } catch (_) {}
  }

  syncSidebarActiveState();

  try {
    history.replaceState({}, '', '/');
  } catch (_) {}

  scrollPageToTop(true);
  setTimeout(function() {
    var dom3 = getDecodeDom();
    var si = dom3.serialEl;
    if (prefillBrand && si && si.focus) {
      try {
        si.focus({ preventScroll: true });
      } catch (_) {
        si.focus();
      }
    } else if (brandSelect && brandSelect.focus) {
      try {
        brandSelect.focus({ preventScroll: true });
      } catch (_) {
        brandSelect.focus();
      }
    } else if (si && si.focus) {
      try {
        si.focus({ preventScroll: true });
      } catch (_) {
        si.focus();
      }
    }
  }, prefillBrand ? 200 : 0);
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
    categoriesSection.innerHTML = '<div class="sidebar-title sidebar-section-title">Categories</div>';
    var catLinks = [
      { key: 'appliances', label: 'Appliances', href: '/appliances' },
      { key: 'hvac', label: 'HVAC', href: '/hvac' },
      { key: 'electronics', label: 'Electronics', href: '/electronics' },
      { key: 'water-heaters', label: 'Water Heaters', href: '/water-heaters' },
      { key: 'smart-lookup', label: 'Smart Lookup ✨', href: '/smart-lookup' }
    ];
    catLinks.forEach(function(item) {
      var a = document.createElement('a');
      a.className = 'sidebar-link sidebar-category-link sidebar-item';
      a.href = item.href;
      a.setAttribute('data-category', item.key);
      var label = SIDEBAR_CATEGORY_LABELS[item.key] || item.label;
      a.textContent = label;
      categoriesSection.appendChild(a);
    });
  }

  if (brandsSection) {
    brandsSection.innerHTML = '<div class="sidebar-title sidebar-section-title">Brands</div>';
    var container = document.createElement('div');
    container.className = 'sidebar-brand-groups';
    var categoryOrder = ['appliances', 'hvac', 'electronics', 'water-heaters'];

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

      var group = document.createElement('div');
      group.className = 'sidebar-brand-group';
      group.setAttribute('data-category', CATEGORY_KEY_TO_NAME[catKey] || catKey);

      var header = document.createElement('div');
      header.className = 'sidebar-group-header';
      var label = document.createElement('div');
      label.className = 'sidebar-group-link';
      label.textContent = CATEGORY_KEY_TO_NAME[catKey] || catKey;
      header.appendChild(label);
      group.appendChild(header);

      var list = document.createElement('div');
      list.className = 'sidebar-group-links';
      topIds.forEach(function(id) {
        var brand = brandData.find(function(b) { return b.id === id; });
        if (!brand) return;
        var a = document.createElement('a');
        a.className = 'sidebar-link sidebar-brand-link sidebar-item';
        a.href = categoryBrandHref(catKey, brand.id);
        a.textContent = getBrandDisplayName(brand);
        a.setAttribute('data-brand', brand.id);
        a.setAttribute('data-category', catKey);
        list.appendChild(a);
      });
      group.appendChild(list);

      if (remaining.length) {
        var moreWrap = document.createElement('div');
        moreWrap.className = 'sidebar-more-brands';
        var moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'sidebar-more-toggle';
        moreBtn.textContent = '+ More Brands';
        var moreList = document.createElement('div');
        moreList.className = 'sidebar-more-list';
        moreList.hidden = true;
        remaining.forEach(function(brand) {
          var a = document.createElement('a');
          a.className = 'sidebar-link sidebar-link-secondary sidebar-brand-link sidebar-item';
          a.href = categoryBrandHref(catKey, brand.id);
          a.textContent = getBrandDisplayName(brand);
          a.setAttribute('data-brand', brand.id);
          a.setAttribute('data-category', catKey);
          moreList.appendChild(a);
        });
        var key = 'sidebar_morebrands_' + catKey;
        moreBtn.addEventListener('click', function() {
          var isOpen = !moreList.hidden;
          moreList.hidden = isOpen;
          moreWrap.classList.toggle('open', !isOpen);
          moreBtn.textContent = isOpen ? '+ More Brands' : '– Less Brands';
          try { localStorage.setItem(key, String(!isOpen)); } catch (_) {}
        });
        moreWrap.appendChild(moreBtn);
        moreWrap.appendChild(moreList);
        group.appendChild(moreWrap);
      }

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
        wa.className = 'sidebar-link sidebar-item';
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
        a.className = 'sidebar-link sidebar-link-secondary sidebar-item';
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
    '<div class="sidebar-section-title">Tools</div>' +
    '<a class="sidebar-link sidebar-smart-top-link sidebar-item" href="/smart-lookup">' +
    'Smart Lookup <span class="new-badge">NEW</span>' +
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
    try {
    var modeParams = new URLSearchParams(window.location.search || '');
    var initialMode = (modeParams.get('mode') || '').toLowerCase();
    var initialHash = (window.location.hash || '').toLowerCase();
    if (initialMode === 'smart' || initialHash === '#panel-smart') {
      setTimeout(function() {
        if (typeof useSmartLookup === 'function') useSmartLookup();
        var smartPanel = document.getElementById('panel-smart');
        if (smartPanel && smartPanel.scrollIntoView) {
          smartPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 120);
    }
  } catch (_) {}

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
    a.className = 'cat-tab cat-tab-link sidebar-item';
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
  if (slug === 'samsung-tv-serial-number-decoder') return 'samsung_tv';
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
  if (key === 'smart-lookup') return 'Smart Lookup (Powered by AI)';
  return 'Appliances Serial Number Decoder';
}

function buildCategoryTabBarHtml(activeKey) {
  var tabs = [
    { key: 'hvac', label: 'HVAC', href: '/hvac' },
    { key: 'appliances', label: 'Appliances', href: '/appliances' },
    { key: 'electronics', label: 'Electronics', href: '/electronics' },
    { key: 'water-heaters', label: 'Water Heaters', href: '/water-heaters' },
    { key: 'smart-lookup', label: 'Smart Lookup', href: '/smart-lookup' }
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
  if (!hasDecoderData()) return;
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

var BRAND_PAGE_CONTENT = {
  'whirlpool': {
    displayName: 'Whirlpool',
    tagline: 'Decode Whirlpool Serial Numbers Instantly',
    description: 'Use the Whirlpool decoder on this page to estimate manufacture date from refrigerators, washers, dryers, dishwashers, and cooking appliances. Whirlpool is preselected so you can land on the page and decode immediately.',
    helperText: 'Whirlpool serial formats commonly appear on refrigerators, laundry appliances, dishwashers, ranges, wall ovens, and microwaves.',
    chips: ['Refrigerators', 'Washers', 'Dishwashers'],
    helperLocations: ['<strong>Refrigerators:</strong> inside the fresh-food section wall or behind a crisper drawer', '<strong>Washers and dryers:</strong> under the lid, around the door opening, or on the rear panel', '<strong>Dishwashers and ranges:</strong> inner door frame, tub lip, oven frame, or behind the drawer'],
    formats: [{ product: 'Refrigerators', format: '9-character serials commonly use character 2 for the year code and characters 3-4 for the production week.', note: 'Whirlpool letter cycles repeat across decades, so age range and model era help confirm the decade.' }, { product: 'Washers and dryers', format: 'Many 10-character serials use character 3 for the year code and characters 4-5 for the production week.', note: 'Letters I, O, Q, and V are skipped in the Whirlpool year cycle.' }, { product: 'Dishwashers, ranges, and microwaves', format: 'Whirlpool cooking and dishwashing products follow the same 9- or 10-character week/year logic depending on plant and era.', note: 'The decoder already applies the correct Whirlpool-family rule set after selection.' }],
    locations: [{ product: 'Refrigerators', items: ['Inside the fresh-food compartment side wall', 'Behind the produce drawers on some bottom-freezer units'] }, { product: 'Washers and dryers', items: ['Washer lid opening or door frame', 'Dryer door opening, rear bulkhead, or back panel'] }, { product: 'Dishwashers and cooking products', items: ['Dishwasher tub lip or inner door frame', 'Range oven frame, storage drawer opening, or rear service label'] }],
    related: [{ href: '/maytag', label: 'Maytag Decoder' }, { href: '/kenmore', label: 'Kenmore Decoder' }, { href: '/ge', label: 'GE Decoder' }, { href: '/frigidaire', label: 'Frigidaire Decoder' }]
  },
  'ge': {
    displayName: 'GE',
    tagline: 'Decode GE Serial Numbers Instantly',
    description: 'Use the GE decoder to read manufacture date codes from refrigerators, ranges, washers, dryers, dishwashers, and other GE-family appliances. The page loads with GE ready to decode so you can move straight to the serial number.',
    helperText: 'GE appliances usually encode the month in the first character and the year in the second character of the serial number.',
    chips: ['Refrigerators', 'Ranges', 'Washers'],
    helperLocations: ['<strong>Refrigerators:</strong> inside the fresh-food compartment or behind a drawer', '<strong>Laundry:</strong> lid opening, door frame, or rear panel', '<strong>Ranges and dishwashers:</strong> oven frame, storage drawer opening, or inner door frame'],
    formats: [{ product: 'Refrigerators', format: 'GE often uses the first character for month and the second character for year.', note: 'The GE year code repeats on a 12-year cycle, so installation era matters.' }, { product: 'Washers and dryers', format: 'Laundry products typically use the same first-letter month and second-letter year pattern.', note: 'This rule also appears across other GE family appliance lines.' }, { product: 'Ranges and dishwashers', format: 'Cooking and dishwashing products generally follow the same 2-character month/year opening code.', note: 'Once decoded, the remaining serial characters act as production sequence data.' }],
    locations: [{ product: 'Refrigerators', items: ['Side wall inside the fresh-food section', 'Behind the crisper pan or top ceiling trim on some models'] }, { product: 'Washers and dryers', items: ['Washer lid rim or underside of the lid', 'Dryer door opening or rear cabinet panel'] }, { product: 'Ranges and dishwashers', items: ['Range oven frame behind the door', 'Dishwasher tub lip, side edge, or inner door'] }],
    related: [{ href: '/whirlpool', label: 'Whirlpool Decoder' }, { href: '/frigidaire', label: 'Frigidaire Decoder' }, { href: '/bosch', label: 'Bosch Decoder' }, { href: '/kenmore', label: 'Kenmore Decoder' }]
  },
  'samsung': {
    displayName: 'Samsung',
    tagline: 'Decode Samsung Serial Numbers Instantly',
    description: 'This Samsung decoder is set up for supported Samsung appliances so you can estimate manufacture date from the serial number without switching brands first. It works best for refrigerators, laundry, and other major home appliances covered by the decoder.',
    helperText: 'Samsung appliance serials commonly use a year/month code inside either a 15-character or 11-character serial pattern.',
    chips: ['Refrigerators', 'Laundry', 'Kitchen appliances'],
    helperLocations: ['<strong>Refrigerators:</strong> inside the fresh-food section wall or near the crisper area', '<strong>Washers and dryers:</strong> around the door opening, rear panel, or under the lid', '<strong>Ranges and dishwashers:</strong> oven frame, drawer opening, or inner door frame'],
    formats: [{ product: 'Refrigerators', format: '15-character Samsung serials usually store the year in character 8 and the month in character 9.', note: 'Some Samsung code families repeat over roughly 20 years, so model era can help resolve the decade.' }, { product: 'Washers and dryers', format: '11-character serials commonly use character 4 for year and character 5 for month.', note: 'The decoder checks which Samsung serial family matches the entry.' }, { product: 'Dishwashers and ranges', format: 'Kitchen appliances generally follow the same year/month character-position logic used across Samsung major appliances.', note: 'If the serial does not match, use Smart Lookup with the full model number.' }],
    locations: [{ product: 'Refrigerators', items: ['Inside the refrigerator compartment wall', 'Behind produce drawers or near the upper liner on some units'] }, { product: 'Washers and dryers', items: ['Washer lid underside or door opening', 'Dryer door rim, rear panel, or lower frame'] }, { product: 'Dishwashers and ranges', items: ['Dishwasher inner door frame or tub lip', 'Range oven frame or storage drawer opening'] }],
    related: [{ href: '/samsung-tv-serial-number-decoder', label: 'Samsung TV Decoder' }, { href: '/lg', label: 'LG Decoder' }, { href: '/ge', label: 'GE Decoder' }, { href: '/whirlpool', label: 'Whirlpool Decoder' }]
  },
  'lg': {
    displayName: 'LG',
    tagline: 'Decode LG Serial Numbers Instantly',
    description: 'Use the LG decoder on this page to estimate manufacture date for refrigerators, washers, dryers, dishwashers, and other supported LG appliances. LG is preselected so the decode tool is ready as soon as the page opens.',
    helperText: 'LG appliance serial numbers typically begin with a year digit followed by a 2-digit month code.',
    chips: ['Refrigerators', 'Washers', 'Dryers'],
    helperLocations: ['<strong>Refrigerators:</strong> interior wall, ceiling liner, or behind crisper drawers', '<strong>Washers and dryers:</strong> door opening, lid rim, or rear panel', '<strong>Dishwashers and ranges:</strong> inner door frame, oven frame, or lower drawer area'],
    formats: [{ product: 'Refrigerators', format: 'LG commonly uses character 1 as the last digit of the year and characters 2-3 as the month.', note: 'Because the year is a single digit, decade is determined by model era and product age.' }, { product: 'Washers and dryers', format: 'Laundry appliances generally follow the same first-digit year and 2-digit month pattern.', note: 'The decoder uses the current year and product context to narrow the likely decade.' }, { product: 'Dishwashers and cooking products', format: 'Other major LG appliances typically use the same leading year-plus-month logic.', note: 'If a serial looks atypical, the model number can help verify the result.' }],
    locations: [{ product: 'Refrigerators', items: ['Inside the fresh-food compartment side wall', 'Behind a crisper drawer or on the upper interior liner'] }, { product: 'Washers and dryers', items: ['Washer lid or door opening', 'Dryer door opening or rear service panel'] }, { product: 'Dishwashers and cooking products', items: ['Dishwasher tub lip or side edge', 'Range oven frame or warming drawer opening'] }],
    related: [{ href: '/samsung', label: 'Samsung Decoder' }, { href: '/bosch', label: 'Bosch Decoder' }, { href: '/whirlpool', label: 'Whirlpool Decoder' }, { href: '/kenmore', label: 'Kenmore Decoder' }]
  },
  'frigidaire': {
    displayName: 'Frigidaire',
    tagline: 'Decode Frigidaire Serial Numbers Instantly',
    description: 'Use the Frigidaire decoder to estimate manufacture date from refrigerators, ranges, laundry appliances, dishwashers, and other Frigidaire-built products. The brand is preselected here so you can start with the serial number right away.',
    helperText: 'Frigidaire serials often place factory letters first, followed by a single year digit and production week digits.',
    chips: ['Refrigerators', 'Ranges', 'Laundry'],
    helperLocations: ['<strong>Refrigerators:</strong> interior wall or behind produce drawers', '<strong>Washers and dryers:</strong> lid rim, door opening, or rear panel', '<strong>Ranges and dishwashers:</strong> oven frame, lower drawer area, or inner door frame'],
    formats: [{ product: 'Refrigerators', format: 'After the opening factory letters, Frigidaire commonly uses the next digit for year and the following digits for production week.', note: 'The year digit repeats by decade, so age and styling help anchor the result.' }, { product: 'Ranges and wall ovens', format: 'Cooking appliances typically use the same factory-letter plus year/week structure.', note: 'The decoder reads the serial after the plant prefix rather than the whole string as one date code.' }, { product: 'Washers, dryers, and dishwashers', format: 'Laundry and dishwashing products generally follow the same year-digit and week-digit pattern.', note: 'Use the full serial exactly as printed because leading letters matter.' }],
    locations: [{ product: 'Refrigerators', items: ['Fresh-food compartment side wall', 'Behind a produce drawer or on the ceiling liner'] }, { product: 'Washers and dryers', items: ['Washer lid opening or underside of lid', 'Dryer door rim or rear cabinet label'] }, { product: 'Ranges and dishwashers', items: ['Range oven frame or storage drawer opening', 'Dishwasher tub lip or side frame'] }],
    related: [{ href: '/ge', label: 'GE Decoder' }, { href: '/whirlpool', label: 'Whirlpool Decoder' }, { href: '/bosch', label: 'Bosch Decoder' }, { href: '/kenmore', label: 'Kenmore Decoder' }]
  },
  'bosch': {
    displayName: 'Bosch',
    tagline: 'Decode Bosch Serial Numbers Instantly',
    description: 'Use the Bosch decoder to estimate manufacture year from supported Bosch appliance serial labels. Bosch is preselected on the page so you can move straight into the decoder instead of resetting the brand each visit.',
    helperText: 'Bosch appliance labels often include an FD date code that carries the production year information.',
    chips: ['Dishwashers', 'Laundry', 'Cooking'],
    helperLocations: ['<strong>Dishwashers:</strong> inner door edge or upper tub lip', '<strong>Washers and dryers:</strong> door opening, soap drawer area, or rear panel', '<strong>Ovens and ranges:</strong> frame behind the door or warming drawer opening'],
    formats: [{ product: 'Dishwashers', format: 'Bosch commonly uses an FD code where the first 2 digits plus 20 indicate the production year.', note: 'If the FD calculation reaches 100 or higher, drop the leading digit to read the 2-digit year.' }, { product: 'Washers and dryers', format: 'Laundry labels often rely on the same FD code logic rather than a simple serial-only year digit.', note: 'Look for FD near the serial/model information block.' }, { product: 'Ovens, ranges, and cooktops', format: 'Cooking appliances also tend to use the FD-based manufacturing year convention.', note: 'Production month can also be embedded, but the page decoder focuses on the year logic already supported.' }],
    locations: [{ product: 'Dishwashers', items: ['Upper edge of the dishwasher door', 'Tub lip or side frame near the hinges'] }, { product: 'Washers and dryers', items: ['Door opening or behind the detergent drawer', 'Rear service label on stacked laundry units'] }, { product: 'Cooking products', items: ['Oven frame behind the door', 'Storage drawer opening or rear panel label'] }],
    related: [{ href: '/ge', label: 'GE Decoder' }, { href: '/lg', label: 'LG Decoder' }, { href: '/frigidaire', label: 'Frigidaire Decoder' }, { href: '/whirlpool', label: 'Whirlpool Decoder' }]
  },
  'kenmore': {
    displayName: 'Kenmore',
    tagline: 'Decode Kenmore Serial Numbers Instantly',
    description: 'Kenmore serial decoding starts by identifying the original manufacturer from the model prefix, then applying the matching Whirlpool, GE, LG, or other OEM rule. This page opens with Kenmore ready so you can test the serial and model combination immediately.',
    helperText: 'Kenmore is an OEM-driven decoder path, so the first 3 digits of the model number are often needed before the serial rule can be applied correctly.',
    chips: ['Whirlpool-built', 'GE-built', 'LG-built'],
    helperLocations: ['<strong>Refrigerators:</strong> inside the fresh-food section plus capture the model prefix if possible', '<strong>Laundry:</strong> lid opening, door frame, or rear panel with both model and serial tags', '<strong>Ranges and dishwashers:</strong> oven frame or inner door area where the model prefix is visible'],
    formats: [{ product: 'Whirlpool-built Kenmore', format: 'Model prefixes such as 106 or 110 usually point to Whirlpool-family decoding, including 9- and 10-character year/week serial patterns.', note: 'If you know the model prefix, the decoder can route the serial to the right OEM logic.' }, { product: 'GE-built Kenmore', format: 'Prefixes such as 362 or 363 usually use the GE pattern where character 1 is month and character 2 is year.', note: 'GE year codes repeat every 12 years.' }, { product: 'LG-built Kenmore', format: 'Prefix 795 commonly follows LG appliance logic with character 1 as year digit and characters 2-3 as month.', note: 'LG-built refrigerators are one of the strongest Kenmore decoder paths.' }],
    locations: [{ product: 'Refrigerators', items: ['Fresh-food side wall or behind a crisper drawer', 'Capture the model number so the 3-digit prefix is visible'] }, { product: 'Washers and dryers', items: ['Lid rim, door opening, or rear panel', 'Use the model prefix and serial together for best results'] }, { product: 'Ranges and dishwashers', items: ['Range oven frame or lower drawer opening', 'Dishwasher door frame or tub lip near the full model tag'] }],
    related: [{ href: '/whirlpool', label: 'Whirlpool Decoder' }, { href: '/lg', label: 'LG Decoder' }, { href: '/ge', label: 'GE Decoder' }, { href: '/maytag', label: 'Maytag Decoder' }]
  },
  'maytag': {
    displayName: 'Maytag',
    tagline: 'Decode Maytag Serial Numbers Instantly',
    description: 'Use the Maytag decoder to estimate manufacture date across both modern Whirlpool-era Maytag appliances and older legacy Maytag products. The decoder on this page is ready for Maytag immediately, including era selection when the format requires it.',
    helperText: 'Maytag can follow two different families: Whirlpool-style post-2006 year/week decoding and older pre-2006 month/year character codes.',
    chips: ['Post-2006', 'Pre-2006', 'Laundry'],
    helperLocations: ['<strong>Washers and dryers:</strong> lid opening, door frame, or rear panel', '<strong>Refrigerators:</strong> inside the cabinet wall or behind drawers', '<strong>Dishwashers and ranges:</strong> inner door frame, tub lip, or oven frame'],
    formats: [{ product: 'Post-2006 Maytag appliances', format: 'Many newer Maytag serials follow Whirlpool-family logic with a year code character and a 2-digit production week.', note: 'The decoder asks for era when needed because code families repeat.' }, { product: 'Pre-2006 Maytag appliances', format: 'Older Maytag serials often use the last 2 characters, with the second-to-last for year and the last for month.', note: 'Legacy Maytag decoding is most reliable when the era is known.' }, { product: 'Laundry and kitchen products', format: 'Both laundry and kitchen products can appear under either the legacy Maytag system or the Whirlpool-era system depending on manufacture year.', note: 'Use the era selector if it appears after brand selection.' }],
    locations: [{ product: 'Washers and dryers', items: ['Washer lid underside or door frame', 'Dryer door opening or rear bulkhead label'] }, { product: 'Refrigerators', items: ['Fresh-food compartment wall', 'Behind produce drawers or near the ceiling liner'] }, { product: 'Dishwashers and ranges', items: ['Dishwasher tub lip or inner door', 'Range oven frame or lower drawer opening'] }],
    related: [{ href: '/whirlpool', label: 'Whirlpool Decoder' }, { href: '/kenmore', label: 'Kenmore Decoder' }, { href: '/frigidaire', label: 'Frigidaire Decoder' }, { href: '/ge', label: 'GE Decoder' }]
  },
  'rheem': {
    displayName: 'Rheem',
    tagline: 'Decode Rheem Serial Numbers Instantly',
    description: 'Use the Rheem decoder to estimate manufacture date for supported HVAC equipment using the serial number on the outdoor unit, air handler, or furnace. Rheem is preselected on this page so you can move directly into the HVAC decode flow.',
    helperText: 'Rheem HVAC serial numbers often include a 4-digit week/year block immediately following a leading letter.',
    chips: ['Condensers', 'Air handlers', 'Furnaces'],
    helperLocations: ['<strong>Outdoor condensers:</strong> rating plate on the side cabinet near refrigerant lines', '<strong>Air handlers:</strong> blower compartment or exterior cabinet label', '<strong>Furnaces:</strong> inside the burner compartment door or side wall plate'],
    formats: [{ product: 'Air conditioners and heat pumps', format: 'Rheem commonly uses 4 digits after a leading letter in a WWYY sequence.', note: 'The first 2 digits represent production week and the next 2 represent year.' }, { product: 'Air handlers', format: 'Indoor units generally follow the same WWYY block immediately after the opening letter.', note: 'This makes Rheem one of the clearer HVAC decoder paths on the site.' }, { product: 'Furnaces', format: 'Furnace serials often use the same week/year block format.', note: 'Always enter the full serial because plant letters can matter.' }],
    locations: [{ product: 'Outdoor condensers', items: ['Side panel near the service valves', 'Rear or side cabinet data plate'] }, { product: 'Air handlers', items: ['Inside the access panel', 'Exterior cabinet sticker near the electrical data'] }, { product: 'Furnaces', items: ['Inside the front service door', 'Side wall rating plate near the burner compartment'] }],
    related: [{ href: '/trane', label: 'Trane Decoder' }, { href: '/carrier', label: 'Carrier Decoder' }, { href: '/goodman', label: 'Goodman Decoder' }, { href: '/ge', label: 'GE Decoder' }]
  },
  'trane': {
    displayName: 'Trane',
    tagline: 'Decode Trane Serial Numbers Instantly',
    description: 'Use the Trane decoder for supported furnaces, condensers, air handlers, and heat pumps. Trane is already selected on this page so the HVAC tool is ready when you land.',
    helperText: 'Many Trane HVAC serial numbers store the year in digits 3-4 of the serial number.',
    chips: ['Furnaces', 'Condensers', 'Heat pumps'],
    helperLocations: ['<strong>Outdoor units:</strong> side cabinet data plate near service valves', '<strong>Air handlers:</strong> access panel or side wall sticker', '<strong>Furnaces:</strong> inside the front door or on the side plate'],
    formats: [{ product: 'Air conditioners and heat pumps', format: 'Trane often uses digits 3-4 of the serial number as the production year.', note: 'The surrounding characters identify plant and sequence information.' }, { product: 'Air handlers', format: 'Indoor units commonly use the same digits-3-and-4 year position.', note: 'Pair the serial result with model family if you need more era confidence.' }, { product: 'Furnaces', format: 'Furnaces usually follow the same year-position rule.', note: 'The decoder extracts the year once Trane is selected in HVAC.' }],
    locations: [{ product: 'Outdoor condensers', items: ['Side cabinet plate near the refrigerant line connections', 'Rear corner data plate on some units'] }, { product: 'Air handlers', items: ['Inside the blower door or service panel', 'Exterior cabinet label near electrical specs'] }, { product: 'Furnaces', items: ['Front burner-door interior', 'Side cabinet rating plate'] }],
    related: [{ href: '/carrier', label: 'Carrier Decoder' }, { href: '/goodman', label: 'Goodman Decoder' }, { href: '/rheem', label: 'Rheem Decoder' }, { href: '/whirlpool', label: 'Whirlpool Decoder' }]
  },
  'goodman': {
    displayName: 'Goodman',
    tagline: 'Decode Goodman Serial Numbers Instantly',
    description: 'Use the Goodman decoder to estimate manufacture date for condensers, furnaces, package units, and air handlers. Goodman is preloaded here so the HVAC panel is ready without any extra switching.',
    helperText: 'Goodman serial numbers are one of the more direct HVAC paths because the first 2 digits usually give the year and the next 2 digits give the month.',
    chips: ['Condensers', 'Furnaces', 'Package units'],
    helperLocations: ['<strong>Outdoor units:</strong> side cabinet label near service lines', '<strong>Furnaces:</strong> inside the front panel or side rating plate', '<strong>Air handlers:</strong> access panel or blower compartment label'],
    formats: [{ product: 'Air conditioners and heat pumps', format: 'Goodman commonly uses the first 2 digits for year and the next 2 digits for month.', note: 'This is one of the clearest date formats in the HVAC decoder.' }, { product: 'Furnaces', format: 'Furnaces often use the same YYYY-style opening positions with year first, month second.', note: 'Enter the full serial to avoid trimming important plant characters.' }, { product: 'Package units and air handlers', format: 'Other Goodman HVAC products generally follow the same first-4-digit year/month structure.', note: 'The decoder will present the month directly when available.' }],
    locations: [{ product: 'Outdoor units', items: ['Side cabinet rating plate', 'Near the refrigerant service connection panel'] }, { product: 'Furnaces', items: ['Inside the burner compartment door', 'Side cabinet label behind the front panel'] }, { product: 'Air handlers and package units', items: ['Access panel sticker', 'Blower compartment label or side wall plate'] }],
    related: [{ href: '/carrier', label: 'Carrier Decoder' }, { href: '/trane', label: 'Trane Decoder' }, { href: '/rheem', label: 'Rheem Decoder' }, { href: '/ge', label: 'GE Decoder' }]
  },
  'carrier': {
    displayName: 'Carrier',
    tagline: 'Decode Carrier Serial Numbers Instantly',
    description: 'Use the Carrier decoder on this page to estimate manufacture year for furnaces, condensers, air handlers, and heat pumps. Carrier is preselected in the HVAC decoder so you can start with the serial immediately.',
    helperText: 'Carrier serial numbers typically store the production year in digits 3-4 of the serial number.',
    chips: ['Condensers', 'Air handlers', 'Furnaces'],
    helperLocations: ['<strong>Outdoor units:</strong> side cabinet data plate near service valves', '<strong>Air handlers:</strong> access door or exterior cabinet sticker', '<strong>Furnaces:</strong> inside the service panel or side wall plate'],
    formats: [{ product: 'Air conditioners and heat pumps', format: 'Carrier commonly uses digits 3-4 as the production year.', note: 'Other digits identify week, plant, or sequence depending on the era.' }, { product: 'Air handlers', format: 'Indoor units often use the same year placement in digits 3-4.', note: 'If more context is needed, compare the result to the model family.' }, { product: 'Furnaces', format: 'Furnaces generally follow the same year-position logic.', note: 'The decoder is strongest for the major Carrier-family serial structures already mapped.' }],
    locations: [{ product: 'Outdoor units', items: ['Side panel near refrigerant lines', 'Rear or side rating plate'] }, { product: 'Air handlers', items: ['Inside the blower access panel', 'External cabinet sticker near electrical data'] }, { product: 'Furnaces', items: ['Service door interior', 'Side cabinet rating plate'] }],
    related: [{ href: '/trane', label: 'Trane Decoder' }, { href: '/goodman', label: 'Goodman Decoder' }, { href: '/rheem', label: 'Rheem Decoder' }, { href: '/bosch', label: 'Bosch Decoder' }]
  },
  'sony': {
    displayName: 'Sony',
    tagline: 'Decode Sony Serial Numbers Instantly',
    description: 'Use this Sony page when you need a fast path into the Sony electronics decoder. For many Sony products, the strongest signal comes from the model family or suffix rather than the serial alone, so the page keeps both the decoder and Smart Lookup close together.',
    helperText: 'Sony date decoding often depends on model-number conventions, especially the year letter suffix used on many modern Bravia TVs.',
    chips: ['Bravia TVs', 'Audio gear', 'Electronics'],
    helperLocations: ['<strong>TVs:</strong> rear panel sticker, side edge label, or settings menu', '<strong>Audio gear:</strong> rear panel or underside label', '<strong>Other electronics:</strong> underside case, battery compartment, or packaging label'],
    formats: [{ product: 'Bravia TVs', format: 'Sony often encodes model year in the last model-number letter: H=2020, J=2021, K=2022, L=2023, M=2024, N=2025.', note: 'This is a model-based decoder path, not a pure serial-only calendar code.' }, { product: 'Sound bars and receivers', format: 'Many Sony A/V products need model-family context first, then serial details second.', note: 'Use Smart Lookup if the serial does not map cleanly to a supported pattern.' }, { product: 'Other Sony electronics', format: 'Where Sony does not expose a reliable serial date code, model naming conventions provide the best first-pass age estimate.', note: 'That is why the page keeps Smart Lookup alongside the serial decoder.' }],
    locations: [{ product: 'TVs', items: ['Rear label near the HDMI/input area', 'Settings menu if the screen still powers on'] }, { product: 'Audio gear', items: ['Rear chassis label', 'Underside sticker on smaller speakers and players'] }, { product: 'Other electronics', items: ['Battery compartment or underside case', 'Original box label or registration record'] }],
    related: [{ href: '/vizio', label: 'Vizio Decoder' }, { href: '/samsung-tv-serial-number-decoder', label: 'Samsung TV Decoder' }, { href: '/apple', label: 'Apple Decoder' }, { href: '/hp', label: 'HP Decoder' }]
  },
  'vizio': {
    displayName: 'Vizio',
    tagline: 'Decode Vizio Serial Numbers Instantly',
    description: 'Use the Vizio page when you need a practical path for TVs and home entertainment products. Vizio age estimates are usually strongest from model conventions and product generation context, with serial numbers used as supporting information instead of the main date code.',
    helperText: 'Vizio decoding is primarily model-based because the serial alone is not a reliable manufacturing-date source across product lines.',
    chips: ['TVs', 'Sound bars', 'Streaming devices'],
    helperLocations: ['<strong>TVs:</strong> rear label, side sticker, or settings menu', '<strong>Sound bars:</strong> underside or rear label near ports', '<strong>Streaming devices:</strong> underside label or packaging barcode'],
    formats: [{ product: 'TVs', format: 'Vizio model numbers provide the strongest age clues because serial-only date logic is not consistently reliable.', note: 'Use the full model number whenever possible.' }, { product: 'Sound bars', format: 'Sound bars also lean on model family and generation rather than a consistent serial date code.', note: 'Smart Lookup is the best fallback when the label is partial.' }, { product: 'Streaming devices and accessories', format: 'Smaller Vizio electronics typically require model-based research instead of direct serial decoding.', note: 'The page still keeps the serial tool available for supported cases.' }],
    locations: [{ product: 'TVs', items: ['Rear sticker near the input panel', 'On-screen system information if the TV still turns on'] }, { product: 'Sound bars', items: ['Rear port cluster label', 'Underside sticker near the mounting area'] }, { product: 'Streaming devices', items: ['Underside barcode label', 'Retail box or account registration information'] }],
    related: [{ href: '/sony', label: 'Sony Decoder' }, { href: '/samsung-tv-serial-number-decoder', label: 'Samsung TV Decoder' }, { href: '/apple', label: 'Apple Decoder' }, { href: '/hp', label: 'HP Decoder' }]
  },
  'samsung-tv-serial-number-decoder': {
    displayName: 'Samsung TV',
    tagline: 'Decode Samsung TV Serial Numbers Instantly',
    description: 'Use this Samsung TV decoder to estimate manufacturing date from supported Samsung television serial numbers. The page opens with the electronics decoder ready to go and the Samsung TV brand preselected so you can start from the label immediately.',
    helperText: 'Samsung TVs typically use the same supported 15-character and 11-character year/month serial patterns already mapped in the decoder data.',
    chips: ['QLED TVs', 'OLED TVs', 'LED TVs'],
    helperLocations: ['<strong>TVs:</strong> rear panel sticker, side edge label, or settings menu', '<strong>Monitors:</strong> rear stand mount area or underside label', '<strong>Home theater displays:</strong> rear chassis sticker near the inputs'],
    formats: [{ product: '15-character TV serials', format: 'Samsung TV serials often place the year in character 8 and the month in character 9.', note: 'This is the strongest modern Samsung TV serial pattern in the decoder data.' }, { product: '11-character TV serials', format: 'Some Samsung TVs use character 4 for the year and character 5 for the month.', note: 'The decoder checks both 15-character and 11-character Samsung TV structures.' }, { product: 'Model-supported fallback', format: 'If the serial is partial or missing, pair the model number with Smart Lookup to estimate the product generation.', note: 'That fallback is useful for wall-mounted sets where the serial sticker is hard to access.' }],
    locations: [{ product: 'TVs', items: ['Rear label near the input panel', 'Support menu or about screen if the TV powers on'] }, { product: 'Monitors', items: ['Rear stand neck or VESA mount area', 'Underside label on the cabinet edge'] }, { product: 'Packaging and records', items: ['Original carton barcode label', 'Purchase receipt or account registration'] }],
    related: [{ href: '/sony', label: 'Sony Decoder' }, { href: '/vizio', label: 'Vizio Decoder' }, { href: '/samsung', label: 'Samsung Appliance Decoder' }, { href: '/apple', label: 'Apple Decoder' }]
  },
  'apple': {
    displayName: 'Apple',
    tagline: 'Decode Apple Serial Numbers Instantly',
    description: 'Use the Apple decoder to estimate manufacture date for supported Macs, iPads, iPhones, and other Apple hardware. The page keeps Apple selected so you can go straight from the label or system settings into the decoder.',
    helperText: 'Legacy 12-character Apple serials still carry date information, while newer 10-character randomized serials usually need model-based fallback instead.',
    chips: ['MacBooks', 'iPads', 'iMacs'],
    helperLocations: ['<strong>MacBooks:</strong> underside case or About This Mac', '<strong>iPads and iPhones:</strong> back enclosure, SIM tray, or Settings', '<strong>Desktop Macs:</strong> underside base, rear foot, or system information'],
    formats: [{ product: 'Legacy 12-character Apple serials', format: 'Character 4 stores the year code and characters 5-6 store the production week.', note: 'This is the main Apple date pattern supported in decoder data.' }, { product: 'Macs and iPads built before randomized serials', format: 'Older Apple hardware usually follows the same year-plus-week 12-character pattern.', note: 'The decoder can estimate manufacture period from those positions directly.' }, { product: 'Post-2021 randomized serials', format: 'Many newer 10-character Apple serials are randomized and no longer expose direct date codes.', note: 'Use the model number and Smart Lookup when the serial no longer contains date logic.' }],
    locations: [{ product: 'MacBooks', items: ['Underside aluminum case', 'System Settings or About This Mac'] }, { product: 'iPads and iPhones', items: ['Rear enclosure or SIM tray area', 'Settings > General > About'] }, { product: 'Desktop Macs', items: ['Bottom base, rear foot, or underside panel', 'About This Mac or System Information'] }],
    related: [{ href: '/hp', label: 'HP Decoder' }, { href: '/sony', label: 'Sony Decoder' }, { href: '/samsung-tv-serial-number-decoder', label: 'Samsung TV Decoder' }, { href: '/vizio', label: 'Vizio Decoder' }]
  },
  'hp': {
    displayName: 'HP',
    tagline: 'Decode HP Serial Numbers Instantly',
    description: 'Use the HP decoder for supported laptops, desktops, printers, and displays. HP is already selected here so the electronics decoder is ready as soon as the page loads.',
    helperText: 'HP serial decoding often uses character 4 for the year digit and characters 5-6 for the production week.',
    chips: ['Laptops', 'Desktops', 'Printers'],
    helperLocations: ['<strong>Laptops:</strong> underside case, battery bay, or BIOS/system information', '<strong>Desktops:</strong> rear tower label or underside of the stand', '<strong>Printers:</strong> rear panel, cartridge door area, or base label'],
    formats: [{ product: 'Laptops', format: 'HP commonly uses character 4 as the year digit and characters 5-6 as the production week.', note: 'The year is usually the last digit, so decade is resolved from the model generation.' }, { product: 'Desktops and monitors', format: 'Desktop and display products often follow the same year-digit plus week-number pattern.', note: 'Enter the serial exactly as printed because leading characters matter.' }, { product: 'Printers and peripherals', format: 'Many HP printers also use the same character-4 year and character-5-6 week logic.', note: 'Model family helps confirm the likely decade when the year digit repeats.' }],
    locations: [{ product: 'Laptops', items: ['Underside service label', 'Inside the battery bay on older systems', 'BIOS or system information screen'] }, { product: 'Desktops and monitors', items: ['Rear chassis sticker', 'Bottom edge or stand mount label'] }, { product: 'Printers', items: ['Rear panel data sticker', 'Inside the cartridge or access door area'] }],
    related: [{ href: '/apple', label: 'Apple Decoder' }, { href: '/sony', label: 'Sony Decoder' }, { href: '/vizio', label: 'Vizio Decoder' }, { href: '/samsung-tv-serial-number-decoder', label: 'Samsung TV Decoder' }]
  }
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBrandPageEnhancements() {
  var slug = getBrandPageSlug();
  var content = BRAND_PAGE_CONTENT[slug];
  if (!content) return;

  var hero = document.querySelector('.brand-home-hero .brand-hero-copy');
  if (hero) {
    var title = hero.querySelector('h1');
    if (title) title.textContent = content.displayName + ' Serial Number Decoder';
    var heroSubs = hero.querySelectorAll('.hero-sub');
    if (heroSubs[0]) heroSubs[0].innerHTML = '<strong>' + escapeHtml(content.tagline) + '</strong>';
    if (heroSubs[1]) heroSubs[1].textContent = content.description;
  }

  var helperCards = document.querySelectorAll('.brand-helper-wrap .brand-helper-card');
  if (helperCards[0]) {
    var title0 = helperCards[0].querySelector('h2');
    var text0 = helperCards[0].querySelector('p');
    var chips0 = helperCards[0].querySelector('.brand-mini-chip-row');
    if (title0) title0.textContent = 'Common ' + content.displayName + ' products';
    if (text0) text0.textContent = content.helperText;
    if (chips0) {
      chips0.innerHTML = content.chips.map(function(chip) {
        return '<span class="brand-mini-chip">' + escapeHtml(chip) + '</span>';
      }).join('');
    }
  }
  if (helperCards[1]) {
    var title1 = helperCards[1].querySelector('h2');
    var list1 = helperCards[1].querySelector('.serial-checklist');
    if (title1) title1.textContent = 'Where the label usually is';
    if (list1) {
      list1.innerHTML = content.helperLocations.map(function(item) {
        return '<li>' + item + '</li>';
      }).join('');
    }
  }

  var guide = document.querySelector('.guide-faq');
  if (!guide) return;
  guide.setAttribute('data-brand-guide', slug);
  guide.innerHTML = '' +
    '<div class="eyebrow">Brand Guide</div>' +
    '<h2>' + escapeHtml(content.displayName) + ' serial number format guide</h2>' +
    '<p class="section-sub">These format notes mirror the supported rules already used in the decoder for this brand. Use them as a quick reference before you run the serial.</p>' +
    '<div class="location-guide-grid">' +
      content.formats.map(function(item) {
        return '<article class="guide-card">' +
          '<h3>' + escapeHtml(item.product) + '</h3>' +
          '<p><strong>Format:</strong> ' + escapeHtml(item.format) + '</p>' +
          '<div class="determination-body" style="padding:14px 0 0;">' + escapeHtml(item.note) + '</div>' +
        '</article>';
      }).join('') +
    '</div>' +
    '<h2 style="margin-top:28px;">Where to find your serial number</h2>' +
    '<div class="location-guide-grid">' +
      content.locations.map(function(item) {
        return '<article class="guide-card">' +
          '<h3>' + escapeHtml(item.product) + '</h3>' +
          '<ul class="serial-checklist">' +
            item.items.map(function(line) {
              return '<li>' + escapeHtml(line) + '</li>';
            }).join('') +
          '</ul>' +
        '</article>';
      }).join('') +
    '</div>' +
    '<h2 style="margin-top:28px;">Related brands</h2>' +
    '<div class="guide-links">' +
      content.related.map(function(item) {
        return '<a class="guide-chip" href="' + escapeHtml(item.href) + '">' + escapeHtml(item.label) + '</a>';
      }).join('') +
    '</div>';
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
    if (!hasDecoderData()) return;
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
      'samsung-tv-serial-number-decoder': { name: 'Samsung TV', category: 'electronics', brandId: 'samsung_tv' },
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


function enhanceDecodePanel() {
  var formArea = document.querySelector('.main-card .form-area') || document.querySelector('.decoder-card .form-area');
  if (!formArea) return;
  if (formArea.querySelector('.decode-panel')) return;

  var brandEl = document.getElementById('brand');
  var serialEl = document.getElementById('serial');
  var decodeBtn = document.getElementById('decodeBtn');
  if (!brandEl || !serialEl || !decodeBtn) return;

  var brandGroup = brandEl.closest('.form-group');
  var eraGroup = document.getElementById('eraGroup');
  var serialGroup = serialEl.closest('.form-group');
  if (!brandGroup || !serialGroup) return;

  var panel = document.createElement('div');
  panel.className = 'decode-panel';

  var panelLabel = document.createElement('label');
  panelLabel.className = 'panel-label';
  panelLabel.textContent = 'Decode Tool';
  panel.appendChild(panelLabel);

  panel.appendChild(brandGroup);
  if (eraGroup && eraGroup.parentNode === formArea) panel.appendChild(eraGroup);
  panel.appendChild(serialGroup);
  panel.appendChild(decodeBtn);

  decodeBtn.classList.add('decode-button');

  formArea.insertBefore(panel, formArea.firstChild);
}

function applySidebarVisualHierarchy() {
  document.querySelectorAll('.sidebar .sidebar-title').forEach(function(title) {
    title.classList.add('sidebar-section-title');
  });

  document.querySelectorAll('.sidebar .sidebar-link, .sidebar .sidebar-group-link, .sidebar .cat-tab, .sidebar .cat-tab-link').forEach(function(item) {
    item.classList.add('sidebar-item');
  });
}

function renderBrandDirectorySection() {
  var grid = document.getElementById('brandDirectoryGrid');
  if (!grid) return;

  var items = getBrandDirectoryItems();
  if (!items.length) return;

  grid.innerHTML = items.map(function(item) {
    var cardClass = 'brand-tile';
    if (item.logoType === 'wordmark') cardClass += ' brand-tile--wordmark';
    if (item.logoType === 'none') cardClass += ' brand-tile--textonly';

    var logoInner = '';
    if (item.logoType === 'none') {
      logoInner = '<span class="brand-tile-fallback brand-tile-fallback--visible">' + escapeHtml(item.name) + '</span>';
    } else {
      logoInner =
        '<img src="' + escapeHtml(item.logoSrc) + '" alt="' + escapeHtml(item.logoAlt || (item.name + ' logo')) + '" loading="lazy" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'block\';">' +
        '<span class="brand-tile-fallback">' + escapeHtml(item.name) + '</span>';
    }

    var titleMarkup = item.logoType === 'symbol'
      ? '<h3 class="brand-tile-name">' + escapeHtml(item.name) + '</h3>'
      : '<span class="sr-only">' + escapeHtml(item.name) + '</span>';

    return (
      '<a href="' + escapeHtml(item.href) + '" class="' + cardClass + '" data-prefill-cat="' + escapeHtml(item.prefillCat) + '" data-prefill-brand="' + escapeHtml(item.prefillBrand) + '" aria-label="Decode ' + escapeHtml(item.name) + ' serial numbers">' +
        '<div class="brand-tile-logo">' + logoInner + '</div>' +
        titleMarkup +
        '<p class="brand-tile-desc">' + escapeHtml(item.categorySummary) + '</p>' +
      '</a>'
    );
  }).join('');

  rewriteBrandLinks(grid);
}

function initMobileBrandGridToggle() {
  var grid = document.getElementById('brandDirectoryGrid');
  var toggle = document.getElementById('brandGridToggle');
  if (!grid || !toggle) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.brand-tile'));
  var mobileLimit = parseInt(grid.getAttribute('data-mobile-limit') || '8', 10);
  if (!mobileLimit || cards.length <= mobileLimit) {
    toggle.hidden = true;
    cards.forEach(function(card) { card.classList.remove('is-mobile-hidden'); });
    return;
  }

  function sync() {
    var mobile = window.innerWidth <= 768;
    var expanded = grid.getAttribute('data-mobile-expanded') === '1';

    if (!mobile) {
      toggle.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      grid.setAttribute('data-mobile-expanded', '0');
      cards.forEach(function(card) { card.classList.remove('is-mobile-hidden'); });
      return;
    }

    toggle.hidden = false;
    toggle.textContent = expanded ? 'Show fewer' : 'Show all brands';
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    cards.forEach(function(card, index) {
      card.classList.toggle('is-mobile-hidden', !expanded && index >= mobileLimit);
    });
  }

  if (toggle.getAttribute('data-brand-toggle-bound') !== '1') {
    toggle.setAttribute('data-brand-toggle-bound', '1');
    toggle.addEventListener('click', function() {
      var expanded = grid.getAttribute('data-mobile-expanded') === '1';
      grid.setAttribute('data-mobile-expanded', expanded ? '0' : '1');
      sync();
    });
    window.addEventListener('resize', sync);
  }

  sync();
}

function initPage() {

  ensureSmartLookupDom();
  enhanceHeaderBranding();
  enhanceSidebarLogo();
  injectHeroBanner();
  ensurePageTitleAndCategoryTabs();
  enhanceSmartLookupSidebarTop();
  renderStaticSidebar();
  enhanceDecodePanel();
  applySidebarVisualHierarchy();
  document.body.classList.toggle('brand-page', isBrandPage());
  document.body.classList.toggle('methodology-page', getBrandPageSlug() === 'methodology');
  syncSidebarActiveState();
  syncHeaderNavActive();
  enhanceBrandPageEmbeddedDecoder();
  updateMainPageSmartLookupHelperText();
  renderBrandPageEnhancements();
  mountSharedSmartLookupAboutSection();
  ensureFooterPrivacyPolicyLink();
  updateFooterBranding();
  addGuidedSearchButtonToBrandDecoderCard();
  renderBrandDirectorySection();
  rewriteBrandLinks();
  initMobileBrandGridToggle();
  var dom = getDecodeDom();
  var altQuery    = getSmartLookupInputEl();
  bindDecoderDataLoadTriggers();
  if (hasDecoderData()) initializeDecoderUiWhenReady();

  try {
    var modeParams = new URLSearchParams(window.location.search || '');
    var initialMode = (modeParams.get('mode') || '').toLowerCase();
    if (!shouldResetHomePageSearch() && initialMode === 'smart') {
      setTimeout(function() {
        if (typeof useSmartLookup === 'function') useSmartLookup();
      }, 80);
    }
  } catch (_) {}

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
    if (!shouldResetHomePageSearch() && serialParam && dom.serialEl) {
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
    if (href.indexOf('/') === 0 || href.indexOf('http') === 0) return;
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
      if (options && options.scroll) scrollPageToTop(true);
      initPage();
      if (typeof window.initSmartLookupPage === 'function') {
        window.initSmartLookupPage();
      }
    })
    .catch(function() {
      var path = window.location.pathname || '';
      if (path === '/' || path.includes('index')) {
        window.location.href = target.href;
      }
    })
    .finally(function() {
      window.__iaSpaLoading = false;
    });
}

// ===== INIT =====
try {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
} catch (_) {}

document.addEventListener('DOMContentLoaded', function() {
  scrollPageToTop(true);
  setTimeout(function() { scrollPageToTop(true); }, 0);
  setTimeout(function() { scrollPageToTop(true); }, 120);
  ensureMainContentShell();
  initSpaNavigation();
  initPage();
  if (typeof window.initSmartLookupPage === 'function') {
    window.initSmartLookupPage();
  }
});

window.addEventListener('pageshow', function() {
  scrollPageToTop(true);
  setTimeout(function() { scrollPageToTop(true); }, 50);
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
  if (isMobileView()) populateMobileBrands();
  else populateBrands(currentCategory);
  clearDecodeEntryFields({ categoryKey: currentCategory, clearEra: true });
  document.getElementById('serialResults').classList.add('hidden');
  var _ageResultsCat = document.getElementById('ageResults');
  if (_ageResultsCat) _ageResultsCat.classList.add('hidden');
  hideEraGroup();
  updateDecodeBtn();
}

// ===== BRAND DROPDOWN =====
function populateBrands(category) {
  var sel = document.getElementById('brand');
  if (!sel || !hasDecoderData()) return;
  var selectedBrand = getSelectedBrandForCategory(category);
  var consolidated = getCategoryDropdownBrands(category);

  sel.innerHTML = '<option value="">-- Select Brand --</option>';

  if (category === 'appliances') {
    var commonBrands = consolidated.filter(function(b) {
      return !!MOST_COMMON_APPLIANCE_BRANDS[b.id];
    });
    var allBrands = consolidated.slice();

    if (commonBrands.length) {
      var commonGroup = document.createElement('optgroup');
      commonGroup.label = 'Most Common';
      commonBrands.forEach(function(b) {
        var opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name;
        if (b.cycling) opt.dataset.cycling = '1';
        commonGroup.appendChild(opt);
      });
      sel.appendChild(commonGroup);
    }

    if (allBrands.length) {
      var allGroup = document.createElement('optgroup');
      allGroup.label = 'All Brands';
      allBrands.forEach(function(b) {
        var opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name;
        if (b.cycling) opt.dataset.cycling = '1';
        allGroup.appendChild(opt);
      });
      sel.appendChild(allGroup);
    }
  } else {
    consolidated.forEach(function(b) {
      var opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name;
      if (b.cycling) opt.dataset.cycling = '1';
      sel.appendChild(opt);
    });
  }
  if (selectedBrand) sel.value = selectedBrand;
  // Auto-preselect brand if data attributes are set on body
  (function() {
    var body = document.body;
    var prefillCat = body.getAttribute('data-prefill-cat');
    var prefillBrand = body.getAttribute('data-prefill-brand');
    if (!prefillCat || !prefillBrand) return;
    var catTab = document.querySelector('[data-cat="' + prefillCat + '"]');
    if (catTab && typeof selectCatAndShowDecoder === 'function') {
      selectCatAndShowDecoder(prefillCat, catTab);
    }
    var brandSelect = document.getElementById('brand');
    if (brandSelect) {
      brandSelect.value = prefillBrand;
      brandSelect.dispatchEvent(new Event('change'));
    }
  })();
  if (sel.value !== selectedBrand) setSelectedBrandForCategory(category, sel.value || '');
  onBrandChange();
}

// ===== ERA DROPDOWN =====
function onBrandChange() {
  var sel = document.getElementById('brand');
  if (!sel || !hasDecoderData()) return;
  syncDecoderDataRef();
  currentCategory = getActiveDecoderCategory();
  var opt = sel.options[sel.selectedIndex];
  var brandId = opt ? opt.value : '';
  if (isMobileView()) {
    updateMobileItemTypeDropdown(brandId);
    currentCategory = getActiveDecoderCategory();
  }
  setSelectedBrandForCategory(currentCategory, brandId);
  var cyclingCat = CYCLING_BRANDS[currentCategory] || {};
  var cfg = cyclingCat[brandId];
  var decoderId = brandId ? resolveDecoderId(brandId) : '';
  var decoder = (decoderId && decoderData[currentCategory] && decoderData[currentCategory].decoders)
    ? decoderData[currentCategory].decoders[decoderId]
    : null;
  var serialLabel = document.querySelector('label[for="serial"]') || document.querySelector('.serial-label');
  var serialInput = document.getElementById('serial');
  var serialHelper = document.querySelector('.serial-helper-text');
  var modelConfig = getSupplementalModelConfig(currentCategory, brandId);
  // Only show era dropdown for brands with SEPARATE pre/post-2006 decoders (type:'split')
  // Advisory brands (Whirlpool, GE, etc.) already return both possible years in their output
  if (cfg && cfg.type === 'split' && brandId) {
    showEraGroup();
  } else {
    hideEraGroup();
  }
  document.getElementById('eraSelect').value = '';
  updateModelFieldVisibility(brandId);
  updateKenmorePrefixVisibility(brandId);
  if (modelConfig.useModelAsPrimaryInput) {
    if (serialLabel) serialLabel.textContent = 'ENTER SERIAL NUMBER';
    if (serialInput) serialInput.placeholder = 'Enter serial number (optional for Vizio)';
    if (serialHelper) serialHelper.textContent = 'Vizio decoding uses the model field below. Serial number is optional.';
    clearSupplementalModelError();
    return;
  }
  if (decoder && decoder.requiresModel) {
    if (serialLabel) serialLabel.textContent = 'ENTER MODEL NUMBER';
    if (serialInput) serialInput.placeholder = decoder.modelInputLabel || 'Enter model number';
    if (serialHelper) serialHelper.textContent = 'Enter the model number — serial number decoding is not supported for Vizio';
  } else {
    if (serialLabel) serialLabel.textContent = 'ENTER SERIAL NUMBER';
    if (serialInput) serialInput.placeholder = 'Enter serial number (e.g., CB2501800)';
    if (serialHelper) serialHelper.textContent = 'Enter the serial number exactly as shown on the product label';
  }
  clearSupplementalModelError();
}

function showEraGroup() {
  document.getElementById('eraGroup').classList.remove('hidden');
}

function hideEraGroup() {
  var brandEl = document.getElementById('brand');
  var brandId = brandEl ? brandEl.value : '';
  document.getElementById('eraGroup').classList.add('hidden');
  document.getElementById('eraSelect').value = '';
}

function normalizeBrandId(brandId) {
  if (!brandId) return '';
  var raw = String(brandId).trim();
  var s = raw.toLowerCase();
  var cleaned = s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (
    cleaned === 'ge' ||
    cleaned === 'cafe' || cleaned === 'caf�' ||
    cleaned === 'ge cafe' || cleaned === 'ge caf�' || cleaned === 'ge caf' ||
    cleaned === 'ge monogram' || cleaned === 'monogram' ||
    cleaned === 'ge profile' || cleaned === 'profile' ||
    cleaned === 'hotpoint' || cleaned === 'rca'
  ) return 'ge';

  if (s === 'ge_caf' || s === 'cafe' || s === 'ge_profile' || s === 'ge_monogram' || s === 'hotpoint' || s === 'rca') return 'ge';
  return brandId;
}

function isGEFamilyBrand(brandId) {
  var raw = String(brandId || '').trim().toLowerCase();
  return raw === 'ge' || raw === 'cafe' || raw === 'ge_caf' || raw === 'ge_profile' || raw === 'ge_monogram' || raw === 'hotpoint' || raw === 'rca';
}

function getSelectedBrandLabel(brandId) {
  var sel = document.getElementById('brand');
  if (!sel) return String(brandId || '');
  for (var i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === brandId) {
      return (sel.options[i].textContent || sel.options[i].value || '').trim();
    }
  }
  return String(brandId || '');
}

function getResultBrandDisplayName(metaBrandId, decoderName, kenmoreResolution) {
  if (normalizeBrandId(metaBrandId) === 'kenmore') {
    return 'Kenmore (OEM: ' + (kenmoreResolution ? kenmoreResolution.manufacturer : decoderName) + ')';
  }
  if (resolveDecoderId(metaBrandId) === 'ge') {
    var selectedLabel = getSelectedBrandLabel(metaBrandId) || decoderName || 'GE';
    return selectedLabel + ' (GE family decoding)';
  }
  return decoderName;
}

function resolveDecoderId(metaBrandId) {
  var cyclingCat = CYCLING_BRANDS[currentCategory] || {};
  var cfg = cyclingCat[metaBrandId];
  var normalizedEntry = getNormalizedBrandEntry(currentCategory, metaBrandId);
  var normalizedDecoderId = normalizedEntry && normalizedEntry.primaryDecoderId
    ? normalizedEntry.primaryDecoderId
    : '';
  if (!cfg) {
    if (normalizedDecoderId) {
      return normalizedDecoderId;
    }
    metaBrandId = normalizeBrandId(metaBrandId);
    cfg = cyclingCat[metaBrandId];
    if (!cfg) return metaBrandId;
  }
  if (cfg.type === 'split') {
    var era = document.getElementById('eraSelect').value;
    if (era === 'post') return cfg.post;
    if (era === 'pre')  return cfg.pre;
    return null;
  }
  if (normalizedDecoderId) return normalizedDecoderId;
  return cfg.single;
}

function updateDecodeBtn() {
  var dom = getDecodeDom();
  var brandEl  = dom.brandEl;
  var serialEl = dom.serialEl;
  var btnEl    = dom.btnEl;
  var kenmorePrefixEl = document.getElementById('kenmoreModelPrefix');
  if (!brandEl || !serialEl || !btnEl) return;
  if (!hasDecoderData()) {
    btnEl.disabled = true;
    return;
  }
  syncDecoderDataRef();
  currentCategory = getActiveDecoderCategory();
  var brand  = getSelectedBrandForCategory(currentCategory) || brandEl.value;
  var serial = serialEl.value.trim();
  var modelConfig = getSupplementalModelConfig(currentCategory, brand);
  var modelValue = getStoredSupplementalModel(currentCategory).trim();
  var decoderId = brand ? resolveDecoderId(brand) : null;
  var primaryInput = modelConfig.useModelAsPrimaryInput ? modelValue : serial;
  var hasRequiredModel = modelConfig.required ? !!modelValue : true;
  btnEl.disabled = !(brand && primaryInput && decoderId && hasRequiredModel);
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
  var candidateYears = parseCandidateYears(s).filter(function(year) {
    return year >= 1980 && year <= CURRENT_YEAR;
  });
  if (candidateYears.length) {
    var newestYear = Math.max.apply(null, candidateYears);
    var newestAge = CURRENT_YEAR - newestYear;
    return newestAge >= 0 ? newestAge + ' year' + (newestAge !== 1 ? 's' : '') : '—';
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
    fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'decode', brand: brand, serial: serial, category: category, reason: reason, timestamp: new Date().toISOString() })
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
  document.getElementById('resultBrand').textContent  = getResultBrandDisplayName(brandId, decoder.name, null);
  document.getElementById('resultMethod').textContent = decoder.method || decoder.serialLengthNote || 'Check the product label and ensure the full serial number is entered.';
  document.getElementById('resultNotes').textContent  =
    sanitizeAlertText('We\u2019re sorry, our system is having trouble decoding that number. Please refer to the decoding method above.\n\nSerial entered: ' + serial);
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
    '<h4>Narrow the Date</h4>' +
    '<p class="narrow-date-note">Multiple possible dates were found. Add model/context to refine.</p>' +
    '<div class="narrow-date-fields">' +
      '<input type="text" id="narrowModelInput" class="form-input" placeholder="Model number">' +
      '<input type="text" id="narrowContextInput" class="form-input" placeholder="Optional description/context">' +
      '<button type="button" id="narrowDateBtn" class="decode-btn">Refine Result</button>' +
    '</div>' +
    '<div id="narrowDateOutput" class="narrow-date-output"></div>';
  var resultsBody = serialResults.querySelector('.results-body');
  if (resultsBody) {
    var summaryLayer = resultsBody.querySelector('#serialSummaryLayer');
    var queryLine = resultsBody.querySelector('.result-query');
    if (summaryLayer) summaryLayer.insertAdjacentElement('afterend', panel);
    else if (queryLine) queryLine.insertAdjacentElement('afterend', panel);
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
  var serialResults = document.getElementById('serialResults');
  if (!serialResults) return;
  var existing = serialResults.querySelector('.result-query');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
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
  var text = (String(result.year || '') + ' ' + String(result.month || '')).toLowerCase();
  if (text.indexOf('unknown') !== -1) return true;
  if (text.indexOf('ambiguous') !== -1) return true;
  if (text.indexOf('unable') !== -1) return true;
  if (text.indexOf('non-numeric') !== -1) return true;
  // Don't flag "/" as incomplete — Whirlpool-family brands use "YYYY/YYYY" format
  // for 30-year cycle ambiguity, which is a valid decoded result (not an error).
  // The "Important Notes" section already explains the cycle to the user.
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
      p.textContent = sanitizeAlertText('Incomplete result \u2014 please verify your inputs (brand/serial/model). If the result is still incorrect after verifying inputs, report an issue.');
    }
  } else {
    block.classList.add('hidden');
  }
}

function ensureBrandAliasSearch() {
  var brandSelect = document.getElementById('brand');
  if (!brandSelect) return null;
  if (document.getElementById('brandAliasInput')) return document.getElementById('brandAliasInput');
  var brandGroup = brandSelect.closest('.form-group');
  if (!brandGroup) return null;
  var group = document.createElement('div');
  group.className = 'form-group brand-alias-group';
  group.innerHTML = '' +
    '<label class="step-label sr-only" for="brandAliasInput">Search Brand</label>' +
    '<input type="text" id="brandAliasInput" class="form-input" list="brandAliasList" placeholder="Search brand (e.g., GE Profile, Monogram, Caf�)">' +
    '<datalist id="brandAliasList">' +
      '<option value="GE"></option>' +
      '<option value="Caf�"></option>' +
      '<option value="Cafe"></option>' +
      '<option value="GE Caf�"></option>' +
      '<option value="GE Cafe"></option>' +
      '<option value="Monogram"></option>' +
      '<option value="Profile"></option>' +
      '<option value="Hotpoint"></option>' +
      '<option value="RCA"></option>' +
    '</datalist>' +
    '<div class="helper-text">Type a brand or alias to quickly select it in the dropdown.</div>';
  brandGroup.insertAdjacentElement('beforebegin', group);

  var input = group.querySelector('#brandAliasInput');
  var applySelection = function() {
    var query = input.value.trim();
    if (!query) return;
    var normalized = normalizeBrandId(query);
    var targetId = '';
    var qLower = query.toLowerCase();
    for (var i = 0; i < brandSelect.options.length; i++) {
      var opt = brandSelect.options[i];
      var text = (opt.textContent || opt.value || '').toLowerCase();
      if (text === qLower || opt.value.toLowerCase() === qLower) {
        targetId = opt.value;
        break;
      }
    }
    if (!targetId && normalized === 'ge') {
      targetId = 'ge';
    }
    if (targetId) {
      brandSelect.value = targetId;
      onBrandChange();
      updateDecodeBtn();
    }
  };
  input.addEventListener('change', applySelection);
  input.addEventListener('input', applySelection);
  return input;
}
function ensureKenmorePrefixField() {
  return ensureModelField();
}

function updateKenmorePrefixVisibility(brandId) {
  updateModelFieldVisibility(brandId);
}

function resolveKenmoreDecoderFromPrefix(prefixValue) {
  var prefix = extractKenmoreModelPrefix(prefixValue);
  if (!prefix) {
    return { prefix: '', manufacturer: 'Whirlpool', decoderId: 'whirlpool', usedDefault: true, note: KENMORE_DEFAULT_NOTE };
  }
  var match = KENMORE_PREFIX_TO_DECODER[prefix];
  if (!match) {
    return {
      prefix: prefix,
      manufacturer: 'Whirlpool',
      decoderId: 'whirlpool',
      usedDefault: true,
      note: 'Prefix ' + prefix + ' is not in our Kenmore prefix table. ' + KENMORE_DEFAULT_NOTE
    };
  }
  return { prefix: prefix, manufacturer: match.manufacturer, decoderId: match.decoderId, usedDefault: false, note: '' };
}

function ensureModelField() {
  if (document.getElementById('modelNumber')) return document.getElementById('modelNumber');
  var serialInput = document.getElementById('serial');
  if (!serialInput) return null;
  var serialGroup = serialInput
    ? (serialInput.closest('.form-group') || serialInput.closest('.home-tool-row') || serialInput.parentNode)
    : null;
  var isInlineLayout = !!(serialGroup && serialGroup.classList && serialGroup.classList.contains('home-tool-row'));
  var group = document.createElement('div');
  group.className = (isInlineLayout ? 'model-group hidden' : 'form-group model-group hidden');
  group.innerHTML = '' +
    '<label class="' + (isInlineLayout ? 'sr-only' : 'step-label') + '" id="modelFieldLabel" for="modelNumber">Model Number</label>' +
    '<input type="text" id="modelNumber" class="' + (isInlineLayout ? 'search-input' : 'form-input') + '" placeholder="Enter model number">' +
    '<div class="' + (isInlineLayout ? 'search-hint' : 'helper-text') + ' model-note" id="modelFieldHint"></div>' +
    '<div class="' + (isInlineLayout ? 'search-hint' : 'helper-text') + ' model-error hidden" id="modelFieldError" style="color:#fca5a5;"></div>';
  if (serialGroup && serialGroup.parentNode) {
    serialGroup.insertAdjacentElement('afterend', group);
  } else {
    serialInput.parentNode.appendChild(group);
  }
  if (isInlineLayout) {
    group.style.marginTop = '8px';
  }
  var input = document.getElementById('modelNumber');
  if (input && input.getAttribute('data-model-bound') !== '1') {
    input.setAttribute('data-model-bound', '1');
    input.addEventListener('input', function() {
      var category = getActiveDecoderCategory();
      var config = getSupplementalModelConfig(category, getSelectedBrandForCategory(category));
      var nextValue = typeof config.sanitize === 'function' ? config.sanitize(input.value) : input.value;
      if (input.value !== nextValue) input.value = nextValue;
      setStoredSupplementalModel(category, nextValue);
      if (nextValue.trim()) clearSupplementalModelError();
      updateDecodeBtn();
    });
  }
  return input;
}

function updateModelFieldVisibility(brandId) {
  var modelInput = ensureModelField();
  if (!modelInput) return;
  var group = modelInput.closest('.model-group');
  if (!group) return;
  var category = getActiveDecoderCategory();
  var config = getSupplementalModelConfig(category, brandId);
  var labelEl = document.getElementById('modelFieldLabel');
  var hintEl = document.getElementById('modelFieldHint');
  var value = getStoredSupplementalModel(category);

  if (!config.visible) {
    group.classList.add('hidden');
    modelInput.value = '';
    clearSupplementalModelError();
    return;
  }

  group.classList.remove('hidden');
  if (labelEl) labelEl.textContent = config.label;
  modelInput.placeholder = config.placeholder || 'Enter model number';
  modelInput.value = typeof config.sanitize === 'function' ? config.sanitize(value) : value;
  if (hintEl) hintEl.textContent = config.note || '';

  if (config.inputMode) modelInput.setAttribute('inputmode', config.inputMode);
  else modelInput.removeAttribute('inputmode');
  if (config.pattern) modelInput.setAttribute('pattern', config.pattern);
  else modelInput.removeAttribute('pattern');
  if (config.maxLength) modelInput.setAttribute('maxlength', String(config.maxLength));
  else modelInput.removeAttribute('maxlength');
}

function requiresModelForBrand(brandId) {
  return !!getSupplementalModelConfig(getActiveDecoderCategory(), brandId).required;
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

function renderSerialSummaryLayer() {
  var layer = document.getElementById('serialSummaryLayer');
  var serialEl = document.getElementById('serial');
  var yearEl = document.getElementById('resultYear');
  var monthEl = document.getElementById('resultMonth');
  var brandEl = document.getElementById('resultBrand');
  var ageEl = document.getElementById('resultEstimatedAge');
  var methodEl = document.getElementById('resultMethod');
  var notesEl = document.getElementById('resultNotes');
  var monthRow = document.getElementById('resultMonthRow');
  var determinationEl = document.getElementById('serialDeterminationBody');
  var serialValue = serialEl ? (serialEl.value || '').trim() : '';
  var year = yearEl ? (yearEl.textContent || '').trim() : '';
  var month = monthEl ? (monthEl.textContent || '').trim() : '';
  var brand = brandEl ? (brandEl.textContent || '').trim() : '';
  var age = ageEl ? (ageEl.textContent || '').trim() : '';
  var method = methodEl ? (methodEl.textContent || '').trim() : '';
  var notes = notesEl ? (notesEl.textContent || '').trim() : '';
  var determination = determinationEl ? (determinationEl.textContent || '').trim() : '';
  var monthVisible = !monthRow || !window.getComputedStyle || window.getComputedStyle(monthRow).display !== 'none';
  var queryText = buildSearchQueryText();
  var heroRows = [];
  var refinementMount;
  var refinePanel;
  var lkqMount;
  var lkqEntrySection;

  if (!layer) return;

  if (monthVisible && month) heroRows.push('<div class="serial-hero-row"><span class="serial-hero-row-label">Month / Period</span><span class="serial-hero-row-value">' + esc(month) + '</span></div>');
  heroRows.push('<div class="serial-hero-row"><span class="serial-hero-row-label">Brand</span><span class="serial-hero-row-value">' + esc(brand || 'N/A') + '</span></div>');
  heroRows.push('<div class="serial-hero-row"><span class="serial-hero-row-label">Estimated Age</span><span class="serial-hero-row-value">' + esc((age && age !== '—') ? age : 'N/A') + '</span></div>');

  layer.innerHTML = '' +
    '<div class="serial-query-chip">' + esc(queryText || 'Search Query: —') + '</div>' +
    '<div class="serial-top-grid">' +
      '<section class="serial-result-hero">' +
        '<div class="serial-result-eyebrow">Decoded Result</div>' +
        '<div class="serial-result-main">' + esc(year || 'N/A') + '</div>' +
        '<div class="serial-result-subline"><strong>Serial Number:</strong> ' + esc(serialValue || '—') + '</div>' +
        '<div class="serial-hero-rows">' + heroRows.join('') + '</div>' +
      '</section>' +
      '<div class="sl-summary-card serial-method-card">' +
        '<h4>Decoding Method</h4>' +
        '<p class="sl-panel-copy">' + esc(method || 'Method unavailable.') + '</p>' +
      '</div>' +
    '</div>' +
    '<div class="serial-secondary-grid">' +
      '<div id="serialRefinementMount"></div>' +
      '<div id="serialLkqMount"></div>' +
    '</div>' +
    '<div class="serial-bottom-grid">' +
      '<div class="sl-summary-card">' +
        '<h4>Important Notes</h4>' +
        '<p class="sl-panel-copy">' + esc(notes || 'No additional notes.') + '</p>' +
      '</div>' +
      '<div class="sl-summary-card">' +
        '<h4>How this was determined</h4>' +
        '<p class="sl-panel-copy">' + esc(determination || 'We used the brand\'s serial format rules to estimate the manufacture date.') + '</p>' +
      '</div>' +
    '</div>';

  refinementMount = document.getElementById('serialRefinementMount');
  refinePanel = ensureRefinementPanel();
  if (refinePanel && refinementMount) refinementMount.appendChild(refinePanel);

  lkqMount = document.getElementById('serialLkqMount');
  lkqEntrySection = document.querySelector('.lkq-entry-section');
  if (lkqEntrySection && lkqMount) lkqMount.appendChild(lkqEntrySection);

  if (refinePanel && refinePanel.classList && refinePanel.classList.contains('hidden')) {
    layer.classList.add('serial-no-refine');
  } else {
    layer.classList.remove('serial-no-refine');
  }

  layer.classList.remove('hidden');
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

// ===== SERIAL DECODE =====
function decodeSerial() {
  var dom = getDecodeDom();
  if (!dom.brandEl || !dom.serialEl) return;
  if (!hasDecoderData()) {
    ensureDecoderDataLoaded(function(error) {
      if (error) {
        showCustomAlert('The decoder is still loading. Please try again.');
        return;
      }
      initializeDecoderUiWhenReady();
      decodeSerial();
    });
    return;
  }
  syncDecoderDataRef();
  currentCategory = getActiveDecoderCategory();
  var metaBrandId = getSelectedBrandForCategory(currentCategory) || dom.brandEl.value;
  var modelConfig = getSupplementalModelConfig(currentCategory, metaBrandId);
  var supplementalModel = getStoredSupplementalModel(currentCategory).trim();
  var serialInput = dom.serialEl.value.trim();
  clearSupplementalModelError();
  if (!metaBrandId) return;
  if (modelConfig.required && !supplementalModel) {
    showSupplementalModelError(modelConfig.missingMessage || 'Model is required.');
    var modelInput = document.getElementById('modelNumber');
    if (modelInput && modelInput.focus) modelInput.focus();
    return;
  }
  if (!serialInput && !modelConfig.useModelAsPrimaryInput) return;
  var serial = serialInput.replace(/[^A-Za-z0-9]/g, '');
  if (!serial && !modelConfig.useModelAsPrimaryInput) return;
  if (serial !== serialInput) dom.serialEl.value = serial;

  if (isBrandPage()) {
    var currentSlug = getBrandPageSlug();
    var targetSlug = BRAND_PAGE_BY_ID[metaBrandId] || BRAND_PAGE_BY_ID[(metaBrandId || '').replace(/-/g, '_')];
    if (targetSlug && currentSlug && targetSlug !== currentSlug) {
      var path = window.location.pathname || '';
      if (path === '/' || path.includes('index')) {
        window.location.href = '/' + targetSlug + '?serial=' + encodeURIComponent(serial);
      }
      return;
    }
  }

  var brandId = resolveDecoderId(metaBrandId);
  if (!brandId) {
    showCustomAlert('Please select the manufacture era for this brand.');
    return;
  }

  var isKenmore = (normalizeBrandId(metaBrandId) === 'kenmore');
  var kenmoreResolution = null;
  if (isKenmore) {
    kenmoreResolution = resolveKenmoreDecoderFromPrefix(supplementalModel);
    brandId = kenmoreResolution.decoderId;
  }

  var decoder = decoderData[currentCategory].decoders[brandId];
  if (!decoder) { showCustomAlert('Decoder not found for this brand'); return; }
  if (modelConfig.useModelAsPrimaryInput) {
    serial = supplementalModel.replace(/[^A-Za-z0-9-]/g, '').trim();
  }

  clearDecodeEntryFields({ categoryKey: currentCategory });

  updateSearchQueryLine();

  // Show loading animation immediately
  document.getElementById('serialResults').classList.add('hidden');
  var _ageResultsDecode = document.getElementById('ageResults');
  if (_ageResultsDecode) _ageResultsDecode.classList.add('hidden');
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
      if (_yr && _yr.closest) { var r1 = _yr.closest('.result-row'); if (r1) r1.style.display = ''; }
      if (_ae && _ae.closest) { var r2 = _ae.closest('.result-row'); if (r2) r2.style.display = ''; }
    })();

    var result = decoder.decode(serial, supplementalModel);
    var sanity  = sanitizeDecodeResult(result);
    var monthRow  = document.getElementById('resultMonthRow');

    if (!result || !sanity.valid) {
      var _reason = !result
        ? 'Decoder returned null for serial: ' + serial
        : (sanity.reason || 'Sanity check failed');
      showDecodeFallback(decoder, serial, metaBrandId, _reason);
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
        document.getElementById('resultNotes').textContent  = sanitizeAlertText('No matching dates found for the selected era. Try switching to Pre-2006 or Post-2006.');
        updateResultWarning({ year: 'Unknown', month: '' }, metaBrandId);
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
        showBrandLogo('serialBrandLogo', metaBrandId, decoder.name);
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
    document.getElementById('resultBrand').textContent = getResultBrandDisplayName(metaBrandId, decoder.name, kenmoreResolution);
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
    if (parseCandidateYears(result.year).length > 1) {
      var verificationNote = 'Multiple manufacturer dates match this serial format. Estimated age uses the most recent valid date. Search the model number for full verification.';
      if (notesText === 'N/A') notesText = verificationNote;
      else if (notesText.indexOf(verificationNote) === -1) notesText += ' ' + verificationNote;
    }
    if (isKenmore && kenmoreResolution && kenmoreResolution.note) {
      notesText = kenmoreResolution.note + (notesText ? ' ' + notesText : '');
    }
    document.getElementById('resultNotes').textContent = sanitizeAlertText(notesText);
    updateResultWarning(result, metaBrandId);

    // Compute derived display fields from output shape (no decode rules exposed)
    var _displayedYear = document.getElementById('resultYear').textContent;
    document.getElementById('resultEstimatedAge').textContent = computeEstimatedAge(_displayedYear);

    showBrandLogo('serialBrandLogo', metaBrandId, decoder.name);
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

    renderSerialSummaryLayer();

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
function scrollPageToTop(forceInstant) {
  var behavior = forceInstant ? 'auto' : 'smooth';
  try {
    window.scrollTo({ top: 0, left: 0, behavior: behavior });
  } catch (_) {
    window.scrollTo(0, 0);
  }
  if (document.documentElement) document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
}

function scrollHomeSearchToTop() {
  function forceTop() {
    scrollPageToTop(true);
  }

  forceTop();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(forceTop);
    requestAnimationFrame(function() {
      requestAnimationFrame(forceTop);
    });
  }
  setTimeout(forceTop, 60);
  setTimeout(forceTop, 180);
}

function decodeAnotherItem() {
  var serialResults = document.getElementById('serialResults');
  var ageResults = document.getElementById('ageResults');
  var ageLoading = document.getElementById('ageLoading');
  var serialInput = document.getElementById('serial');
  var altQuery = getSmartLookupInputEl();
  if (serialResults) serialResults.classList.add('hidden');
  if (ageResults) ageResults.classList.add('hidden');
  if (ageLoading) ageLoading.classList.add('hidden');
  var serialSummaryLayer = document.getElementById('serialSummaryLayer');
  if (serialSummaryLayer) {
    serialSummaryLayer.innerHTML = '';
    serialSummaryLayer.classList.add('hidden');
  }
  if (serialInput) serialInput.value = '';
  var kenmorePrefix = document.getElementById('kenmoreModelPrefix');
  if (kenmorePrefix) kenmorePrefix.value = '';
  if (altQuery) altQuery.value = '';
  if (document.getElementById('eraGroup')) hideEraGroup();
  var refinePanel = document.querySelector('.narrow-date-panel');
  if (refinePanel) refinePanel.classList.add('hidden');
  var refineOut = document.getElementById('narrowDateOutput');
  if (refineOut) refineOut.innerHTML = '';
  var serialLkqResults = document.getElementById('serialLkqResults');
  if (serialLkqResults) serialLkqResults.classList.add('hidden');
  var serialModelInput = document.getElementById('serial-lkq-model-input');
  if (serialModelInput) serialModelInput.value = '';
  LKQEngine.clearInstance('serial-decoder');
  LKQEngine.clearInstance('smart-lookup');
  clearSmartLookupAssist();
  updateDecodeBtn();
  scrollPageToTop(true);
  setTimeout(function() {
    if (serialInput) {
      try {
        serialInput.focus({ preventScroll: true });
      } catch (error) {
        serialInput.focus();
      }
    } else if (altQuery) {
      try {
        altQuery.focus({ preventScroll: true });
      } catch (error) {
        altQuery.focus();
      }
    }
  }, 400);
}

function useSmartLookup() {
  decodeAnotherItem();
  var altQuery = getSmartLookupInputEl();
  if (altQuery) {
    try {
      altQuery.focus({ preventScroll: true });
    } catch (_) {
      altQuery.focus();
    }
    var altSection = document.getElementById('altSection');
    if (altSection && !altSection.classList.contains('open')) {
      altSection.classList.add('open');
    }
  }
  scrollHomeSearchToTop();
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
  var iconColor = isCapacity ? '#b45309' : '#0369a1';
  var safeMessage = sanitizeAlertText(message);
  var alertIcon = '' +
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="flex:0 0 auto;fill:' + iconColor + ';">' +
      '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15h-2v-2h2Zm0-4h-2V7h2Z"></path>' +
    '</svg>';
  if (body) {
    body.innerHTML =
      '<div style="background:' + bg + ';border-left:3px solid ' + border + ';border-radius:8px;padding:1rem 1.125rem;font-size:0.875rem;color:' + color + ';line-height:1.65;display:flex;gap:0.625rem;align-items:flex-start;">' +
      alertIcon +
      '<div style="min-width:0;">' + safeMessage + '</div>' +
      '</div>';
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

// ===== ESTIMATE AGE — delegates to LKQ engine (Smart Lookup entry point) =====
function estimateAge() {
  runLKQLookup();
}

function escapeSmartLookupHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeSmartLookupQuery(query) {
  return String(query || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function expandKnownSmartLookupQuery(query) {
  var text = normalizeSmartLookupQuery(query);
  var normalized = text.toLowerCase();
  if (!text) return '';

  if (/\blr3re(?:-\d+)?\b/.test(normalized)) {
    if (!/\blitter[\s-]*robot\b/.test(normalized)) {
      return text + ' Whisker Litter-Robot 3 Open Air self-cleaning litter box';
    }
    return text;
  }

  if (/\blitter[\s-]*robot\b/.test(normalized) && !/\bself[\s-]*clean/i.test(text)) {
    return text + ' self-cleaning litter box by Whisker';
  }

  return text;
}

function getSmartLookupAssistHost() {
  var input = getSmartLookupInputEl();
  if (!input) return null;
  return input.closest('.form-group') || input.closest('.search-panel') || input.closest('.lookup-box') || input.closest('.alt-inner') || input.parentNode;
}

function ensureSmartLookupAssistEl() {
  var existing = document.getElementById('smart-lookup-assist');
  var anchor;
  var host;
  var el;
  if (existing) return existing;
  anchor = getSmartLookupAssistHost();
  host = anchor && anchor.parentNode ? anchor.parentNode : null;
  if (!host) return null;
  el = document.createElement('div');
  el.id = 'smart-lookup-assist';
  el.className = 'smart-lookup-assist hidden';
  if (anchor.nextSibling) host.insertBefore(el, anchor.nextSibling);
  else host.appendChild(el);
  return el;
}

function clearSmartLookupAssist() {
  var el = document.getElementById('smart-lookup-assist');
  if (!el) return;
  el.innerHTML = '';
  el.classList.add('hidden');
}

function showSmartLookupAssistLoading() {
  var el = ensureSmartLookupAssistEl();
  if (!el) return;
  el.classList.remove('hidden');
  el.innerHTML =
    '<div class="smart-lookup-assist-card">' +
      '<div class="smart-lookup-assist-title">Checking Your Search</div>' +
      '<p class="smart-lookup-assist-note">Classifying your search before any LKQ results are generated.</p>' +
    '</div>';
}

function looksLikeSpecificSmartLookupQuery(query) {
  var value = normalizeSmartLookupQuery(query);
  var compact;
  var tokens;
  var hasMixedToken;
  var hasLongDigitRun;
  if (!value) return false;

  compact = value.replace(/[^A-Za-z0-9]/g, '');
  tokens = value.split(/\s+/).filter(Boolean);
  hasMixedToken = tokens.some(function (token) {
    return /[A-Za-z]/.test(token) && /\d/.test(token) && token.replace(/[^A-Za-z0-9]/g, '').length >= 5;
  });
  hasLongDigitRun = /\b\d{5,}\b/.test(value);

  if (hasMixedToken) return true;
  if (compact.length >= 8 && /[A-Za-z]/.test(compact) && /\d/.test(compact)) return true;
  if (tokens.length >= 3 && hasLongDigitRun) return true;
  return false;
}

async function fetchSmartLookupInterpretation(query) {
  var res = await fetch('/api/smart-query-interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query }),
  });
  var data = await parseJsonResponseSafe(res, 'smart-query-interpret');
  if (!res.ok) {
    var err = new Error((data && data.error) || 'Interpretation unavailable');
    err.code = data && data.errorCode ? data.errorCode : '';
    throw err;
  }
  return data || {};
}

async function fetchSmartLookupGeneral(query) {
  var res = await fetch('/api/smart-query-general', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query }),
  });
  var data = await parseJsonResponseSafe(res, 'smart-query-general');
  if (!res.ok) {
    var err = new Error((data && data.error) || 'General lookup unavailable');
    err.code = data && data.errorCode ? data.errorCode : '';
    throw err;
  }
  return data || {};
}

async function fetchAgeLookup(query) {
  var res = await fetch('/api/age-lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query }),
  });
  var data = await parseJsonResponseSafe(res, 'age-lookup');
  if (!res.ok) {
    var err = new Error((data && data.error) || 'Age lookup unavailable');
    err.code = data && data.errorCode ? data.errorCode : '';
    throw err;
  }
  return data || {};
}

function showAgeLookupResults(displayQuery, data) {
  var ageResultsEl = document.getElementById('ageResults');
  var resultsEl = getSmartLookupResultsEl();
  var fields;
  var details;
  if (!resultsEl) return;

  fields = [
    { label: 'Search', value: displayQuery || '—' },
    { label: 'Brand', value: data.brand || 'Unknown' },
    { label: 'Model', value: data.model || 'Unknown' },
    { label: 'Specificity', value: data.specificityLevel || 'Unknown' },
    { label: 'Estimated Year', value: data.estimatedYear || 'Unknown' },
    { label: 'Production Range', value: data.yearRange || 'Unknown' }
  ];

  details = [];
  if (data.inventionSummary) details.push('<p>' + escapeSmartLookupHtml(data.inventionSummary) + '</p>');
  if (data.notes) details.push('<p>' + escapeSmartLookupHtml(data.notes) + '</p>');
  if (data.refinementSuggestion) details.push('<p><strong>Refine Search:</strong> ' + escapeSmartLookupHtml(data.refinementSuggestion) + '</p>');
  if (data.serialRule) details.push('<p><strong>Serial Rule:</strong> ' + escapeSmartLookupHtml(data.serialRule) + '</p>');
  if (data.serialLocation) details.push('<p><strong>Serial Location:</strong> ' + escapeSmartLookupHtml(data.serialLocation) + '</p>');
  if (data.exampleModelNumber) details.push('<p><strong>Example Model:</strong> ' + escapeSmartLookupHtml(data.exampleModelNumber) + '</p>');
  if (Array.isArray(data.suggestedModelNumbers) && data.suggestedModelNumbers.length) {
    details.push('<p><strong>Suggested Models:</strong> ' + escapeSmartLookupHtml(data.suggestedModelNumbers.join(', ')) + '</p>');
  }

  resultsEl.innerHTML =
    '<div class="smart-age-grid">' +
      '<div class="smart-general-section smart-age-section">' +
        '<div class="smart-general-section-title">Item Identification</div>' +
        '<div class="smart-age-rows">' +
          fields.map(function (field) {
            return '' +
              '<div class="smart-age-row">' +
                '<span class="smart-age-label">' + escapeSmartLookupHtml(field.label) + '</span>' +
                '<span class="smart-age-value">' + escapeSmartLookupHtml(field.value) + '</span>' +
              '</div>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="smart-general-section smart-age-section">' +
        '<div class="smart-general-section-title">Research Notes</div>' +
        '<div class="smart-age-copy">' + (details.join('') || '<p>No additional details found.</p>') + '</div>' +
      '</div>' +
    '</div>';

  if (ageResultsEl) {
    ageResultsEl.classList.remove('hidden');
    ageResultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function buildProgressiveAgeLookupMarkup(displayQuery, data) {
  var fields = [
    { label: 'Search', value: displayQuery || 'â€”' },
    { label: 'Brand', value: data.brand || 'Unknown' },
    { label: 'Model', value: data.model || 'Unknown' },
    { label: 'Specificity', value: data.specificityLevel || 'Unknown' },
    { label: 'Estimated Year', value: data.estimatedYear || 'Unknown' },
    { label: 'Production Range', value: data.yearRange || 'Unknown' }
  ];
  var details = [];

  if (data.inventionSummary) details.push('<p>' + escapeSmartLookupHtml(data.inventionSummary) + '</p>');
  if (data.notes) details.push('<p>' + escapeSmartLookupHtml(data.notes) + '</p>');
  if (data.refinementSuggestion) details.push('<p><strong>Refine Search:</strong> ' + escapeSmartLookupHtml(data.refinementSuggestion) + '</p>');
  if (data.serialRule) details.push('<p><strong>Serial Rule:</strong> ' + escapeSmartLookupHtml(data.serialRule) + '</p>');
  if (data.serialLocation) details.push('<p><strong>Serial Location:</strong> ' + escapeSmartLookupHtml(data.serialLocation) + '</p>');
  if (data.exampleModelNumber) details.push('<p><strong>Example Model:</strong> ' + escapeSmartLookupHtml(data.exampleModelNumber) + '</p>');
  if (Array.isArray(data.suggestedModelNumbers) && data.suggestedModelNumbers.length) {
    details.push('<p><strong>Suggested Models:</strong> ' + escapeSmartLookupHtml(data.suggestedModelNumbers.join(', ')) + '</p>');
  }

  return '' +
    '<div class="smart-age-grid">' +
      '<div class="smart-general-section smart-age-section">' +
        '<div class="smart-general-section-title">Item Identification</div>' +
        '<div class="smart-age-rows">' +
          fields.map(function (field) {
            return '' +
              '<div class="smart-age-row">' +
                '<span class="smart-age-label">' + escapeSmartLookupHtml(field.label) + '</span>' +
                '<span class="smart-age-value">' + escapeSmartLookupHtml(field.value) + '</span>' +
              '</div>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="smart-general-section smart-age-section">' +
        '<div class="smart-general-section-title">Research Notes</div>' +
        '<div class="smart-age-copy">' + (details.join('') || '<p>No additional details found.</p>') + '</div>' +
      '</div>' +
    '</div>';
}

function createSmartLookupProgressiveShell(resultsEl) {
  var stack;
  if (!resultsEl) return null;
  resultsEl.innerHTML =
    '<div class="sl-progressive-stack">' +
      '<div class="sl-progressive-card-slot is-loading" data-slot="age">' +
        '<div class="sl-progressive-skeleton">' +
          '<div class="sl-progressive-skeleton-title"></div>' +
          '<div class="sl-progressive-skeleton-line w-100"></div>' +
          '<div class="sl-progressive-skeleton-line w-70"></div>' +
          '<div class="sl-progressive-skeleton-line w-85"></div>' +
        '</div>' +
      '</div>' +
      '<div class="sl-progressive-card-slot is-loading" data-slot="lkq">' +
        '<div class="sl-progressive-skeleton">' +
          '<div class="sl-progressive-skeleton-title"></div>' +
          '<div class="sl-progressive-skeleton-line w-100"></div>' +
          '<div class="sl-progressive-skeleton-line w-90"></div>' +
          '<div class="sl-progressive-skeleton-line w-60"></div>' +
        '</div>' +
      '</div>' +
      '<div class="sl-progressive-card-slot is-loading" data-slot="price">' +
        '<div class="sl-progressive-skeleton">' +
          '<div class="sl-progressive-skeleton-title"></div>' +
          '<div class="sl-progressive-skeleton-line w-80"></div>' +
          '<div class="sl-progressive-skeleton-line w-65"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  stack = resultsEl.querySelector('.sl-progressive-stack');
  return stack ? {
    ageSlot: stack.querySelector('[data-slot="age"]'),
    lkqSlot: stack.querySelector('[data-slot="lkq"]'),
    priceSlot: stack.querySelector('[data-slot="price"]')
  } : null;
}

function buildSmartLookupCardElement(innerHtml, extraClass) {
  var wrapper = document.createElement('div');
  wrapper.className = 'sl-progressive-card' + (extraClass ? (' ' + extraClass) : '');
  wrapper.innerHTML = innerHtml;
  return wrapper;
}

function buildSmartLookupStatusCard(title, message) {
  return buildSmartLookupCardElement(
    '<div class="smart-general-section smart-age-section">' +
      '<div class="smart-general-section-title">' + escapeSmartLookupHtml(title) + '</div>' +
      '<div class="smart-age-copy"><p>' + escapeSmartLookupHtml(message) + '</p></div>' +
    '</div>',
    'sl-progressive-card--status'
  );
}

function mountSmartLookupProgressiveSlot(slot, contentEl) {
  if (!slot || !contentEl) return;
  slot.classList.remove('is-hidden', 'is-ready', 'is-loading');
  slot.innerHTML = '';
  slot.appendChild(contentEl);
  requestAnimationFrame(function () {
    slot.classList.add('is-ready');
  });
}

function hideSmartLookupProgressiveSlot(slot) {
  if (!slot) return;
  slot.innerHTML = '';
  slot.classList.remove('is-loading', 'is-ready');
  slot.classList.add('is-hidden');
}

function evaluateSmartLookupLkq(instanceId, query, resultsEl) {
  return new Promise(function (resolve, reject) {
    LKQEngine.evaluate(instanceId, query, resultsEl, {
      onSuccess: function (lkqData) {
        resolve(lkqData || {});
      },
      onError: function (type, message) {
        var err = new Error(message || 'Smart Lookup is temporarily unavailable. Please try again.');
        err.lookupType = type || 'unknown';
        reject(err);
      }
    });
  });
}

async function runAgeOnlyLookup(query, opts) {
  var ageResultsEl = document.getElementById('ageResults');
  var serialResultsEl = document.getElementById('serialResults');
  var ageLoadingEl = document.getElementById('ageLoading');
  var displayQuery = normalizeSmartLookupQuery((opts && opts.displayQuery) || query);
  var loadStart;

  clearSmartLookupAssist();
  if (ageResultsEl) ageResultsEl.classList.add('hidden');
  if (serialResultsEl) serialResultsEl.classList.add('hidden');
  setLoadingActive();
  if (ageLoadingEl) ageLoadingEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  loadStart = Date.now();

  try {
    var data = await fetchAgeLookup(query);
    var elapsed = Date.now() - loadStart;
    var remaining = Math.max(0, 200 - elapsed);
    currentFeedbackContext = { brand: data.brand || '', serial: displayQuery };
    trackSmartLookupEvent('result_success', { query: displayQuery, queryKind: 'age-only', brand: data.brand || '', category: data.itemCategory || '', resultType: 'age-only' });
    setTimeout(function () {
      setLoadingSuccess(function () {
        showAgeLookupResults(displayQuery, data);
      });
    }, remaining);
  } catch (_) {
    trackSmartLookupEvent('result_failure', { query: displayQuery, queryKind: 'age-only', resultType: 'age-only' });
    setLoadingHidden();
    showSmartLookupNotice('limit', 'Smart Lookup is temporarily unavailable. Please try again.');
  }
}

function showGeneralSmartLookupResults(query, data) {
  var ageResultsEl = document.getElementById('ageResults');
  var resultsEl = getSmartLookupResultsEl();
  var refineOptions = Array.isArray(data && data.refineOptions) ? data.refineOptions.slice(0, 5) : [];
  var averageLabel = (data && data.averageModelLabel) || (data && data.averageModelQuery) || '';
  var averageQuery = (data && data.averageModelQuery) || '';
  var category = (data && data.itemCategory) || 'General Property Item';
  var brand = (data && data.brand) || '';
  var headingMeta = [];
  if (!resultsEl) return;
  if (brand) headingMeta.push('<span><strong>Brand:</strong> ' + escapeSmartLookupHtml(brand) + '</span>');
  headingMeta.push('<span><strong>Category:</strong> ' + escapeSmartLookupHtml(category) + '</span>');

  resultsEl.innerHTML =
    '<div class="smart-general-card smart-general-card-upgraded">' +
      '<div class="smart-general-section smart-general-overview smart-general-hero">' +
        '<div class="smart-general-kicker">General result</div>' +
        '<div class="smart-general-section-title">We found the product family, but not a single verified model yet</div>' +
        '<div class="smart-general-meta">' + headingMeta.join('') + '</div>' +
        '<p class="smart-general-overview-text">' + escapeSmartLookupHtml((data && data.overview) || '') + '</p>' +
        '<p class="smart-general-overview-note">This is intentional: your search is broad enough to describe a family of products, so the result stays general until you choose a more specific model path.</p>' +
      '</div>' +
      '<div class="smart-general-section smart-general-steps">' +
        '<div class="smart-general-section-title">Best next step</div>' +
        '<div class="smart-general-path-grid">' +
          '<div class="smart-general-path-card smart-general-path-card-primary"><strong>1. Pick a likely model</strong><span>Best for a defendable replacement result.</span></div>' +
          '<div class="smart-general-path-card"><strong>2. Run average-model comparison</strong><span>Useful when only the product family is known.</span></div>' +
          '<div class="smart-general-path-card"><strong>3. Research more model numbers</strong><span>Open a broader search if you need to identify the exact unit first.</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="smart-general-section smart-general-refine">' +
        '<div class="smart-general-section-title">Choose a more specific model path</div>' +
        '<p class="smart-general-subtitle">Tap one of these likely refinements to move from a general category result to a model-based replacement evaluation.</p>' +
        '<div class="smart-general-refine-list">' +
          refineOptions.map(function (item, index) {
            return '<button type="button" class="smart-general-refine-pill" data-refine-query="' + escapeSmartLookupHtml(item.query) + '" data-refine-index="' + index + '">' + escapeSmartLookupHtml(item.label) + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="smart-general-section smart-general-lkq">' +
        '<div class="smart-general-section-title">Continue with a guided fallback</div>' +
        '<div class="smart-general-lkq-placeholder" id="smart-general-lkq-placeholder">' +
          '<div class="smart-general-lkq-actions">' +
            '<button type="button" class="smart-general-primary" id="smart-general-average-btn">Run average-model replacement check</button>' +
            '<button type="button" class="smart-general-secondary" id="smart-general-research-btn">Research more possible models</button>' +
          '</div>' +
          '<p class="smart-general-subtitle">If you cannot identify the exact model, use the average-model path as a rougher first pass and document that the result remains generalized.</p>' +
        '</div>' +
        '<div class="smart-general-lkq-note" id="smart-general-lkq-note"></div>' +
        '<div class="smart-general-lkq-target" id="smart-general-lkq-target"></div>' +
      '</div>' +
    '</div>';

  Array.prototype.forEach.call(resultsEl.querySelectorAll('[data-refine-query]'), function (btn) {
    btn.addEventListener('click', function () {
      var placeholder = document.getElementById('smart-general-lkq-placeholder');
      var target = document.getElementById('smart-general-lkq-target');
      var note = document.getElementById('smart-general-lkq-note');
      var nextQuery = normalizeSmartLookupQuery(btn.getAttribute('data-refine-query'));
      var inputEl = getSmartLookupInputEl();
      if (!nextQuery || !target) return;
      trackSmartLookupEvent('refinement_click', { query: query, refinedQuery: nextQuery, queryKind: 'general' });
      if (inputEl) inputEl.value = nextQuery;
      if (placeholder) placeholder.classList.add('hidden');
      if (note) note.textContent = '';
      executeSmartLookup(nextQuery, {
        targetEl: target,
        preserveGeneral: true,
        instanceId: 'smart-lookup-general'
      });
    });
  });

  (function bindAverageAndResearch() {
    var avgBtn = document.getElementById('smart-general-average-btn');
    var researchBtn = document.getElementById('smart-general-research-btn');
    var target = document.getElementById('smart-general-lkq-target');
    var note = document.getElementById('smart-general-lkq-note');
    if (avgBtn) {
      avgBtn.disabled = !averageQuery;
      avgBtn.addEventListener('click', function () {
        var placeholder = document.getElementById('smart-general-lkq-placeholder');
        var inputEl = getSmartLookupInputEl();
        if (!averageQuery || !target) return;
        trackSmartLookupEvent('refinement_click', { query: query, refinedQuery: averageQuery, queryKind: 'general', action: 'average-model' });
        if (inputEl) inputEl.value = averageQuery;
        if (placeholder) placeholder.classList.add('hidden');
        if (note) {
          note.textContent = 'LKQ options calculated based on an average ' +
            (((brand ? brand + ' ' : '') + ((data && data.averageModelCategory) || category)).trim()) +
            ' model. For more accurate results, select a specific model above.';
        }
        executeSmartLookup(averageQuery, {
          targetEl: target,
          preserveGeneral: true,
          instanceId: 'smart-lookup-general'
        });
      });
    }
    if (researchBtn) {
      researchBtn.addEventListener('click', function () {
        trackSmartLookupEvent('refinement_click', { query: query, queryKind: 'general', action: 'research-more-models' });
        window.open('https://www.google.com/search?q=' + encodeURIComponent(query + ' model numbers'), '_blank', 'noopener,noreferrer');
      });
    }
  })();

  trackSmartLookupEvent('result_success', { query: query, queryKind: 'general', brand: brand, category: category, resultType: 'general' });
  if (ageResultsEl) {
    ageResultsEl.classList.remove('hidden');
    ageResultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function showUnrecognizedSmartLookupResults(query, interpreted) {
  var ageResultsEl = document.getElementById('ageResults');
  var serialResultsEl = document.getElementById('serialResults');
  var resultsEl = getSmartLookupResultsEl();
  var suggestions = Array.isArray(interpreted && interpreted.suggestions) ? interpreted.suggestions.filter(Boolean).slice(0, 5) : [];
  if (!resultsEl) return;
  if (serialResultsEl) serialResultsEl.classList.add('hidden');

  resultsEl.innerHTML =
    '<div class="smart-unrecognized-card">' +
      '<div class="smart-unrecognized-title">We weren&apos;t sure what you meant by \'' + escapeSmartLookupHtml(query) + '\'</div>' +
      '<div class="smart-unrecognized-subtitle">Did you mean?</div>' +
      '<div class="smart-unrecognized-suggestions">' +
        suggestions.map(function (item) {
          return '<button type="button" class="smart-unrecognized-pill" data-unrecognized-query="' + escapeSmartLookupHtml(item) + '">' + escapeSmartLookupHtml(item) + '</button>';
        }).join('') +
      '</div>' +
      (!suggestions.length ? '<p class="smart-unrecognized-empty">No results found.</p>' : '') +
      '<div class="smart-unrecognized-tips-title">Not what you were looking for? Try these tips:</div>' +
      '<ul class="smart-unrecognized-tips">' +
        '<li>Include the brand name (e.g. Samsung, LG, Carrier)</li>' +
        '<li>Include the item type (e.g. refrigerator, AC unit, breaker panel)</li>' +
        '<li>Include the model number if available for the most accurate results</li>' +
      '</ul>' +
      '<div class="smart-unrecognized-form">' +
        '<input type="text" class="search-input smart-unrecognized-input" id="smart-unrecognized-input" value="' + escapeSmartLookupHtml(query) + '">' +
        '<button type="button" class="smart-unrecognized-submit" id="smart-unrecognized-submit">Search Again</button>' +
      '</div>' +
    '</div>';

  Array.prototype.forEach.call(resultsEl.querySelectorAll('[data-unrecognized-query]'), function (btn) {
    btn.addEventListener('click', function () {
      var nextQuery = normalizeSmartLookupQuery(btn.getAttribute('data-unrecognized-query'));
      var inputEl = getSmartLookupInputEl();
      if (!nextQuery) return;
      clearSmartLookupAssist();
      if (inputEl) inputEl.value = nextQuery;
      executeSmartLookup(nextQuery);
    });
  });

  (function bindRetry() {
    var retryInput = document.getElementById('smart-unrecognized-input');
    var retryBtn = document.getElementById('smart-unrecognized-submit');
    if (!retryInput || !retryBtn) return;
    retryBtn.addEventListener('click', function () {
      var nextQuery = normalizeSmartLookupQuery(retryInput.value || '');
      var inputEl = getSmartLookupInputEl();
      if (!nextQuery) return;
      clearSmartLookupAssist();
      if (inputEl) inputEl.value = nextQuery;
      runLKQLookup();
    });
    retryInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        retryBtn.click();
      }
    });
  })();

  if (ageResultsEl) {
    ageResultsEl.classList.remove('hidden');
    ageResultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

async function runGeneralSmartLookup(query) {
  var ageResultsEl = document.getElementById('ageResults');
  var serialResultsEl = document.getElementById('serialResults');
  var ageLoadingEl = document.getElementById('ageLoading');
  var loadStart;
  clearSmartLookupAssist();
  if (ageResultsEl) ageResultsEl.classList.add('hidden');
  if (serialResultsEl) serialResultsEl.classList.add('hidden');
  setLoadingActive();
  if (ageLoadingEl) ageLoadingEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  loadStart = Date.now();

  try {
    var generalData = await fetchSmartLookupGeneral(query);
    var elapsed = Date.now() - loadStart;
    var remaining = Math.max(0, 300 - elapsed);
    setTimeout(function () {
      setLoadingSuccess(function () {
        showGeneralSmartLookupResults(query, generalData);
      });
    }, remaining);
  } catch (_) {
    trackSmartLookupEvent('result_failure', { query: query, queryKind: 'general', resultType: 'general' });
    setLoadingHidden();
    showSmartLookupNotice('limit', 'Smart Lookup is temporarily unavailable. Please try again.');
  }
}

async function executeSmartLookup(query, opts) {
  var ageResultsEl;
  var serialResultsEl;
  var ageLoadingEl;
  var resultsEl = (opts && opts.targetEl) ? opts.targetEl : getSmartLookupResultsEl();
  var preserveGeneral = !!(opts && opts.preserveGeneral);
  var instanceId = (opts && opts.instanceId) || 'smart-lookup';
  var interpretData = (opts && opts.interpretData) || null;
  var originalQuery = normalizeSmartLookupQuery((opts && opts.originalQuery) || query);
  var normalizedOriginalQuery = String(originalQuery || '').toLowerCase().trim();
  var includeComparisons = (opts && typeof opts.includeComparisons === 'boolean')
    ? opts.includeComparisons
    : shouldIncludeSmartLookupComparisons();
  var ageLookupPromise;
  var lkqRenderEl;
  var lkqPromise;
  var lookupSettlePromise;
  var slots;
  var ageData = null;
  var lkqData = null;
  var lkqSlotContent = null;
  var normalizedResult = null;
  var ageRendered = false;
  var ageFailed = false;
  var resultsShown = false;
  var analyticsTracked = false;

  if (!preserveGeneral) clearSmartLookupAssist();
  query = normalizeSmartLookupQuery(query);
  if (!query) return;
  if (!resultsEl) { setLoadingHidden(); return; }

  if (!preserveGeneral) {
    ageResultsEl = document.getElementById('ageResults');
    serialResultsEl = document.getElementById('serialResults');
    if (ageResultsEl) ageResultsEl.classList.add('hidden');
    if (serialResultsEl) serialResultsEl.classList.add('hidden');
    setLoadingActive();
    ageLoadingEl = document.getElementById('ageLoading');
    if (ageLoadingEl) ageLoadingEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  slots = createSmartLookupProgressiveShell(resultsEl);
  ageLookupPromise = preserveGeneral ? Promise.resolve(null) : fetchAgeLookup(query);
  lkqRenderEl = document.createElement('div');
  lkqPromise = evaluateSmartLookupLkq(instanceId, query, lkqRenderEl);
  lookupSettlePromise = Promise.allSettled([ageLookupPromise, lkqPromise]);

  function ensureVisibleResults() {
    if (resultsShown) return;
    resultsShown = true;
    if (preserveGeneral) {
      resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    setLoadingHidden();
    if (ageResultsEl) {
      ageResultsEl.classList.remove('hidden');
      ageResultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updateNormalizedArtifacts() {
    if (!lkqSlotContent || typeof normalizeSmartLookupResult !== 'function') return;
    normalizedResult = normalizeSmartLookupResult({
      interpret: interpretData,
      age: ageData,
      lkq: lkqData,
      candidate: null,
      originalQuery: originalQuery,
      normalizedQuery: normalizedOriginalQuery
    });
    prependSmartLookupSummaryLayer(lkqSlotContent, normalizedResult);

    if (!analyticsTracked && lkqData) {
      analyticsTracked = true;
      trackSmartLookupEvent('result_success', {
        query: originalQuery,
        queryKind: (interpretData && interpretData.queryKind) || '',
        brand: normalizedResult && normalizedResult.identity && normalizedResult.identity.brand,
        category: normalizedResult && normalizedResult.identity && normalizedResult.identity.category,
        resultType: preserveGeneral ? 'general-refined-lkq' : 'lkq'
      });
    }

    if (slots && slots.priceSlot && typeof window.fetchAndRenderPriceTier === 'function') {
      if (normalizedResult && normalizedResult.identity && !slots.priceSlot.getAttribute('data-price-tier-started')) {
        slots.priceSlot.setAttribute('data-price-tier-started', '1');
        window.fetchAndRenderPriceTier(normalizedResult.identity, lkqSlotContent, { progressiveSlot: slots.priceSlot });
      } else if ((!normalizedResult || !normalizedResult.identity) && !slots.priceSlot.getAttribute('data-price-tier-started')) {
        hideSmartLookupProgressiveSlot(slots.priceSlot);
      }
    }
  }

  ageLookupPromise.then(function (resolvedAgeData) {
    ageData = resolvedAgeData || null;
    ageRendered = true;
    currentFeedbackContext = { brand: (resolvedAgeData && resolvedAgeData.brand) || '', serial: originalQuery };
    if (slots && slots.ageSlot && resolvedAgeData) {
      mountSmartLookupProgressiveSlot(
        slots.ageSlot,
        buildSmartLookupCardElement(buildProgressiveAgeLookupMarkup(originalQuery, resolvedAgeData), 'sl-progressive-card--age')
      );
    } else if (slots && slots.ageSlot) {
      hideSmartLookupProgressiveSlot(slots.ageSlot);
    }
    ensureVisibleResults();
    updateNormalizedArtifacts();
  }).catch(function () {
    ageFailed = true;
    if (slots && slots.ageSlot) hideSmartLookupProgressiveSlot(slots.ageSlot);
    if (lkqData) ensureVisibleResults();
  });

  lkqPromise.then(function (resolvedLkqData) {
    var lkqWrapper = document.createElement('div');
    currentFeedbackContext = { brand: '', serial: query };
    lkqData = resolvedLkqData || {};
    applySmartLookupComparisonPreference(lkqRenderEl, includeComparisons);
    lkqWrapper.className = 'sl-progressive-card sl-progressive-card--lkq';
    while (lkqRenderEl.firstChild) {
      lkqWrapper.appendChild(lkqRenderEl.firstChild);
    }
    lkqSlotContent = lkqWrapper;
    if (slots && slots.lkqSlot) {
      mountSmartLookupProgressiveSlot(slots.lkqSlot, lkqWrapper);
    }
    if (ageRendered || ageFailed) ensureVisibleResults();
    updateNormalizedArtifacts();
  }).catch(function (err) {
    if (slots && slots.lkqSlot) {
      mountSmartLookupProgressiveSlot(
        slots.lkqSlot,
        buildSmartLookupStatusCard('Replacement lookup unavailable', err && err.message ? err.message : 'Smart Lookup is temporarily unavailable. Please try again.')
      );
    }
    if (slots && slots.priceSlot) hideSmartLookupProgressiveSlot(slots.priceSlot);
    if (ageRendered) ensureVisibleResults();
  });

  lookupSettlePromise.then(function (settled) {
    var ageRejected = settled[0] && settled[0].status === 'rejected';
    var lkqRejected = settled[1] && settled[1].status === 'rejected';
    if (!ageRejected && !lkqRejected) return;
    if (!lkqRejected) return;

    trackSmartLookupEvent('result_failure', {
      query: originalQuery,
      queryKind: (interpretData && interpretData.queryKind) || '',
      failureType: (settled[1] && settled[1].reason && settled[1].reason.lookupType) || 'unknown',
      resultType: preserveGeneral ? 'general-refined-lkq' : 'lkq'
    });

    if (ageRejected && lkqRejected) {
      var err = settled[1] && settled[1].reason;
      if (preserveGeneral) {
        resultsEl.innerHTML =
          '<div class="smart-general-inline-error">' + escapeSmartLookupHtml((err && err.message) || 'Smart Lookup is temporarily unavailable. Please try again.') + '</div>';
      } else {
        setLoadingHidden();
        if (err && err.lookupType === 'capacity') {
          showSmartLookupNotice('capacity', 'Wow! Due to the popular demand of this tool, the capacity of the free version has been reached. Please utilize the serial number decoder. The smart lookup function will be available again soon. Interested in utilizing smart lookup within personalized data limits? <a href="contact.html" style="color:inherit;font-weight:700;">Contact us today</a> to become a pro member.');
        } else {
          showSmartLookupNotice('limit', (err && err.message) || 'Smart Lookup is temporarily unavailable. Please try again.');
        }
      }
    }
  });
}

function shouldIncludeSmartLookupComparisons() {
  var checkbox = document.getElementById('include-replacement-comparisons');
  return checkbox ? !!checkbox.checked : true;
}

function applySmartLookupComparisonPreference(resultsEl, includeComparisons) {
  var table;
  var rows;
  var headerRow;
  var colgroup;
  if (!resultsEl || includeComparisons) return;

  table = resultsEl.querySelector('.lkq-comparison-table');
  if (!table) return;

  colgroup = table.querySelector('colgroup');
  if (colgroup) {
    while (colgroup.children.length > 2) {
      colgroup.removeChild(colgroup.lastElementChild);
    }
  }

  headerRow = table.querySelector('thead tr');
  if (headerRow) {
    while (headerRow.children.length > 2) {
      headerRow.removeChild(headerRow.lastElementChild);
    }
  }

  rows = table.querySelectorAll('tbody tr');
  Array.prototype.forEach.call(rows, function (row) {
    var rowKey = row.getAttribute('data-row');
    if (rowKey === 'rating' || rowKey === 'buy' || rowKey === 'notes') {
      row.remove();
      return;
    }
    while (row.children.length > 2) {
      row.removeChild(row.lastElementChild);
    }
  });
}

function prependSmartLookupSummaryLayer(resultsEl, normalizedResult) {
  var existingLayer;
  var summaryLayer;
  if (!resultsEl) return;

  existingLayer = resultsEl.querySelector('.sl-top-summary-layer');
  if (existingLayer && existingLayer.parentNode) {
    existingLayer.parentNode.removeChild(existingLayer);
  }

  if (!normalizedResult || typeof renderSmartLookupTopSummaryLayer !== 'function') return;
  summaryLayer = renderSmartLookupTopSummaryLayer(normalizedResult);
  if (!summaryLayer) return;
  resultsEl.insertBefore(summaryLayer, resultsEl.firstChild || null);
}

// ===== SMART LOOKUP — thin entry point wrapper around LKQEngine =====
async function runLKQLookup() {
  var inputEl = getSmartLookupInputEl();
  var query;
  var resolvedQuery;
  var interpreted;
  var includeComparisons;
  var canBypassInterpret;
  if (!inputEl || !document.getElementById('smart-lookup-input')) return;
  query = normalizeSmartLookupQuery(inputEl.value || '');
  inputEl.value = query;
  if (!query) return;
  resolvedQuery = expandKnownSmartLookupQuery(query);
  inputEl.value = '';
  includeComparisons = shouldIncludeSmartLookupComparisons();
  trackSmartLookupEvent('search_started', { query: query, includeComparisons: includeComparisons });
  if (typeof window.recordRecentSmartLookup === 'function') window.recordRecentSmartLookup(query);
  canBypassInterpret = looksLikeSpecificSmartLookupQuery(resolvedQuery);
  clearSmartLookupAssist();

  try {
    if (canBypassInterpret) {
      interpreted = {
        action: 'bypass',
        queryKind: 'specific',
        confidence: 'high',
        scopeValid: true,
        message: null,
        suggestions: [resolvedQuery],
        fastPath: true
      };
      trackSmartLookupEvent('query_path_selected', { query: query, queryKind: 'specific', path: 'fast-path' });
      if (includeComparisons) {
        executeSmartLookup(resolvedQuery, {
          interpretData: interpreted,
          originalQuery: query
        });
      } else {
        runAgeOnlyLookup(resolvedQuery, { displayQuery: query });
      }
      return;
    }

    showSmartLookupAssistLoading();
    // Keep interpretation sequential here: it determines whether the query should
    // route to general lookup, age-only lookup, or the specific-model path.
    interpreted = await fetchSmartLookupInterpretation(resolvedQuery);
    clearSmartLookupAssist();

    if (interpreted && interpreted.action === 'bypass' && interpreted.queryKind === 'specific') {
      trackSmartLookupEvent('query_path_selected', { query: query, queryKind: 'specific', path: 'interpreted-bypass' });
      if (includeComparisons) {
        executeSmartLookup((interpreted.suggestions && interpreted.suggestions[0]) || resolvedQuery, {
          interpretData: interpreted,
          originalQuery: query
        });
      } else {
        runAgeOnlyLookup((interpreted.suggestions && interpreted.suggestions[0]) || resolvedQuery, { displayQuery: query });
      }
      return;
    }
    if (interpreted && interpreted.queryKind === 'general') {
      trackSmartLookupEvent('query_path_selected', { query: query, queryKind: 'general', path: 'general' });
      if (includeComparisons) runGeneralSmartLookup(resolvedQuery);
      else runAgeOnlyLookup(resolvedQuery, { displayQuery: query });
      return;
    }
    if (interpreted && (interpreted.action === 'suggest' || interpreted.action === 'no_results' || interpreted.action === 'out_of_scope')) {
      trackSmartLookupEvent('query_path_selected', { query: query, queryKind: interpreted.queryKind || 'unrecognized', path: interpreted.action || 'suggest' });
      showUnrecognizedSmartLookupResults(query, interpreted);
      return;
    }
    if (interpreted && interpreted.queryKind === 'specific') {
      trackSmartLookupEvent('query_path_selected', { query: query, queryKind: 'specific', path: 'specific' });
      if (includeComparisons) {
        executeSmartLookup(resolvedQuery, {
          interpretData: interpreted,
          originalQuery: query
        });
      }
      else runAgeOnlyLookup(resolvedQuery, { displayQuery: query });
      return;
    }
  } catch (_) {
    clearSmartLookupAssist();
    showSmartLookupNotice('limit', 'Smart Lookup is temporarily unavailable. Please try again.');
  }
}

// ===== SERIAL DECODER — LKQ entry point =====
(function bindSmartLookupAssistReset() {
  var input = getSmartLookupInputEl();
  if (!input) return;
  if (input.getAttribute('data-smart-lookup-assist-bound') === '1') return;
  input.setAttribute('data-smart-lookup-assist-bound', '1');
  input.addEventListener('input', function () {
    clearSmartLookupAssist();
  });
})();

function loadSerialLKQ() {
  var brand = (currentFeedbackContext && currentFeedbackContext.brand)
    ? currentFeedbackContext.brand.trim() : '';
  var modelInputEl = document.getElementById('serial-lkq-model-input');
  var model = modelInputEl ? modelInputEl.value.trim() : '';

  // Build query: brand + model if provided, or brand alone
  var query = model ? ((brand ? brand + ' ' : '') + model) : brand;
  if (!query) return;

  var resultsCard = document.getElementById('serialLkqResults');
  var resultsEl   = document.getElementById('serial-lkq-output');
  if (!resultsCard || !resultsEl) return;

  // Show inline loading state
  resultsEl.innerHTML =
    '<div style="display:flex;align-items:center;gap:0.5rem;padding:1rem 0;font-size:0.83rem;color:#64748b;">' +
      '<span>🕵️</span> Evaluating LKQ options\u2026' +
    '</div>';
  resultsCard.classList.remove('hidden');
  resultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  LKQEngine.evaluate('serial-decoder', query, resultsEl, {
    onSuccess: function () {
      resultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    onError: function (type, message) {
      resultsEl.innerHTML =
        '<div style="background:#fef2f2;border-left:3px solid #ef4444;border-radius:8px;padding:1rem;font-size:0.875rem;color:#991b1b;">' +
          (message || 'LKQ lookup failed. Please try again.') +
        '</div>';
    },
  });
}

function closeSerialLkq() {
  var el = document.getElementById('serialLkqResults');
  if (el) el.classList.add('hidden');
  LKQEngine.clearInstance('serial-decoder');
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
function openFeedbackModal(defaultType) {
  var ctx = currentFeedbackContext;
  document.getElementById('fbBrand').value   = ctx.brand  || '';
  document.getElementById('fbSerial').value  = ctx.serial || '';
  document.getElementById('fbType').value    = defaultType || '';
  document.getElementById('fbDetails').value = '';
  document.getElementById('fbThanks').classList.add('hidden');
  document.getElementById('fbActions').style.display = '';
  document.getElementById('feedbackModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (typeof trackSmartLookupEvent === 'function') {
    trackSmartLookupEvent('feedback_modal_opened', { issueType: defaultType || '', context: ctx.serial || ctx.brand || '' });
  }
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
    await fetch('/api/forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'feedback', brand: brand, serial: serial, issueType: issueType, details: details }),
    });
  } catch (e) {
    // fail silently — still show thank-you
  }

  if (typeof trackSmartLookupEvent === 'function') {
    trackSmartLookupEvent('feedback_submitted', { brand: brand, query: serial, issueType: issueType });
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
  runLKQLookup();
}

// ===== UTILITY =====
function esc(s) {
  if (!s) return '';
  var div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function sanitizeAlertText(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/\\ufe0e|\\ufe0f|ufe0e|ufe0f/gi, '')
    .replace(/[\uFE0E\uFE0F\u200B-\u200D\u2060\u00AD]/g, '');
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

  var heading = document.createElement('div');
  heading.style.display = 'flex';
  heading.style.alignItems = 'center';
  heading.style.justifyContent = 'center';
  heading.style.gap = '8px';
  heading.style.marginBottom = '10px';
  heading.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="fill:#0369a1;">' +
      '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15h-2v-2h2Zm0-4h-2V7h2Z"></path>' +
    '</svg>' +
    '<span style="font-weight:700;color:#0f172a;">Notice</span>';

  var msg = document.createElement('div');
  msg.textContent = sanitizeAlertText(message);
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

  box.appendChild(heading);
  box.appendChild(msg);
  box.appendChild(okBtn);
  modal.appendChild(box);
  document.body.appendChild(modal);
}










