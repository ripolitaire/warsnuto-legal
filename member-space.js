(() => {
  'use strict';
  const number = value => new Intl.NumberFormat('fr-FR').format(value || 0);
  const date = value => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  const guildIcon = (guild, E) => guild.icon && /^https:\/\/cdn\.discordapp\.com\//.test(guild.icon) ? `<img src="${E(guild.icon)}" alt="" loading="lazy">` : `<span class="guild-initial">${E(guild.name.slice(0, 2).toUpperCase())}</span>`;
  async function servers(ui, provided, configure = false) {
    const { content, request, E, icon, icons } = ui, data = provided || await request('servers');
    const guilds = data.guilds.filter(g => !configure || g.bots.some(b => b.canConfigure));
    content.innerHTML = `<section class="workspace-section"><div class="section-heading"><h2>${configure ? 'Choisir un serveur à administrer' : 'Tes serveurs WarsNuto'}</h2><button type="button" data-refresh-servers aria-label="Actualiser les serveurs" title="Actualiser les serveurs">${icon('refresh-cw')}</button></div><label class="server-search">Rechercher un serveur<input type="search" data-server-search placeholder="Nom du serveur" maxlength="100"></label>${data.unavailable.length ? `<p class="notice">Liaison indisponible : ${E(data.unavailable.join(', '))}. Certains serveurs peuvent manquer.</p>` : ''}
      <div class="server-grid">${guilds.map(guild => `<article class="server-item" data-server-name="${E(guild.name.toLocaleLowerCase('fr'))}"><div class="server-identity">${guildIcon(guild, E)}<div><h3>${E(guild.name)}</h3><span class="muted">${guild.memberCount ? number(guild.memberCount) + ' membres' : 'Serveur Discord'}</span></div></div><div class="bot-chips">${guild.bots.map(bot => `<span>${E(bot.name.replace('WarsNuto ', ''))}</span>`).join('')}</div>${guild.bots.filter(b => b.id === 'protect' && b.access?.canModerate).map(b => `<span class="protect-server-grade">${icon('badge-check')} ${E(b.access.label)} · Niveau ${b.access.level}</span>`).join('')}<div class="form-actions">${guild.bots.some(b => b.id === 'game') ? `<a class="button" href="/profile/game?guild=${E(guild.id)}">${icon('chart-no-axes-combined')} Ma progression</a>` : ''}${guild.bots.some(b => b.id === 'protect' && b.access?.canModerate) ? `<a class="button" href="/admin/moderation?guild=${E(guild.id)}">${icon('shield-check')} Modération</a>` : ''}${guild.bots.some(b => b.canConfigure) ? `<a class="button primary" href="/admin/configuration?guild=${E(guild.id)}">${icon('settings-2')} Configurer</a>` : guild.bots.some(b => b.access?.canModerate) ? '' : '<span class="muted">Membre</span>'}</div></article>`).join('')}</div><p data-server-empty ${guilds.length ? 'hidden' : ''}>${configure ? 'Aucun serveur administrable. Il faut le rôle administrateur du bot ou la permission Administrateur Discord.' : 'Aucun serveur commun avec les bots WarsNuto.'}</p></section>`;
    content.querySelector('[data-server-search]').oninput = event => {
      let visible = 0; const term = event.target.value.trim().toLocaleLowerCase('fr');
      content.querySelectorAll('[data-server-name]').forEach(node => { node.hidden = !node.dataset.serverName.includes(term); if (!node.hidden) visible++; });
      const empty = content.querySelector('[data-server-empty]'); empty.hidden = visible > 0;
      if (guilds.length) empty.textContent = 'Aucun serveur ne correspond à cette recherche.';
    };
    content.querySelector('[data-refresh-servers]').onclick = async event => {
      event.currentTarget.disabled = true;
      try { await servers(ui, null, configure); } catch (error) { ui.notice?.(error.message); } finally { if (event.target.isConnected) event.target.disabled = false; }
    };
    icons();
  }
  async function game(ui, compact = false) {
    const { content, request, E, icon, icons } = ui;
    const directory = await request('servers'), guilds = directory.guilds.filter(g => g.bots.some(b => b.id === 'game'));
    if (!guilds.length) { content.innerHTML = `<section class="empty-state"><h2>${directory.unavailable.includes('WarsNuto Game') ? 'Game est temporairement indisponible' : 'Aucun serveur Game commun'}</h2><a href="/servers" class="button">${icon('server')} Mes serveurs</a></section>`; icons(); return; }
    const query = new URLSearchParams(location.search);
    let guild = guilds.find(g => g.id === query.get('guild')) || guilds[0], mode = query.get('mode') === 'admin' ? 'admin' : 'normal', loading = false;
    content.innerHTML = `<section class="workspace-section"><div class="game-toolbar"><label>Serveur<select data-game-guild>${guilds.map(g => `<option value="${E(g.id)}" ${g.id === guild.id ? 'selected' : ''}>${E(g.name)}</option>`).join('')}</select></label><div class="game-modes" role="group" aria-label="Profil de jeu"><button type="button" data-game-mode="normal">${icon('user-round')} Normal</button><button type="button" data-game-mode="admin" hidden>${icon('shield')} Admin Mod</button></div><button type="button" data-game-refresh aria-label="Actualiser ma progression" title="Actualiser ma progression">${icon('refresh-cw')}</button>${compact ? '<a href="/profile/game" class="button">Toute ma progression</a>' : ''}</div><div data-game-data aria-live="polite"></div></section>`;
    const target = content.querySelector('[data-game-data]');
    const facts = entries => `<dl class="profile-facts">${entries.map(([label, value]) => `<div><dt>${E(label)}</dt><dd>${E(value ?? 'Aucun')}</dd></div>`).join('')}</dl>`;
    async function load() {
      if (loading) return; loading = true;
      const controls = [...content.querySelectorAll('button,select')]; controls.forEach(node => { node.disabled = true; });
      target.innerHTML = '<p class="loading-state">Lecture de ta progression…</p>';
      try {
        const data = await request('me/game/' + guild.id + '?mode=' + mode), p = data.player;
        if (!compact) history.replaceState(null, '', '/profile/game?' + new URLSearchParams({ guild: guild.id, mode }));
        content.querySelector('[data-game-mode="admin"]').hidden = !data.adminAvailable;
        content.querySelectorAll('[data-game-mode]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.gameMode === mode)));
        if (!p) { target.innerHTML = `<div class="empty-state"><h2>Pas encore de personnage ${mode === 'admin' ? 'Admin Mod' : 'normal'}</h2><p>Commence ton aventure dans Discord avec WarsNuto Game.</p></div>`; return; }
        const observations = data.history, first = observations[0];
        target.innerHTML = `${mode === 'admin' ? '<p class="notice">Profil Admin Mod : progression séparée du jeu normal.</p>' : ''}<div class="game-level"><div><span class="eyebrow">${E(p.className || 'Aventurier')}</span><h2>Niveau ${number(p.level)}</h2></div><div class="xp-track"><div><span>${number(p.xp)} / ${number(p.nextXp)} XP</span><span>Niveau ${number(p.level + 1)}</span></div><progress max="${p.nextXp}" value="${p.xp}" aria-label="Progression vers le niveau suivant"></progress></div></div>
          <div class="metric-grid game-metrics">${[['Berrys', p.berries, 'coins'], ['Prime', p.bounty, 'target'], ['Énergie', number(p.energy) + ' / ' + number(p.maxEnergy), 'zap'], ['XP totale', p.totalXp, 'sparkles']].map(([label, value, glyph]) => `<article class="metric">${icon(glyph)}<span>${label}</span><strong>${ui.preferences.hideBalances && ['Berrys', 'Prime'].includes(label) ? 'Masqué' : typeof value === 'number' ? number(value) : E(value)}</strong></article>`).join('')}</div>
          <div class="game-details"><section><h3>Personnage et équipement</h3>${facts([['Classe', p.className], ['XP de classe', number(p.classXp)], ['Fruit', p.fruit?.name], ['Maîtrise du fruit', p.fruit ? number(p.fruit.mastery) : null], ['Éveil du fruit', p.fruit ? 'Palier ' + number(p.fruit.awakened) : null], ['Arme', p.weapon], ['Accessoire', p.accessory], ['Équipage', p.crew ? p.crew.name + ' · Niveau ' + number(p.crew.level) : null], ['Points de saison', number(p.seasonPoints)]])}</section><section><h3>Évolution observée</h3>${observations.length > 1 ? `<p class="progress-gain">${number(p.totalXp - first.totalXp)} XP · ${number(p.level - first.level)} niveau(x)</p><div class="table-scroll"><table><thead><tr><th>Date</th><th>Niveau</th><th>XP totale</th></tr></thead><tbody>${observations.slice().reverse().slice(0, 8).map(point => `<tr><td>${E(date(point.sampledAt))}</td><td>${number(point.level)}</td><td>${number(point.totalXp)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Première observation enregistrée. Ton évolution apparaîtra lors de tes prochaines visites.</p>'}<p class="muted">Suivi depuis le ${E(date(first?.sampledAt || data.sampledAt))}.</p></section></div>
          ${compact ? '' : `<section class="game-inventory"><h3>Inventaire · ${number(p.inventory.length)} ${p.inventory.length === 1 ? 'objet différent' : 'objets différents'}</h3>${p.inventory.length ? `<div class="inventory-grid">${p.inventory.map(item => `<div><span>${E(item.name)}</span><strong>× ${number(item.quantity)}</strong></div>`).join('')}</div>` : '<p class="muted">Ton inventaire est vide.</p>'}</section>`}<p class="muted game-updated">Actualisé le ${E(date(data.sampledAt))}</p>`;
      } catch (error) {
        target.innerHTML = `<div class="notice">${E(error.message)}</div>`;
        if (error.status === 403 && mode === 'admin') { mode = 'normal'; content.querySelector('[data-game-mode="admin"]').hidden = true; }
      } finally { loading = false; controls.filter(node => node.isConnected).forEach(node => { node.disabled = false; }); icons(); }
    }
    content.querySelector('[data-game-guild]').onchange = event => { guild = guilds.find(g => g.id === event.target.value); mode = 'normal'; void load(); };
    content.querySelectorAll('[data-game-mode]').forEach(node => node.onclick = () => { mode = node.dataset.gameMode; void load(); });
    content.querySelector('[data-game-refresh]').onclick = () => void load();
    await load();
    const timer = setInterval(() => {
      if (!target.isConnected) { clearInterval(timer); return; }
      if (!document.hidden && ui.preferences.autoRefresh !== false) void load();
    }, 60000);
  }
  async function protectProfile(ui, compact = false) {
    const { content, request, E, icon, icons } = ui, directory = await request('servers');
    const guilds = directory.guilds.filter(g => g.bots.some(b => b.id === 'protect'));
    if (!guilds.length) {
      content.innerHTML = `<section class="workspace-section"><h2>XP Protect</h2><p class="muted">${directory.unavailable.includes('WarsNuto Protect') ? 'Protect est temporairement indisponible.' : 'Aucun serveur commun avec Protect.'}</p></section>`; return;
    }
    let guild = guilds.find(g => g.id === new URLSearchParams(location.search).get('guild')) || guilds[0], loading = false;
    content.innerHTML = `<section class="workspace-section protect-xp"><div class="section-heading"><div class="progression-brand"><img src="/assets/protect-logo.png" alt=""><div><h2>XP Protect</h2><span class="muted">Progression communautaire</span></div></div>${compact ? `<a href="/profile/protect" class="button">${icon('sparkles')} Toute ma progression</a>` : ''}</div><div class="game-toolbar"><label>Serveur<select data-protect-xp-guild>${guilds.map(g => `<option value="${E(g.id)}" ${g.id === guild.id ? 'selected' : ''}>${E(g.name)}</option>`).join('')}</select></label><button type="button" data-protect-xp-refresh title="Actualiser mon XP Protect" aria-label="Actualiser mon XP Protect">${icon('refresh-cw')}</button></div><div data-protect-xp-data aria-live="polite"></div></section>`;
    const target = content.querySelector('[data-protect-xp-data]'), select = content.querySelector('[data-protect-xp-guild]'), refresh = content.querySelector('[data-protect-xp-refresh]');
    async function load() {
      if (loading) return; loading = true; select.disabled = true; refresh.disabled = true;
      target.innerHTML = '<p class="loading-state">Lecture de ton XP Protect…</p>';
      try {
        const data = await request('me/protect/' + guild.id), p = data.progression;
        if (!compact) history.replaceState(null, '', '/profile/protect?' + new URLSearchParams({ guild: guild.id }));
        if (!p) { target.innerHTML = '<div class="empty-state"><h3>Aucune XP enregistrée sur ce serveur</h3></div>'; return; }
        const special = p.progressLocked;
        target.innerHTML = `<div class="game-level"><div><span class="eyebrow">Niveaux Protect</span><h2>Niveau ${E(p.levelLabel || number(p.level))}</h2></div>${special ? `<span class="status warning">${E(p.badgeLabel || 'Progression spéciale')}</span>` : `<div class="xp-track"><div><span>${p.reachedMax ? 'Niveau maximum atteint' : number(p.xp) + ' / ' + number(p.nextXp) + ' XP'}</span><span>${p.reachedMax ? '' : 'Niveau ' + number(p.level + 1)}</span></div><progress value="${p.reachedMax ? p.nextXp : p.xp}" max="${p.nextXp}" aria-label="Progression XP Protect"></progress></div>`}</div><dl class="profile-facts protect-xp-facts"><div><dt>XP totale</dt><dd>${number(p.totalXp)}</dd></div><div><dt>XP par message</dt><dd>${data.enabled ? 'Activée' : 'Désactivée'}</dd></div><div><dt>XP vocale</dt><dd>${data.voiceEnabled ? 'Activée' : 'Désactivée'}</dd></div>${compact ? '' : `<div><dt>Dernière XP par message</dt><dd>${p.lastMessageXpAt ? E(date(p.lastMessageXpAt)) : 'Aucune'}</dd></div><div><dt>Dernière XP vocale</dt><dd>${p.lastVoiceXpAt ? E(date(p.lastVoiceXpAt)) : 'Aucune'}</dd></div>`}</dl><p class="muted game-updated">Actualisé le ${E(date(data.sampledAt))}</p>`;
      } catch (error) { target.innerHTML = `<div class="notice">${E(error.message)}</div>`; }
      finally { loading = false; select.disabled = false; refresh.disabled = false; icons(); }
    }
    select.onchange = event => { guild = guilds.find(g => g.id === event.target.value); void load(); }; refresh.onclick = () => void load();
    await load();
    const timer = setInterval(() => { if (!target.isConnected) return clearInterval(timer); if (!document.hidden && ui.preferences.autoRefresh !== false) void load(); }, 60000);
  }
  async function moderation(ui) {
    const { content, request, E, icon, icons } = ui, directory = await request('servers');
    const guilds = directory.guilds.filter(g => g.bots.some(b => b.id === 'protect' && (b.access?.canModerate || b.canConfigure)));
    if (!guilds.length) {
      content.innerHTML = `<section class="moderation-empty"><span class="section-symbol">${icon('shield-check')}</span><h2>${directory.unavailable.includes('WarsNuto Protect') ? 'Protect est momentanément indisponible' : 'Aucun accès de modération Protect'}</h2><a href="/servers" class="button">${icon('server')} Mes serveurs</a></section>`; icons(); return;
    }
    let selected = guilds.find(g => g.id === new URLSearchParams(location.search).get('guild')) || guilds[0];
    const modules = { access: ['users-round', 'Équipe', 'Rôles et autorisations'], validation: ['badge-check', 'Équipe', 'Validation et archivage'], automod: ['shield-check', 'Sécurité', 'Filtres et seuils de détection'], 'anti-alt': ['shield-alert', 'Sécurité', 'Quarantaine et alertes'], logs: ['scroll-text', 'Journaux', 'Salons et événements'], 'xp-logs': ['scroll-text', 'Journaux', 'Historique de progression'] };
    content.innerHTML = `<div class="moderation-toolbar"><div class="moderation-brand"><img src="/assets/protect-logo.png" alt=""><div><strong>WarsNuto Protect</strong><span class="muted">Modération du serveur</span></div></div><label>Serveur<select data-moderation-guild>${guilds.map(g => `<option value="${E(g.id)}" ${g.id === selected.id ? 'selected' : ''}>${E(g.name)}</option>`).join('')}</select></label><button type="button" data-moderation-refresh title="Actualiser Protect" aria-label="Actualiser Protect">${icon('refresh-cw')}</button></div><div data-moderation-content aria-live="polite"></div>`;
    const target = content.querySelector('[data-moderation-content]'), select = content.querySelector('[data-moderation-guild]'), refresh = content.querySelector('[data-moderation-refresh]');
    async function load() {
      select.disabled = true; refresh.disabled = true; target.innerHTML = '<p class="loading-state">Chargement des réglages Protect…</p>';
      try {
        const scoped = await request('moderation/' + selected.id), access = scoped.access;
        const permissions = `<section class="protect-permissions"><div class="protect-grade"><span class="section-symbol">${icon('badge-check')}</span><div><span class="muted">Ton grade sur ${E(selected.name)}</span><h2>${E(access.label)}</h2></div><span class="status positive">Niveau ${access.level} / 4</span></div><div class="protect-access-lines"><span>${icon('check')} Espace de modération</span><span>${icon(access.canConfigure ? 'check' : 'shield')} ${access.canConfigure ? 'Configuration autorisée' : 'Configuration réservée aux administrateurs'}</span></div><details class="protect-command-list"><summary>Commandes Discord autorisées par ton grade (${access.commands.length})</summary><div>${access.commands.map(command => `<code>/${E(command)}</code>`).join('')}</div></details></section>`;
        const historyNote = `<aside class="moderation-history-note">${icon('info')}<div><strong>Historique des sanctions</strong><p>Consultation et actions disponibles dans Discord. Les dossiers privés ne sont pas reliés à cette page.</p></div></aside>`;
        if (!access.canConfigure) {
          history.replaceState(null, '', '/admin/moderation?' + new URLSearchParams({ guild: selected.id }));
          target.innerHTML = permissions + historyNote; return;
        }
        const meta = await request('admin/bot-config/protect/' + selected.id), available = meta.sections.filter(s => modules[s.id]);
        history.replaceState(null, '', '/admin/moderation?' + new URLSearchParams({ guild: selected.id }));
        const sections = available.length ? available : meta.sections;
        const base = '/admin/configuration?' + new URLSearchParams({ bot: 'protect', guild: selected.id });
        target.innerHTML = `<div class="moderation-summary"><div class="server-identity">${guildIcon(selected, E)}<div><h2>${E(selected.name)}</h2><span class="muted">${selected.memberCount ? number(selected.memberCount) + ' membres' : 'Serveur Discord'}</span></div></div><div class="moderation-summary-meta"><strong>${number(sections.length)}</strong><span>rubriques accessibles</span></div><a class="button primary" href="${E(base)}">${icon('settings-2')} Tous les réglages</a></div>
          ${permissions}<section class="moderation-modules" aria-label="Réglages de modération">${['Sécurité', 'Équipe', 'Journaux', 'Configuration'].map(group => {
            const entries = sections.filter(s => (modules[s.id]?.[1] || 'Configuration') === group);
            if (!entries.length) return '';
            return `<div class="moderation-module-group"><h2>${group}</h2>${entries.map(s => `<a class="moderation-module" href="${E(base + '&section=' + s.id)}"><span class="section-symbol">${icon(modules[s.id]?.[0] || 'settings-2')}</span><span class="moderation-module-name"><strong>${E(s.label)}</strong><small>${E(modules[s.id]?.[2] || s.label)}</small></span><span class="module-field-count">${s.fields.length} paramètres</span>${icon('chevron-right')}</a>`).join('')}</div>`;
          }).join('')}</section>${historyNote}`;
      } catch (error) {
        target.innerHTML = `<section class="moderation-empty"><span class="section-symbol">${icon('shield-alert')}</span><h2>Réglages Protect indisponibles</h2><p class="muted">${E(error.message)}</p></section>`;
      } finally { select.disabled = false; refresh.disabled = false; icons(); }
    }
    select.onchange = event => { selected = guilds.find(g => g.id === event.target.value); void load(); }; refresh.onclick = () => void load(); await load();
  }
  window.wnMemberSpace = { servers, game, moderation, protectProfile };
})();
