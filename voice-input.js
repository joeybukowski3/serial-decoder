/**
 * voice-input.js
 * Voice-to-text feature for serial number decoder (mobile only)
 * Uses Web Speech API (Chrome, Edge, Safari)
 */
(function () {
  'use strict';

  const API_LANG = 'en-US';
  const RECOGNITION_TIMEOUT = 30000; // 30 seconds

  // Detect browser support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.log('[Voice] Web Speech API not supported');
    return; // Silently exit if not supported
  }

  // Check if mobile
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  console.log('[Voice] Script loaded. User Agent:', navigator.userAgent);
  console.log('[Voice] Is mobile:', isMobile());

  // Only show on mobile
  if (!isMobile()) {
    console.log('[Voice] Not a mobile device, exiting');
    return;
  }

  let recognition = null;
  let isListening = false;
  let hasInitialized = false;

  // ── Inject styles ────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('vi-styles')) return;
    const style = document.createElement('style');
    style.id = 'vi-styles';
    style.textContent = `
      .vi-mic-btn {
        background: #44e5c2;
        color: #00382d;
        border: none;
        border-radius: 8px;
        padding: 8px 10px;
        width: auto;
        height: 40px;
        min-width: 40px;
        font-size: 20px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 0.2s;
        font-family: 'Sora', sans-serif;
        margin-left: 8px;
        flex-shrink: 0;
      }
      .vi-mic-btn:hover { background: #38debb; transform: scale(1.05); }
      .vi-mic-btn:active { transform: scale(0.98); }
      .vi-mic-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
      .vi-mic-btn.listening {
        background: #f87171;
        color: #fff;
        animation: vi-pulse 1s infinite;
      }
      @keyframes vi-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(248,113,113,0.7); }
        50% { box-shadow: 0 0 0 8px rgba(248,113,113,0); }
      }
      .vi-mic-icon { font-size: 20px; line-height: 1; }
      
      /* Listening indicator dots */
      .vi-listening-dots {
        display: none;
        align-items: center;
        gap: 3px;
        margin-left: 0;
      }
      .vi-listening-dots.active {
        display: inline-flex;
      }
      .vi-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: currentColor;
        animation: vi-dot-bounce 1.4s infinite;
      }
      .vi-dot:nth-child(2) { animation-delay: 0.2s; }
      .vi-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes vi-dot-bounce {
        0%, 80%, 100% { opacity: 0.3; }
        40% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Initialize recognition ───────────────────────────────────
  function initRecognition() {
    if (hasInitialized) {
      console.log('[Voice] Already initialized');
      return;
    }
    
    hasInitialized = true;
    console.log('[Voice] Initializing SpeechRecognition');
    
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.language = API_LANG;
    recognition.maxAlternatives = 1;

    recognition.onstart = function () {
      console.log('[Voice] Recognition started');
      isListening = true;
      updateMicButton();
    };

    recognition.onresult = function (event) {
      console.log('[Voice] onresult event, isFinal:', event.results[event.results.length - 1].isFinal);
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      
      const isFinal = event.results[event.results.length - 1].isFinal;
      if (isFinal && transcript) {
        console.log('[Voice] Final result:', transcript);
        applyVoiceInput(transcript);
      } else if (transcript) {
        console.log('[Voice] Interim result:', transcript);
      }
    };

    recognition.onerror = function (event) {
      console.error('[Voice] Recognition error:', event.error);
      isListening = false;
      updateMicButton();
      showVoiceMessage('Error: ' + (event.error || 'unknown'), 'error');
    };

    recognition.onend = function () {
      console.log('[Voice] Recognition ended');
      isListening = false;
      updateMicButton();
    };
  }

  // ── Apply voice input to serial field ────────────────────────
  function applyVoiceInput(transcript) {
    const serialEl = document.getElementById('serial');
    if (!serialEl) {
      console.log('[Voice] Serial element not found');
      showVoiceMessage('Error: No input field', 'error');
      return;
    }

    // Clean up the transcript: remove spaces, uppercase
    const cleaned = transcript.toUpperCase().replace(/\s+/g, '');
    console.log('[Voice] Cleaned transcript:', cleaned);
    
    // Only accept if it looks like a serial (at least 4 chars)
    if (cleaned.length < 4) {
      console.log('[Voice] Cleaned input too short:', cleaned.length);
      showVoiceMessage('Too short', 'error');
      return;
    }

    serialEl.value = cleaned;
    serialEl.dispatchEvent(new Event('input', { bubbles: true }));
    serialEl.dispatchEvent(new Event('change', { bubbles: true }));
    
    console.log('[Voice] Serial filled:', cleaned);
    
    // Scroll to decoder and show success
    const tool = document.getElementById('decoder-tool') || document.getElementById('panel-decoder');
    if (tool) {
      setTimeout(() => tool.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
    
    showVoiceMessage('✓', 'success');
    
    // Trigger decode button update
    if (typeof updateDecodeBtn === 'function') {
      console.log('[Voice] Calling updateDecodeBtn');
      updateDecodeBtn();
    }
  }

  // ── Show message tooltip ─────────────────────────────────────
  function showVoiceMessage(msg, type) {
    const btn = document.getElementById('vi-mic-btn');
    if (!btn) return;

    // Remove old message
    const old = btn.querySelector('.vi-message');
    if (old) old.remove();

    const msgEl = document.createElement('div');
    msgEl.className = `vi-message`;
    msgEl.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(-8px);
      background: ${type === 'error' ? '#f87171' : '#44e5c2'};
      color: ${type === 'error' ? '#fff' : '#00382d'};
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 10px;
      white-space: nowrap;
      z-index: 1000;
      font-weight: 600;
    `;
    msgEl.textContent = msg;
    btn.appendChild(msgEl);

    setTimeout(() => msgEl.remove(), 2000);
  }

  // ── Toggle listening ────────────────────────────────────────
  function toggleListening() {
    console.log('[Voice] toggleListening called, isListening:', isListening);
    
    if (!recognition) {
      console.log('[Voice] Recognition not initialized, initializing...');
      initRecognition();
      if (!recognition) {
        console.error('[Voice] Failed to initialize recognition');
        showVoiceMessage('Mic not available', 'error');
        return;
      }
    }

    if (isListening) {
      console.log('[Voice] Stopping recognition');
      try {
        recognition.stop();
      } catch (e) {
        console.error('[Voice] Error stopping:', e);
      }
    } else {
      console.log('[Voice] Starting recognition');
      try {
        recognition.start();
      } catch (e) {
        console.error('[Voice] Error starting:', e.message);
        
        // On iOS, sometimes we get "already started" errors
        // In that case, just mark as listening
        if (e.message && e.message.includes('already started')) {
          console.log('[Voice] Already started, marking as listening');
          isListening = true;
          updateMicButton();
        } else {
          showVoiceMessage('Mic error: ' + e.message, 'error');
        }
      }
    }
  }

  // ── Update button state ─────────────────────────────────────
  function updateMicButton() {
    const btn = document.getElementById('vi-mic-btn');
    if (!btn) return;

    const dotsEl = btn.querySelector('.vi-listening-dots');
    
    if (isListening) {
      btn.classList.add('listening');
      btn.disabled = false;
      if (dotsEl) dotsEl.classList.add('active');
    } else {
      btn.classList.remove('listening');
      btn.disabled = false;
      if (dotsEl) dotsEl.classList.remove('active');
    }
  }

  // ── Build button and inject ────────────────────────────────
  function buildVoiceButton() {
    const serialEl = document.getElementById('serial');
    console.log('[Voice] buildVoiceButton called, serialEl:', !!serialEl);
    
    if (!serialEl) {
      console.log('[Voice] Serial element not found');
      return;
    }
    if (document.getElementById('vi-mic-btn')) {
      console.log('[Voice] Button already exists');
      return; // Already added
    }

    console.log('[Voice] Creating button...');
    
    // Create button - icon with listening dots
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'vi-mic-btn';
    btn.className = 'vi-mic-btn';
    btn.setAttribute('aria-label', 'Voice input for serial number');
    btn.title = 'Tap to speak your serial number. Tap again to stop.';
    btn.innerHTML = `
      <span class="material-symbols-outlined vi-mic-icon">mic</span>
      <span class="vi-listening-dots">
        <span class="vi-dot"></span>
        <span class="vi-dot"></span>
        <span class="vi-dot"></span>
      </span>
    `;

    // Find parent row - try multiple selectors
    let row = serialEl.closest('.home-tool-row');
    if (!row) {
      row = serialEl.parentElement;
    }
    
    console.log('[Voice] Found row:', !!row);
    
    if (row) {
      // Ensure row is properly set up for flex layout
      if (!row.style.display || row.style.display === 'block') {
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
      }
      row.appendChild(btn);
      console.log('[Voice] Button appended to row');
    } else {
      serialEl.insertAdjacentElement('afterend', btn);
      console.log('[Voice] Button inserted after serial element');
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Voice] Button clicked');
      toggleListening();
    });
    
    console.log('[Voice] Button created and event listener attached');
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    console.log('[Voice] Init starting, readyState:', document.readyState);
    injectStyles();
    
    // Poll for serial input
    let attempts = 0;
    function tryBuild() {
      if (document.getElementById('serial')) {
        console.log('[Voice] Serial element found on attempt', attempts);
        buildVoiceButton();
      } else if (attempts++ < 20) {
        setTimeout(tryBuild, 300);
      } else {
        console.log('[Voice] Gave up after 20 attempts');
      }
    }
    tryBuild();

    // Watch for dynamic injection
    const obs = new MutationObserver(function () {
      if (document.getElementById('serial') && !document.getElementById('vi-mic-btn')) {
        console.log('[Voice] Serial element detected via MutationObserver');
        buildVoiceButton();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('[Voice] MutationObserver attached');
  }

  if (document.readyState === 'loading') {
    console.log('[Voice] DOM still loading, waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', init);
  } else {
    console.log('[Voice] DOM already loaded, initializing');
    init();
  }
  
  console.log('[Voice] Script initialization complete');
})();
