(() => {
  'use strict';
  const icon = name => { const node = document.createElement('i'); node.dataset.lucide = name; node.setAttribute('aria-hidden', 'true'); return node; };
  const header = document.querySelector('.v2-header, .site-header');
  const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const link = (href, label) => { const a = document.createElement('a'); a.href = href; a.textContent = label; return a; };
  const main = document.querySelector('main');
  if (main) {
    main.id ||= 'main-content'; main.tabIndex = -1;
    const skip = link('#' + main.id, 'Aller au contenu'); skip.className = 'skip-link'; document.body.prepend(skip);
  }
  function disclosure(button, panel) {
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open)); panel.classList.toggle('navigation-open', open);
    });
    const close = () => { button.setAttribute('aria-expanded', 'false'); panel.classList.remove('navigation-open'); };
    panel.addEventListener('click', event => { if (event.target.closest('a')) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') { close(); button.focus(); } });
    document.addEventListener('pointerdown', event => { if (!panel.contains(event.target) && !button.contains(event.target)) close(); });
  }
  if (header) {
    header.classList.add('community-header');
    const nav = header.querySelector('nav');
    if (nav) {
      nav.id = 'public-navigation'; nav.replaceChildren();
      for (const [href, label] of [['/', 'Accueil'], ['/game', 'Game'], ['/cards', 'Collection'], ['/discord', 'Communauté'], ['/bots', 'Bots'], ['/docs', 'Documentation']]) {
        const a = link(href, label);
        if (path === href || href === '/bots' && ['/protect', '/support'].includes(path)) a.setAttribute('aria-current', 'page');
        nav.append(a);
      }
      const button = document.createElement('button'); button.type = 'button'; button.className = 'navigation-toggle';
      button.setAttribute('aria-controls', nav.id); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-label', 'Menu principal'); button.title = 'Menu principal'; button.append(icon('menu'));
      header.insertBefore(button, nav); disclosure(button, nav);
    }
    const subtitle = header.querySelector('.v2-brand small, .brand small'); if (subtitle) subtitle.textContent = 'UNIVERS';
  }
  const sidebar = document.querySelector('.platform-sidebar');
  if (sidebar) {
    sidebar.id = 'workspace-navigation';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'navigation-toggle workspace-toggle';
    button.setAttribute('aria-controls', sidebar.id); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-label', 'Menu de mon espace'); button.title = 'Menu de mon espace'; button.append(icon('menu'));
    document.querySelector('.platform-header').prepend(button); disclosure(button, sidebar);
  }
  const footer = document.querySelector('.v2-footer, .site-footer');
  if (footer) {
    footer.classList.add('community-footer');
    const identity = document.createElement('div'); identity.className = 'footer-identity';
    const brand = link('/', 'WarsNuto Univers'); const subtitle = document.createElement('p'); subtitle.textContent = 'La communauté, au-delà des vidéos.'; identity.append(brand, subtitle);
    const nav = document.createElement('nav'); nav.setAttribute('aria-label', 'Liens de pied de page');
    for (const [href, label] of [['/discord', 'Discord'], ['/youtube', 'YouTube'], ['/cards', 'Catalogue'], ['/docs', 'Documentation'], ['/privacy', 'Confidentialité'], ['/terms', 'Conditions']]) nav.append(link(href, label));
    const updated = footer.querySelector('[data-site-updated]'); footer.replaceChildren(identity, nav); if (updated) footer.append(updated);
  }
  document.addEventListener('click', event => {
    for (const details of document.querySelectorAll('.wn-account details[open]')) if (!details.contains(event.target)) details.open = false;
    const retry = event.target.closest('[data-youtube-retry]'); if (retry) void window.loadYouTubeVideos?.();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') for (const details of document.querySelectorAll('.wn-account details[open]')) { details.open = false; details.querySelector('summary').focus(); }
  });
  window.lucide?.createIcons();
})();
