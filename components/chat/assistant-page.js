(function () {
  function boot() {
    var core = window.BoltAIAssistCore;
    var root = document.getElementById('bolt-assistant-root');
    var draft = '';

    if (!core || !root) return;

    function render() {
      var state = core.getState();
      var quickActions = core.getQuickActions();
      root.innerHTML =
        '<div class="bolt-assistant-app bolt-chat-font">' +
          '<header class="bolt-assistant-topbar">' +
            '<div class="bolt-assistant-brand">' +
              '<div class="bolt-assistant-brand-mark">AI</div>' +
              '<div>' +
                '<h1>Bolt AI Assist</h1>' +
                '<p>Full-view research dashboard for property and equipment questions</p>' +
              '</div>' +
            '</div>' +
            '<div class="bolt-chat-header-actions">' +
              '<a class="bolt-chat-secondary-btn" href="/">Back to Item Assist</a>' +
              '<button type="button" class="bolt-chat-primary-btn" data-bolt-clear>New Chat</button>' +
            '</div>' +
          '</header>' +
          '<main class="bolt-assistant-main">' +
            '<aside class="bolt-assistant-sidebar">' +
              '<div class="bolt-assistant-card">' +
                '<h2>What It Helps With</h2>' +
                '<ul>' +
                  '<li>Serial number guidance for appliances, HVAC, and electronics</li>' +
                  '<li>Technical specs and common replacement context</li>' +
                  '<li>Useful life and age-estimation research</li>' +
                  '<li>General property-claim item research</li>' +
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
                    return (
                      '<div class="bolt-chat-message ' + message.role + '">' +
                        '<div class="bolt-chat-avatar">' + (message.role === 'user' ? 'You' : 'AI') + '</div>' +
                        '<div class="bolt-chat-bubble">' + core.formatMessageHtml(message.text) + '</div>' +
                      '</div>'
                    );
                  }).join('') +
                  (state.loading ? '<div class="bolt-chat-loading">Bolt AI Assist is responding...</div>' : '') +
                '</div>' +
              '</div>' +
              '<div class="bolt-assistant-composer">' +
                '<form class="bolt-chat-form" data-bolt-form>' +
                  '<input class="bolt-chat-input" type="text" name="message" placeholder="Ask about a serial number, item age, specs, or claim-related equipment research..." value="' + draft.replace(/"/g, '&quot;') + '">' +
                  '<button type="button" class="bolt-chat-secondary-btn" data-bolt-home>Back</button>' +
                  '<button type="submit" class="bolt-chat-primary-btn">Send</button>' +
                '</form>' +
                '<div class="bolt-chat-note">Responses are AI-generated research. Verify with manufacturer or source documentation for final claims use.</div>' +
              '</div>' +
            '</section>' +
          '</main>' +
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

      var backBtn = root.querySelector('[data-bolt-home]');
      if (backBtn) {
        backBtn.addEventListener('click', function () {
          window.location.href = '/';
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
    }

    core.subscribe(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
