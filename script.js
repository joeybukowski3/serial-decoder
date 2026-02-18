// ===== ERA & CYCLING BRAND CONFIG =====
// Brands where the user must or should select an era for accurate decoding
var CYCLING_BRANDS = {
  appliances: {
    // type:'split' — separate pre/post-2006 decoders in the data
    'admiral':   { label: 'Admiral',    post: 'admiral_post_2006',  pre: 'admiral_pre_2006',  type: 'split' },
    'amana':     { label: 'Amana',      post: 'amana_post_2006',    pre: 'amana_pre_2006',    type: 'split' },
    'jenn_air':  { label: 'Jenn-Air',   post: 'jenn_air_post_2006', pre: 'jenn_air_pre_2006', type: 'split' },
    'maytag':    { label: 'Maytag',     post: 'maytag_post_2006',   pre: 'maytag_pre_2006',   type: 'split' },
    // type:'advisory' — single decoder, but repeating cycle requires era clarification
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

// Reverse map: era-specific decoder ID → base/meta ID
// e.g. 'admiral_post_2006' → 'admiral'
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
  'admiral':            'admiralproducts.com',
  'admiral_post_2006':  'admiralproducts.com',
  'admiral_pre_2006':   'admiralproducts.com',
  'amana':              'amana.com',
  'amana_post_2006':    'amana.com',
  'amana_pre_2006':     'amana.com',
  'jenn_air':           'jennair.com',
  'jenn_air_post_2006': 'jennair.com',
  'jenn_air_pre_2006':  'jennair.com',
  'maytag':             'maytag.com',
  'maytag_post_2006':   'maytag.com',
  'maytag_pre_2006':    'maytag.com',
  'ge':           'geappliances.com',
  'ge_caf':       'cafeappliances.com',
  'ge_profile':   'geappliances.com',
  'ge_monogram':  'geappliances.com',
  'ge_water_heaters': 'geappliances.com',
  'frigidaire':   'frigidaire.com',
  'electrolux':   'electroluxappliances.com',
  'bosch':        'bosch-home.com',
  'thermador':    'thermador.com',
  'samsung':      'samsung.com',
  'lg':           'lg.com',
  'kenmore':      'kenmore.com',
  'hotpoint':     'hotpointservice.com',
  'roper':        'whirlpool.com',
  'estate':       'whirlpool.com',
  'inglis':       'whirlpool.com',
  'rheem':        'rheem.com',
  'ruud':         'ruud.com',
  'a_o_smith':    'hotwater.com',
  'bradford_white': 'bradfordwhite.com',
  'american_water_heater_company': 'americanwaterheater.com',
  'state_industries': 'statewaterheaters.com',
};

// ===== STATE =====
var currentCategory = 'appliances';
var currentFeedbackContext = {};

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

// ===== BRAND DROPDOWN (with era-split consolidation) =====
function populateBrands(category) {
  var sel = document.getElementById('brand');
  var brands = decoderData[category].brands;
  var cyclingCat = CYCLING_BRANDS[category] || {};

  // Build deduplicated list — consolidate era-split brands into a single meta entry
  var seenBase = {};
  var consolidated = [];
  brands.forEach(function(b) {
    var baseId = ERA_ID_TO_BASE[b.id];
    if (baseId && cyclingCat[baseId]) {
      // Era-split brand — emit only one meta entry
      if (!seenBase[baseId]) {
        seenBase[baseId] = true;
        consolidated.push({ id: baseId, name: cyclingCat[baseId].label, cycling: true });
      }
    } else if (cyclingCat[b.id] && cyclingCat[b.id].type === 'advisory') {
      // Single-decoder cycling brand
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

// ===== ERA DROPDOWN LOGIC =====
function onBrandChange() {
  var sel = document.getElementById('brand');
  var opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.cycling === '1' && opt.value) {
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

// Resolve the meta brand ID (possibly with era) to the actual decoder key
function resolveDecoderId(metaBrandId) {
  var cat = currentCategory;
  var cyclingCat = CYCLING_BRANDS[cat] || {};
  var cfg = cyclingCat[metaBrandId];

  if (!cfg) return metaBrandId; // Not a cycling brand — use as-is

  if (cfg.type === 'split') {
    var era = document.getElementById('eraSelect').value;
    if (era === 'post') return cfg.post;
    if (era === 'pre')  return cfg.pre;
    return null; // Era not yet selected
  }

  // Advisory: era shown for UX but decoder is always the single ID
  return cfg.single;
}

function updateDecodeBtn() {
  var brand  = document.getElementById('brand').value;
  var serial = document.getElementById('serial').value.trim();
  var decoderId = brand ? resolveDecoderId(brand) : null;
  document.getElementById('decodeBtn').disabled = !(brand && serial && decoderId);
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

  var result = decoder.decode(serial);
  if (!result) {
    alert('Could not decode this serial number. Please check the format and try again.');
    return;
  }

  document.getElementById('resultYear').textContent    = result.year;
  document.getElementById('resultMonth').textContent   = result.month;
  document.getElementById('resultBrand').textContent   = decoder.name;
  document.getElementById('resultMethod').textContent  = decoder.method || decoder.serialLengthNote || 'N/A';
  document.getElementById('resultNotes').textContent   = decoder.notes  || decoder.decodeNotes     || 'N/A';
  document.getElementById('resultExample').textContent = decoder.exampleSerial
    ? decoder.exampleSerial + ' → ' + decoder.exampleResult
    : 'N/A';
  document.getElementById('resultSources').textContent = decoder.source || decoder.sources || 'N/A';

  // Brand logo
  showBrandLogo('serialBrandLogo', brandId, decoder.name);

  document.getElementById('serialResults').classList.remove('hidden');
  document.getElementById('ageResults').classList.add('hidden');
  document.getElementById('serialResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Store context for feedback modal
  currentFeedbackContext = { brand: decoder.name, serial: serial };
}

// ===== ALT LOOKUP TOGGLE =====
function toggleAlt() {
  var section = document.getElementById('altSection');
  var toggle  = document.querySelector('.alt-toggle');
  section.classList.toggle('open');
  toggle.classList.toggle('open');
}

function toggleHowTo() {
  var content = document.getElementById('howToContent');
  var toggle  = document.querySelector('.how-to-toggle');
  content.classList.toggle('open');
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
  // Brief pause so the sun animation is visible, then hide loader and show results
  setTimeout(function() {
    document.getElementById('ageLoading').classList.add('hidden');
    if (callback) callback();
  }, 650);
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
    img.onerror = function() {
      this.replaceWith(makeBrandBadge(brandName));
    };
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

  var html = '<div class="confidence-bar-wrap">'
    + '<div class="confidence-bar-label">Confidence Score</div>'
    + '<div class="confidence-bar">';
  levels.forEach(function(l, i) {
    var cls = 'conf-seg' + (i <= idx ? ' active ' + level.toLowerCase() : '');
    html += '<div class="' + cls + '">' + labels[i] + '</div>';
  });
  html += '</div></div>';
  return html;
}

// ===== ESTIMATE AGE (Alternative Lookup) =====
async function estimateAge() {
  var query = document.getElementById('altQuery').value.trim();
  if (!query) return;

  document.getElementById('ageResults').classList.add('hidden');
  document.getElementById('serialResults').classList.add('hidden');
  setLoadingActive();

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
      html += '<div class="result-row"><span class="result-label">Estimated Year</span><span class="result-value">' + esc(data.estimatedYear) + '</span></div>';
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
        html += '<div class="evidence-item">';
        html += '<span class="ev-source">' + esc(ev.source) + '</span>';
        if (ev.date) html += '<span class="ev-date">' + esc(ev.date) + '</span>';
        html += '<span>' + esc(ev.detail) + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    if (data.notes) {
      html += '<div class="info-block notes"><h4>Notes</h4><p>' + esc(data.notes) + '</p></div>';
    }

    body.innerHTML = html;

    // Show brand logo
    var brandId = (data.brand || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    showBrandLogo('ageBrandLogo', brandId, data.brand || '');

    // Store context for feedback modal
    currentFeedbackContext = { brand: data.brand || '', serial: query };

    setLoadingSuccess(function() {
      document.getElementById('ageResults').classList.remove('hidden');
      document.getElementById('ageResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

  } catch (e) {
    setLoadingHidden();
    alert('Error estimating age: ' + (e.message || e) + '. Please try again.');
  }
}

// ===== FEEDBACK MODAL =====
function openFeedbackModal() {
  var ctx = currentFeedbackContext;
  document.getElementById('fbBrand').value   = ctx.brand  || '';
  document.getElementById('fbSerial').value  = ctx.serial || '';
  document.getElementById('fbType').value    = '';
  document.getElementById('fbDetails').value = '';
  document.getElementById('fbThanks').classList.add('hidden');
  document.getElementById('feedbackModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeFeedbackModal() {
  document.getElementById('feedbackModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function submitFeedback() {
  // In production this would POST to an API endpoint
  document.getElementById('fbThanks').classList.remove('hidden');
  document.querySelector('.modal-actions').style.display = 'none';
  setTimeout(function() {
    closeFeedbackModal();
    document.querySelector('.modal-actions').style.display = '';
  }, 2200);
}

// ===== UTILITY =====
function esc(s) {
  if (!s) return '';
  var div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
