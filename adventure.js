(() => {
  'use strict';
  const $ = value => document.querySelector(value), main = $('#game-main'), hud = $('#game-hud');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => new Intl.NumberFormat('fr-FR').format(Number(value) || 0);
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const entries = value => Object.values(value || {}), asset = name => '/assets/adventure/' + name;
  let state, session, view = 'world', zoneId = '', busy = false, pending = null, selection = '', poll, loadGeneration = 0;
  const params = new URLSearchParams(location.search);
  let guild = params.get('guild') || '', mode = params.get('mode') === 'admin' ? 'admin' : 'normal';
  function icons() { window.lucide?.createIcons(); }
  function notice(message, bad = false) {
    const node = $('#game-notice'); node.textContent = message; node.dataset.error = String(bad); node.classList.add('visible');
    clearTimeout(notice.timer); notice.timer = setTimeout(() => node.classList.remove('visible'), bad ? 10000 : 5000);
  }
  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
    let data; try { data = await response.json(); } catch { throw Error('La liaison a été interrompue.'); }
    if (!response.ok) { const error = Object.assign(Error(data.error || 'Le jeu est indisponible.'), { status: response.status }); if (response.status === 401) location.assign('/auth/discord/start?next=' + encodeURIComponent(location.pathname + location.search)); throw error; }
    return data;
  }
  const endpoint = () => `/api/platform/adventure/${guild}/${mode}`;
  function button(label, action, input = {}, options = {}) {
    return `<button data-action="${escape(action)}" data-input="${escape(JSON.stringify(input))}" class="${options.primary ? 'primary' : ''}"${options.disabled ? ' disabled' : ''}${options.confirm ? ` data-confirm="${escape(options.confirm)}"` : ''}>${options.icon ? icon(options.icon) : ''}${escape(label)}</button>`;
  }
  function header(kicker, title, trailing = '') { return `<div class="view-heading"><div><p class="kicker">${escape(kicker)}</p><h1>${escape(title)}</h1></div>${trailing}</div>`; }
  function bar(label, value, max, type = '') { return `<div class="vital ${type}"><span>${escape(label)}<b>${number(value)} / ${number(max)}</b></span><meter min="0" max="${Math.max(1,max || 1)}" value="${Math.max(0,value || 0)}">${number(value)}</meter></div>`; }
  function cooldown(key) { const at = state.cooldowns.find(c => c.action === key)?.available_at || 0; return at > Date.now() ? `<span class="cooldown" data-until="${at}"></span>` : ''; }
  function drawHud() {
    const p = state.player;
    hud.innerHTML = p ? `<div class="identity"><img src="${escape(session.user.avatar)}" alt=""><div><b>${escape(session.user.displayName)}</b><span>${escape(state.catalog.classes[p.class_id]?.name || 'Classe à choisir')} · Niv. ${number(p.level)}</span></div></div>
      <div class="resources"><span>${icon('coins')}<b>${number(p.berries)}</b><small>Berrys</small></span><span>${icon('flag')}<b>${number(p.prime)}</b><small>Prime</small></span></div>
      <div class="hud-bars">${bar('Énergie',p.energy,p.max_energy,'energy')}${bar('Expérience',p.xp,p.nextXp,'xp')}</div>
      ${state.adminAvailable ? `<label class="mode-picker">Profil<select id="profile-mode"><option value="normal"${mode === 'normal' ? ' selected' : ''}>Normal</option><option value="admin"${mode === 'admin' ? ' selected' : ''}>Admin Mod</option></select></label>` : ''}` : '';
    $('#profile-mode')?.addEventListener('change', async event => { if (busy || pending) return; mode = event.target.value; updateUrl(); await load(true); });
  }
  function updateUrl() { history.replaceState(null, '', '/play?' + new URLSearchParams({ guild, mode })); }
  function onboard() {
    return `<section class="onboarding"><img src="${asset('island.webp')}" alt="Un navire accoste dans Grand Line"><div><p class="kicker">WARSNUTO GAME</p><h1>Le large t’appelle.</h1><p>${state.player ? 'Choisis ta voie.' : 'Ton personnage n’a pas encore embarqué sur ce serveur.'}</p>
      ${!state.player ? button('Embarquer', 'enrol', {}, {primary:true,icon:'ship'}) : `<div class="class-grid">${entries(state.catalog.classes).map(c => `<article><h2>${escape(c.name)}</h2><p>${escape(c.description)}</p><small>${escape(c.passive)}</small>${button('Choisir','class',{id:c.id},{primary:true})}</article>`).join('')}</div>`}</div></section>`;
  }
  function world() {
    const zones = entries(state.catalog.zones), selected = state.catalog.zones[zoneId] || zones.find(z => z.minLevel <= state.player.level) || zones[0]; zoneId = selected.id;
    const unlocked = selected.minLevel <= state.player.level || mode === 'admin';
    return header('LE LOG POSE','Le monde',button('Récompense quotidienne','daily',{}, {icon:'gift'}) + cooldown('daily')) +
      `<section class="world-atlas"><img class="atlas-underlay" src="${asset('world-map.jpg')}" alt="La carte des océans de One Piece"><canvas id="world-canvas" width="1200" height="520" aria-label="Itinéraire des îles de Grand Line"></canvas></section>
      <div class="world-bottom"><div class="island-detail"><span class="kicker">${escape(selected.saga)} · NIVEAU ${selected.minLevel}</span><h2>${escape(selected.name)}</h2><p>${unlocked ? 'Une nouvelle escale sur ta route.' : 'Cette île est encore hors de portée.'}</p>
      <dl><div><dt>Énergie</dt><dd>${selected.energyCost}</dd></div><div><dt>Berrys</dt><dd>${selected.berry.join(' – ')}</dd></div><div><dt>XP</dt><dd>${selected.xp.join(' – ')}</dd></div></dl>
      ${button(unlocked ? 'Explorer l’île' : `Niveau ${selected.minLevel} requis`,'explore',{id:selected.id},{primary:true,icon:unlocked?'compass':'lock-keyhole',disabled:!unlocked})}${cooldown('explore:'+selected.id)}</div>
      <div class="island-list" role="group" aria-label="Choisir une île">${zones.map(z=>`<button data-zone="${escape(z.id)}"${z.id===selected.id?' aria-pressed="true"':' aria-pressed="false"'}>${icon(z.minLevel > state.player.level && mode !== 'admin'?'lock-keyhole':'map-pin')}<span>${escape(z.name)}</span><small>${z.minLevel}</small></button>`).join('')}</div></div>`;
  }
  function paintMap() {
    const canvas = $('#world-canvas'); if (!canvas) return;
    const ctx = canvas.getContext('2d'), zones = entries(state.catalog.zones), cols = 9;
    const points = zones.map((z,i) => ({ z, x:76+(Math.floor(i/cols)%2 ? cols-1-i%cols : i%cols)*130, y:100+Math.floor(i/cols)*155 }));
    ctx.clearRect(0,0,1200,520); ctx.lineWidth=2; ctx.setLineDash([6,8]); ctx.strokeStyle='#e9ecdf99';
    ctx.beginPath(); points.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.stroke(); ctx.setLineDash([]);
    for (const {z,x,y} of points) {
      const open = z.minLevel <= state.player.level || mode==='admin', active=z.id===zoneId;
      ctx.fillStyle=active?'#f2c66c':open?'#7ddbc2':'#6a7279'; ctx.beginPath(); ctx.ellipse(x,y,active?20:13,active?14:9,-.3,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=active?'#fff2cb':'#d8eee2';ctx.lineWidth=active?3:1;ctx.stroke();
      ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.fillStyle=open?'#fff':'#b8c3c8';
      const words=z.name.split(' '); const lines=z.name.length>15?[words.slice(0,Math.ceil(words.length/2)).join(' '),words.slice(Math.ceil(words.length/2)).join(' ')]:[z.name];
      lines.forEach((line,i)=>ctx.fillText(line,x,y+32+i*16,122));
      if(!open){ctx.font='11px system-ui';ctx.fillText('Niv. '+z.minLevel,x,y-21);}
    }
    canvas.addEventListener('click', event=>{ const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)*1200/r.width,y=(event.clientY-r.top)*520/r.height;const point=points.find(p=>Math.hypot(p.x-x,p.y-y)<38);if(point){zoneId=point.z.id;render();audioScene();} });
  }
  function missions() { return header('CONTRATS','Missions') + `<div class="activity-grid">${entries(state.catalog.missions).map(m=>`<article class="activity"><div class="activity-icon">${icon(m.id==='chasse'?'crosshair':m.id==='tresor'?'gem':'scroll-text')}</div><h2>${escape(m.name)}</h2><p>${m.energyCost} énergie · ${Math.round(m.risk*100)} % de risque de base</p><dl><div><dt>Berrys</dt><dd>${m.berry.join(' – ')}</dd></div><div><dt>XP de base</dt><dd>${m.xp.join(' – ')}</dd></div></dl>${button('Accepter','mission',{id:m.id},{primary:true})}${cooldown('mission:'+m.id)}</article>`).join('')}</div>`; }
  function combatPanel(c) {
    const template=state.catalog.bosses[c.boss_id] || state.catalog.serverBosses[c.boss_id] || state.catalog.crewBosses[c.boss_id] || {name:c.boss_name};
    return `<section class="combat-arena" data-combat-status="${escape(c.status)}"><div class="arena-top"><span class="kicker">${c.scope==='server'?'RAID':'COMBAT'} · TOUR ${c.turn}</span><h2>${escape(template.name)}</h2><span class="battle-status">${c.status==='active'?'En cours':c.status==='victory'?'Victoire':c.status==='fled'?'Repli':'Combat terminé'}</span></div>
      <div class="fighters"><div class="fighter player-fighter"><img src="${escape(session.user.avatar)}" alt="${escape(session.user.displayName)}"><b>${escape(session.user.displayName)}</b>${bar('PV',c.player_hp,c.player_max_hp)}</div>
      <span class="duel-symbol">VS</span><div class="fighter enemy-fighter"><img src="${escape(state.catalog.bossImages?.[c.boss_id] || asset('enemy.png'))}" alt="${escape(template.name)}" data-fallback="boss"><b>${escape(template.name)}</b>${bar('PV',c.boss_hp,c.boss_max_hp,'enemy')}</div></div>
      <div class="combat-log" aria-live="polite">${escape(c.log).replace(/\n/g,'<br>')}</div>
      ${c.status==='active'&&!c.raid_battle_id?`<div class="combat-actions">${[['attack','Attaquer','sword'],['heavy','Coup lourd','flame'],['defend','Défendre','shield'],['heal','Potion','heart-pulse'],['flee','Fuir','door-open']].map(([action,label,ico])=>button(label,'combat',{scope:c.scope,sessionId:c.session_id||String(c.created_at),turn:c.turn,action},{primary:action==='attack',icon:ico,confirm:action==='flee'?'Abandonner ce combat ?':null})).join('')}</div>`:''}</section>`;
  }
  function bosses() {
    return header('LE CHAMP DE BATAILLE','Combats')+state.combats.filter(c=>!c.raid_battle_id).map(combatPanel).join('')+`<div class="boss-grid">${entries(state.catalog.bosses).map(b=>`<article class="boss-tile"><img src="${escape(state.catalog.bossImages?.[b.id] || asset('enemy.png'))}" loading="lazy" alt="${escape(b.name)}" data-fallback="boss"><div><small>NIVEAU ${b.minLevel||1}</small><h2>${escape(b.name)}</h2><p>${b.energyCost} énergie</p>${button('Affronter','boss.start',{id:b.id},{primary:true,disabled:state.player.level<(b.minLevel||1)&&mode!=='admin',icon:'swords'})}${cooldown('boss:'+b.id)}</div></article>`).join('')}</div>`;
  }
  function character() {
    const p=state.player,fruit=state.catalog.fruits[p.fruit_id];
    return header('TON PERSONNAGE',session.user.displayName)+`<section class="character-sheet"><img class="character-avatar" src="${escape(session.user.avatar)}" alt=""><div><p class="kicker">NIVEAU ${number(p.level)}</p><h2>${escape(state.catalog.classes[p.class_id]?.name)}</h2><p>${escape(state.catalog.classes[p.class_id]?.passive)}</p>${bar('Expérience',p.xp,p.nextXp,'xp')}<dl><div><dt>Vitalité maximale</dt><dd>${number(p.maxHp)}</dd></div><div><dt>Prime</dt><dd>${number(p.prime)}</dd></div><div><dt>Points de saison</dt><dd>${number(p.season_points)}</dd></div></dl></div></section>
      <section class="equipment"><h2>Équipement</h2><div class="equipment-slots">${[['Arme',p.equipped_weapon,'sword'],['Accessoire',p.equipped_accessory,'gem'],['Fruit',p.fruit_id,'cherry']].map(([label,id,ico])=>`<div>${icon(ico)}<span>${label}<b>${escape(state.catalog.items[id]?.name||state.catalog.fruits[id]?.name||'Aucun')}</b></span></div>`).join('')}</div>
      ${fruit?`<h3>${escape(fruit.name)}</h3><p>Maîtrise : ${number(p.fruit_mastery)} · Éveil : ${number(p.fruit_awakened)}</p><div class="actions">${button('Éveiller','fruit.awaken',{}, {icon:'sparkles',confirm:'Utiliser les ressources nécessaires à cet éveil ?'})}${button('Pouvoir du fruit','fruit.skill',{}, {icon:'zap'})}</div>`:''}</section>
      <details class="section-details"><summary>Changer de classe</summary><p>2 500 berrys. Expérience de classe divisée par deux ; délai de sept jours entre les changements.</p><div class="class-grid">${entries(state.catalog.classes).map(c=>`<article><h3>${escape(c.name)}</h3><p>${escape(c.passive)}</p>${button('Choisir','class',{id:c.id},{confirm:'Changer de classe pour '+c.name+' ?'})}</article>`).join('')}</div></details>`;
  }
  function inventory() {
    return header('TES TROUVAILLES','Inventaire',button('Identifier un fruit','fruit.identify',{}, {icon:'search'}))+`<div class="filter-bar"><label>${icon('search')}<input id="inventory-search" type="search" placeholder="Chercher un objet" aria-label="Chercher un objet"></label><select id="inventory-filter" aria-label="Type d’objet"><option value="">Tous les objets</option><option value="arme">Armes</option><option value="accessoire">Accessoires</option><option value="fruit">Fruits</option></select></div>
      <div class="item-grid">${state.inventory.map(i=>`<article class="item" data-item-name="${escape(i.name.toLocaleLowerCase('fr'))}" data-item-type="${escape(i.type)}"><div class="item-art">${icon(i.type==='arme'?'sword':i.type==='fruit'?'cherry':i.type==='accessoire'?'gem':'package')}<span>×${number(i.quantity)}</span></div><h2>${escape(i.name)}</h2><small>${escape(i.rarity)} · ${escape(i.type)}</small><p>${escape(i.description)}</p>
      ${i.type==='fruit'?button('Manger','fruit.eat',{id:i.item_id.slice(6)},{confirm:'Remplacer ton fruit actuel par '+i.name+' ?'}):button(i.type==='arme'||i.type==='accessoire'?'Équiper / retirer':'Utiliser','item.use',{id:i.item_id})}</article>`).join('')||'<p class="empty">Ton sac est vide.</p>'}</div>`;
  }
  function shop() {
    return header('LE PORT','Le marchand')+`<div class="activity-grid">${state.catalog.shop.map(id=>{const i=state.catalog.items[id];return `<article class="activity"><div class="activity-icon">${icon(i.type==='arme'?'sword':'package')}</div><h2>${escape(i.name)}</h2><p>${escape(i.description)}</p><b class="price">${number(state.player.class_id==='marchand'?Math.floor(i.price*.9):i.price)} berrys</b><form data-command="shop.buy"><input type="hidden" name="id" value="${escape(id)}"><label>Quantité<input name="quantity" type="number" min="1" max="100" value="1" required></label><button class="primary">${icon('shopping-bag')}Acheter</button></form></article>`;}).join('')}</div>
      <section class="sell-section"><h2>Vendre un objet</h2><form data-command="shop.sell"><label>Objet<select name="id" required>${state.inventory.filter(i=>i.sellPrice>0).map(i=>`<option value="${escape(i.item_id)}">${escape(i.name)} · ${number(i.sellPrice)} berrys / unité · ×${i.quantity}</option>`).join('')}</select></label><label>Quantité<input name="quantity" type="number" min="1" max="100" value="1" required></label><button>${icon('coins')}Vendre</button></form></section>`;
  }
  function voyage() {
    const v=state.voyage,stats=state.voyageStats,body=v?.status==='active'?`<div class="voyage-stats"><h2>Île ${v.stage}</h2>${bar('Coque',v.hp,v.max_hp)}<b>${number(v.cargo)} marques à bord</b><span>${v.camps_left} réparations</span></div><p class="voyage-log">${escape(v.log)}</p>
      <div class="actions">${v.phase==='route'?button('Cap prudent','voyage.advance',{run:v.run_id,revision:v.revision,route:'safe'},{primary:true,icon:'compass'})+button('Cap périlleux','voyage.advance',{run:v.run_id,revision:v.revision,route:'risk'},{icon:'flame'})+button('Revenir au port','voyage.bank',{run:v.run_id,revision:v.revision},{icon:'anchor',confirm:'Sécuriser ta cargaison et terminer la traversée ?'}):(()=>{const actions={combat:[['attack','Attaquer'],['heavy','Coup lourd'],['guard','Se protéger'],['escape','Fuir']],storm:[['brace','Replier les voiles'],['charge','Forcer le passage'],['detour','Contourner']],treasure:[['inspect','Inspecter'],['open','Ouvrir'],['leave','Laisser']],port:[['repair','Réparer'],['trade','Marchander'],['leave','Repartir']]};return (actions[v.encounter?.type]||[]).map(([action,label])=>button(label,'voyage.act',{run:v.run_id,revision:v.revision,action},{primary:true})).join('');})()}</div>`:button('Prendre la mer','voyage.start',{}, {primary:true,icon:'ship'});
    return header('AU-DELÀ DE L’HORIZON','Grand Line')+`<section class="voyage-scene"><img src="${asset('island.webp')}" alt="Un navire navigue au large d’une île de Grand Line"><div>${body}</div></section><section class="exchange-marks"><h2>Le comptoir des navigateurs</h2><p>${number(stats?.navigation_marks)} marques sécurisées · Record : île ${number(stats?.best_stage)}</p><div class="activity-grid">${state.catalog.exchanges.map(e=>`<article class="activity"><h3>${escape(e.name)}</h3><p>${number(e.cost)} marques</p>${button('Échanger','voyage.exchange',{id:e.id},{disabled:(stats?.navigation_marks||0)<e.cost})}</article>`).join('')}</div></section>`;
  }
  function userForm(action,label) {return `<form data-command="${action}"><label>ID Discord<input name="user" inputmode="numeric" pattern="[0-9]{17,20}" required></label><button>${escape(label)}</button></form>`;}
  function crew() {
    const c=state.crew;
    if(!c)return header('PAS DE CAPITAINE SANS ÉQUIPAGE','Équipage')+`<section class="crew-empty"><img src="${asset('island.webp')}" alt="Un équipage en mer"><div><h2>Rassemble ton équipage.</h2><form data-command="crew.create"><label>Nom de l’équipage<input name="name" minlength="3" maxlength="30" required></label><button class="primary">Créer · 5 000 berrys</button></form>${state.crewInvite?button('Accepter l’invitation','crew.accept',{}, {primary:true}):''}</div></section>`;
    return header('ÉQUIPAGE',c.name)+`<div class="crew-summary"><div><h2>Niveau ${c.level}</h2><p>Coffre : ${number(c.chest_berries)} berrys · Navire : ${number(c.ship_level)}</p></div><div class="actions">${button('Expédition','crew.expedition',{}, {primary:true,icon:'ship'})}${button('Boss d’équipage','crew.boss',{}, {icon:'swords'})}${button('Améliorer le navire','crew.upgrade',{}, {icon:'hammer',confirm:'Financer l’amélioration du navire avec les ressources de l’équipage ?'})}</div></div>
      <section><h2>Les membres</h2><ul class="crew-members">${state.crewMembers.map(m=>`<li><span>${escape(m.user_id)}</span><b>${m.role==='captain'?'Capitaine':'Membre'}</b></li>`).join('')}</ul></section>
      <section class="crew-tools"><div><h2>Coffre partagé</h2>${['deposit','withdraw'].map(action=>`<form data-command="crew.${action}"><label>Montant<input type="number" name="amount" min="1" max="1000000000" required></label><button>${action==='deposit'?'Déposer':'Retirer'}</button></form>`).join('')}</div><div><h2>Gestion de l’équipage</h2>${userForm('crew.invite','Inviter')}${c.member_role==='captain'?userForm('crew.kick','Exclure')+userForm('crew.transfer','Transmettre le commandement'):''}${button('Quitter l’équipage','crew.leave',{}, {confirm:'Quitter cet équipage ?'})}</div></section>`;
  }
  function raids() {
    const event=state.event;
    return header('FACE AUX EMPEREURS','Raids')+`${event?`<section class="event-boss"><h2>${escape(event.name)}</h2><p>Événement en cours</p>${button('Affronter en solo','server.start',{bossId:event.boss_id,createdAt:event.created_at},{primary:true,icon:'swords'})}</section>`:'<p class="empty">Aucun boss serveur en cours.</p>'}`+
      state.raids.map(r=>`<article class="raid"><h2>${escape(state.catalog.serverBosses[r.boss_id]?.name||r.boss_id)}</h2><p>${r.kind==='crew'?'Équipage':'Groupe d’amis'} · ${escape(r.status)} · Tour ${r.round}</p>${bar('Boss',r.hp,r.max_hp,'enemy')}
      <ul class="crew-members">${r.members.map(m=>`<li>${escape(m.user_id)}<span>${m.ready?'Prêt':'En préparation'} · ${number(m.hp)} PV${m.user_id===r.current_user_id?' · À son tour':''}</span></li>`).join('')}</ul><p>${escape(r.log).replace(/\n/g,'<br>')}</p><div class="actions">${(r.status==='lobby'?[['join','Rejoindre'],['ready','Prêt / pas prêt'],['leave','Quitter'],...(r.owner_id===state.actor?[['start','Lancer'],['cancel','Annuler']]:[])]:r.status==='active'&&r.current_user_id===state.actor?[['attack','Attaquer'],['heavy','Coup lourd'],['defend','Défendre'],['heal','Soin']]:[]).map(([action,label])=>button(label,'raid.act',{id:r.thread_id,revision:r.revision,action},{primary:true})).join('')}</div></article>`).join('') +
      `<section class="event-history"><h2>Événements saisonniers</h2><p>Halloween : ${state.halloween.config.enabled?'configuré':'fermé'}. Les objets déjà obtenus sont conservés.</p></section>`;
  }
  function trades() {
    return header('LE MARCHÉ DES AVENTURIERS','Échanges')+`<section class="trade-new">${userForm('trade.create','Proposer un échange')}</section>`+state.trades.map(t=>`<article class="trade"><div class="trade-heading"><h2>${escape(t.initiator_id)} ↔ ${escape(t.target_id)}</h2><span>${escape(t.status)}</span></div><ul>${t.offers.map(o=>`<li><b>${escape(o.user_id)}</b> · ${number(o.quantity)} ${escape(o.item_id==='berries'?'berrys':state.catalog.items[o.item_id]?.name||state.catalog.fruits[o.item_id.replace('fruit:','')]?.name||o.item_id)}${o.user_id===state.actor&&t.status==='open'?button('Retirer','trade.remove',{id:t.trade_id,item:o.item_id},{icon:'x'}):''}</li>`).join('')||'<li>Aucun objet proposé.</li>'}</ul>${t.status==='open'?`<form data-command="trade.offer"><input type="hidden" name="id" value="${escape(t.trade_id)}"><label>À proposer<select name="item"><option value="berries">Berrys</option>${state.inventory.map(i=>`<option value="${escape(i.item_id)}">${escape(i.name)} · ×${i.quantity}</option>`).join('')}</select></label><label>Quantité<input name="quantity" type="number" min="1" max="1000000000" required value="1"></label><button>Ajouter à l’offre</button></form><p>Offres validées : ${t.initiator_ready?'oui':'non'} / ${t.target_ready?'oui':'non'} · Confirmations : ${t.initiator_confirmed?'oui':'non'} / ${t.target_confirmed?'oui':'non'}</p><div class="actions">${button('Valider mon offre','trade.ready',{id:t.trade_id})}${button('Confirmer l’échange','trade.confirm',{id:t.trade_id},{primary:true,confirm:'Confirmer le transfert de tous les objets et berrys affichés ?'})}${button('Annuler','trade.cancel',{id:t.trade_id})}</div>`:''}</article>`).join('');
  }
  function guide() {return header('LE CARNET DE BORD','Le guide')+`<section class="guide"><h2>Les classes</h2><div class="class-grid">${entries(state.catalog.classes).map(c=>`<article><h3>${escape(c.name)}</h3><p>${escape(c.passive)}</p><small>${escape(c.specialty)}</small></article>`).join('')}</div><h2>Les fruits</h2><div class="activity-grid">${entries(state.catalog.fruits).map(f=>`<article><h3>${escape(f.name)}</h3><p>${escape(f.description||f.effect||'')}</p><small>${escape(f.rarity)}</small></article>`).join('')}</div><h2>Historique récent</h2><ol class="history">${state.history.map(h=>`<li><time>${new Date(h.created_at).toLocaleString('fr-FR')}</time><span>${escape(h.reason)}</span><b>${h.amount>0?'+':''}${number(h.amount)}</b></li>`).join('')}</ol></section>`;}
  function render() {
    if(!state)return;
    drawHud(); const renderers={world,missions,bosses,character,inventory,shop,voyage,crew,raids,trades,guide};
    main.innerHTML=!state.player||!state.player.class_id?onboard():renderers[view](); main.setAttribute('aria-busy','false');main.dataset.view=view;
    document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-current',button.dataset.view===view?'page':'false'));
    main.querySelectorAll('img[data-fallback]').forEach(img=>img.addEventListener('error',()=>{img.removeAttribute('data-fallback');img.src=asset('enemy.png');},{once:true}));
    $('#inventory-search')?.addEventListener('input',filterInventory);$('#inventory-filter')?.addEventListener('change',filterInventory);
    icons();paintMap();tick();
  }
  function filterInventory(){const query=$('#inventory-search').value.toLocaleLowerCase('fr'),type=$('#inventory-filter').value;document.querySelectorAll('[data-item-name]').forEach(node=>node.hidden=!node.dataset.itemName.includes(query)||Boolean(type&&node.dataset.itemType!==type));}
  function tick(){document.querySelectorAll('[data-until]').forEach(node=>{const seconds=Math.max(0,Math.ceil((Number(node.dataset.until)-Date.now())/1000));node.textContent=seconds?`Disponible dans ${Math.floor(seconds/3600)?Math.floor(seconds/3600)+' h ':''}${Math.floor(seconds%3600/60)} min ${seconds%60} s`:'Disponible';});}
  function audioScene(){const combat=state?.combats.some(c=>c.status==='active');const scene=view==='bosses'&&combat?'boss':view==='raids'?'boss':view==='voyage'?(state?.voyage?.encounter?.type==='combat'?'battle':'sea'):view==='world'&&state?.catalog.zones[zoneId]?.minLevel>=20?'storm':view==='shop'||view==='crew'?'harbour':'theme';window.WarsAdventureAudio?.scene(scene);}
  async function load(showError=false){
    if(!guild||busy||pending)return;const gen=++loadGeneration;
    try{const data=await api(endpoint());if(gen!==loadGeneration)return;
      // Discord remains the authority for the active normal/Admin Mod profile.
      // Align the browser before any action can use a stale profile partition.
      if (data.activeMode && data.activeMode !== mode) { mode = data.activeMode; updateUrl(); return load(showError); }
      state=data;render();audioScene();}
    catch(error){if(showError||!state){main.innerHTML=`<section class="opening"><h1>Aventure indisponible</h1><p>${escape(error.message)}</p><button id="retry-load">${icon('refresh-cw')}Réessayer</button><a href="/profile">Mon espace</a></section>`;main.setAttribute('aria-busy','false');$('#retry-load').onclick=()=>load(true);icons();}else notice(error.message,true);}
  }
  async function confirm(message){const dialog=$('#game-confirm');$('#game-confirm-text').textContent=message;dialog.returnValue='';dialog.showModal();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));}
  async function mutate(action,input,confirmText){
    if(busy||!state)return;if(pending)return notice('Vérifie d’abord le résultat de l’action précédente.',true);
    if(confirmText&&!await confirm(confirmText))return;
    pending={url:endpoint(),body:{operationId:crypto.randomUUID(),revision:state.revision,action,input}};await sendPending();
  }
  async function sendPending(){
    if(!pending||busy)return;busy=true;document.body.dataset.busy='true';main.setAttribute('aria-busy','true');
    try{const data=await api(pending.url,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf},body:JSON.stringify(pending.body)});
      const action=pending.body.action;pending=null;state=data;if(action==='boss.start'||action==='crew.boss'||action==='combat')view='bosses';
      render();audioScene();const event=data.result.victory?'victory':data.result.failed?'defeat':action==='combat'?'attack':action==='explore'?'discovery':action==='item.use'?'equip':'reward';
      window.WarsAdventureAudio?.effect(event);notice(data.result.message);if(action==='combat')main.classList.add('strike');setTimeout(()=>main.classList.remove('strike'),350);
    }catch(error){window.WarsAdventureAudio?.effect('error');
      if(error.status&&error.status<500){pending=null;notice(error.message,true);busy=false;await load();}
      else{notice(error.message+' Le résultat reste à vérifier.',true);main.insertAdjacentHTML('afterbegin','<div class="uncertain"><b>Connexion interrompue.</b><button id="retry-action">Vérifier l’action</button></div>');$('#retry-action').onclick=sendPending;}
    }finally{busy=false;delete document.body.dataset.busy;main.setAttribute('aria-busy','false');icons();}
  }
  main.addEventListener('click',event=>{const action=event.target.closest('[data-action]'),zone=event.target.closest('[data-zone]');if(action)mutate(action.dataset.action,JSON.parse(action.dataset.input),action.dataset.confirm);if(zone){zoneId=zone.dataset.zone;render();audioScene();window.WarsAdventureAudio?.effect('navigate');}});
  main.addEventListener('submit',event=>{const form=event.target.closest('[data-command]');if(!form)return;event.preventDefault();const input=Object.fromEntries(new FormData(form));for(const key of ['quantity','amount'])if(key in input)input[key]=Number(input[key]);mutate(form.dataset.command,input,form.dataset.command==='crew.transfer'?'Transmettre le commandement de l’équipage ?':null);});
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{if(busy||pending)return;view=button.dataset.view;render();audioScene();window.WarsAdventureAudio?.effect('navigate');main.focus({preventScroll:true});}));
  $('#game-refresh').onclick=()=>pending?sendPending():load(true);
  $('#game-guild').onchange=async event=>{if(busy||pending){event.target.value=guild;return;}guild=event.target.value;zoneId='';state=null;updateUrl();await load(true);};
  $('#game-audio').onclick=()=>$('#audio-dialog').showModal();
  async function boot(){try{
    session=await api('/api/platform/session');if(!session.user){location.assign('/auth/discord/start?next='+encodeURIComponent(location.pathname+location.search));return;}
    window.WarsAdventureAudio?.init(session.user.id);
    const servers=await api('/api/platform/servers'),available=servers.guilds.filter(g=>g.bots.some(b=>b.id==='game'));
    $('#game-guild').innerHTML=available.map(g=>`<option value="${escape(g.id)}">${escape(g.name)}</option>`).join('');
    if(!available.some(g=>g.id===guild))guild=available[0]?.id||'';$('#game-guild').value=guild;
    if(!guild){main.innerHTML='<section class="opening"><h1>Aucun serveur Game accessible.</h1><a href="/servers">Mes serveurs</a></section>';return;}
    updateUrl();await load(true);poll=setInterval(()=>{if(!document.hidden&&!main.querySelector('input:focus,select:focus,textarea:focus')&&!$('#game-confirm').open&&!$('#audio-dialog').open)load();},10000);setInterval(tick,1000);
  }catch(error){notice(error.message,true);main.setAttribute('aria-busy','false');}}
  window.addEventListener('pagehide',()=>{clearInterval(poll);window.WarsAdventureAudio?.stop();});icons();boot();
})();
