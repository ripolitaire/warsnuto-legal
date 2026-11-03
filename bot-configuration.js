(() => {
  'use strict';
  let dirty = false;
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.wnBotConfiguration = async ({ content, request, write, confirmAction, notice, action, icon, E, icons }) => {
    const catalog = await request('admin/bot-config'), query = new URLSearchParams(location.search);
    const model = { bot: catalog.bots.some(b => b.id === query.get('bot')) ? query.get('bot') : catalog.bots[0].id, guilds: [], guild: '', section: '', meta: null, values: {}, revision: '' };
    let inFlight = false;
    const base = () => 'admin/bot-config/' + model.bot;
    const path = () => base() + '/' + model.guild + '/' + model.section;
    const selectedSection = () => model.meta.sections.find(s => s.id === model.section);
    const run = callback => action(null, async () => {
      if (inFlight) return; inFlight = true;
      content.querySelectorAll('input,select,textarea').forEach(node => { node.disabled = true; });
      try { await callback(); } finally { inFlight = false; content.querySelectorAll('input,select,textarea').forEach(node => { node.disabled = false; }); }
    });
    const discard = async () => !dirty || Boolean(await confirmAction('Abandonner les modifications non enregistrées ?', 'ABANDONNER', false));
    function input(f, value) {
      const required = f.required ? ' required' : '';
      const common = ' data-config-input' + required;
      if (f.type === 'boolean') return `<label class="checkbox-line"><input type="checkbox" data-config-input ${value ? 'checked' : ''}>${E(f.label)}</label>`;
      if (['role', 'roles', 'channel', 'channels', 'select'].includes(f.type)) {
        const multiple = ['roles', 'channels'].includes(f.type), chosen = multiple ? value || [] : value == null ? [] : [value];
        let options = f.type === 'select' ? f.choices : (f.type.startsWith('role') ? model.meta.roles : model.meta.channels.filter(c => f.channelTypes.includes(c.type))).map(item => ({ value: item.id, label: item.name }));
        options = [...chosen.map(value => options.find(option => String(option.value) === String(value)) || { value, label: 'Introuvable : ' + value }), ...options.filter(option => !chosen.some(value => String(value) === String(option.value)))];
        return `<label>${E(f.label)}<select${common}${multiple ? ' multiple size="5"' : ''}>${!multiple && f.type !== 'select' ? '<option value="">Aucun</option>' : ''}${options.map(option => `<option value="${E(option.value)}" ${chosen.some(value => String(value) === String(option.value)) ? 'selected' : ''}>${E(option.label)}</option>`).join('')}</select></label>`;
      }
      if (f.type === 'list') return `<fieldset class="config-repeater"><legend>${E(f.label)}</legend><div data-config-rows>${(value || []).map(row => rowHTML(f, row)).join('')}</div><button type="button" data-add-row="${E(f.key)}">${icon('plus')} Ajouter</button></fieldset>`;
      if (['ids', 'lines'].includes(f.type) || f.multiline) return `<label>${E(f.label)}<textarea${common} rows="4" maxlength="${f.type === 'ids' ? 2200 : f.type === 'lines' ? 11000 : f.maxLength}">${E(Array.isArray(value) ? value.join('\n') : value)}</textarea></label>`;
      if (f.type === 'number') return `<label>${E(f.label)}<input${common} type="number" min="${f.min}" max="${f.max}" step="${f.step === 1 ? 1 : 'any'}" value="${E(value)}" required></label>`;
      let display = value, type = f.type === 'color' ? 'color' : f.type === 'url' ? 'url' : 'text';
      if (f.type === 'datetime') { type = 'datetime-local'; if (value) { const d = new Date(value); display = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); } }
      return `<label>${E(f.label)}<input${common} type="${type}" value="${E(display)}" ${f.maxLength ? 'maxlength="' + f.maxLength + '"' : ''} ${f.pattern ? 'pattern="' + E(f.pattern) + '"' : ''}></label>`;
    }
    function fieldsHTML(fields, values) {
      return fields.map(f => `<div class="config-field ${f.type === 'list' || f.multiline || ['lines', 'ids'].includes(f.type) ? 'config-field-wide' : ''}" data-config-field="${E(f.key)}">${input(f, values[f.key] ?? (['roles', 'channels', 'list', 'ids', 'lines'].includes(f.type) ? [] : f.type === 'number' ? f.min : ''))}</div>`).join('');
    }
    function rowHTML(field, row) {
      return `<div class="config-repeater-row" data-config-row><div class="config-row-fields">${fieldsHTML(field.itemFields, row)}</div><button type="button" data-remove-row title="Retirer cette ligne" aria-label="Retirer cette ligne">${icon('x')}</button></div>`;
    }
    function readFields(fields, container) {
      return Object.fromEntries(fields.map(f => {
        const element = [...container.children].find(node => node.dataset.configField === f.key), control = element.querySelector('[data-config-input]');
        let value;
        if (f.type === 'list') value = [...element.querySelector('[data-config-rows]').children].map(row => readFields(f.itemFields, row.querySelector('.config-row-fields')));
        else if (f.type === 'boolean') value = control.checked;
        else if (f.type === 'number') value = Number(control.value);
        else if (['roles', 'channels'].includes(f.type)) value = [...control.selectedOptions].map(option => option.value);
        else if (['role', 'channel'].includes(f.type)) value = control.value || null;
        else if (['ids', 'lines'].includes(f.type)) value = control.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
        else if (f.type === 'select') value = f.choices.find(choice => String(choice.value) === control.value).value;
        else if (f.type === 'datetime') value = control.value ? new Date(control.value).toISOString() : '';
        else value = control.value;
        return [f.key, value];
      }));
    }
    function patch() {
      const values = readFields(selectedSection().fields, content.querySelector('.config-fields'));
      return Object.fromEntries(Object.entries(values).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(model.values[key])));
    }
    function updateDirty() {
      try { const count = Object.keys(patch()).length; dirty = count > 0; content.querySelector('[data-config-changes]').textContent = count ? count + ' réglage(s) modifié(s), non enregistré(s)' : 'Aucune modification'; content.querySelector('[data-save-config]').disabled = !dirty; } catch { dirty = true; }
    }
    function renderForm() {
      const section = selectedSection();
      content.querySelector('[data-config-editor]').innerHTML = `<div class="section-heading"><h2>${E(section.label)}</h2><button type="button" data-refresh-config title="Actualiser les réglages" aria-label="Actualiser les réglages">${icon('refresh-cw')}</button></div><form id="bot-config-form"><div class="config-fields">${fieldsHTML(section.fields, model.values)}</div><div class="config-save-bar"><span class="muted" data-config-changes>Aucune modification</span><button type="button" data-cancel-config>${icon('x')} Annuler les modifications</button><button type="submit" class="primary" data-save-config disabled>${icon('save')} Enregistrer</button></div></form>`;
      const form = content.querySelector('#bot-config-form');
      form.addEventListener('input', updateDirty); form.addEventListener('change', updateDirty);
      form.onclick = event => {
        const add = event.target.closest('[data-add-row]'), remove = event.target.closest('[data-remove-row]');
        if (add) {
          const f = section.fields.find(field => field.key === add.dataset.addRow), rows = add.parentElement.querySelector('[data-config-rows]');
          if (rows.children.length >= f.maxItems) return notice('Nombre maximum de lignes atteint.');
          rows.insertAdjacentHTML('beforeend', rowHTML(f, {})); icons(); updateDirty();
        } else if (remove) { remove.closest('[data-config-row]').remove(); updateDirty(); }
      };
      form.onsubmit = event => {
        event.preventDefault(); const values = patch(); if (!Object.keys(values).length) return;
        void run(async () => {
          const labels = Object.keys(values).map(key => section.fields.find(f => f.key === key).label);
          const confirmation = await confirmAction('Enregistrer sur ' + catalog.bots.find(b => b.id === model.bot).name + ', serveur ' + model.meta.guild.name + ' : ' + labels.join(', ') + '.', 'ENREGISTRER');
          if (!confirmation) return;
          const saved = await write(path(), { values, revision: model.revision, operationId: crypto.randomUUID(), ...confirmation }, 'PATCH');
          model.values = saved.values; model.revision = saved.revision; dirty = false; renderForm(); notice(saved.warning || 'Configuration enregistrée dans le bot.', 'success');
        });
      };
      content.querySelector('[data-cancel-config]').onclick = () => { dirty = false; renderForm(); };
      content.querySelector('[data-refresh-config]').onclick = () => run(async () => { if (await discard()) await loadSection(); });
      icons();
    }
    function loading() { content.querySelector('[data-config-editor]').innerHTML = '<p class="loading-state">Chargement des réglages…</p>'; }
    function loadError(retry) {
      content.querySelector('[data-config-editor]').innerHTML = '<h2>Configuration indisponible</h2><button type="button" data-config-retry>Réessayer</button>';
      content.querySelector('[data-config-retry]').onclick = () => run(retry);
    }
    async function loadSection() {
      loading();
      try {
        const data = await request(path()); model.values = data.values; model.revision = data.revision; dirty = false;
        history.replaceState(null, '', '/admin/configuration?' + new URLSearchParams({ bot: model.bot, guild: model.guild, section: model.section })); renderForm();
      } catch (error) { loadError(loadSection); throw error; }
    }
    async function loadGuild() {
      loading();
      try {
        model.meta = await request(base() + '/' + model.guild);
        model.section = model.meta.sections.some(s => s.id === query.get('section')) ? query.get('section') : model.meta.sections[0].id;
        const select = content.querySelector('[data-config-section]'); select.innerHTML = model.meta.sections.map(s => `<option value="${E(s.id)}">${E(s.label)}</option>`).join(''); select.value = model.section;
        await loadSection();
      } catch (error) { loadError(loadGuild); throw error; }
    }
    async function loadGuilds() {
      loading(); model.guild = ''; model.meta = null;
      let data;
      try { data = await request(base() + '/guilds'); } catch (error) { loadError(loadGuilds); throw error; }
      model.guilds = data.guilds;
      const select = content.querySelector('[data-config-guild]'); select.innerHTML = data.guilds.map(g => `<option value="${E(g.id)}">${E(g.name)}</option>`).join('');
      if (!data.guilds.length) { content.querySelector('[data-config-editor]').innerHTML = '<p class="notice">Aucun serveur accessible : la permission Administrateur Discord est requise sur un serveur où ce bot est présent.</p>'; content.querySelector('[data-config-section]').innerHTML = ''; model.guild = ''; return; }
      model.guild = data.guilds.some(g => g.id === query.get('guild')) ? query.get('guild') : data.guilds[0].id; select.value = model.guild;
      await loadGuild();
    }
    content.innerHTML = `<section class="workspace-section"><div class="config-selectors"><label>Bot<select data-config-bot>${catalog.bots.map(b => `<option value="${E(b.id)}">${E(b.name)}</option>`).join('')}</select></label><label>Serveur Discord<select data-config-guild></select></label><label>Rubrique<select data-config-section></select></label></div></section><section class="workspace-section" data-config-editor></section>`;
    const botSelect = content.querySelector('[data-config-bot]'), guildSelect = content.querySelector('[data-config-guild]'), sectionSelect = content.querySelector('[data-config-section]');
    botSelect.value = model.bot;
    botSelect.onchange = () => { const value = botSelect.value; void run(async () => { if (!await discard()) { botSelect.value = model.bot; return; } dirty = false; model.bot = value; await loadGuilds(); }); };
    guildSelect.onchange = () => { const value = guildSelect.value; void run(async () => { if (!await discard()) { guildSelect.value = model.guild; return; } dirty = false; model.guild = value; await loadGuild(); }); };
    sectionSelect.onchange = () => { const value = sectionSelect.value; void run(async () => { if (!await discard()) { sectionSelect.value = model.section; return; } dirty = false; model.section = value; await loadSection(); }); };
    inFlight = true; content.querySelectorAll('select').forEach(node => { node.disabled = true; });
    try { await loadGuilds(); } finally { inFlight = false; content.querySelectorAll('select').forEach(node => { node.disabled = false; }); }
  };
})();
