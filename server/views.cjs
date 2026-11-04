const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const pages = { '/profile': ['Mon espace', 'Ton espace WarsNuto'], '/profile/settings': ['Mon compte', 'Paramètres du compte'], '/profile/game': ['WarsNuto Game', 'Ta progression Game'], '/profile/protect': ['XP communautaire', 'Ta progression Protect'], '/servers': ['Écosystème WarsNuto', 'Mes serveurs'],
  '/admin': ['Administration', 'Vue d’ensemble'], '/admin/bots': ['Administration', 'Suivi des bots'], '/admin/configuration': ['Administration', 'Configuration des bots'], '/admin/users': ['Administration', 'Comptes utilisateurs'],
  '/admin/staff': ['Propriétaire', 'Équipe et permissions'], '/admin/logs': ['Administration', 'Journal administratif'],
  '/admin/settings': ['Administration', 'Paramètres du site'], '/admin/moderation': ['Modération', 'Espace de modération'] };
function page(route, session, settings = { name: 'WarsNuto' }) {
  const [section, title] = pages[route];
  const admin = route.startsWith('/admin') && session.permissions.includes('admin:read');
  const canModerate = session.permissions.includes('moderation:read') || session.protectAccess?.canModerate;
  const symbols = { '/admin': 'layout-dashboard', '/servers': 'server', '/admin/configuration': 'sliders-horizontal', '/admin/bots': 'activity', '/admin/users': 'users-round', '/admin/moderation': 'shield-check', '/admin/staff': 'badge-check', '/admin/logs': 'scroll-text', '/admin/settings': 'settings-2', '/profile': 'user-round', '/profile/game': 'swords', '/profile/protect': 'sparkles', '/profile/settings': 'settings-2' };
  const symbol = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const links = admin ? [['/admin', 'Vue d’ensemble', 'admin:read'], ['/servers', 'Mes serveurs'], ['/admin/configuration', 'Configuration des bots'], ['/admin/bots', 'Suivi des bots', 'admin:read'], ['/admin/users', 'Utilisateurs', 'users:read'],
    ['/admin/moderation', 'Modération', 'moderation:read'], ['/admin/staff', 'Équipe et permissions', 'staff:manage'],
    ['/admin/logs', 'Journal', 'audit:read'], ['/admin/settings', 'Paramètres du site', 'settings:write']]
    : [['/profile', 'Mon espace'], ['/profile/protect', 'Mon XP Protect'], ['/profile/game', 'Ma progression Game'], ['/servers', 'Mes serveurs'], ['/profile/settings', 'Mon compte'], ['/admin/moderation', 'Modération', 'moderation:read'], ...(session.permissions.includes('admin:read') ? [['/admin', 'Administration']] : [])];
  const prefs = require('./preferences.cjs').normalizePreferences(session.user.preferences);
  return `<!doctype html><html lang="fr" data-account-appearance="true" data-theme="${prefs.theme}" data-density="${prefs.density}" data-reduced-motion="${prefs.reducedMotion}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/appearance.js"></script>
    <meta name="robots" content="noindex,nofollow"><title>${escape(title)} · ${escape(settings.name)}</title>
    <link rel="icon" href="/assets/warsnuto-favicon-round.png"><link rel="stylesheet" href="/platform.css"><script src="/assets/platform-icons.js" defer></script><script src="/member-space.js" defer></script>${route === '/admin/configuration' ? '<script src="/bot-configuration.js" defer></script>' : ''}<script src="/platform.js" defer></script></head>
    <body data-platform-page="${escape(route)}"><header class="platform-header"><a class="platform-brand" href="/"><img src="/assets/warsnuto-icon.png" alt="">${escape(settings.name)}<span>UNIVERS</span></a>
    <div data-account-menu></div></header><div class="platform-shell"><aside class="platform-sidebar"><p>${escape(section)}</p><nav aria-label="Navigation de l’espace">
    ${links.filter(([href, , permission]) => href === '/admin/moderation' || !permission || session.permissions.includes(permission)).map(([href, label]) => `<a href="${href}"${href === '/admin/moderation' ? ' data-protect-link' + (!canModerate ? ' hidden' : '') : ''}${href === route ? ' aria-current="page"' : ''}>${symbol(symbols[href])}<span>${escape(label)}</span></a>`).join('')}
    <a href="/" class="nav-return">${symbol('arrow-up-right')}<span>Retour au site</span></a></nav><div class="sidebar-account"><img src="${escape(session.user.avatar)}" alt=""><span>${escape(session.user.displayName)}<small>${escape(session.user.role === 'USER' && session.protectAccess?.canModerate ? 'Équipe Protect' : session.user.role)}</small></span></div></aside>
    <main class="platform-main"><div class="page-heading"><div><p class="eyebrow">${escape(section)}</p><h1>${escape(title)}</h1></div><span class="connection-state"><i></i> Session active</span></div>
    <div role="status" aria-live="polite" data-notice></div><div id="platform-content" aria-busy="true"><p class="loading-state">Chargement…</p></div></main></div>
    <dialog id="confirm-dialog" aria-labelledby="confirm-title"><form method="dialog"><h2 id="confirm-title">Confirmer l’action</h2><p data-confirm-description></p>
    <label>Motif<textarea name="reason" required minlength="3" maxlength="300"></textarea></label><label data-confirm-label>Confirmation<input name="confirmation" required autocomplete="off"></label>
    <div class="form-actions"><button value="cancel" type="button" data-dialog-cancel>Annuler</button><button value="confirm" class="danger">Confirmer</button></div></form></dialog>
    </body></html>`;
}
function failurePage(status, message) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/platform.css"><title>WarsNuto · Accès</title></head><body data-platform-page="error"><main class="error-page"><img src="/assets/warsnuto-icon.png" alt="WarsNuto"><h1>${status === 403 ? 'Accès réservé' : 'Action indisponible'}</h1><p>${escape(message)}</p><a class="button primary" href="/">Retour au site</a><a class="button" href="/auth/discord/start">Se connecter avec Discord</a></main></body></html>`;
}
module.exports = { page, pages, escape, failurePage };
