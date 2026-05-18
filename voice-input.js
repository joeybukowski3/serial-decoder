/**
 * voice-input.js - VOICE-TO-TEXT FEATURE
 * Complete rewrite with proper Safari iOS handling
 * Comprehensive debugging for all platforms
 */
(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════════
  // CONFIGURATION & DETECTION
  // ════════════════════════════════════════════════════════════════════════════
  
  const API_LANG = 'en-US';
  
  // Detect browser and capabilities
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isChrome = /Chrome/.test(navigator.userAgent);
  const isEdge = /Edg/.test(navigator.userAgent);
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  
  console.log('[Voice Audit]', {
    supported: !!SpeechRecognition,
    browser: { isChrome, isEdge, isSafari, isIOS },
    userAgent: navigator.userAgent
  });

  if (!SpeechRecognition) {
    console.error('[Voice] Web Speech API not supported - exiting');
    return;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ════════════════════════════════════════════════════════════════════════════
  
  let recognition = null;
  let isListening = false;
  let lastTranscript = '';
  let recognitionStartTime = 0;

  // ════════════════════════════════════════════════════════════════════════════
  // STYLE INJECTION
  // ════════════════════════════════════════════════════════════════════════════
  
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
        position: relative;
      }
      .vi-mic-btn:hover { 
        background: #38debb; 
        transform: scale(1.05); 
      }
      .vi-mic-btn:active { 
        transform: scale(0.98); 
      }
      .vi-mic-btn.listening {
        background: #f87171;
        color: #fff;
        animation: vi-pulse 1s infinite;
      }
      @keyframes vi-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(248,113,113,0.7); }
        50% { box-shadow: 0 0 0 8px rgba(248,113,113,0); }
      }
      .vi-mic-icon { 
        font-size: 20px; 
        line-height: 1; 
        display: inline-flex;
      }
      
      .vi-listening-dots {
        display: none;
        align-items: center;
        gap: 3px;
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
      
      .vi-message {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%) translateY(-8px);
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 10px;
        white-space: nowrap;
        z-index: 10000;
        font-weight: 600;
        pointer-events: none;
      }
      .vi-message.success {
        background: #44e5c2;
        color: #00382d;
      }
      .vi-message.error {
        background: #f87171;
        color: #fff;
      }
    `;
    document.head.appendChild(style);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RECOGNITION INITIALIZATION
  // ════════════════════════════════════════════════════════════════════════════
  
  function initRecognition() {
    if (recognition) {
      console.log('[Voice] Recognition already initialized');
      return;
    }
    
    console.log('[Voice] Creating new SpeechRecognition instance');
    recognition = new SpeechRecognition();
    
    // Configure recognition
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.language = API_LANG;
    recognition.maxAlternatives = 1;
    
    if (isIOS && isSafari) {
      console.log('[Voice] Detected iOS Safari - applying compatibility settings');
    }

    recognition.onstart = function () {
      console.log('[Voice] ✓ onstart fired');
      recognitionStartTime = Date.now();
      isListening = true;
      updateMicButton();
    };

    recognition.onresult = function (event) {
      console.log('[Voice] onresult event', {
        resultIndex: event.resultIndex,
        resultsLength: event.results.length,
        timestamp: Date.now() - recognitionStartTime + 'ms'
      });
      
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const isFinal = event.results[i].isFinal;
        
        console.log(`[Voice] Result[${i}]:`, {
          transcript,
          isFinal,
          confidence: event.results[i][0].confidence
        });
        
        if (isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }
      
      if (interimTranscript) {
        console.log('[Voice] Interim:', interimTranscript);
      }
      
      if (finalTranscript) {
        console.log('[Voice] Final transcript captured:', finalTranscript.trim());
        lastTranscript = finalTranscript.trim();
        if (!isIOS) {
          applyVoiceInput(finalTranscript.trim());
        }
      }
    };

    recognition.onerror = function (event) {
      console.error('[Voice] ✗ Error event:', event.error, {
        timestamp: Date.now() - recognitionStartTime + 'ms'
      });
      
      isListening = false;
      updateMicButton();
      
      const errorMsg = event.error === 'no-speech' 
        ? 'No speech detected' 
        : event.error === 'network'
        ? 'Network error'
        : event.error;
      
      showVoiceMessage('Error: ' + errorMsg, 'error');
    };

    recognition.onend = function () {
      console.log('[Voice] ✓ onend fired', {
        wasListening: isListening,
        lastTranscript: lastTranscript,
        duration: Date.now() - recognitionStartTime + 'ms'
      });
      
      isListening = false;
      updateMicButton();
      
      if (isIOS && lastTranscript) {
        console.log('[Voice] iOS: Processing transcript on end:', lastTranscript);
        applyVoiceInput(lastTranscript);
        lastTranscript = '';
      }
    };

    console.log('[Voice] Recognition instance created and configured');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // APPLY VOICE INPUT TO SERIAL FIELD
  // ════════════════════════════════════════════════════════════════════════════
  
  function applyVoiceInput(transcript) {
    console.log('[Voice] applyVoiceInput called with:', transcript);
    
    if (!transcript || typeof transcript !== 'string') {
      console.error('[Voice] Invalid transcript:', transcript);
      return;
    }
    
    const serialEl = document.getElementById('serial');
    if (!serialEl) {
      console.error('[Voice] Serial element (#serial) not found in DOM');
      return;
    }

    const cleaned = transcript.trim().toUpperCase().replace(/\s+/g, '');
    console.log('[Voice] Cleaned transcript:', cleaned, 'length:', cleaned.length);
    
    if (cleaned.length < 4) {
      console.log('[Voice] Rejected: too short');
      showVoiceMessage('Too short', 'error');
      return;
    }

    console.log('[Voice] Setting serial input value to:', cleaned);
    serialEl.value = cleaned;
    
    try {
      serialEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      serialEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      serialEl.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
      console.log('[Voice] Events dispatched');
    } catch (e) {
      console.error('[Voice] Error dispatching events:', e);
    }
    
    try {
      if (typeof window.updateDecodeBtn === 'function') {
        window.updateDecodeBtn();
        console.log('[Voice] updateDecodeBtn called');
      } else {
        console.log('[Voice] updateDecodeBtn not available');
      }
    } catch (e) {
      console.error('[Voice] Error calling updateDecodeBtn:', e);
    }
    
    showVoiceMessage('✓', 'success');
    console.log('[Voice] Voice input successfully applied');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UI: SHOW MESSAGE
  // ════════════════════════════════════════════════════════════════════════════
  
  function showVoiceMessage(msg, type) {
    const btn = document.getElementById('vi-mic-btn');
    if (!btn) return;

    const old = btn.querySelector('.vi-message');
    if (old) old.remove();

    const msgEl = document.createElement('div');
    msgEl.className = 'vi-message ' + type;
    msgEl.textContent = msg;
    btn.appendChild(msgEl);
    
    console.log('[Voice] Message shown:', msg);

    setTimeout(() => {
      if (msgEl.parentNode) msgEl.remove();
    }, 2000);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UI: UPDATE BUTTON STATE
  // ════════════════════════════════════════════════════════════════════════════
  
  function updateMicButton() {
    const btn = document.getElementById('vi-mic-btn');
    if (!btn) return;

    const dotsEl = btn.querySelector('.vi-listening-dots');
    
    if (isListening) {
      btn.classList.add('listening');
      if (dotsEl) dotsEl.classList.add('active');
      console.log('[Voice] Button state: LISTENING');
    } else {
      btn.classList.remove('listening');
      if (dotsEl) dotsEl.classList.remove('active');
      console.log('[Voice] Button state: IDLE');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RECOGNITION: TOGGLE LISTENING
  // ════════════════════════════════════════════════════════════════════════════
  
  function toggleListening() {
    console.log('[Voice] toggleListening called, currently isListening:', isListening);
    
    if (!recognition) {
      console.log('[Voice] Recognition not initialized, initializing...');
      initRecognition();
      if (!recognition) {
        console.error('[Voice] Failed to initialize recognition');
        showVoiceMessage('Failed to initialize', 'error');
        return;
      }
    }

    if (isListening) {
      console.log('[Voice] Stopping recognition');
      try {
        recognition.stop();
        console.log('[Voice] Stop called');
      } catch (e) {
        console.error('[Voice] Error stopping:', e);
      }
    } else {
      console.log('[Voice] Starting recognition');
      lastTranscript = '';
      try {
        recognition.start();
        console.log('[Voice] Start called');
      } catch (e) {
        console.error('[Voice] Error starting:', e.message);
        
        if (e.message && (e.message.includes('already started') || e.message.includes('already recording'))) {
          console.log('[Voice] Already running, marking as listening');
          isListening = true;
          updateMicButton();
        } else {
          showVoiceMessage('Mic error: ' + e.message, 'error');
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UI: BUILD AND INJECT BUTTON
  // ════════════════════════════════════════════════════════════════════════════
  
  function buildVoiceButton() {
    const serialEl = document.getElementById('serial');
    if (!serialEl) {
      console.log('[Voice] Serial element not found, cannot build button');
      return;
    }
    
    if (document.getElementById('vi-mic-btn')) {
      console.log('[Voice] Button already exists');
      return;
    }

    console.log('[Voice] Building voice button');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'vi-mic-btn';
    btn.className = 'vi-mic-btn';
    btn.setAttribute('aria-label', 'Voice input for serial number');
    btn.title = 'Tap to speak. Tap again to stop.';
    btn.innerHTML = `
      <span class="material-symbols-outlined vi-mic-icon">mic</span>
      <span class="vi-listening-dots">
        <span class="vi-dot"></span>
        <span class="vi-dot"></span>
        <span class="vi-dot"></span>
      </span>
    `;

    let row = serialEl.closest('.home-tool-row');
    if (!row) {
      row = serialEl.parentElement;
    }
    
    if (row) {
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
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
    
    console.log('[Voice] Button built and listeners attached');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ════════════════════════════════════════════════════════════════════════════
  
  function init() {
    console.log('[Voice] ✓ Initializing voice-to-text feature');
    injectStyles();
    
    let attempts = 0;
    const MAX_ATTEMPTS = 30;
    const tryBuild = () => {
      const serialEl = document.getElementById('serial');
      if (serialEl) {
        console.log(`[Voice] Serial element found on attempt ${attempts}`);
        buildVoiceButton();
      } else if (attempts++ < MAX_ATTEMPTS) {
        setTimeout(tryBuild, 300);
      } else {
        console.warn('[Voice] Gave up waiting for serial element');
      }
    };
    tryBuild();

    const obs = new MutationObserver(() => {
      if (document.getElementById('serial') && !document.getElementById('vi-mic-btn')) {
        console.log('[Voice] Serial element detected via MutationObserver');
        buildVoiceButton();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('[Voice] MutationObserver active');
  }

  if (document.readyState === 'loading') {
    console.log('[Voice] DOM loading, waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', init);
  } else {
    console.log('[Voice] DOM already loaded, initializing immediately');
    init();
  }

  console.log('[Voice] ✓ Script ready');
})();
