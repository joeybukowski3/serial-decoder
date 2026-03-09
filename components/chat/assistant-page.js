(function () {
  function boot() {
    var core = window.BoltAIAssistCore;
    var root = document.getElementById('bolt-assistant-root');
    var draft = '';

    if (!core || !root) return;

    function render() {
      var state = core.getState();
      var quickActions = core.getQuickActions();
      var actionContext = state.actionContext;
      var lastMessage = state.messages.length ? state.messages[state.messages.length - 1] : null;
      root.innerHTML =
        '<div class="bolt-assistant-panel bolt-chat-font">' +
          '<div class="bolt-chat-header bolt-chat-header-full">' +
            '<div class="bolt-chat-header-brand">' +
              '<div class="bolt-chat-logo-mark"><span>🔍</span></div>' +
              '<div>' +
                '<h1>Item Assist AI</h1>' +
                '<p>Age Verification &amp; Replacement Research</p>' +
              '</div>' +
            '</div>' +
            '<div class="bolt-chat-header-actions">' +
              '<button type="button" class="bolt-chat-header-btn bolt-chat-header-btn-ghost" data-bolt-clear>New Chat</button>' +
            '</div>' +
          '</div>' +
          '<div class="bolt-assistant-main">' +
            '<aside class="bolt-assistant-sidebar">' +
              '<div class="bolt-assistant-card">' +
                '<h2>What It Helps With</h2>' +
                '<ul>' +
                  '<li>Serial number decoding and age verification</li>' +
                  '<li>Model and generation identification from partial details</li>' +
                  '<li>LKQ replacement comparison and rating guidance</li>' +
                  '<li>Cause-of-loss thinking for property equipment claims</li>' +
                '</ul>' +
              '</div>' +
              '<div class="bolt-assistant-card">' +
                '<h2>Quick Prompts</h2>' +
                '<div class="bolt-chat-actions">' +
                  quickActions.map(function (prompt) {
                    return '<button type="button" class="bolt-chat-pill" data-bolt-quick="' + prompt.replace(/"/g, '&quot;') + '">' + prompt + '</button>';
                  }).join('') +
                '</div>' +
              '</div>' +
              '<div class="bolt-assistant-card">' +
                '<h2>Persistence</h2>' +
                '<p>Your chat history is stored locally in this browser so the floating bubble and full assistant view stay in sync.</p>' +
              '</div>' +
            '</aside>' +
            '<section class="bolt-assistant-chat">' +
              '<div class="bolt-assistant-scroll">' +
                '<div class="bolt-chat-message-list">' +
                  state.messages.map(function (message) {
                    var showActions = actionContext && lastMessage && message.role === 'model' && message.timestamp === lastMessage.timestamp;
                    return (
                      '<div class="bolt-chat-message-block">' +
                        '<div class="bolt-chat-message ' + message.role + '">' +
                          '<div class="bolt-chat-avatar">' + (message.role === 'user' ? 'You' : 'AI') + '</div>' +
                          '<div class="bolt-chat-bubble">' + core.formatMessageHtml(message.text) + '</div>' +
                        '</div>' +
                        (showActions ? (
                          '<div class="bolt-chat-preset-row">' +
                            actionContext.actions.map(function (action) {
                              return '<button type="button" class="bolt-chat-preset-btn ' + (action.style === 'ghost' ? 'is-ghost' : 'is-primary') + '" data-bolt-preset="' + action.kind + '">' + action.label + '</button>';
                            }).join('') +
                          '</div>'
                        ) : '') +
                      '</div>'
                    );
                  }).join('') +
                  (state.loading ? '<div class="bolt-chat-loading">Item Assist AI is responding...</div>' : '') +
                '</div>' +
              '</div>' +
              '<div class="bolt-assistant-composer">' +
                '<form class="bolt-chat-form bolt-chat-form-wide" data-bolt-form>' +
                  '<input class="bolt-chat-input" type="text" name="message" placeholder="Ask me to decode a serial number, estimate an item&#39;s age, or compare LKQ replacements..." value="' + draft.replace(/"/g, '&quot;') + '">' +
                  '<button type="submit" class="bolt-chat-primary-btn">Send</button>' +
                '</form>' +
                '<div class="bolt-chat-note">Responses are AI-generated research. Verify with manufacturer or source documentation for final claims use.</div>' +
              '</div>' +
            '</section>' +
          '</div>' +
        '</div>';

      var scrollArea = root.querySelector('.bolt-assistant-scroll');
      if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;

      var clearBtn = root.querySelector('[data-bolt-clear]');
      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          draft = '';
          core.clearConversation();
        });
      }

      Array.prototype.forEach.call(root.querySelectorAll('[data-bolt-quick]'), function (button) {
        button.addEventListener('click', function () {
          draft = button.getAttribute('data-bolt-quick') || '';
          core.sendMessage(draft);
          draft = '';
        });
      });

      Array.prototype.forEach.call(root.querySelectorAll('[data-bolt-preset]'), function (button) {
        button.addEventListener('click', function () {
          var kind = button.getAttribute('data-bolt-preset');
          var action = actionContext && actionContext.actions
            ? actionContext.actions.find(function (item) { return item.kind === kind; })
            : null;
          draft = '';
          core.runPresetAction(action);
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
    }

    core.subscribe(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
