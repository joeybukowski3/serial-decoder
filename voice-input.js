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

  // Only show on mobile
  if (!isMobile()) {
    return;
  }

  let recognition = null;
  let isListening = false;

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
        width: 40px;
        height: 40px;
        min-width: 40px;
        font-size: 20px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
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
    `;
    document.head.appendChild(style);
  }

  // ── Initialize recognition ───────────────────────────────────
  function initRecognition() {
    if (recognition) return;
    
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.language = API_LANG;
    recognition.maxAlternatives = 1;

    recognition.onstart = function () {
      isListening = true;
      updateMicButton();
    };

    recognition.onresult = function (event) {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      
      const isFinal = event.results[event.results.length - 1].isFinal;
      if (isFinal && transcript) {
        applyVoiceInput(transcript);
      }
    };

    recognition.onerror = function (event) {
      console.error('[Voice] Recognition error:', event.error);
      isListening = false;
      updateMicButton();
      showVoiceMessage('Could not understand', 'error');
    };

    recognition.onend = function () {
      isListening = false;
      updateMicButton();
    };
  }

  // ── Apply voice input to serial field ────────────────────────
  function applyVoiceInput(transcript) {
    const serialEl = document.getElementById('serial');
    if (!serialEl) return;

    // Clean up the transcript: remove spaces, uppercase
    const cleaned = transcript.toUpperCase().replace(/\s+/g, '');
    
    // Only accept if it looks like a serial (at least 4 chars)
    if (cleaned.length < 4) {
      showVoiceMessage('Too short', 'error');
      return;
    }

    serialEl.value = cleaned;
    serialEl.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Scroll to decoder and show success
    const tool = document.getElementById('decoder-tool') || document.getElementById('panel-decoder');
    if (tool) {
      setTimeout(() => tool.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
    
    showVoiceMessage('✓', 'success');
    
    // Trigger decode button update
    if (typeof updateDecodeBtn === 'function') updateDecodeBtn();
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
    if (!recognition) initRecognition();

    if (isListening) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (e) {
        // Already listening
        recognition.stop();
        setTimeout(() => recognition.start(), 100);
      }
    }
  }

  // ── Update button state ─────────────────────────────────────
  function updateMicButton() {
    const btn = document.getElementById('vi-mic-btn');
    if (!btn) return;

    if (isListening) {
      btn.classList.add('listening');
      btn.disabled = false;
    } else {
      btn.classList.remove('listening');
      btn.disabled = false;
    }
  }

  // ── Build button and inject ────────────────────────────────
  function buildVoiceButton() {
    const serialEl = document.getElementById('serial');
    if (!serialEl) return;
    if (document.getElementById('vi-mic-btn')) return; // Already added

    // Create button - icon only
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'vi-mic-btn';
    btn.className = 'vi-mic-btn';
    btn.setAttribute('aria-label', 'Voice input for serial number');
    btn.title = 'Speak your serial number';
    btn.innerHTML = `<span class="material-symbols-outlined vi-mic-icon">mic</span>`;

    // Find parent row
    const row = serialEl.closest('.home-tool-row') || serialEl.parentNode;
    if (row) {
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.appendChild(btn);
    } else {
      serialEl.insertAdjacentElement('afterend', btn);
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      toggleListening();
    });
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    injectStyles();
    
    // Poll for serial input
    let attempts = 0;
    function tryBuild() {
      if (document.getElementById('serial')) {
        buildVoiceButton();
      } else if (attempts++ < 20) {
        setTimeout(tryBuild, 300);
      }
    }
    tryBuild();

    // Watch for dynamic injection
    const obs = new MutationObserver(function () {
      if (document.getElementById('serial') && !document.getElementById('vi-mic-btn')) {
        buildVoiceButton();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
