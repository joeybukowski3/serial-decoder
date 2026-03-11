(function () {
  if (window.BoltAIAssistCore) return;

  var STORAGE_KEY = 'bolt_ai_assist_messages_v1';
  var listeners = [];
  var initialMessage = {
    role: 'model',
    text: "Hi — I'm Item Assist AI. I can decode serial numbers, estimate item ages, and identify LKQ replacement options. What are you working on?",
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
    actionContext: null,
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
      actionContext: Object.prototype.hasOwnProperty.call(next, 'actionContext') ? next.actionContext : state.actionContext,
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
      actionContext: state.actionContext,
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
      actionContext: null,
    });
  }

  function detectActionContext(text) {
    var value = String(text || '').toLowerCase();
    if (!value) return null;

    if (/(best match|alternative 1|alternative 2|lkq|close match|not lkq|above lkq)/i.test(value)) {
      return {
        type: 'replacement',
        actions: [{
          kind: 'replacement',
          label: 'Decode a Different Item',
          prompt: 'I have a new item to identify.',
          style: 'ghost',
          clearFirst: true,
        }],
      };
    }

    if (/(cause of loss|likely cause|damage pattern|fire damage|smoke damage|water damage|surge damage|mechanical failure|theft|physical damage)/i.test(value)) {
      return {
        type: 'cause',
        actions: [{
          kind: 'cause',
          label: 'Find Replacement Options for Damaged Item',
          prompt: 'Please provide LKQ replacement options for the item we just discussed.',
          style: 'primary',
          clearFirst: false,
        }],
      };
    }

    if (/(manufacture date|estimated age|age estimate|confidence level|identified item|serial number|generation|manufactured)/i.test(value)) {
      return {
        type: 'age',
        actions: [{
          kind: 'age',
          label: 'Compare Replacement Options',
          prompt: 'Based on the item you just identified, please provide LKQ replacement options.',
          style: 'primary',
          clearFirst: false,
        }],
      };
    }

    return null;
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
      actionContext: null,
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
        actionContext: detectActionContext(String(data.reply || '').trim()),
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
        actionContext: null,
      });
    }
  }

  async function runPresetAction(action) {
    if (!action || !action.prompt) return;
    if (action.clearFirst) {
      clearConversation();
    } else {
      setState({
        messages: state.messages,
        loading: state.loading,
        error: state.error,
        actionContext: null,
      });
    }
    await sendMessage(action.prompt);
  }

  window.BoltAIAssistCore = {
    clearConversation: clearConversation,
    formatMessageHtml: formatMessageHtml,
    getQuickActions: function () { return quickActions.slice(); },
    getState: getState,
    runPresetAction: runPresetAction,
    sendMessage: sendMessage,
    subscribe: subscribe,
  };
})();
