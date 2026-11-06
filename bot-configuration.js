(() => {
  'use strict';
  let dirty = false, pickerEvents;
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.wnBotConfiguration = async ({ content, request, write, confirmAction, notice, action, icon, E, icons }) => {
    pickerEvents?.abort(); pickerEvents = new AbortController();
    const query = new URLSearchParams(location.search), directory = await request('servers');
    if (!query.get('guild')) return window.wnMemberSpace.servers({ content, request, E, icon, icons }, directory, true);
    const selectedGuild = directory.guilds.find(g => g.id === query.get('guild'));
    const available = selectedGuild?.bots.filter(bot => bot.canConfigure) || [];
    if (!available.length) return window.wnMemberSpace.servers({ content, request, E, icon, icons }, directory, true);
    const catalog = { bots: available };
    const model = { bot: catalog.bots.some(b => b.id === query.get('bot')) ? query.get('bot') : catalog.bots[0].id, guilds: [], guild: '', section: '', meta: null, values: {}, revision: '' };
    let inFlight = false, controlId = 0;
    const sectionIcon = id => ({ access: 'users-round', validation: 'badge-check', logs: 'scroll-text', 'anti-alt': 'shield-alert', appearance: 'palette', rankings: 'chart-no-axes-combined', xp: 'sparkles', 'xp-messages': 'megaphone', 'xp-crates': 'package', 'xp-roles': 'award', 'xp-logs': 'scroll-text', automod: 'shield-check', 'auto-roles': 'user-plus', welcome: 'user-plus', availability: 'power', channels: 'hash', balance: 'sliders-horizontal', notes: 'notebook-pen', 'auto-boss': 'swords', events: 'calendar-days', halloween: 'moon', 'player-roles': 'award', team: 'users-round', options: 'sliders-horizontal', types: 'tags' }[id] || 'settings-2');
    const base = () => 'admin/bot-config/' + model.bot;
    const path = () => base() + '/' + model.guild + '/' + model.section;
    const selectedSection = () => model.meta.sections.find(s => s.id === model.section);
    const run = callback => action(null, async () => {
      if (inFlight) return; inFlight = true;
      content.querySelectorAll('input,select,textarea').forEach(node => { node.disabled = true; });
      content.querySelectorAll('[data-reference-picker]').forEach(node => { node.inert = true; node.open = false; });
      try { await callback(); } finally { inFlight = false; content.querySelectorAll('input,select,textarea').forEach(node => { node.disabled = false; }); content.querySelectorAll('[data-reference-picker]').forEach(node => { node.inert = false; }); }
    });
    const discard = async () => !dirty || Boolean(await confirmAction('Abandonner les modifications non enregistrées ?', 'ABANDONNER', false));
    function input(f, value) {
      const required = f.required ? ' required' : '';
      const common = ' data-config-input' + required;
      if (f.type === 'boolean') return `<label class="checkbox-line"><input type="checkbox" role="switch" data-config-input ${value ? 'checked' : ''}>${E(f.label)}</label>`;
      if (['role', 'roles', 'channel', 'channels', 'select'].includes(f.type)) {
        const multiple = ['roles', 'channels'].includes(f.type), chosen = multiple ? value || [] : value == null ? [] : [value];
        let options = f.type === 'select' ? f.choices : (f.type.startsWith('role') ? model.meta.roles : model.meta.channels.filter(c => f.channelTypes.includes(c.type))).map(item => ({ value: item.id, label: item.name }));
        options = [...chosen.map(value => options.find(option => String(option.value) === String(value)) || { value, label: 'Introuvable : ' + value }), ...options.filter(option => !chosen.some(value => String(value) === String(option.value)))];
        const optionHTML = options.map(option => `<option value="${E(option.value)}" ${chosen.some(value => String(value) === String(option.value)) ? 'selected' : ''}>${E(option.label)}</option>`).join('');
        if (f.type === 'select') return `<label>${E(f.label)}<select${common}>${optionHTML}</select></label>`;
        const id = 'config-reference-' + ++controlId;
        const pickerOptions = multiple ? options : [{ value: '', label: 'Aucun' }, ...options];
        return `<div class="reference-field"><span id="${id}" class="field-label">${E(f.label)}</span><select hidden data-config-input aria-label="${E(f.label)}" ${f.required ? 'data-required' : ''} ${multiple ? 'multiple' : ''}>${!multiple ? '<option value="">Aucun</option>' : ''}${optionHTML}</select>
          <details class="reference-picker" data-reference-picker data-multiple="${multiple}" data-max="${f.maxItems || 100}"><summary aria-labelledby="${id}"><span class="reference-glyph">${icon(f.type.startsWith('role') ? 'at-sign' : 'hash')}</span><span data-picker-caption></span>${icon('chevron-down')}</summary><div class="reference-popover"><label class="reference-search">${icon('search')}<input type="search" data-picker-search autocomplete="off" spellcheck="false" placeholder="Rechercher…" aria-label="Rechercher : ${E(f.label)}"></label><div class="reference-options" data-picker-options role="group" aria-labelledby="${id}">${pickerOptions.map(option => `<button type="button" data-picker-value="${E(option.value)}" data-picker-name="${E(String(option.label).toLocaleLowerCase('fr'))}" aria-pressed="${chosen.some(value => String(value) === String(option.value))}"><span class="reference-check">${icon('check')}</span><span>${E(option.label)}</span></button>`).join('')}</div><p data-picker-empty hidden>Aucun résultat.</p></div></details><div class="reference-tokens" data-picker-tokens aria-live="polite"></div></div>`;
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
    function mountPickers(root) {
      root.querySelectorAll('[data-reference-picker]:not([data-ready])').forEach(picker => {
        picker.dataset.ready = 'true';
        const field = picker.closest('.reference-field'), select = field.querySelector('select'), multiple = select.multiple;
        const refresh = () => {
          const selected = [...select.selectedOptions].filter(option => option.value);
          picker.querySelector('[data-picker-caption]').textContent = multiple ? selected.length ? selected.length + (selected.length === 1 ? ' sélection' : ' sélections') : 'Aucune sélection' : selected[0]?.textContent || 'Aucun';
          picker.querySelectorAll('[data-picker-value]').forEach(button => button.setAttribute('aria-pressed', String(multiple ? selected.some(option => option.value === button.dataset.pickerValue) : select.value === button.dataset.pickerValue)));
          field.querySelector('[data-picker-tokens]').innerHTML = multiple ? selected.slice(0, 3).map(option => `<span class="reference-token"><span>${E(option.textContent)}</span><button type="button" data-picker-remove="${E(option.value)}" title="Retirer ${E(option.textContent)}" aria-label="Retirer ${E(option.textContent)}">${icon('x')}</button></span>`).join('') + (selected.length > 3 ? `<button type="button" class="reference-more" data-picker-more>+ ${selected.length - 3}</button>` : '') : '';
          icons();
        };
        const change = () => { refresh(); select.dispatchEvent(new Event('change', { bubbles: true })); };
        picker.addEventListener('toggle', () => { if (picker.open) {
          content.querySelectorAll('[data-reference-picker]').forEach(other => { if (other !== picker) other.open = false; });
          const rect = picker.getBoundingClientRect(); picker.dataset.placement = innerHeight - rect.bottom < 300 && rect.top > 300 ? 'top' : 'bottom';
          picker.querySelector('[data-picker-search]').focus();
        } });
        picker.addEventListener('focusout', () => setTimeout(() => { if (!field.contains(document.activeElement)) picker.open = false; }, 0));
        picker.querySelector('[data-picker-search]').onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); if (event.key === 'ArrowDown') { event.preventDefault(); picker.querySelector('[data-picker-value]:not([hidden])')?.focus(); } };
        picker.querySelector('[data-picker-search]').oninput = event => {
          const term = event.target.value.trim().toLocaleLowerCase('fr'); let visible = 0;
          picker.querySelectorAll('[data-picker-value]').forEach(button => { button.hidden = !button.dataset.pickerName.includes(term); if (!button.hidden) visible++; });
          picker.querySelector('[data-picker-empty]').hidden = visible > 0;
        };
        field.addEventListener('click', event => {
          const button = event.target.closest('[data-picker-value], [data-picker-remove], [data-picker-more]');
          if (!button || inFlight) return;
          if (button.hasAttribute('data-picker-more')) { picker.open = true; return; }
          const option = [...select.options].find(option => option.value === (button.hasAttribute('data-picker-value') ? button.dataset.pickerValue : button.dataset.pickerRemove));
          if (!option) return;
          if (button.hasAttribute('data-picker-remove')) option.selected = false;
          else if (multiple) {
            if (!option.selected && select.selectedOptions.length >= Number(picker.dataset.max)) return notice('Nombre maximum de sélections atteint.');
            option.selected = !option.selected;
          } else { select.value = option.selected ? '' : option.value; picker.open = false; picker.querySelector('summary').focus(); }
          change();
        });
        refresh();
      });
    }
    document.addEventListener('pointerdown', event => content.querySelectorAll('[data-reference-picker][open]').forEach(picker => { if (!picker.contains(event.target)) picker.open = false; }), { signal: pickerEvents.signal });
    content.addEventListener('keydown', event => { if (event.key !== 'Escape') return; const picker = content.querySelector('[data-reference-picker][open]'); if (picker) { event.preventDefault(); picker.open = false; picker.querySelector('summary').focus(); } }, { signal: pickerEvents.signal });
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
      return Object.fromEntries(Object.entries(values).filter(([key, value]) => {
        if (selectedSection().fields.find(f => f.key === key)?.type === 'color') return value.toLowerCase() !== String(model.values[key]).toLowerCase();
        return JSON.stringify(value) !== JSON.stringify(model.values[key]);
      }));
    }
    function updateDirty() {
      try { const count = Object.keys(patch()).length; dirty = count > 0; content.querySelector('[data-config-changes]').textContent = count ? count + (count === 1 ? ' réglage modifié, non enregistré' : ' réglages modifiés, non enregistrés') : 'Aucune modification'; content.querySelector('[data-save-config]').disabled = !dirty; } catch { dirty = true; }
    }
    function renderForm() {
      const section = selectedSection();
      content.querySelector('[data-config-editor]').innerHTML = `<div class="config-editor-heading"><span class="section-symbol">${icon(sectionIcon(section.id))}</span><div><h2>${E(section.label)}</h2><span class="muted">${section.fields.length} ${section.fields.length === 1 ? 'paramètre' : 'paramètres'} · ${E(catalog.bots.find(b => b.id === model.bot).name)}</span></div><button type="button" data-refresh-config title="Actualiser les réglages" aria-label="Actualiser les réglages">${icon('refresh-cw')}</button></div><form id="bot-config-form"><div class="config-fields">${fieldsHTML(section.fields, model.values)}</div><div class="config-save-bar"><span class="muted" data-config-changes>Aucune modification</span><button type="button" data-cancel-config>${icon('undo-2')} Annuler</button><button type="submit" class="primary" data-save-config disabled>${icon('save')} Enregistrer</button></div></form>`;
      const form = content.querySelector('#bot-config-form');
      form.addEventListener('input', updateDirty); form.addEventListener('change', updateDirty);
      form.onclick = event => {
        const add = event.target.closest('[data-add-row]'), remove = event.target.closest('[data-remove-row]');
        if (add) {
          const f = section.fields.find(field => field.key === add.dataset.addRow), rows = add.parentElement.querySelector('[data-config-rows]');
          if (rows.children.length >= f.maxItems) return notice('Nombre maximum de lignes atteint.');
          rows.insertAdjacentHTML('beforeend', rowHTML(f, {})); mountPickers(rows); icons(); updateDirty();
        } else if (remove) { remove.closest('[data-config-row]').remove(); updateDirty(); }
      };
      form.onsubmit = event => {
        event.preventDefault();
        const missing = [...form.querySelectorAll('select[data-required]')].find(select => !select.value);
        if (missing) { const picker = missing.closest('.reference-field').querySelector('details'); picker.open = true; notice('Une sélection est requise : ' + missing.getAttribute('aria-label') + '.'); return; }
        const values = patch(); if (!Object.keys(values).length) return;
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
      mountPickers(form); icons();
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
        content.querySelectorAll('[data-section-link]').forEach(button => button.setAttribute('aria-current', button.dataset.sectionLink === model.section ? 'page' : 'false'));
        content.querySelector('[data-config-section]').value = model.section;
      } catch (error) { loadError(loadSection); throw error; }
    }
    async function loadGuild() {
      loading();
      try {
        model.meta = await request(base() + '/' + model.guild);
        model.section = model.meta.sections.some(s => s.id === query.get('section')) ? query.get('section') : model.meta.sections[0].id;
        const select = content.querySelector('[data-config-section]'); select.innerHTML = model.meta.sections.map(s => `<option value="${E(s.id)}">${E(s.label)}</option>`).join(''); select.value = model.section;
        content.querySelector('[data-config-nav]').innerHTML = model.meta.sections.map(s => `<button type="button" data-section-link="${E(s.id)}">${icon(sectionIcon(s.id))}<span>${E(s.label)}</span><small>${s.fields.length}</small></button>`).join('');
        content.querySelectorAll('[data-section-link]').forEach(button => button.onclick = () => run(async () => { if (!await discard()) return; dirty = false; model.section = button.dataset.sectionLink; await loadSection(); }));
        icons();
        await loadSection();
      } catch (error) { loadError(loadGuild); throw error; }
    }
    async function loadGuilds() {
      loading(); model.guild = ''; model.meta = null; content.querySelector('[data-config-nav]').innerHTML = '';
      let data;
      try { data = await request(base() + '/guilds'); } catch (error) { loadError(loadGuilds); throw error; }
      data.guilds = data.guilds.filter(g => g.id === selectedGuild.id);
      model.guilds = data.guilds;
      const select = content.querySelector('[data-config-guild]'); select.innerHTML = data.guilds.map(g => `<option value="${E(g.id)}">${E(g.name)}</option>`).join('');
      if (!data.guilds.length) { content.querySelector('[data-config-editor]').innerHTML = '<p class="notice">Aucun serveur accessible : la permission Administrateur Discord est requise sur un serveur où ce bot est présent.</p>'; content.querySelector('[data-config-section]').innerHTML = ''; model.guild = ''; return; }
      model.guild = data.guilds.some(g => g.id === query.get('guild')) ? query.get('guild') : data.guilds[0].id; select.value = model.guild;
      await loadGuild();
    }
    const guildImage = selectedGuild.icon && /^https:\/\/cdn\.discordapp\.com\//.test(selectedGuild.icon) ? `<img src="${E(selectedGuild.icon)}" alt="">` : `<span class="guild-initial">${E(selectedGuild.name.slice(0, 2))}</span>`;
    content.innerHTML = `<div class="config-context"><a href="/admin/configuration" class="button context-back" title="Changer de serveur" aria-label="Changer de serveur">${icon('arrow-left')}</a>${guildImage}<div class="config-guild-name"><small>Serveur Discord</small><h2>${E(selectedGuild.name)}</h2></div><span class="config-access">${icon('shield-check')} Accès autorisé</span>${selectedGuild.bots.some(bot => bot.id === 'game') ? `<a href="/profile/game?guild=${E(selectedGuild.id)}" class="button">${icon('gamepad-2')} Mon Game</a>` : ''}</div>
      <div class="config-bot-tabs" role="tablist" aria-label="Bots du serveur">${catalog.bots.map(b => `<button type="button" role="tab" id="config-tab-${E(b.id)}" data-bot-tab="${E(b.id)}" aria-selected="${b.id === model.bot}" aria-controls="config-workspace"><img src="/assets/${E(b.id)}-logo.png" alt=""><span>${E(b.name.replace('WarsNuto ', ''))}</span></button>`).join('')}</div>
      <div class="config-workspace" id="config-workspace" role="tabpanel" aria-labelledby="config-tab-${E(model.bot)}"><aside class="config-module-nav"><p class="nav-caption">Réglages du bot</p><nav data-config-nav aria-label="Rubriques de configuration"></nav><label class="config-mobile-section">Rubrique<select data-config-section></select></label></aside><section class="config-editor" data-config-editor></section></div><select hidden data-config-bot>${catalog.bots.map(b => `<option value="${E(b.id)}">${E(b.name)}</option>`).join('')}</select><select hidden data-config-guild></select>`;
    const botSelect = content.querySelector('[data-config-bot]'), guildSelect = content.querySelector('[data-config-guild]'), sectionSelect = content.querySelector('[data-config-section]');
    botSelect.value = model.bot;
    botSelect.onchange = () => { const value = botSelect.value; void run(async () => { if (!await discard()) { botSelect.value = model.bot; return; } dirty = false; model.bot = value; await loadGuilds(); }); };
    const tabs = [...content.querySelectorAll('[data-bot-tab]')];
    tabs.forEach((button, index) => {
      button.tabIndex = button.dataset.botTab === model.bot ? 0 : -1;
      button.onkeydown = event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
        if (next < 0 || inFlight) return; event.preventDefault(); tabs[next].focus(); tabs[next].click();
      };
      button.onclick = () => run(async () => {
      if (button.dataset.botTab === model.bot || !await discard()) return;
      dirty = false; model.bot = button.dataset.botTab; botSelect.value = model.bot;
      tabs.forEach(tab => { const selected = tab.dataset.botTab === model.bot; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
      content.querySelector('#config-workspace').setAttribute('aria-labelledby', 'config-tab-' + model.bot);
      await loadGuilds();
      });
    });
    guildSelect.onchange = () => { const value = guildSelect.value; void run(async () => { if (!await discard()) { guildSelect.value = model.guild; return; } dirty = false; model.guild = value; await loadGuild(); }); };
    sectionSelect.onchange = () => { const value = sectionSelect.value; void run(async () => { if (!await discard()) { sectionSelect.value = model.section; return; } dirty = false; model.section = value; await loadSection(); }); };
    inFlight = true; content.querySelectorAll('select').forEach(node => { node.disabled = true; });
    try { await loadGuilds(); } finally { inFlight = false; content.querySelectorAll('select').forEach(node => { node.disabled = false; }); }
  };
})();
