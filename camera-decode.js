/**
 * camera-decode.js
 * Adds a "Scan Label" button to the serial number decoder.
 * Uses Gemini vision via /api/decode-label to extract brand + serial from photos.
 */
(function () {
  'use strict';

  // ── Config ───────────────────────────────────────────────────
  var MAX_PX    = 1200;   // max image dimension before compressing
  var QUALITY   = 0.88;   // JPEG quality
  var API_PATH  = '/api/decode-label';

  // ── Inject styles ────────────────────────────────────────────
  var STYLES = [
    '.cd-btn-wrap { position: relative; display: inline-flex; align-items: center; }',

    /* The camera button itself */
    '.cd-scan-btn {',
    '  display: inline-flex; align-items: center; justify-content: center; gap: 6px;',
    '  background: rgba(68,229,194,0.1); color: #44e5c2;',
    '  border: 1px solid rgba(68,229,194,0.35); border-radius: 8px;',
    '  padding: 0 12px; height: 40px; min-width: 40px;',
    '  font-size: 12px; font-weight: 700; font-family: "Sora", sans-serif;',
    '  cursor: pointer; white-space: nowrap; transition: all 0.2s;',
    '  margin-left: 8px; flex-shrink: 0;',
    '}',
    '.cd-scan-btn:hover { background: rgba(68,229,194,0.18); border-color: #44e5c2; }',
    '.cd-scan-btn:active { transform: scale(0.97); }',
    '.cd-scan-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }',
    '.cd-scan-btn .cd-icon { font-size: 18px; font-variation-settings: "FILL" 0,"wght" 400; flex-shrink: 0; }',
    '.cd-scan-btn .cd-label { display: none; }',
    '@media (min-width: 480px) { .cd-scan-btn .cd-label { display: inline; } }',

    /* Spinner inside button */
    '.cd-spin { width: 16px; height: 16px; border: 2px solid rgba(68,229,194,0.3);',
    '  border-top-color: #44e5c2; border-radius: 50%; animation: cd-rotate 0.7s linear infinite; flex-shrink: 0; }',
    '@keyframes cd-rotate { to { transform: rotate(360deg); } }',

    /* Toast notification */
    '.cd-toast {',
    '  position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%) translateY(16px);',
    '  z-index: 10000; min-width: 260px; max-width: min(92vw, 440px);',
    '  background: #112236; border: 1px solid #3c4a45; border-radius: 14px;',
    '  padding: 16px 20px; box-shadow: 0 8px 40px rgba(0,0,0,0.5);',
    '  opacity: 0; transition: opacity 0.25s ease, transform 0.25s ease;',
    '  pointer-events: none;',
    '}',
    '.cd-toast.cd-visible { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }',
    '.cd-toast-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }',
    '.cd-toast-icon { font-size: 20px; flex-shrink: 0; }',
    '.cd-toast-title { font-weight: 700; font-size: 14px; color: #dae2fd; }',
    '.cd-toast-close { margin-left: auto; background: none; border: none; color: #64748B;',
    '  cursor: pointer; font-size: 18px; line-height: 1; padding: 0; }',
    '.cd-toast-close:hover { color: #dae2fd; }',
    '.cd-field-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }',
    '.cd-field-row:last-of-type { margin-bottom: 0; }',
    '.cd-field-label { font-family: "JetBrains Mono", monospace; font-size: 10px;',
    '  color: #64748B; text-transform: uppercase; letter-spacing: 0.07em; min-width: 42px; }',
    '.cd-field-val { font-size: 13px; color: #dae2fd; font-weight: 600; word-break: break-all; }',
    '.cd-conf-pill { font-family: "JetBrains Mono", monospace; font-size: 9px;',
    '  padding: 2px 7px; border-radius: 999px; margin-left: 4px; }',
    '.cd-conf-high   { background: rgba(68,229,194,0.12); color: #44e5c2; border: 1px solid rgba(68,229,194,0.25); }',
    '.cd-conf-medium { background: rgba(255,194,120,0.12); color: #ffc278; border: 1px solid rgba(255,194,120,0.25); }',
    '.cd-conf-low    { background: rgba(148,163,184,0.1);  color: #94a3b8; border: 1px solid rgba(148,163,184,0.2); }',
    '.cd-toast-note { font-size: 11px; color: #64748B; margin-top: 8px; line-height: 1.5; }',
    '.cd-toast-actions { display: flex; gap: 8px; margin-top: 12px; }',
    '.cd-toast-apply { flex: 1; background: #44e5c2; color: #00382d; border: none;',
    '  border-radius: 8px; padding: 9px 12px; font-weight: 700; font-size: 12px;',
    '  cursor: pointer; transition: all 0.2s; font-family: "Sora", sans-serif; }',
    '.cd-toast-apply:hover { background: #38debb; }',
    '.cd-toast-retry { background: transparent; color: #64748B; border: 1px solid #3c4a45;',
    '  border-radius: 8px; padding: 9px 12px; font-size: 12px; cursor: pointer;',
    '  transition: all 0.2s; font-family: "Sora", sans-serif; }',
    '.cd-toast-retry:hover { border-color: #44e5c2; color: #44e5c2; }',

    /* Error state */
    '.cd-toast.cd-error { border-color: rgba(255,100,100,0.3); }',
    '.cd-toast.cd-error .cd-toast-icon { color: #f87171; }',
    '.cd-toast.cd-error .cd-toast-title { color: #f87171; }',
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('cd-styles')) return;
    var style = document.createElement('style');
    style.id = 'cd-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // ── Compress image ───────────────────────────────────────────
  function compressImage(file, callback) {
    console.log('[Camera] Compressing image:', file.name, 'Size:', Math.round(file.size / 1024), 'KB');
    
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        console.log('[Camera] Original dimensions:', w, 'x', h);
        
        if (w > MAX_PX || h > MAX_PX) {
          var ratio = Math.min(MAX_PX / w, MAX_PX / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
          console.log('[Camera] Compressed to:', w, 'x', h);
        }
        
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var dataURL = canvas.toDataURL('image/jpeg', QUALITY);
        var base64 = dataURL.split(',')[1];
        
        console.log('[Camera] Final base64 size:', Math.round(base64.length / 1024), 'KB');
        callback(null, base64, 'image/jpeg');
      };
      img.onerror = function () {
        console.error('[Camera] Failed to load image');
        callback(new Error('Cannot read image'));
      };
      img.src = e.target.result;
    };
    reader.onerror = function () {
      console.error('[Camera] Failed to read file');
      callback(new Error('Cannot read file'));
    };
    reader.readAsDataURL(file);
  }

  // ── Call the API ─────────────────────────────────────────────
  function callDecodeAPI(base64, mimeType, callback) {
    console.log('[Camera] Calling decode API with image size:', base64.length, 'bytes');
    
    fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, mimeType: mimeType })
    })
      .then(function (r) {
        console.log('[Camera] API response status:', r.status);
        if (!r.ok) {
          return r.text().then(function(text) {
            console.error('[Camera] API error response:', text);
            throw new Error('HTTP ' + r.status + ': ' + text);
          });
        }
        return r.json();
      })
      .then(function (data) {
        console.log('[Camera] API success:', data);
        callback(null, data);
      })
      .catch(function (err) {
        console.error('[Camera] API error:', err.message);
        callback(err);
      });
  }

  // ── Match brand in the select dropdown ───────────────────────
  function matchBrandInSelect(brandName, selectEl) {
    if (!brandName || !selectEl) return false;
    var lower = brandName.toLowerCase().trim();
    var opts = Array.from(selectEl.options);

    // Exact match first
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value && opts[i].text.toLowerCase() === lower) {
        selectEl.value = opts[i].value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    // Partial match
    for (var j = 0; j < opts.length; j++) {
      var optLower = opts[j].text.toLowerCase();
      if (opts[j].value && (optLower.includes(lower) || lower.includes(optLower))) {
        selectEl.value = opts[j].value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // ── Apply to decoder fields ──────────────────────────────────
  function applyToDecoder(result) {
    var serialEl = document.getElementById('serial');
    var brandEl  = document.getElementById('brand');
    var modelEl  = document.getElementById('modelNumber');

    // Set a flag to prevent clearing when brand changes
    if (serialEl) serialEl.setAttribute('data-camera-filled', '1');
    if (modelEl) modelEl.setAttribute('data-camera-filled', '1');

    if (result.serial && serialEl) {
      serialEl.value = result.serial.trim();
      serialEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (result.brand && brandEl) {
      var matched = matchBrandInSelect(result.brand, brandEl);
      if (matched) {
        // Call the underlying onBrandChange, NOT the change event (which clears fields)
        if (typeof onBrandChange === 'function') {
          onBrandChange();
        }
      }
    }

    if (result.model && modelEl) {
      modelEl.value = result.model.trim();
      modelEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Trigger decode button enable check
    if (typeof updateDecodeBtn === 'function') updateDecodeBtn();
    if (typeof window.updateDecodeBtn === 'function') window.updateDecodeBtn();

    // Scroll to decoder
    var tool = document.getElementById('decoder-tool') || document.getElementById('panel-decoder');
    if (tool) tool.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Toast ────────────────────────────────────────────────────
  var toastEl = null;
  var pendingResult = null;

  function removeToast() {
    if (toastEl) {
      toastEl.classList.remove('cd-visible');
      setTimeout(function () {
        if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
        toastEl = null;
      }, 300);
    }
  }

  function showSuccessToast(result) {
    removeToast();
    pendingResult = result;

    // If we have candidates but no clear serial/model, show selection dialog instead
    if ((result.fallback || result.confidence === 'low') && result.candidates && result.candidates.length > 0) {
      showCandidateSelector(result);
      return;
    }

    var confClass = 'cd-conf-' + (result.confidence || 'low');
    var confLabel = (result.confidence || 'low').charAt(0).toUpperCase() + (result.confidence || 'low').slice(1);

    var html = [
      '<div class="cd-toast-head">',
      '  <span class="material-symbols-outlined cd-toast-icon" style="color:#44e5c2;">qr_code_scanner</span>',
      '  <span class="cd-toast-title">Label Detected</span>',
      '  <button class="cd-toast-close" aria-label="Close">&times;</button>',
      '</div>',
      result.brand  ? '<div class="cd-field-row"><span class="cd-field-label">Brand</span><span class="cd-field-val">' + esc(result.brand) + '</span></div>' : '',
      result.serial ? '<div class="cd-field-row"><span class="cd-field-label">Serial</span><span class="cd-field-val">' + esc(result.serial) + '<span class="cd-conf-pill ' + confClass + '">' + confLabel + '</span></span></div>' : '',
      result.model  ? '<div class="cd-field-row"><span class="cd-field-label">Model</span><span class="cd-field-val">' + esc(result.model) + '</span></div>' : '',
      result.note   ? '<p class="cd-toast-note">' + esc(result.note) + '</p>' : '',
      '<div class="cd-toast-actions">',
      '  <button class="cd-toast-apply">Fill Decoder Fields →</button>',
      '  <button class="cd-toast-retry">Retry</button>',
      '</div>'
    ].join('');

    toastEl = document.createElement('div');
    toastEl.className = 'cd-toast';
    toastEl.innerHTML = html;
    document.body.appendChild(toastEl);

    toastEl.querySelector('.cd-toast-close').onclick = removeToast;
    toastEl.querySelector('.cd-toast-apply').onclick = function () {
      if (pendingResult) applyToDecoder(pendingResult);
      removeToast();
    };
    toastEl.querySelector('.cd-toast-retry').onclick = function () {
      removeToast();
      fileInput && fileInput.click();
    };

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (toastEl) toastEl.classList.add('cd-visible');
      });
    });

    // Auto-dismiss after 18 seconds
    setTimeout(removeToast, 18000);
  }

  function showCandidateSelector(result) {
    removeToast();
    pendingResult = result;

    var opts = result.candidates.map(function(c, i) {
      return '<option value="' + i + '">' + esc(c) + '</option>';
    }).join('');

    var html = [
      '<div class="cd-toast-head">',
      '  <span class="material-symbols-outlined cd-toast-icon" style="color:#ffc278;">info</span>',
      '  <span class="cd-toast-title">Found label — please select fields</span>',
      '  <button class="cd-toast-close" aria-label="Close">&times;</button>',
      '</div>',
      '<p style="font-size:12px;color:#bacac3;margin:0 0 14px;">The photo shows alphanumeric codes. Which is the serial number and which is the model?</p>',
      '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px;">',
      '  <div>',
      '    <label style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;display:block;">Serial Number:</label>',
      '    <select id="cd-sel-serial" class="cd-candidate-select">' + opts + '</select>',
      '  </div>',
      '  <div>',
      '    <label style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;display:block;">Model Number (optional):</label>',
      '    <select id="cd-sel-model" class="cd-candidate-select"><option value="">-- Skip --</option>' + opts + '</select>',
      '  </div>',
      '</div>',
      '<div class="cd-toast-actions">',
      '  <button class="cd-toast-apply" id="cd-apply-selection">Use These Values →</button>',
      '  <button class="cd-toast-retry">Try Different Photo</button>',
      '</div>'
    ].join('');

    toastEl = document.createElement('div');
    toastEl.className = 'cd-toast';
    toastEl.innerHTML = html;
    document.body.appendChild(toastEl);

    var serialSel = toastEl.querySelector('#cd-sel-serial');
    var modelSel = toastEl.querySelector('#cd-sel-model');

    toastEl.querySelector('.cd-toast-close').onclick = removeToast;
    toastEl.querySelector('#cd-apply-selection').onclick = function () {
      var serialIdx = parseInt(serialSel.value, 10);
      var modelIdx = parseInt(modelSel.value, 10);
      
      if (isNaN(serialIdx)) {
        alert('Please select a serial number.');
        return;
      }

      pendingResult.serial = result.candidates[serialIdx];
      if (!isNaN(modelIdx)) {
        pendingResult.model = result.candidates[modelIdx];
      }
      
      applyToDecoder(pendingResult);
      removeToast();
    };
    toastEl.querySelector('.cd-toast-retry').onclick = function () {
      removeToast();
      fileInput && fileInput.click();
    };

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (toastEl) toastEl.classList.add('cd-visible');
      });
    });

    setTimeout(removeToast, 30000); // Longer timeout for user selection
  }

  function showErrorToast(message) {
    removeToast();
    var html = [
      '<div class="cd-toast-head">',
      '  <span class="material-symbols-outlined cd-toast-icon">error_outline</span>',
      '  <span class="cd-toast-title">Could not read label</span>',
      '  <button class="cd-toast-close" aria-label="Close">&times;</button>',
      '</div>',
      '<p style="font-size:13px;color:#bacac3;margin:0 0 12px;">' + esc(message || 'Make sure the label is clearly lit and in focus.') + '</p>',
      '<div class="cd-toast-actions">',
      '  <button class="cd-toast-apply">Try another photo</button>',
      '</div>'
    ].join('');

    toastEl = document.createElement('div');
    toastEl.className = 'cd-toast cd-error';
    toastEl.innerHTML = html;
    document.body.appendChild(toastEl);

    toastEl.querySelector('.cd-toast-close').onclick = removeToast;
    toastEl.querySelector('.cd-toast-apply').onclick = function () {
      removeToast();
      fileInput && fileInput.click();
    };

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (toastEl) toastEl.classList.add('cd-visible');
      });
    });
    setTimeout(removeToast, 10000);
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Build the UI ─────────────────────────────────────────────
  var fileInput = null;

  function buildCameraButton() {
    var serialEl = document.getElementById('serial');
    if (!serialEl) return;
    if (document.getElementById('cd-scan-btn')) return; // already added

    // Create hidden file input
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.capture = 'environment'; // rear camera on mobile
    fileInput.style.display = 'none';
    fileInput.id = 'cd-file-input';
    document.body.appendChild(fileInput);

    // Create the scan button
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'cd-scan-btn';
    btn.className = 'cd-scan-btn';
    btn.setAttribute('aria-label', 'Scan data plate photo');
    btn.title = 'Scan a photo of the serial number label';
    btn.innerHTML = [
      '<span class="material-symbols-outlined cd-icon">photo_camera</span>',
      '<span class="cd-label">Scan Label</span>'
    ].join('');

    // Place the button after the serial input's parent row
    var row = serialEl.closest('.home-tool-row') || serialEl.parentNode;
    if (row) {
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.appendChild(btn);
    } else {
      serialEl.insertAdjacentElement('afterend', btn);
    }

    // ── Event handlers ─────────────────────────────────────────
    btn.addEventListener('click', function () {
      fileInput.value = '';
      fileInput.click();
    });

    fileInput.addEventListener('change', function () {
      console.log('[Camera] File input changed');
      var file = fileInput.files && fileInput.files[0];
      if (!file) {
        console.log('[Camera] No file selected');
        return;
      }
      
      console.log('[Camera] File selected:', file.name, file.type, Math.round(file.size / 1024) + 'KB');
      
      if (!file.type.startsWith('image/')) {
        console.error('[Camera] Invalid file type:', file.type);
        showErrorToast('Please select an image file.');
        return;
      }

      // Clear the camera-filled flags so new results can overwrite
      var serialEl = document.getElementById('serial');
      var modelEl = document.getElementById('modelNumber');
      if (serialEl) serialEl.removeAttribute('data-camera-filled');
      if (modelEl) modelEl.removeAttribute('data-camera-filled');

      // Loading state
      btn.disabled = true;
      btn.innerHTML = '<span class="cd-spin"></span><span class="cd-label">Analyzing...</span>';

      compressImage(file, function (err, base64, mime) {
        if (err) {
          console.error('[Camera] Compression error:', err);
          resetBtn(btn);
          showErrorToast('Could not read the image. Please try again.');
          return;
        }

        callDecodeAPI(base64, mime, function (apiErr, result) {
          console.log('[Camera] API callback - apiErr:', apiErr, 'result:', result);
          resetBtn(btn);
          if (apiErr) {
            console.error('[Camera] API request failed:', apiErr.message);
            showErrorToast('Network error — please check your connection and try again.');
            return;
          }
          if (result.error) {
            console.error('[Camera] API returned error:', result.error);
            showErrorToast(result.error || 'Could not analyze the image.');
            return;
          }
          if (!result.brand && !result.serial && result.candidates && result.candidates.length === 0) {
            console.warn('[Camera] No data extracted from image');
            showErrorToast('No serial number label detected. Make sure the label is in focus and well-lit.');
            return;
          }
          console.log('[Camera] Successfully extracted data, showing toast');
          showSuccessToast(result);
        });
      });
    });
  }

  function resetBtn(btn) {
    btn.disabled = false;
    btn.innerHTML = [
      '<span class="material-symbols-outlined cd-icon">photo_camera</span>',
      '<span class="cd-label">Scan Label</span>'
    ].join('');
  }

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    console.log('[Camera] Initializing camera decode module');
    injectStyles();
    // The serial input may not exist until the decoder data loads
    // Poll briefly, then fall back to MutationObserver
    var attempts = 0;
    function tryBuild() {
      if (document.getElementById('serial')) {
        console.log('[Camera] Serial input found, building camera button');
        buildCameraButton();
      } else if (attempts++ < 20) {
        setTimeout(tryBuild, 300);
      } else {
        console.warn('[Camera] Serial input not found after 20 attempts');
      }
    }
    tryBuild();

    // Also watch for dynamic injection
    var obs = new MutationObserver(function () {
      if (document.getElementById('serial') && !document.getElementById('cd-scan-btn')) {
        console.log('[Camera] Serial input injected, building camera button');
        buildCameraButton();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('[Camera] Initialization complete');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* Add styles for candidate selector (append to STYLES var) */
// Update: The styles are added inline in the HTML, but we need to inject CSS for the select
// We'll add it to STYLES before injection
