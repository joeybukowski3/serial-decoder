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
  }
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
};

// ===== STATE =====
var currentCategory = 'appliances';
var currentFeedbackContext = {};
var CURRENT_YEAR = new Date().getFullYear();

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
  populateBrands('appliances');

  document.getElementById('brand').addEventListener('change', function() {
    onBrandChange();
    updateDecodeBtn();
  });
  document.getElementById('serial').addEventListener('input', updateDecodeBtn);
  document.getElementById('serial').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') decodeSerial();
  });
  document.getElementById('eraSelect').addEventListener('change', updateDecodeBtn);
  document.getElementById('altQuery').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') estimateAge();
  });
});

// ===== CATEGORY SELECTION =====
function selectCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.cat-tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  populateBrands(cat);
  document.getElementById('serial').value = '';
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
  var brand  = document.getElementById('brand').value;
  var serial = document.getElementById('serial').value.trim();
  var decoderId = brand ? resolveDecoderId(brand) : null;
  document.getElementById('decodeBtn').disabled = !(brand && serial && decoderId);
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

// ===== SERIAL DECODE =====
function decodeSerial() {
  var metaBrandId = document.getElementById('brand').value;
  var serial = document.getElementById('serial').value.trim();
  if (!metaBrandId || !serial) return;

  var brandId = resolveDecoderId(metaBrandId);
  if (!brandId) {
    alert('Please select the manufacture era for this brand.');
    return;
  }

  var decoder = decoderData[currentCategory].decoders[brandId];
  if (!decoder) { alert('Decoder not found for this brand'); return; }

  // Show loading animation immediately
  document.getElementById('serialResults').classList.add('hidden');
  document.getElementById('ageResults').classList.add('hidden');
  setLoadingActive();

  // Hold the cloud for at least 1400ms so the sun transition reaches ~2 s total
  setTimeout(function() {
    var result = decoder.decode(serial);
    if (!result) {
      setLoadingHidden();
      alert('Could not decode this serial number. Please check the format and try again.');
      return;
    }

    document.getElementById('resultYear').textContent    = capYear(result.year);
    document.getElementById('resultMonth').textContent   = result.month;
    document.getElementById('resultBrand').textContent   = decoder.name;
    document.getElementById('resultMethod').textContent  = decoder.method || decoder.serialLengthNote || 'N/A';
    document.getElementById('resultNotes').textContent   = decoder.notes  || decoder.decodeNotes     || 'N/A';
    document.getElementById('resultExample').textContent = decoder.exampleSerial
      ? decoder.exampleSerial + ' → ' + decoder.exampleResult
      : 'N/A';
    document.getElementById('resultSources').textContent = decoder.source || decoder.sources || 'N/A';

    showBrandLogo('serialBrandLogo', brandId, decoder.name);
    currentFeedbackContext = { brand: decoder.name, serial: serial };

    setLoadingSuccess(function() {
      document.getElementById('serialResults').classList.remove('hidden');
      document.getElementById('serialResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, 1400);
}

// ===== ALT LOOKUP TOGGLE =====
function toggleAlt() {
  var section = document.getElementById('altSection');
  var toggle  = document.querySelector('.alt-toggle');
  section.classList.toggle('open');
  toggle.classList.toggle('open');
}

// ===== LOADING STATE (🌩️ → ☀️) =====
function setLoadingActive() {
  var emoji   = document.getElementById('loadingEmoji');
  var loading = document.getElementById('ageLoading');
  if (emoji) {
    emoji.textContent = '🌩️';
    emoji.className   = 'loading-emoji lightning';
  }
  loading.classList.remove('hidden');
}

function setLoadingSuccess(callback) {
  var emoji = document.getElementById('loadingEmoji');
  if (emoji) {
    emoji.textContent = '☀️';
    emoji.className   = 'loading-emoji sun';
  }
  setTimeout(function() {
    document.getElementById('ageLoading').classList.add('hidden');
    if (callback) callback();
  }, 600);
}

function setLoadingHidden() {
  document.getElementById('ageLoading').classList.add('hidden');
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

// ===== CONFIDENCE BAR =====
function buildConfidenceBar(level) {
  var levels = ['low', 'medium', 'high'];
  var labels = ['Low', 'Medium', 'High'];
  var idx    = levels.indexOf((level || '').toLowerCase());
  if (idx === -1) return '';
  var html = '<div class="confidence-bar-wrap"><div class="confidence-bar-label">Confidence Score</div><div class="confidence-bar">';
  levels.forEach(function(l, i) {
    var cls = 'conf-seg' + (i <= idx ? ' active ' + level.toLowerCase() : '');
    html += '<div class="' + cls + '">' + labels[i] + '</div>';
  });
  html += '</div></div>';
  return html;
}

// ===== ESTIMATE AGE =====
async function estimateAge() {
  var query = document.getElementById('altQuery').value.trim();
  if (!query) return;

  document.getElementById('ageResults').classList.add('hidden');
  document.getElementById('serialResults').classList.add('hidden');
  setLoadingActive();
  var loadStart = Date.now();

  try {
    var res  = await fetch('/api/age-lookup?query=' + encodeURIComponent(query));
    var data = await res.json();

    if (data.error) {
      setLoadingHidden();
      alert('Error: ' + data.error);
      return;
    }

    var body = document.getElementById('ageResultsBody');
    var html = '';

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
    if (data.confidence) {
      var cls = data.confidence.toLowerCase();
      html += '<div class="result-row"><span class="result-label">Confidence</span><span class="confidence-badge ' + cls + '">' + esc(data.confidence) + '</span></div>';
      html += buildConfidenceBar(cls);
    }
    if (data.evidence && data.evidence.length > 0) {
      html += '<div class="info-block method"><h4>Evidence</h4><div class="evidence-list">';
      data.evidence.forEach(function(ev) {
        html += '<div class="evidence-item"><span class="ev-source">' + esc(ev.source) + '</span>';
        if (ev.date) html += '<span class="ev-date">' + esc(ev.date) + '</span>';
        html += '<span>' + esc(ev.detail) + '</span></div>';
      });
      html += '</div></div>';
    }
    if (data.notes) {
      html += '<div class="info-block notes"><h4>Notes</h4><p>' + esc(data.notes) + '</p></div>';
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
    alert('Error estimating age: ' + (e.message || e) + '. Please try again.');
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

function submitFeedback() {
  document.getElementById('fbThanks').classList.remove('hidden');
  document.getElementById('fbActions').style.display = 'none';
  setTimeout(closeFeedbackModal, 2200);
}

// ===== UTILITY =====
function esc(s) {
  if (!s) return '';
  var div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
