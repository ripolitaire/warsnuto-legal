(() => {
  'use strict';
  const data = window.WARSNUTO_CARDS;
  const grid = document.querySelector('#card-grid'), count = document.querySelector('#card-count');
  if (!grid || !count) return;
  if (!data?.cards?.length) { count.textContent = 'Catalogue temporairement indisponible.'; return; }
  const rarity = document.querySelector('#card-rarity'), universe = document.querySelector('#card-universe'), search = document.querySelector('#card-search');
  const detail = document.querySelector('#card-detail'), byId = new Map(data.cards.map(card => [card.id, card]));
  const tiers = new Map(data.rarities.map(tier => [tier.id, tier]));
  const poolCounts = new Map(data.rarities.map(tier => [tier.id, data.cards.filter(card => card.rarity === tier.id).length]));
  const cardChance = card => `${(tiers.get(card.rarity).percent / poolCounts.get(card.rarity)).toLocaleString('fr-FR', { maximumSignificantDigits: 6 })} % pour cette carte, hors bonus`;
  const pageSize = 20, normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let page = 0, selected = '', previousFocus;
  for (const tier of data.rarities) rarity.add(new Option(tier.label, tier.id));
  for (const name of [...new Set(data.cards.map(card => card.universe))].sort((a, b) => a.localeCompare(b, 'fr'))) universe.add(new Option(name, name));
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'card-reset'; reset.textContent = 'Effacer les filtres'; reset.hidden = true;
  count.after(reset);
  function syncURL() {
    const params = new URLSearchParams();
    if (search.value.trim()) params.set('q', search.value.trim());
    if (rarity.value !== 'all') params.set('rarity', rarity.value);
    if (universe.value !== 'all') params.set('universe', universe.value);
    if (page) params.set('page', String(page + 1));
    if (selected) params.set('card', selected);
    history.replaceState(null, '', '/cards' + (params.size ? '?' + params : ''));
  }
  function render() {
    const query = normalize(search.value.trim());
    const cards = data.cards.filter(card => (rarity.value === 'all' || card.rarity === rarity.value) && (universe.value === 'all' || card.universe === universe.value) && normalize(card.name + ' ' + card.id).includes(query));
    const pages = Math.max(1, Math.ceil(cards.length / pageSize)); page = Math.max(0, Math.min(page, pages - 1));
    grid.replaceChildren();
    for (const card of cards.slice(page * pageSize, (page + 1) * pageSize)) {
      const item = document.createElement('article'); item.className = 'card-item';
      const button = document.createElement('button'); button.className = 'card-image'; button.type = 'button'; button.dataset.card = card.id; button.setAttribute('aria-label', 'Voir ' + card.name);
      const image = document.createElement('img'); image.src = '/assets/cards/thumbs/' + card.id + '.webp'; image.alt = card.name; image.width = 320; image.height = 480; image.loading = 'lazy'; image.decoding = 'async'; button.append(image);
      const heading = document.createElement('h2'); heading.textContent = card.name;
      const caption = document.createElement('p'); caption.className = 'card-tier'; caption.textContent = tiers.get(card.rarity).label + ' · ' + card.universe;
      const chance = document.createElement('p'); chance.textContent = cardChance(card);
      item.append(button, heading, caption, chance); grid.append(item);
    }
    if (!cards.length) { const empty = document.createElement('p'); empty.className = 'card-empty'; empty.textContent = 'Aucune carte ne correspond à cette recherche.'; grid.append(empty); }
    count.textContent = `${cards.length} carte(s) sur ${data.cards.length}`;
    reset.hidden = !(query || rarity.value !== 'all' || universe.value !== 'all');
    const tier = tiers.get(rarity.value);
    document.querySelector('#card-odds').textContent = tier ? `Chance de la rareté : ${tier.percent.toLocaleString('fr-FR', { maximumSignificantDigits: 6 })} % par tirage, hors bonus. Les cartes d’une même rareté ont la même probabilité.` : 'Probabilités hors bonus. Les doublons sont possibles ; aucune rareté n’est garantie.';
    document.querySelector('#card-page').textContent = `${page + 1} / ${pages}`;
    document.querySelector('#card-prev').disabled = page === 0; document.querySelector('#card-next').disabled = page + 1 === pages;
    syncURL();
  }
  function open(card, trigger) {
    if (!card) return;
    previousFocus = trigger || document.activeElement; selected = card.id;
    document.querySelector('#card-title').textContent = card.name;
    document.querySelector('#card-meta').textContent = `${card.id} · ${tiers.get(card.rarity).label} · ${card.universe} · ${cardChance(card)}`;
    const image = document.querySelector('#card-art'); image.src = '/assets/cards/' + card.id + '.webp'; image.alt = card.name;
    document.querySelector('#card-original').href = image.src; if (!detail.open) detail.showModal(); syncURL();
  }
  function restore() {
    const params = new URLSearchParams(location.search);
    search.value = (params.get('q') || '').slice(0, 100);
    rarity.value = tiers.has(params.get('rarity')) ? params.get('rarity') : 'all';
    universe.value = [...universe.options].some(option => option.value === params.get('universe')) ? params.get('universe') : 'all';
    const requestedPage = Number(params.get('page')); page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage - 1 : 0;
    selected = byId.has(params.get('card')) ? params.get('card') : ''; render();
    if (selected) open(byId.get(selected));
  }
  document.querySelector('#card-filters').addEventListener('submit', event => event.preventDefault());
  for (const input of [rarity, universe, search]) input.addEventListener('input', () => { page = 0; render(); });
  reset.addEventListener('click', () => { search.value = ''; rarity.value = universe.value = 'all'; page = 0; render(); search.focus(); });
  for (const [id, direction] of [['card-prev', -1], ['card-next', 1]]) document.getElementById(id).addEventListener('click', () => { page += direction; render(); document.querySelector('#card-filters').scrollIntoView({ block: 'start' }); });
  grid.addEventListener('click', event => { const button = event.target.closest('[data-card]'); open(byId.get(button?.dataset.card), button); });
  detail.addEventListener('close', () => { selected = ''; syncURL(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
  detail.addEventListener('click', event => { if (event.target === detail) { const rect = detail.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) detail.close(); } });
  restore();
})();
