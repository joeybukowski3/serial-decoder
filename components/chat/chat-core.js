(function () {
  if (window.BoltAIAssistCore) return;

  var STORAGE_KEY = 'bolt_ai_assist_messages_v1';
  var listeners = [];
  var initialMessage = {
    role: 'model',
    text: 'Hello. I am Bolt AI Assist. I can help with item age research, serial number guidance, technical specs, life expectancy, and property-related equipment questions.',
    timestamp: Date.now(),
  };

  var quickActions = [
    'How do I estimate the age of a Carrier condenser from the serial number?',
    'What are the typical specs for a 50-gallon electric water heater?',
    'What is the normal life expectancy of an asphalt shingle roof?',
    'Help me identify what this appliance model likely is used for.'
  ];

  var state = {
    messages: loadMessages(),
    loading: false,
    error: '',
  };

  function safeLocalStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeLocalStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {}
  }

  function loadMessages() {
    var raw = safeLocalStorageGet(STORAGE_KEY);
    if (!raw) return [initialMessage];
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.filter(function (message) {
          return message && (message.role === 'user' || message.role === 'model') && String(message.text || '').trim();
        });
      }
    } catch (_) {}
    return [initialMessage];
  }

  function persistMessages() {
    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(state.messages));
  }

  function notify() {
    listeners.slice().forEach(function (listener) {
      try {
        listener(getState());
      } catch (_) {}
    });
  }

  function setState(next) {
    state = {
      messages: next.messages || state.messages,
      loading: typeof next.loading === 'boolean' ? next.loading : state.loading,
      error: typeof next.error === 'string' ? next.error : state.error,
    };
    persistMessages();
    notify();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.push(listener);
    listener(getState());
    return function () {
      listeners = listeners.filter(function (item) { return item !== listener; });
    };
  }

  function getState() {
    return {
      messages: state.messages.slice(),
      loading: state.loading,
      error: state.error,
    };
  }

  function clearConversation() {
    setState({
      messages: [{
        role: initialMessage.role,
        text: initialMessage.text,
        timestamp: Date.now(),
      }],
      loading: false,
      error: '',
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMessageHtml(value) {
    var text = escapeHtml(value);
    text = text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return text.replace(/\n/g, '<br>');
  }

  async function sendMessage(text) {
    var clean = String(text || '').trim();
    var nextMessages;
    var response;
    var data;

    if (!clean || state.loading) return;

    nextMessages = state.messages.concat({
      role: 'user',
      text: clean,
      timestamp: Date.now(),
    });

    setState({
      messages: nextMessages,
      loading: true,
      error: '',
    });

    try {
      response = await fetch('/api/assistant-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(function (message) {
            return { role: message.role, text: message.text };
          }),
        }),
      });

      data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.reply) {
        throw new Error((data && data.error) || 'Unable to get a response right now');
      }

      setState({
        messages: nextMessages.concat({
          role: 'model',
          text: String(data.reply || '').trim(),
          timestamp: Date.now(),
        }),
        loading: false,
        error: '',
      });
    } catch (error) {
      setState({
        messages: nextMessages.concat({
          role: 'model',
          text: 'I could not reach Gemini right now. Please try again in a moment.',
          timestamp: Date.now(),
        }),
        loading: false,
        error: error && error.message ? error.message : 'Unable to get a response right now',
      });
    }
  }

  window.BoltAIAssistCore = {
    clearConversation: clearConversation,
    formatMessageHtml: formatMessageHtml,
    getQuickActions: function () { return quickActions.slice(); },
    getState: getState,
    sendMessage: sendMessage,
    subscribe: subscribe,
  };
})();
