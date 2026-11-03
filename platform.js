(() => {
  'use strict';
  const route = document.body.dataset.platformPage;
  const content = document.getElementById('platform-content');
  const menu = document.querySelector('[data-account-menu]') || (() => {
    const nav = document.querySelector('.v2-header, .site-header');
    if (!nav) return null;
    const node = document.createElement('div'); node.dataset.accountMenu = ''; nav.append(node); return node;
  })();
  const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = value => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Pas encore connecté';
  const number = value => new Intl.NumberFormat('fr-FR').format(value);
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const icons = () => window.lucide?.createIcons();
  const roles = { USER: 'Membre', MODERATOR: 'Modérateur', ADMIN: 'Administrateur', OWNER: 'Propriétaire' };
  const botStatus = { available: 'Connecté à Discord', disconnected: 'Discord déconnecté', stale: 'Signal trop ancien', unavailable: 'Signal indisponible', not_connected: 'Surveillance non connectée' };
  const statusClass = status => status === 'available' ? 'positive' : ['disconnected', 'unavailable'].includes(status) ? 'negative' : 'warning';
  const uptime = value => { const minutes = Math.max(0, Math.floor(value / 60000)); return minutes >= 1440 ? Math.floor(minutes / 1440) + ' j ' + Math.floor(minutes % 1440 / 60) + ' h' : minutes >= 60 ? Math.floor(minutes / 60) + ' h ' + minutes % 60 + ' min' : minutes + ' min'; };
  const events = { 'auth.login': 'Connexion Discord', 'auth.failure': 'Connexion refusée', 'session.logout': 'Déconnexion', 'session.revoke_others': 'Autres sessions révoquées',
    'staff.role': 'Rôle modifié', 'staff.permissions': 'Permissions modifiées', 'user.status': 'Statut du compte modifié', 'user.sessions_revoke': 'Sessions révoquées',
    'site.settings': 'Paramètres du site modifiés', 'application.error': 'Erreur du service web', 'request.denied': 'Action refusée', 'owner.bootstrap': 'Propriétaire initial configuré',
    'bot.config.requested': 'Configuration bot demandée', 'bot.config.saved': 'Configuration bot enregistrée', 'bot.config.refused': 'Configuration bot refusée ou à vérifier' };
  const grantLabels = { 'admin:read': 'Vue d’ensemble', 'moderation:read': 'Espace de modération', 'users:read': 'Consulter les comptes', 'users:moderate': 'Suspendre et réactiver les membres',
    'audit:read': 'Consulter le journal', 'settings:write': 'Modifier les paramètres publics', 'bots:configure': 'Configurer les bots sur les serveurs Discord autorisés' };
  let session, serverOffset = 0, listPage = 1, currentUser, settings, grants, busy = false;
  async function request(path, options = {}) {
    const response = await fetch('/api/platform/' + path, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(15000), ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': session?.csrf || '' } : {}), ...options.headers } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) expire();
      const error = new Error(result.error || 'Le service est temporairement indisponible.'); error.status = response.status; throw error;
    }
    return result;
  }
  const write = (path, body, method = 'POST') => request(path, { method, body: JSON.stringify(body) });
  function notice(message, kind = 'error', reauth = false) {
    const target = document.querySelector('[data-notice]');
    if (!target) return;
    target.className = 'notice ' + kind;
    target.innerHTML = `${icon(kind === 'success' ? 'circle-check' : 'info')}<span>${E(message)}${reauth ? ' <a href="/auth/discord/start?next=' + encodeURIComponent(route) + '">Confirmer avec Discord</a>' : ''}</span>`; icons();
  }
  function fail(error) { notice(error.name === 'TimeoutError' ? 'La réponse prend trop de temps. Réessaie dans un instant.' : error.message, 'error', error.status === 428); }
  function account() {
    if (!menu) return;
    menu.className = 'wn-account';
    menu.innerHTML = session?.user ? `<details><summary aria-label="Compte de ${E(session.user.displayName)}"><img src="${E(session.user.avatar)}" alt=""><span>${E(session.user.displayName)}</span>${icon('chevron-down')}</summary>
      <div class="wn-account-dropdown"><strong>${E(session.user.displayName)}</strong><span>@${E(session.user.username || session.user.id)}</span><small>ID Discord : ${E(session.user.id)}</small>
      <a href="/profile">${icon('user-round')} Mon espace</a><a href="/profile/settings">${icon('settings-2')} Mon compte</a>
      ${session.permissions.includes('admin:read') ? `<a href="/admin">${icon('shield-check')} Administration</a>` : session.permissions.includes('moderation:read') ? `<a href="/admin/moderation">${icon('shield-check')} Modération</a>` : ''}<button type="button" data-logout>${icon('log-out')} Se déconnecter</button></div></details>`
      : `<a class="wn-login" href="/auth/discord/start?next=${encodeURIComponent(route || '/profile')}">${icon('log-in')} Se connecter</a>`;
    menu.querySelector('[data-logout]')?.addEventListener('click', async () => { try { await write('logout', {}); location.assign('/'); } catch (error) { fail(error); } });
    icons();
  }
  function expire() {
    session = null; account();
    if (content) { content.setAttribute('aria-busy', 'false'); content.innerHTML = '<section class="empty-state"><h2>Ta session a expiré</h2><p>Reconnecte-toi avec Discord pour retrouver ton espace.</p><a class="button primary" href="/auth/discord/start?next=' + encodeURIComponent(route) + '">Se reconnecter</a></section>'; }
    document.querySelectorAll('.platform-sidebar nav a').forEach(node => { if (node.href.includes('/admin')) node.remove(); });
    document.getElementById('confirm-dialog')?.close();
  }
  async function confirmAction(description, expected, reason = true) {
    const dialog = document.getElementById('confirm-dialog'), form = dialog.querySelector('form');
    form.reset(); dialog.querySelector('[data-confirm-description]').textContent = description;
    const reasonInput = form.elements.reason; reasonInput.required = reason; reasonInput.closest('label').hidden = !reason;
    const field = form.elements.confirmation; field.setCustomValidity(''); field.placeholder = expected;
    dialog.querySelector('[data-confirm-label]').firstChild.textContent = 'Saisis « ' + expected + ' »';
    dialog.returnValue = 'cancel'; dialog.showModal();
    return new Promise(resolve => {
      const submit = event => { event.preventDefault(); if (field.value !== expected) { field.setCustomValidity('Recopie exactement la confirmation demandée.'); field.reportValidity(); return; } dialog.close('confirm'); };
      const input = () => field.setCustomValidity('');
      const closed = () => { form.removeEventListener('submit', submit); field.removeEventListener('input', input); resolve(dialog.returnValue === 'confirm' ? { confirmation: field.value, reason: reasonInput.value } : null); };
      form.addEventListener('submit', submit); field.addEventListener('input', input); dialog.addEventListener('close', closed, { once: true });
      dialog.querySelector('[data-dialog-cancel]').onclick = () => dialog.close('cancel');
    });
  }
  function table(headers, rows) {
    return `<div class="table-scroll"><table><thead><tr>${headers.map(label => `<th scope="col">${E(label)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${headers.length}" class="table-empty">Aucun résultat.</td></tr>`}</tbody></table></div>`;
  }
  function logRows(rows, details = false) {
    return rows.map(row => `<tr><td>${E(date(row.created_at))}</td><td><strong>${E(events[row.action] || row.action)}</strong>${details && row.context && row.context !== '{}' ? `<details><summary>Contexte</summary><p>${E(JSON.stringify(JSON.parse(row.context)))}</p></details>` : ''}</td><td class="mono">${E(row.actor_id || 'Système')}</td><td class="mono">${E(row.target_id || '—')}</td><td><span class="status ${row.result === 'success' ? 'positive' : 'negative'}">${row.result === 'success' ? 'Réussite' : 'Refus / échec'}</span></td></tr>`);
  }
  function pager(data) {
    return `<div class="pagination"><span>${number(data.total)} résultat(s) · Page ${data.page}</span><div><button type="button" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''} aria-label="Page précédente" title="Page précédente">${icon('chevron-left')}</button><button type="button" data-page="${data.page + 1}" ${data.page * 25 >= data.total ? 'disabled' : ''} aria-label="Page suivante" title="Page suivante">${icon('chevron-right')}</button></div></div>`;
  }
  async function overview() {
    const data = await request('admin/overview');
    content.innerHTML = `<section class="metric-grid">${[['Comptes', data.users, 'users-round'], ['Connexions · 24 h', data.recentLogins, 'log-in'], ['Administrateurs actifs', data.administrators, 'shield-check'], ['Sessions actives', data.activeSessions, 'monitor']].map(([label, value, glyph]) => `<article class="metric">${icon(glyph)}<span>${label}</span><strong>${number(value)}</strong></article>`).join('')}</section>
      <section class="workspace-section"><div class="section-heading"><h2>État des services</h2><span>${number(data.applicationErrors)} erreur(s) web · 24 h</span></div><div class="service-list">${data.services.map(service => `<div ${service.id ? 'data-bot-service="' + E(service.id) + '"' : ''}><span>${E(service.name)}</span><span class="status ${statusClass(service.status)}">${E(service.id ? botStatus[service.status] : 'Disponible')}</span></div>`).join('')}</div><div class="monitoring-toolbar"><span class="muted" data-bot-checked>Vérifié le ${E(date(data.monitoringCheckedAt))}</span><a class="button" href="/admin/bots">${icon('monitor')} Suivi des bots</a></div></section>
      <section class="workspace-section"><h2>Activité récente</h2>${table(['Date', 'Action', 'Acteur', 'Compte concerné', 'Résultat'], logRows(data.activity))}</section>`;
  }
  function renderBotMonitoring(data) {
    if (route === '/admin') {
      for (const bot of data.bots) {
        const badge = content.querySelector('[data-bot-service="' + bot.id + '"] .status');
        if (badge) { badge.className = 'status ' + statusClass(bot.status); badge.textContent = botStatus[bot.status]; }
      }
    } else {
      const grid = content.querySelector('[data-bot-grid]');
      grid.innerHTML = data.bots.map(bot => `<article class="bot-monitor"><div class="section-heading"><h2>${E(bot.name)}</h2><span class="status ${statusClass(bot.status)}">${E(botStatus[bot.status])}</span></div>
        <dl class="bot-facts">${[['Latence Discord', bot.latencyMs == null ? '—' : number(bot.latencyMs) + ' ms'],
          ['Serveurs Discord', bot.guildCount == null ? '—' : number(bot.guildCount)], ['Mémoire du processus', bot.rssBytes == null ? '—' : number(Math.round(bot.rssBytes / 1048576)) + ' Mo'],
          ['Depuis le démarrage', bot.startedAt == null ? '—' : uptime(bot.sampledAt - bot.startedAt)],
          ['Commandes depuis le démarrage', bot.commandsSinceStart == null ? '—' : number(bot.commandsSinceStart)],
          ['Dernière commande', bot.lastCommandAt == null ? (bot.commandsSinceStart == null ? '—' : 'Aucune depuis le démarrage') : date(bot.lastCommandAt)],
          ['Dernier signal', bot.sampledAt == null ? 'Aucun signal' : date(bot.sampledAt)]].map(([label, value]) => `<div><dt>${E(label)}</dt><dd>${E(value)}</dd></div>`).join('')}</dl></article>`).join('');
    }
    content.querySelector('[data-bot-checked]').textContent = 'Vérifié le ' + date(data.checkedAt);
  }
  async function botMonitoring() {
    const data = await request('admin/bots');
    content.innerHTML = `<section class="workspace-section"><div class="section-heading"><h2>Protect, Game et Support</h2><button type="button" data-refresh-bots title="Actualiser les états" aria-label="Actualiser les états">${icon('refresh-cw')}</button></div><p class="muted" data-bot-checked></p><div class="bot-monitor-grid" data-bot-grid></div></section>`;
    renderBotMonitoring(data);
    content.querySelector('[data-refresh-bots]').onclick = () => action(null, async () => renderBotMonitoring(await request('admin/bots')));
  }
  let monitoringBusy = false;
  async function refreshMonitoring() {
    if (monitoringBusy || busy || !session?.user || document.hidden || !['/admin', '/admin/bots'].includes(route)) return;
    monitoringBusy = true;
    try { renderBotMonitoring(await request('admin/bots')); }
    catch (error) {
      if (session?.user) {
        renderBotMonitoring({ checkedAt: Date.now() + serverOffset, bots: [['protect', 'WarsNuto Protect'], ['game', 'WarsNuto Game'], ['support', 'WarsNuto Support']].map(([id, name]) => ({ id, name, status: 'unavailable' })) });
        fail(error);
      }
    } finally { monitoringBusy = false; }
  }
  async function profile() {
    const data = await request('me'), user = data.user;
    if (route.endsWith('/settings')) {
      content.innerHTML = `<section class="workspace-section"><h2>Informations Discord</h2><div class="setting-line"><div><strong>@${E(user.username || user.id)}</strong><p>ID : ${E(user.id)}</p></div><a class="button" href="/auth/discord/start?next=/profile/settings">${icon('refresh-cw')} Actualiser avec Discord</a></div></section>
        <section class="workspace-section"><h2>Préférences</h2><form id="preferences-form"><label class="checkbox-line"><input type="checkbox" name="reducedMotion" ${user.preferences.reducedMotion ? 'checked' : ''}>Réduire les animations de mon espace</label><button class="primary" type="submit">${icon('save')} Enregistrer</button></form></section>
        <section class="workspace-section"><div class="section-heading"><h2>Sessions actives</h2><button type="button" data-revoke-others>${icon('monitor-x')} Révoquer les autres</button></div>
        ${table(['Navigateur', 'Connexion', 'Dernière activité', 'Expiration', 'Session'], data.sessions.map(item => `<tr><td>${E(item.browser)}</td><td>${E(date(item.created_at))}</td><td>${E(date(item.last_seen_at))}</td><td>${E(date(item.expires_at))}</td><td>${item.current ? '<span class="status positive">Actuelle</span>' : 'Autre session'}</td></tr>`))}<p class="muted">Expiration après 30 minutes d’inactivité, ou 2 heures après la connexion.</p></section>`;
      content.querySelector('#preferences-form').onsubmit = event => action(event, async () => {
        const reducedMotion = event.currentTarget.elements.reducedMotion.checked;
        await write('me/preferences', { reducedMotion }, 'PATCH'); document.body.classList.toggle('reduced-motion', reducedMotion); notice('Préférences enregistrées.', 'success');
      });
      content.querySelector('[data-revoke-others]').onclick = () => action(null, async () => {
        const result = await confirmAction('Les autres navigateurs devront se reconnecter. Cette session reste active.', 'REVOQUER', false);
        if (!result) return; await write('me/sessions/revoke-others', { confirmation: result.confirmation }); await profile(); notice('Les autres sessions ont été révoquées.', 'success');
      }); return;
    }
    content.innerHTML = `<section class="profile-identity">${user.banner ? `<img class="profile-banner" src="${E(user.banner)}" alt="Bannière Discord">` : ''}<div class="profile-person"><img class="profile-avatar" src="${E(user.avatar)}" alt="Avatar Discord"><div><h2>${E(user.displayName)}</h2><p>@${E(user.username || user.id)}</p><span class="status positive">Compte actif</span></div><a class="button" href="/profile/settings">${icon('settings-2')} Mon compte</a></div></section>
      <section class="workspace-section"><h2>Ton compte</h2><dl class="profile-facts">${[['Identifiant Discord', user.id], ['Rôle sur le site', roles[user.role]], ['Compte Discord créé le', date(user.accountCreatedAt)], ['Première connexion au site', date(user.firstLoginAt)], ['Dernière connexion', date(user.lastLoginAt)]].map(([label, value]) => `<div><dt>${E(label)}</dt><dd>${E(value)}</dd></div>`).join('')}</dl></section>
      <section class="workspace-section"><h2>L’écosystème WarsNuto</h2><p class="muted">Les statistiques personnelles de Protect, Game et Support ne sont pas encore reliées à cet espace.</p><div class="inline-links"><a href="/game">Game ${icon('arrow-up-right')}</a><a href="/protect">Protect ${icon('arrow-up-right')}</a><a href="/support">Support ${icon('arrow-up-right')}</a></div></section>`;
  }
  async function users(staff = false) {
    const query = new URLSearchParams(location.search); query.set('page', listPage);
    const data = await request('admin/' + (staff ? 'staff' : 'users') + '?' + query);
    grants = staff ? data : null;
    content.innerHTML = `<section class="workspace-section"><form id="search-form" class="filter-bar"><label>Rechercher un compte<input name="q" maxlength="100" value="${E(query.get('q') || '')}" placeholder="Nom ou identifiant Discord"></label><button class="primary" type="submit">${icon('search')} Rechercher</button></form>
      ${table(['Membre', 'Rôle du site', 'Statut', 'Dernière connexion', ''], data.users.map(user => `<tr><td><div class="member-cell"><img src="${E(user.avatar)}" alt=""><span><strong>${E(user.displayName)}</strong><small>${E(user.id)}</small></span></div></td><td>${E(roles[user.role])}</td><td><span class="status ${user.status === 'active' ? 'positive' : 'negative'}">${user.status === 'active' ? 'Actif' : 'Suspendu'}</span></td><td>${E(date(user.lastLoginAt))}</td><td><button type="button" data-user="${E(user.id)}" title="Consulter ce compte" aria-label="Consulter ${E(user.displayName)}">${icon('arrow-right')}</button></td></tr>`))}${pager(data)}</section><section id="user-detail" class="workspace-section" hidden></section>
      ${staff ? `<section class="workspace-section"><h2>Autorisations des rôles</h2><p class="muted">L’attribution d’un rôle se fait depuis la fiche d’un compte. Les changements ci-dessous déconnectent les comptes du rôle concerné.</p><a class="button" href="/admin/users">${icon('user-plus')} Rechercher un membre à promouvoir</a>
      <div class="grants-grid">${['MODERATOR', 'ADMIN'].map(role => `<form data-grants="${role}"><h3>${E(roles[role])}</h3>${data.ceilings[role].map(permission => `<label class="checkbox-line"><input type="checkbox" name="permission" value="${E(permission)}" ${data.grants[role].includes(permission) ? 'checked' : ''}>${E(grantLabels[permission] || permission)}</label>`).join('')}<button type="submit">${icon('save')} Enregistrer</button></form>`).join('')}</div></section>` : ''}`;
    content.querySelector('#search-form').onsubmit = event => { event.preventDefault(); const params = new URLSearchParams({ q: event.currentTarget.elements.q.value }); history.replaceState(null, '', route + '?' + params); listPage = 1; action(null, () => users(staff)); };
    content.querySelectorAll('[data-page]').forEach(button => button.onclick = () => { listPage = Number(button.dataset.page); action(null, () => users(staff)); });
    content.querySelectorAll('[data-user]').forEach(button => button.onclick = () => action(null, () => detail(button.dataset.user)));
    content.querySelectorAll('[data-grants]').forEach(form => form.onsubmit = event => action(event, async () => {
      const role = form.dataset.grants, selected = Array.from(form.querySelectorAll('input:checked'), input => input.value);
      const result = await confirmAction('Modifier les autorisations du rôle ' + roles[role] + ' et révoquer ses sessions actives.', 'CONFIRMER ' + role);
      if (!result) return; await write('admin/permissions', { role, permissions: selected, version: data.versions[role], ...result }, 'PATCH'); await users(true); notice('Permissions enregistrées.', 'success');
    }));
  }
  async function detail(id) {
    const data = await request('admin/users/' + id), user = data.user; currentUser = user;
    const target = document.getElementById('user-detail'); target.hidden = false;
    const self = session.user.id === id, allowed = !self && (session.user.role === 'OWNER' || !['ADMIN', 'OWNER'].includes(user.role));
    const moderate = session.permissions.includes('users:moderate') && allowed;
    target.innerHTML = `<div class="section-heading"><h2>${E(user.displayName)}</h2><button type="button" data-close-detail title="Fermer la fiche" aria-label="Fermer la fiche">${icon('x')}</button></div>
      <dl class="profile-facts"><div><dt>ID Discord</dt><dd class="mono">${E(id)}</dd></div><div><dt>Rôle</dt><dd>${E(roles[user.role])}</dd></div><div><dt>Première connexion</dt><dd>${E(date(user.firstLoginAt))}</dd></div><div><dt>Autorisations</dt><dd>${data.permissions.map(permission => E(grantLabels[permission] || permission)).join(', ') || 'Compte personnel uniquement'}</dd></div></dl>
      ${moderate ? `<div class="form-actions"><button type="button" data-status class="${user.status === 'active' ? 'danger' : 'primary'}">${icon(user.status === 'active' ? 'user-round-x' : 'user-round-check')}${user.status === 'active' ? 'Suspendre' : 'Réactiver'}</button><button type="button" data-revoke>${icon('monitor-x')} Révoquer les sessions</button></div>` : ''}
      ${session.user.role === 'OWNER' && !self ? `<form id="role-form" class="filter-bar"><label>Rôle sur le site<select name="role">${Object.keys(roles).map(role => `<option value="${role}" ${user.role === role ? 'selected' : ''}>${E(roles[role])}</option>`).join('')}</select></label><button type="submit">${icon('shield-check')} Modifier le rôle</button></form>` : ''}
      <h3>Historique du compte</h3>${table(['Date', 'Action', 'Acteur', 'Compte concerné', 'Résultat'], logRows(data.history, true))}`;
    target.querySelector('[data-close-detail]').onclick = () => { target.hidden = true; };
    const mutation = async (actionName, payload, method) => {
      const confirmation = await confirmAction(actionName + ' pour ' + user.displayName + ' (' + id + ').', 'CONFIRMER ' + id);
      if (!confirmation) return;
      await write('admin/users/' + id + '/' + payload.action, { ...payload.values, version: user.version, ...confirmation }, method);
      await detail(id); notice('Modification enregistrée. Les sessions du compte ont été révoquées.', 'success');
    };
    target.querySelector('[data-status]')?.addEventListener('click', () => action(null, () => mutation(user.status === 'active' ? 'Suspendre le compte' : 'Réactiver le compte', { action: 'status', values: { status: user.status === 'active' ? 'suspended' : 'active' } }, 'PATCH')));
    target.querySelector('[data-revoke]')?.addEventListener('click', () => action(null, () => mutation('Révoquer les sessions', { action: 'revoke', values: {} }, 'POST')));
    target.querySelector('#role-form')?.addEventListener('submit', event => { event.preventDefault(); const role = event.currentTarget.elements.role.value; action(null, () => mutation('Attribuer le rôle ' + roles[role], { action: 'role', values: { role } }, 'PATCH')); });
    icons(); target.scrollIntoView({ block: 'nearest', behavior: session.user.preferences.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  async function logs() {
    const query = new URLSearchParams(location.search); query.set('page', listPage);
    const data = await request('admin/logs?' + query);
    content.innerHTML = `<section class="workspace-section"><form id="logs-form" class="filter-bar logs-filters"><label>Action<select name="action"><option value="">Toutes les actions</option>${data.actions.map(action => `<option value="${E(action)}" ${query.get('action') === action ? 'selected' : ''}>${E(events[action] || action)}</option>`).join('')}</select></label><label>Acteur · ID Discord<input name="actor" value="${E(query.get('actor') || '')}" inputmode="numeric" maxlength="20"></label><label>Compte concerné · ID Discord<input name="target" value="${E(query.get('target') || '')}" inputmode="numeric" maxlength="20"></label><button type="submit" class="primary">${icon('list-filter')} Filtrer</button></form>
      ${table(['Date', 'Action', 'Acteur', 'Compte concerné', 'Résultat'], logRows(data.logs, true))}${pager(data)}<p class="muted">Historique conservé 180 jours. Aucun token ni cookie n’est journalisé.</p></section>`;
    content.querySelector('#logs-form').onsubmit = event => { event.preventDefault(); const query = new URLSearchParams(new FormData(event.currentTarget)); history.replaceState(null, '', route + '?' + query); listPage = 1; action(null, logs); };
    content.querySelectorAll('[data-page]').forEach(button => button.onclick = () => { listPage = Number(button.dataset.page); action(null, logs); });
  }
  async function siteSettings() {
    settings = await request('admin/settings');
    content.innerHTML = `<section class="workspace-section"><form id="settings-form" class="settings-form"><label>Nom public<input name="name" required maxlength="80" value="${E(settings.name)}"></label><label>Description<textarea name="description" maxlength="300">${E(settings.description)}</textarea></label><label>Annonce publique<textarea name="announcement" maxlength="800">${E(settings.announcement)}</textarea></label>
      <label class="checkbox-line"><input name="maintenance" type="checkbox" ${settings.maintenance ? 'checked' : ''} ${session.user.role !== 'OWNER' ? 'disabled' : ''}>Maintenance des espaces membres</label>
      <p class="muted">La maintenance conserve le site public et l’accès des propriétaires. Aucun secret ne peut être modifié ici.</p><button type="submit" class="primary">${icon('save')} Publier les paramètres</button></form></section>`;
    content.querySelector('#settings-form').onsubmit = event => {
      event.preventDefault(); const form = event.currentTarget, payload = { name: form.elements.name.value, description: form.elements.description.value, announcement: form.elements.announcement.value, maintenance: form.elements.maintenance.checked, version: settings.version };
      action(null, async () => { const confirmation = await confirmAction('Publier les paramètres du site.', 'PUBLIER', false); if (!confirmation) return;
        await write('admin/settings', { ...payload, confirmation: confirmation.confirmation }, 'PATCH'); await siteSettings(); notice('Paramètres publiés.', 'success'); });
    };
  }
  async function action(event, callback) {
    event?.preventDefault(); if (busy) return;
    busy = true; const buttons = Array.from(content.querySelectorAll('button:not(:disabled)')); buttons.forEach(button => { button.disabled = true; });
    try { await callback(); icons(); } catch (error) { fail(error); } finally { busy = false; buttons.filter(button => button.isConnected).forEach(button => { button.disabled = false; }); }
  }
  async function boot() {
    try {
      session = await request('session'); serverOffset = session.serverNow - Date.now(); account();
      if (!session.user) { if (route) expire(); return; }
      document.body.classList.toggle('reduced-motion', session.user.preferences.reducedMotion);
      if (!route) return;
      if (route.startsWith('/profile')) await profile();
      else if (route === '/admin') await overview();
      else if (route === '/admin/bots') await botMonitoring();
      else if (route === '/admin/configuration') await window.wnBotConfiguration({ content, request, write, confirmAction, notice, action, icon, E, icons });
      else if (route === '/admin/users' || route === '/admin/staff') await users(route.endsWith('/staff'));
      else if (route === '/admin/logs') await logs();
      else if (route === '/admin/settings') await siteSettings();
      else if (route === '/admin/moderation') content.innerHTML = `<section class="empty-state">${icon('shield-check')}<h2>Connecteur de modération non activé</h2><p>Aucune sanction privée n’est exposée ici. Les actions de modération restent dans Discord.</p><a class="button" href="/protect">WarsNuto Protect</a></section>`;
      icons();
    } catch (error) {
      if (content) content.innerHTML = '<section class="empty-state"><h2>Chargement indisponible</h2><button type="button" data-retry>Réessayer</button></section>';
      content?.querySelector('[data-retry]')?.addEventListener('click', boot); fail(error);
      if (menu && !route) menu.innerHTML = '<a class="wn-login" href="/profile">Mon espace</a>';
    } finally { content?.setAttribute('aria-busy', 'false'); }
  }
  let lastActivity = 0;
  for (const eventName of ['pointerdown', 'keydown']) document.addEventListener(eventName, () => {
    if (!session?.user || Date.now() - lastActivity < 60000) return;
    lastActivity = Date.now(); write('activity', {}).then(() => { session.idleExpiresAt = Date.now() + serverOffset + 30 * 60000; }).catch(fail);
  }, { passive: true });
  setInterval(() => { if (session?.user && Date.now() + serverOffset >= Math.min(session.expiresAt, session.idleExpiresAt)) expire(); }, 5000);
  setInterval(refreshMonitoring, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshMonitoring(); });
  setInterval(async () => { if (!session?.user || document.hidden) return; try { const fresh = await request('session'); if (!fresh.user) expire(); else { session = fresh; account(); } } catch (error) { if (route) fail(error); } }, 60000);
  document.addEventListener('click', event => { const details = menu?.querySelector('details'); if (details?.open && !menu.contains(event.target)) details.open = false; });
  if (!route) request('public').then(data => {
    if (data.name) { const title = document.querySelector('.v2-brand strong'); if (title) title.textContent = data.name; }
    if (data.description) document.querySelector('meta[name="description"]')?.setAttribute('content', data.description);
    if (!data.announcement) return; const band = document.createElement('aside'); band.className = 'wn-announcement'; band.setAttribute('aria-label', 'Annonce WarsNuto'); band.textContent = data.announcement; document.querySelector('header')?.after(band);
  }).catch(() => {});
  boot();
})();
