(() => {
  'use strict';
  window.wnConfigurationPicker = ({ content, E, icon, icons, notice, isBusy }) => {
    const events = new AbortController(), mounted = new Set(); let sequence = 0;
    const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
    function render(field, value, meta) {
      const multiple = ['roles', 'channels'].includes(field.type), roles = field.type.startsWith('role');
      const chosen = [...new Set((multiple ? Array.isArray(value) ? value : [] : value == null || value === '' ? [] : [value]).map(String).filter(Boolean))];
      const source = roles ? meta.roles : meta.channels.filter(channel => field.channelTypes.includes(channel.type));
      const options = [...new Map(source.map(item => [String(item.id), { value: String(item.id), label: item.name }])).values()]
        .sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true, sensitivity: 'base' }));
      for (const value of chosen) if (!options.some(option => option.value === value)) options.unshift({ value, label: 'Indisponible : ' + value, missing: true });
      const choices = multiple ? options : [...(!field.required ? [{ value: '', label: 'Aucun' }] : []), ...options];
      const id = 'config-reference-' + ++sequence;
      return `<div class="reference-field"><span id="${id}" class="field-label">${E(field.label)}</span><select hidden data-config-input aria-labelledby="${id}" ${field.required ? 'data-required' : ''} ${multiple ? 'multiple' : ''}>${!multiple ? '<option value="">Aucun</option>' : ''}${options.map(option => `<option value="${E(option.value)}" ${chosen.includes(option.value) ? 'selected' : ''}>${E(option.label)}</option>`).join('')}</select>
        <details class="reference-picker" data-reference-picker data-multiple="${multiple}" data-max="${field.maxItems || 100}"><summary aria-labelledby="${id}" aria-expanded="false"><span class="reference-glyph">${icon(roles ? 'at-sign' : 'hash')}</span><span data-picker-caption></span>${icon('chevron-down')}</summary><div class="reference-popover" popover="manual"><label class="reference-search">${icon('search')}<input type="search" data-picker-search autocomplete="off" spellcheck="false" placeholder="Rechercher…" aria-label="Rechercher : ${E(field.label)}"></label><div class="reference-options" role="group" aria-labelledby="${id}">${choices.map(option => `<button type="button" data-picker-value="${E(option.value)}" data-picker-name="${E(normalize(option.label))}" title="${E(option.value || 'Aucune sélection')}" ${option.missing ? 'disabled' : ''} aria-pressed="${multiple ? chosen.includes(option.value) : (chosen[0] || '') === option.value}"><span class="reference-check">${icon('check')}</span><span>${E(option.label)}</span></button>`).join('')}</div><p data-picker-empty hidden>Aucun résultat.</p></div></details><div class="reference-tokens" data-picker-tokens aria-live="polite"></div></div>`;
    }
    function close(picker, focus = false) {
      picker.open = false; picker.querySelector('summary').setAttribute('aria-expanded', 'false');
      const panel = picker.querySelector('.reference-popover');
      panel.classList.remove('is-open');
      if (typeof panel.hidePopover === 'function' && panel.matches(':popover-open')) panel.hidePopover();
      if (focus) picker.querySelector('summary').focus();
    }
    const closeAll = () => mounted.forEach(picker => { if (picker.isConnected) close(picker); });
    function position(picker, allowScroll = false) {
      if (!picker.open || !picker.isConnected) return;
      const anchor = picker.querySelector('summary').getBoundingClientRect(), panel = picker.querySelector('.reference-popover');
      const topLimit = Math.max(8, document.querySelector('.platform-header')?.getBoundingClientRect().bottom || 0) + 8;
      const viewport = window.visualViewport, bottom = (viewport ? viewport.offsetTop + viewport.height : innerHeight) - 8;
      if (anchor.bottom < topLimit || anchor.top > bottom) {
        if (!allowScroll) return close(picker);
        picker.querySelector('summary').scrollIntoView({ block: 'center' }); return position(picker);
      }
      const above = anchor.top - topLimit - 6, below = bottom - anchor.bottom - 6;
      const upwards = below < 300 && above > below, height = Math.min(340, Math.max(80, upwards ? above : below));
      const width = Math.min(anchor.width, innerWidth - 24), left = Math.max(12, Math.min(anchor.left, innerWidth - width - 12));
      panel.style.left = left + 'px'; panel.style.width = width + 'px'; panel.style.maxHeight = height + 'px';
      const actualHeight = panel.getBoundingClientRect().height;
      panel.style.top = Math.max(topLimit, upwards ? anchor.top - actualHeight - 6 : anchor.bottom + 6) + 'px';
      picker.dataset.placement = upwards ? 'top' : 'bottom';
    }
    function mount(root) {
      for (const picker of [...mounted]) if (!picker.isConnected) mounted.delete(picker);
      root.querySelectorAll('[data-reference-picker]:not([data-ready])').forEach(picker => {
        picker.dataset.ready = 'true'; mounted.add(picker);
        const field = picker.closest('.reference-field'), select = field.querySelector('select'), panel = picker.querySelector('.reference-popover');
        const search = picker.querySelector('[data-picker-search]'), multiple = select.multiple;
        const refresh = () => {
          const selected = [...select.selectedOptions].filter(option => option.value);
          if (select.value) { field.classList.remove('invalid'); picker.querySelector('summary').removeAttribute('aria-invalid'); field.querySelector('.field-error')?.remove(); }
          picker.querySelector('[data-picker-caption]').textContent = multiple ? selected.length ? selected.length + (selected.length === 1 ? ' sélection' : ' sélections') : 'Aucune sélection' : selected[0]?.textContent || (select.hasAttribute('data-required') ? 'À choisir' : 'Aucun');
          picker.querySelectorAll('[data-picker-value]').forEach(button => button.setAttribute('aria-pressed', String(multiple ? selected.some(option => option.value === button.dataset.pickerValue) : select.value === button.dataset.pickerValue)));
          field.querySelector('[data-picker-tokens]').innerHTML = multiple ? selected.slice(0, 3).map(option => `<span class="reference-token"><span>${E(option.textContent)}</span><button type="button" data-picker-remove="${E(option.value)}" title="Retirer ${E(option.textContent)}" aria-label="Retirer ${E(option.textContent)}">${icon('x')}</button></span>`).join('') + (selected.length > 3 ? `<button type="button" class="reference-more" data-picker-more>+ ${selected.length - 3}</button>` : '') : '';
          icons();
        };
        const filter = () => {
          const term = normalize(search.value.trim()); let visible = 0;
          picker.querySelectorAll('[data-picker-value]').forEach(button => { button.hidden = !button.dataset.pickerName.includes(term); if (!button.hidden) visible++; });
          picker.querySelector('[data-picker-empty]').hidden = visible > 0;
        };
        picker.addEventListener('toggle', () => {
          picker.querySelector('summary').setAttribute('aria-expanded', String(picker.open));
          if (!picker.open) { close(picker); return; }
          if (isBusy()) return close(picker);
          mounted.forEach(other => { if (other !== picker && other.isConnected) close(other); });
          search.value = ''; filter();
          if (typeof panel.showPopover === 'function') panel.showPopover();
          panel.classList.add('is-open'); position(picker); search.focus({ preventScroll: true });
        }, { signal: events.signal });
        picker.addEventListener('focusout', () => setTimeout(() => { if (!field.contains(document.activeElement)) close(picker); }, 0), { signal: events.signal });
        search.addEventListener('input', filter, { signal: events.signal });
        panel.addEventListener('keydown', event => {
          const options = [...picker.querySelectorAll('[data-picker-value]:not([hidden]):not(:disabled)')];
          const index = options.indexOf(document.activeElement);
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(picker, true); }
          else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault(); const at = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? (index + 1) % options.length : index <= 0 ? options.length - 1 : index - 1;
            options[at]?.focus();
          } else if (event.key === 'Enter' && document.activeElement === search) event.preventDefault();
        }, { signal: events.signal });
        field.addEventListener('click', event => {
          const button = event.target.closest('[data-picker-value], [data-picker-remove], [data-picker-more]');
          if (!button || button.disabled || isBusy()) return;
          if (button.hasAttribute('data-picker-more')) { picker.open = true; return; }
          const value = button.hasAttribute('data-picker-value') ? button.dataset.pickerValue : button.dataset.pickerRemove;
          const option = [...select.options].find(option => option.value === value); if (!option) return;
          if (button.hasAttribute('data-picker-remove')) option.selected = false;
          else if (multiple) {
            if (!option.selected && [...select.selectedOptions].filter(item => item.value).length >= Number(picker.dataset.max)) return notice('Nombre maximum de sélections atteint.');
            option.selected = !option.selected;
          } else { select.value = option.value; close(picker, true); }
          refresh(); select.dispatchEvent(new Event('change', { bubbles: true }));
        }, { signal: events.signal });
        refresh();
      });
    }
    document.addEventListener('pointerdown', event => mounted.forEach(picker => { if (picker.open && !picker.contains(event.target)) close(picker); }), { signal: events.signal });
    content.addEventListener('keydown', event => { if (event.key === 'Escape') { const picker = [...mounted].find(picker => picker.open); if (picker) { event.preventDefault(); close(picker, true); } } }, { signal: events.signal });
    const reposition = () => mounted.forEach(picker => position(picker));
    const resized = () => mounted.forEach(picker => position(picker, true));
    window.addEventListener('resize', resized, { signal: events.signal }); window.addEventListener('scroll', reposition, { capture: true, passive: true, signal: events.signal });
    window.visualViewport?.addEventListener('resize', resized, { signal: events.signal });
    return { render, mount, closeAll, destroy() { closeAll(); events.abort(); mounted.clear(); } };
  };
})();
