(() => {
  const toggle = document.getElementById('hamburgerBtn');
  const menu = document.querySelector('nav > ul');
  if (!toggle || !menu) return;

  const syncExpandedState = () => {
    toggle.setAttribute('aria-expanded', String(menu.classList.contains('open')));
  };

  new MutationObserver(syncExpandedState).observe(menu, { attributes: true, attributeFilter: ['class'] });
  syncExpandedState();

  if (!document.querySelector('script[src$="shared.js"]')) {
    const closeResources = () => {
      document.querySelectorAll('.nav-dropdown-toggle').forEach((button) => button.setAttribute('aria-expanded', 'false'));
      document.querySelectorAll('.nav-dropdown-panel').forEach((panel) => panel.classList.remove('open'));
    };

    document.querySelectorAll('.nav-dropdown-toggle').forEach((button) => {
      const panel = button.nextElementSibling;
      if (!panel?.classList.contains('nav-dropdown-panel')) return;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const wasOpen = panel.classList.contains('open');
        closeResources();
        if (!wasOpen) {
          panel.classList.add('open');
          button.setAttribute('aria-expanded', 'true');
        }
      });
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.nav-dropdown-item')) closeResources();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeResources();
    });
  }
})();
