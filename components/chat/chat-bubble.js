(function () {
  if (window.__boltAiBubbleBooted) return;
  window.__boltAiBubbleBooted = true;

  function isAssistantPage() {
    var path = window.location.pathname || '';
    return path === '/assistant' || path.endsWith('/assistant.html') || path.endsWith('assistant.html');
  }

  if (isAssistantPage()) return;

  function ensureStylesheet() {
    if (document.getElementById('bolt-ai-chat-css')) return;
    var link = document.createElement('link');
    link.id = 'bolt-ai-chat-css';
    link.rel = 'stylesheet';
    link.href = '/components/chat/chat.css';
    document.head.appendChild(link);
  }

  function ensureScript(src, id, callback) {
    var existing = document.getElementById(id);
    if (existing) {
      if (existing.getAttribute('data-loaded') === '1') callback();
      else existing.addEventListener('load', callback, { once: true });
      return;
    }
    var script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.onload = function () {
      script.setAttribute('data-loaded', '1');
      callback();
    };
    document.head.appendChild(script);
  }

  function boot() {
    var core = window.BoltAIAssistCore;
    var root;
    var open = false;
    var draft = '';
    var unlisten;

    if (!core || document.getElementById('bolt-ai-bubble-root')) return;

    root = document.createElement('div');
    root.id = 'bolt-ai-bubble-root';
    root.className = 'bolt-chat-bubble-shell bolt-chat-font';
    document.body.appendChild(root);

    function scrollMessages() {
      var body = root.querySelector('.bolt-chat-body');
      if (body) body.scrollTop = body.scrollHeight;
    }

    function render() {
      var state = core.getState();
      var messages = state.messages.slice(-10);
      var quickActions = core.getQuickActions().slice(0, 2);

      root.innerHTML =
        (open ? (
          '<div class="bolt-chat-panel">' +
            '<div class="bolt-chat-header">' +
              '<div>' +
                '<h2>Bolt AI Assist</h2>' +
                '<p>Property and equipment research assistant</p>' +
              '</div>' +
              '<div class="bolt-chat-header-actions">' +
                '<button type="button" class="bolt-chat-header-btn" data-bolt-expand>Expand to Full View</button>' +
                '<button type="button" class="bolt-chat-header-btn" data-bolt-close>Close</button>' +
              '</div>' +
            '</div>' +
            '<div class="bolt-chat-body"><div class="bolt-chat-message-list">' +
              messages.map(function (message) {
                return (
                  '<div class="bolt-chat-message ' + message.role + '">' +
                    '<div class="bolt-chat-avatar">' + (message.role === 'user' ? 'You' : 'AI') + '</div>' +
                    '<div class="bolt-chat-bubble">' + core.formatMessageHtml(message.text) + '</div>' +
                  '</div>'
                );
              }).join('') +
              (state.loading ? '<div class="bolt-chat-loading">Bolt AI Assist is responding...</div>' : '') +
            '</div></div>' +
            '<div class="bolt-chat-footer">' +
              '<div class="bolt-chat-actions">' +
                quickActions.map(function (prompt) {
                  return '<button type="button" class="bolt-chat-pill" data-bolt-quick="' + prompt.replace(/"/g, '&quot;') + '">' + prompt + '</button>';
                }).join('') +
              '</div>' +
              '<form class="bolt-chat-form" data-bolt-form>' +
                '<input class="bolt-chat-input" type="text" name="message" placeholder="Ask about age, specs, or serial guidance..." value="' + draft.replace(/"/g, '&quot;') + '">' +
                '<button type="submit" class="bolt-chat-primary-btn">Send</button>' +
              '</form>' +
              '<div class="bolt-chat-note">Chat history is saved locally and continues in full view.</div>' +
            '</div>' +
          '</div>'
        ) : '') +
        '<button type="button" class="bolt-chat-launcher" aria-label="Open Bolt AI Assist" data-bolt-launcher>AI</button>';

      var launcher = root.querySelector('[data-bolt-launcher]');
      if (launcher) {
        launcher.addEventListener('click', function () {
          open = !open;
          render();
        });
      }

      var closeBtn = root.querySelector('[data-bolt-close]');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          open = false;
          render();
        });
      }

      var expandBtn = root.querySelector('[data-bolt-expand]');
      if (expandBtn) {
        expandBtn.addEventListener('click', function () {
          window.location.href = '/assistant';
        });
      }

      Array.prototype.forEach.call(root.querySelectorAll('[data-bolt-quick]'), function (button) {
        button.addEventListener('click', function () {
          draft = button.getAttribute('data-bolt-quick') || '';
          core.sendMessage(draft);
          draft = '';
        });
      });

      var form = root.querySelector('[data-bolt-form]');
      if (form) {
        var input = form.querySelector('input[name="message"]');
        if (input) {
          input.addEventListener('input', function () {
            draft = input.value || '';
          });
        }
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          if (!draft.trim()) return;
          core.sendMessage(draft);
          draft = '';
        });
      }

      scrollMessages();
    }

    unlisten = core.subscribe(render);
    window.addEventListener('beforeunload', function () {
      if (typeof unlisten === 'function') unlisten();
    });
  }

  ensureStylesheet();
  ensureScript('/components/chat/chat-core.js', 'bolt-ai-chat-core', boot);
})();
