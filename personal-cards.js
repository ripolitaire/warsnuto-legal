window.wnPersonalCards = async ui => {
  const { content, request, E, icon, icons } = ui;
  const catalogue = window.WARSNUTO_CARDS;
  if (!catalogue?.cards?.length) throw Error('Catalogue temporairement indisponible.');
  const directory = await request('servers');
  const guilds = directory.guilds.filter(guild => guild.bots.some(bot => bot.id === 'game'));
  if (!guilds.length) { content.innerHTML = '<p class="notice">Aucun serveur Game commun disponible. Réessaie lorsque le bot est connecté.</p>'; return; }
  const tiers = new Map(catalogue.rarities.map(tier => [tier.id, tier]));
  const query = new URLSearchParams(location.search);
  let guild = guilds.find(guild => guild.id === query.get('guild')) || guilds[0], owned = new Map(), page = 0, loading = false;
  content.innerHTML = `<section class="workspace-section"><div class="section-heading"><label>Serveur<select data-collection-guild>${guilds.map(g => `<option value="${E(g.id)}" ${g.id === guild.id ? 'selected' : ''}>${E(g.name)}</option>`).join('')}</select></label><button data-collection-refresh aria-label="Actualiser ma collection" title="Actualiser ma collection">${icon('refresh-cw')}</button><a href="/cards" class="button">Catalogue public</a></div><div data-collection-stats role="status"></div><form class="card-filters personal-filters" data-collection-filters><label>Personnage<input type="search" data-collection-search maxlength="100" placeholder="Rechercher une carte"></label><label>Rareté<select data-collection-rarity><option value="all">Toutes les raretés</option>${catalogue.rarities.map(tier => `<option value="${E(tier.id)}">${E(tier.label)}</option>`).join('')}</select></label><label>Univers<select data-collection-universe><option value="all">Tous les univers</option>${[...new Set(catalogue.cards.map(card => card.universe))].sort((a,b) => a.localeCompare(b,'fr')).map(name => `<option value="${E(name)}">${E(name)}</option>`).join('')}</select></label><label>Afficher<select data-collection-view><option value="owned">Obtenues</option><option value="all">Toutes les cartes</option><option value="missing">Manquantes</option><option value="duplicates">Doublons</option></select></label></form><div data-collection-grid class="card-grid"></div><nav class="card-pagination" aria-label="Pages de ma collection"><button data-collection-prev aria-label="Page précédente">&larr;</button><span data-collection-page></span><button data-collection-next aria-label="Page suivante">&rarr;</button></nav></section>`;
  const find = selector => content.querySelector(selector);
  const stats = find('[data-collection-stats]'), grid = find('[data-collection-grid]');
  const search = find('[data-collection-search]'), rarity = find('[data-collection-rarity]'), view = find('[data-collection-view]'), universe = find('[data-collection-universe]');
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function render() {
    const filtered = catalogue.cards.filter(card => {
      const quantity = owned.get(card.id) || 0;
      return (universe.value === 'all' || universe.value === card.universe) && (rarity.value === 'all' || rarity.value === card.rarity) && normalize(card.name + ' ' + card.id).includes(normalize(search.value.trim()))
        && (view.value === 'all' || view.value === 'owned' && quantity > 0 || view.value === 'missing' && !quantity || view.value === 'duplicates' && quantity > 1);
    });
    const pages = Math.max(1, Math.ceil(filtered.length / 20)); page = Math.max(0, Math.min(page, pages - 1));
    grid.innerHTML = filtered.length ? filtered.slice(page * 20, page * 20 + 20).map(card => {
      const quantity = owned.get(card.id) || 0;
      return `<article class="card-item"><a class="card-image${quantity ? '' : ' personal-card-missing'}" href="/assets/cards/${E(card.id)}.webp" target="_blank" rel="noopener noreferrer" aria-label="Voir ${E(card.name)}"><img src="/assets/cards/thumbs/${E(card.id)}.webp" alt="${E(card.name)}" width="320" height="480" loading="lazy" decoding="async"></a><h2>${E(card.name)}</h2><p class="card-tier">${E(tiers.get(card.rarity).label)} · ${quantity ? `×${quantity}` : 'Non obtenue'}</p></article>`;
    }).join('') : '<p class="card-empty">Aucune carte dans cette sélection. Les tirages se font dans Discord avec /cartes tirage.</p>';
    const quantities = [...owned.values()], total = quantities.reduce((sum, quantity) => sum + quantity, 0);
    stats.innerHTML = `<div class="collection-totals"><div><strong>${owned.size} / ${catalogue.cards.length}</strong><span>Cartes différentes</span></div><div><strong>${total}</strong><span>Exemplaires</span></div><div><strong>${total - owned.size}</strong><span>Doublons</span></div></div><progress value="${owned.size}" max="${catalogue.cards.length}" aria-label="Progression de la collection"></progress><div class="collection-rarities">${catalogue.rarities.map(tier => { const pool = catalogue.cards.filter(card => card.rarity === tier.id); return `<span>${E(tier.label)} · ${pool.filter(card => owned.has(card.id)).length}/${pool.length}</span>`; }).join('')}</div><p>${filtered.length} carte(s) dans cette sélection</p>`;
    find('[data-collection-page]').textContent = `${page + 1} / ${pages}`;
    find('[data-collection-prev]').disabled = page === 0; find('[data-collection-next]').disabled = page + 1 === pages;
  }
  async function load() {
    if (loading) return; loading = true; grid.replaceChildren(); stats.textContent = 'Lecture de ta collection…';
    const controls = [...content.querySelectorAll('button,select,input')]; controls.forEach(control => { control.disabled = true; });
    try {
      const data = await request('me/game/' + guild.id + '?mode=normal');
      if (!data.collection?.available) throw Error('La collection est temporairement indisponible.');
      const known = new Set(catalogue.cards.map(card => card.id));
      owned = new Map(data.collection.cards.filter(card => known.has(card.id) && Number.isSafeInteger(card.quantity) && card.quantity > 0).map(card => [card.id, card.quantity]));
      history.replaceState(null, '', '/profile/cards?' + new URLSearchParams({ guild: guild.id })); page = 0;
      controls.forEach(control => { control.disabled = false; }); render();
    } catch (error) {
      owned = new Map(); stats.textContent = error.message;
      controls.forEach(control => { control.disabled = !control.matches('[data-collection-guild],[data-collection-refresh]'); });
    }
    finally { loading = false; icons(); }
  }
  find('[data-collection-filters]').onsubmit = event => event.preventDefault();
  for (const input of [search, rarity, view, universe]) input.oninput = () => { page = 0; render(); };
  find('[data-collection-prev]').onclick = () => { page--; render(); };
  find('[data-collection-next]').onclick = () => { page++; render(); };
  find('[data-collection-guild]').onchange = event => { guild = guilds.find(guild => guild.id === event.target.value); void load(); };
  find('[data-collection-refresh]').onclick = () => void load();
  await load();
};
