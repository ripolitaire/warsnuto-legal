(() => {
  'use strict';
  const states = { creating: 'Création en cours', open: 'Ouverte', closed: 'Fermée', review: 'À vérifier', placing: 'Placement en cours', active: 'En prison', releasing: 'Libération en cours', released: 'Libéré', banned: 'Banni', left: 'A quitté le serveur', pending: 'En attente', running: 'En cours', applied: 'Terminée', sent: 'Envoyée', sending: 'Envoi en cours', cancelled: 'Annulée', failed: 'Refusée' };
  const actionLabels = { create: 'Créer une prison', add: 'Ajouter les membres', repair: 'Réparer le placement', release: 'Libérer ce membre', close: 'Libérer tous et fermer', derank: 'Dérank', exclude: 'Exclure les rôles', mute: 'Mute', ban: 'Bannir', test: 'Envoyer le test sans ping', 'reconcile-ban': 'Constater un bannissement', 'resolve-sanction': 'Classer la vérification sans sanction prouvée', reconcile: 'Réconcilier la notification', preview: 'Prévisualiser' };
  async function mount(ui, root, guild, module) {
    const { request, write, confirmAction, action, notice, E, icon, icons } = ui;
    const path = 'admin/features/' + guild + '/' + module; let selected, selectedUser, poll, operation = 0, view = 0, detail = 0;
    const command = async (name, input) => {
      const confirmation = await confirmAction(actionLabels[name] + ' ?', 'CONFIRMER'); if (!confirmation) return;
      const current = ++operation, selectedAtSubmit = selected?.id; clearInterval(poll);
      const result = await write(path, { action: name, input: { ...input, reason: confirmation.reason }, confirmation: confirmation.confirmation, operationId: crypto.randomUUID() });
      if (!root.isConnected || current !== operation) return;
      if (result.preview) { renderPreview(result.preview); return; }
      const target = root.querySelector('[data-feature-result]');
      target.innerHTML = `<p role="status"><strong>${E(states[result.job.status] || result.job.status)}</strong> · <span class="mono">${E(result.job.id)}</span></p>`;
      let attempts = 0, checking = false, ownPoll;
      const check = async () => {
        if (!root.isConnected || current !== operation) { clearInterval(ownPoll); return; }
        if (attempts >= 150) { clearInterval(ownPoll); target.textContent = 'Le traitement continue dans Protect. Consulte les opérations récentes pour son résultat.'; return; }
        if (document.hidden || checking) return;
        checking = true; attempts++;
        try {
          const data = await request(path + '/job/' + result.job.id); if (!root.isConnected || current !== operation) { clearInterval(ownPoll); return; }
          target.textContent = (states[data.job.status] || data.job.status) + (data.job.result?.error ? ' : ' + data.job.result.error : '');
          if (!['pending', 'running'].includes(data.job.status)) { clearInterval(ownPoll); if (data.job.status === 'applied') { if (data.job.result?.prisonId && selected?.id === selectedAtSubmit) selected = { id: data.job.result.prisonId }; notice(data.job.result?.warning || 'Opération terminée dans Protect.', 'success'); await load(current); } }
        } catch (error) { clearInterval(ownPoll); if (root.isConnected && current === operation && error.status !== 401) notice(error.message); } finally { checking = false; }
      };
      ownPoll = setInterval(() => void check(), 2000); poll = ownPoll; await check();
    };
    const ids = value => [...new Set(value.split(/[\s,]+/).filter(Boolean))];
    function renderPreview(payload) {
      const target = root.querySelector('[data-feature-preview]'), titles = { video: 'Nouvelle vidéo WarsNuto !', short: 'Nouveau Short WarsNuto !', live: 'WarsNuto est en live !', scheduled: 'Diffusion WarsNuto programmée' };
      const url = /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(payload.url || '') ? payload.url : null;
      target.innerHTML = `<article class="feature-preview"><h3>${E(titles[payload.kind] || 'Aperçu YouTube')}</h3><p><strong>${E(payload.title || '')}</strong></p><p>${E(payload.channel || 'WarsNuto')}${payload.date && Number.isFinite(Date.parse(payload.date)) ? ' · ' + E(new Date(payload.date).toLocaleString('fr-FR')) : ''}</p>${/^https:\/\/i\.ytimg\.com\//.test(payload.thumbnail || '') ? `<img src="${E(payload.thumbnail)}" alt="Miniature YouTube">` : ''}${url ? `<a href="${E(url)}" target="_blank" rel="noopener noreferrer">Ouvrir sur YouTube</a>` : ''}</article>`;
    }
    async function showPrison(id) {
      const currentDetail = ++detail, currentView = view;
      const { prison } = await request(path + '/' + id); if (!root.isConnected || currentDetail !== detail || currentView !== view) return;
      selected = prison;
      root.querySelector('[data-prison-detail]').innerHTML = `<div class="section-heading"><h3>Prison #${prison.id}</h3><span class="status">${E(states[prison.status] || prison.status)}</span></div><p>${E(prison.reason)}</p><dl class="profile-facts"><div><dt>Responsable</dt><dd>${E(prison.creator_id)}</dd></div><div><dt>Création</dt><dd>${E(new Date(prison.created_at).toLocaleString('fr-FR'))}</dd></div></dl>
        <label>Membre concerné<select data-feature-member><option value="">Choisir un membre</option>${prison.members.map(m => `<option value="${E(m.user_id)}">${E(m.snapshot.displayName || m.user_id)} · ${E(states[m.status] || m.status)}</option>`).join('')}</select></label><div data-feature-member-info></div>
        <form data-prison-decision class="feature-decision"><label>Décision<select name="decision"><option value="release">Libérer</option><option value="derank">Dérank des rôles staff configurés</option><option value="mute">Mute</option><option value="ban">Bannir</option><option value="reconcile-ban">Constater un bannissement déjà appliqué</option><option value="resolve-sanction">Classer la vérification sans sanction prouvée</option><option value="exclude">Exclure des rôles de la restauration</option></select></label><label data-mute-duration hidden>Durée du mute<input name="duration" placeholder="30m, 1h, 1d" maxlength="12"></label><label data-mute-proof hidden>Preuve Discord (facultatif)<input name="proof" type="url" maxlength="140"></label><label data-exclude-roles hidden>IDs des rôles à ne pas restaurer<textarea name="roles" maxlength="600"></textarea></label><button type="submit">${icon('shield-check')} Confirmer la décision</button></form>
        <form data-prison-add class="feature-inline"><label>Membres à ajouter · IDs Discord<textarea name="members" required maxlength="240" rows="2"></textarea></label><button type="submit">${icon('user-plus')} Ajouter</button></form><div class="form-actions"><button type="button" data-prison-repair>${icon('refresh-cw')} Réparer</button><button type="button" data-prison-close class="danger">${icon('lock-keyhole')} Libérer tous et fermer</button></div>
        <h3>Historique</h3><ol class="feature-history">${prison.history.map(h => `<li><strong>${E(actionLabels[h.action] || h.action)}</strong> · ${E(h.actor_id)}${h.user_id ? ' · ' + E(h.user_id) : ''}<p>${E(h.details.reason || '')}</p></li>`).join('') || '<li>Aucune action.</li>'}</ol>`;
      const memberSelect = root.querySelector('[data-feature-member]');
      memberSelect.onchange = () => {
        selectedUser = memberSelect.value;
        const member = selected.members.find(m => m.user_id === selectedUser), info = root.querySelector('[data-feature-member-info]');
        root.querySelector('[data-prison-decision] button').disabled = !member || ['released', 'banned'].includes(member.status);
        info.innerHTML = member ? `<dl class="profile-facts"><div><dt>Rôles sauvegardés</dt><dd>${member.snapshot.roles.map(r => E(r.name || r.id)).join(', ') || 'Aucun'}</dd></div><div><dt>Non restaurés</dt><dd>${member.excluded_roles.map(E).join(', ') || 'Aucun'}</dd></div></dl>` : '';
      };
      const form = root.querySelector('[data-prison-decision]');
      form.elements.decision.onchange = () => { form.querySelector('[data-mute-duration]').hidden = form.elements.decision.value !== 'mute'; form.querySelector('[data-mute-proof]').hidden = form.elements.decision.value !== 'mute'; form.querySelector('[data-exclude-roles]').hidden = form.elements.decision.value !== 'exclude'; };
      form.onsubmit = event => action(event, async () => {
        if (!memberSelect.value) { notice('Choisis le membre concerné.'); return; }
        const name = form.elements.decision.value;
        await command(name, { prisonId: prison.id, userId: memberSelect.value, ...(name === 'mute' ? { duration: form.elements.duration.value, proof: form.elements.proof.value.trim() } : {}), ...(name === 'exclude' ? { roleIds: ids(form.elements.roles.value) } : {}) });
      });
      const add = root.querySelector('[data-prison-add]'); add.onsubmit = event => action(event, () => command('add', { prisonId: prison.id, userIds: ids(add.elements.members.value) }));
      root.querySelector('[data-prison-repair]').onclick = () => action(null, () => command('repair', { prisonId: prison.id }));
      root.querySelector('[data-prison-close]').onclick = () => action(null, () => command('close', { prisonId: prison.id }));
      if (prison.members.some(m => m.user_id === selectedUser)) memberSelect.value = selectedUser;
      memberSelect.onchange();
      icons();
    }
    async function load(expectedOperation = operation) {
      const currentView = ++view; detail++;
      const data = await request(path); if (!root.isConnected || currentView !== view || expectedOperation !== operation) return;
      if (module === 'prison') {
        root.innerHTML = `<section class="workspace-section feature-workspace"><div class="section-heading"><h2>Gestion des prisons</h2><button type="button" data-feature-refresh aria-label="Actualiser les prisons" title="Actualiser les prisons">${icon('refresh-cw')}</button></div>
          <form data-prison-create class="feature-inline"><label>Membres de la nouvelle prison · IDs Discord<textarea name="members" rows="2" required maxlength="240"></textarea></label><button type="submit" class="primary">${icon('lock-keyhole')} Créer une prison</button></form>
          <div class="feature-prisons">${data.prisons.map(p => `<button type="button" data-prison="${p.id}" class="feature-prison-item"><strong>Prison #${p.id}</strong><span>${E(states[p.status] || p.status)} · ${p.members.filter(m => !['released', 'banned'].includes(m.status)).length} membre(s)</span><span>${E(p.reason)}</span></button>`).join('') || '<p>Aucune prison active.</p>'}</div><div data-prison-detail></div><div data-feature-result role="status"></div></section>`;
        const create = root.querySelector('[data-prison-create]'); create.onsubmit = event => action(event, () => command('create', { userIds: ids(create.elements.members.value) }));
        root.querySelectorAll('[data-prison]').forEach(button => { button.onclick = () => action(null, () => showPrison(Number(button.dataset.prison))); });
      } else {
        root.innerHTML = `<section class="workspace-section feature-workspace"><div class="section-heading"><h2>Surveillance YouTube</h2><button type="button" data-feature-refresh title="Actualiser YouTube" aria-label="Actualiser YouTube">${icon('refresh-cw')}</button></div>
          <dl class="profile-facts"><div><dt>Chaîne officielle</dt><dd><a href="https://www.youtube.com/@WarsNut0" target="_blank" rel="noopener noreferrer">@WarsNut0</a></dd></div><div><dt>Identifiant résolu</dt><dd>${E(data.channelId || 'Pas encore vérifié')}</dd></div><div><dt>Clé API du bot</dt><dd>${data.apiConfigured ? 'Présente' : 'Manquante'}</dd></div><div><dt>Dernier succès</dt><dd>${data.lastSuccess ? E(new Date(data.lastSuccess).toLocaleString('fr-FR')) : 'Aucun'}</dd></div></dl>${data.lastError ? `<p class="notice">${E(data.lastError)}</p>` : ''}
          <form data-youtube-preview class="feature-inline"><label>Publication<select name="kind"><option value="video">Vidéo</option><option value="short">Short</option><option value="live">Live en cours</option><option value="scheduled">Diffusion programmée</option></select></label><button type="submit">${icon('eye')} Aperçu privé</button><button type="button" data-youtube-test>${icon('send')} Envoyer un test sans ping</button></form><div data-feature-preview></div>
          <h3>Dernières publications détectées</h3><ul class="feature-history">${data.publications.map(p => `<li><a href="https://www.youtube.com/watch?v=${E(p.video_id)}" target="_blank" rel="noopener noreferrer">${E(p.title || p.video_id)}</a> · ${E(p.kind)}</li>`).join('') || '<li>Aucune publication détectée.</li>'}</ul>
          <h3>Notifications</h3><p>${(data.counts || []).map(c => E(states[c.status] || c.status) + ' : ' + E(c.count)).join(' · ')}</p><ul class="feature-history">${data.deliveries.map(d => `<li><strong>${E(d.kind)} · ${E(states[d.status] || d.status)}</strong><span class="mono">${E(d.id)}</span>${d.last_error ? `<p>${E(d.last_error)}</p>` : ''}</li>`).join('') || '<li>Aucune notification.</li>'}</ul>
          <form data-youtube-reconcile class="feature-inline"><label>Référence de notification<input name="delivery" pattern="[a-f0-9]{24}" required maxlength="24"></label><label>ID du message Discord déjà envoyé<input name="message" pattern="[0-9]{17,20}" required maxlength="20"></label><button type="submit">${icon('check-check')} Réconcilier</button></form><div data-feature-result role="status"></div></section>`;
        const form = root.querySelector('[data-youtube-preview]'); form.onsubmit = event => action(event, () => command('preview', { kind: form.elements.kind.value }));
        root.querySelector('[data-youtube-test]').onclick = () => action(null, () => command('test', { kind: form.elements.kind.value }));
        const reconcile = root.querySelector('[data-youtube-reconcile]'); reconcile.onsubmit = event => action(event, () => command('reconcile', { deliveryId: reconcile.elements.delivery.value, messageId: reconcile.elements.message.value }));
      }
      if (module === 'youtube' && data.errors?.length) {
        const history = document.createElement('section'); history.className = 'workspace-section';
        history.innerHTML = `<h3>Historique des erreurs</h3><ul class="feature-history">${data.errors.map(entry => `<li><strong>${E(entry.kind)}</strong> · ${E(new Date(entry.created_at).toLocaleString('fr-FR'))}<p>${E(entry.error)}</p></li>`).join('')}</ul>`;
        root.append(history);
      }
      const recent = document.createElement('section'); recent.className = 'workspace-section';
      recent.innerHTML = `<h3>Opérations récentes</h3><ul class="feature-history">${(data.jobs || []).map(job => `<li><strong>${E(actionLabels[job.action] || job.action)}</strong><span>${E(states[job.status] || job.status)}</span><button type="button" data-feature-job="${E(job.id)}" title="Consulter le résultat" aria-label="Consulter le résultat ${E(job.id)}">${icon('eye')}</button></li>`).join('') || '<li>Aucune opération.</li>'}</ul>`;
      root.append(recent);
      recent.querySelectorAll('[data-feature-job]').forEach(button => { button.onclick = () => action(null, async () => { const { job } = await request(path + '/job/' + button.dataset.featureJob); if (root.isConnected) root.querySelector('[data-feature-result]').textContent = (states[job.status] || job.status) + (job.result?.error ? ' : ' + job.result.error : job.result?.warning ? ' : ' + job.result.warning : '') + (job.payload?.reason ? ' · ' + job.payload.reason : ''); }); });
      root.querySelector('[data-feature-refresh]').onclick = () => action(null, load);
      if (module === 'prison' && selected?.id && data.prisons.some(p => p.id === selected.id)) await showPrison(selected.id);
      icons();
    }
    root.innerHTML = '<p class="loading-state">Chargement du module…</p>';
    try { await load(); } catch (error) { if (root.isConnected && error.status !== 401) root.innerHTML = `<p class="notice">${E(error.message)}</p>`; }
  }
  async function page(ui) {
    const servers = await ui.request('servers'), eligible = servers.guilds.filter(g => g.bots.some(b => b.id === 'protect' && b.access?.canManagePrisons));
    if (!eligible.length) { ui.content.innerHTML = '<p class="notice">Aucun accès aux prisons disponible sur tes serveurs.</p>'; return; }
    const requested = new URLSearchParams(location.search).get('guild'), guild = eligible.find(g => g.id === requested) || eligible[0];
    ui.content.innerHTML = `<label>Serveur<select data-prison-guild>${eligible.map(g => `<option value="${ui.E(g.id)}" ${g.id === guild.id ? 'selected' : ''}>${ui.E(g.name)}</option>`).join('')}</select></label><div data-feature-tools></div>`;
    ui.content.querySelector('[data-prison-guild]').onchange = event => { location.assign('/admin/prisons?guild=' + encodeURIComponent(event.currentTarget.value)); };
    await mount(ui, ui.content.querySelector('[data-feature-tools]'), guild.id, 'prison');
  }
  window.wnFeatureDashboard = { mount, page };
})();
