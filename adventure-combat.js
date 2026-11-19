(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WarsAdventureCombat = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const format = value => new Intl.NumberFormat('fr-FR').format(Number(value) || 0);
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const labels = { active: 'À toi de jouer', victory: 'Victoire', defeat: 'Défaite', fled: 'Repli' };
  const moves = [
    ['attack', 'Attaque', 'sword', 'Une attaque normale.'],
    ['heavy', 'Coup lourd', 'swords', 'Une frappe plus puissante, qui peut manquer sa cible.'],
    ['defend', 'Défense', 'shield', 'Attaque prudemment et réduit la riposte.'],
    ['heal', 'Potion', 'heart-pulse', 'Consomme une potion de soin. Une seule par combat.'],
    ['flee', 'Repli', 'door-open', 'Quitte ce combat. Le délai de combat reste actif.']
  ];
  function hp(side, value, max) {
    return `<div class="battle-vital" data-hp="${side}"><div><span>PV</span><b>${format(value)} / ${format(max)}</b></div><meter aria-label="PV ${side === 'player' ? 'du personnage' : 'de l’adversaire'}" min="0" max="${Math.max(1, Number(max) || 1)}" value="${Math.max(0, Number(value) || 0)}"></meter></div>`;
  }
  function render({ combat: c, catalog, player, user, inventory, button, result, history = [] }) {
    const boss = catalog.bosses[c.boss_id] || catalog.serverBosses[c.boss_id] || catalog.crewBosses[c.boss_id] || { name: c.boss_name || c.boss_id };
    const active = c.status === 'active', win = c.status === 'victory';
    const canHeal = !c.potion_used && c.player_hp < c.player_max_hp && inventory.some(i => i.item_id === 'potion_soin' && i.quantity > 0);
    const image = catalog.bossImages?.[c.boss_id] || '/assets/adventure/enemy.png';
    const equipment = [catalog.items[player.equipped_weapon]?.name, catalog.fruits[player.fruit_id]?.name].filter(Boolean);
    return `<section class="battle" data-battle="${escape(c.scope)}" data-status="${escape(c.status)}" aria-label="Combat contre ${escape(boss.name)}">
      <header class="battle-heading"><div><span class="kicker">${c.scope === 'solo' ? 'DUEL' : c.scope === 'crew' ? 'ÉQUIPAGE' : 'BOSS SERVEUR'}</span><h2>${escape(boss.name)}</h2></div><div class="battle-turn"><span>Tour ${format(c.turn)}</span><b data-battle-status>${escape(labels[c.status] || 'Combat terminé')}</b></div></header>
      <div class="battle-stage"><img class="battle-scenery" src="/assets/adventure/rpg/harbour.webp" alt="Un quai ouvert sur la mer, terrain de ce duel" fetchpriority="high">
        <div class="battle-nameplate player-nameplate"><strong>${escape(user.displayName)}</strong><small>${escape(catalog.classes[player.class_id]?.name || 'Aventurier')} · Niv. ${format(player.level)}</small>${hp('player', c.player_hp, c.player_max_hp)}</div>
        <div class="battle-nameplate enemy-nameplate"><strong>${escape(boss.name)}</strong><small>${boss.minLevel ? 'Niv. ' + format(boss.minLevel) : 'Adversaire'} · Cible unique</small>${hp('enemy', c.boss_hp, c.boss_max_hp)}</div>
        <figure class="battle-actor battle-player" data-fighter="player"><img src="/assets/adventure/rpg/adventurer.webp" alt="Ton aventurier, sabre en main"><figcaption>${escape(user.displayName)}</figcaption><output class="battle-number" aria-hidden="true"></output></figure>
        <figure class="battle-actor battle-enemy" data-fighter="enemy"><img src="${escape(image)}" alt="${escape(boss.name)}" data-fallback="boss"><figcaption>${escape(boss.name)}</figcaption><output class="battle-number" aria-hidden="true"></output></figure>
        <div class="battle-impact" aria-hidden="true"></div><p class="battle-caption" aria-live="polite">${active ? 'Choisis ton action.' : escape(labels[c.status] || 'Combat terminé')}</p>
      </div>
      <div class="battle-console"><div class="battle-toolbar"><span>${equipment.length ? escape(equipment.join(' · ')) : 'Combat au tour par tour'}</span><label>Animations<select data-battle-speed aria-label="Vitesse des animations"><option value="1">Normales</option><option value="2">Rapides ×2</option><option value="0">Instantanées</option></select></label></div>
      ${active && !c.raid_battle_id ? `<div class="battle-actions">${moves.map(([action, label, ico, hint]) => `<div class="battle-move">${button(label, 'combat', { scope: c.scope, sessionId: c.session_id || String(c.created_at), turn: c.turn, action }, { primary: action === 'attack', icon: ico, disabled: action === 'heal' && !canHeal, confirm: action === 'flee' ? 'Abandonner ce combat ?' : null })}<small>${escape(action === 'heal' && !canHeal ? c.potion_used ? 'Potion déjà utilisée.' : c.player_hp >= c.player_max_hp ? 'PV au maximum.' : 'Aucune potion.' : hint)}</small></div>`).join('')}</div>` : ''}
      ${!active ? `<div class="battle-outcome" role="status"><h3>${icon(win ? 'trophy' : c.status === 'fled' ? 'anchor' : 'flag')} ${escape(labels[c.status] || 'Combat terminé')}</h3><p>${win ? 'Récompenses enregistrées dans ta progression.' : 'Le résultat de ce combat a été enregistré.'}</p>${result ? `<dl>${[['Berrys', result.berries], ['XP', result.xp], ['Prime', result.prime]].filter(([, value]) => value !== undefined).map(([label, value]) => `<div><dt>${label}</dt><dd>${format(value)}</dd></div>`).join('')}</dl><ul>${[result.foundItem, result.foundBossItem, result.foundBossFruit].filter(Boolean).map(id => `<li>${escape(catalog.items[id]?.name || catalog.fruits[id?.replace('fruit:', '')]?.name || id)}</li>`).join('')}</ul>` : ''}</div>` : ''}
      <details class="battle-journal"><summary>${icon('scroll-text')} Journal du combat</summary>${(history.length ? [...history].reverse().map(r => r.battle.after.log) : [c.log]).map(log => `<p>${escape(log).replace(/\n/g, '<br>')}</p>`).join('')}</details></div></section>`;
  }
  function createDirector({ audio, reducedMotion = () => false, storage = null } = {}) {
    let generation = 0, speed = 1;
    const seen = new Set();
    try { const value = Number(storage?.getItem('warsnuto:combat:speed') ?? 1); if ([0, 1, 2].includes(value)) speed = value; } catch {}
    const setSpeed = value => { speed = [0, 1, 2].includes(Number(value)) ? Number(value) : 1; try { storage?.setItem('warsnuto:combat:speed', String(speed)); } catch {} };
    async function play(container, battle, { replayed = false } = {}) {
      if (!battle || replayed || seen.has(battle.id)) return;
      seen.add(battle.id); if (seen.size > 80) seen.delete(seen.values().next().value);
      const token = ++generation;
      const arena = [...container.querySelectorAll('[data-battle]')].find(node => node.dataset.battle === battle.after.scope);
      if (!arena) return;
      const fast = !speed || reducedMotion(), wait = ms => new Promise(resolve => setTimeout(resolve, fast ? 0 : ms / speed));
      const caption = arena.querySelector('.battle-caption');
      const animate = (target, name) => { if (!fast) arena.querySelector(`[data-fighter="${target}"]`)?.classList.add(name); };
      const health = (target, state) => {
        const value = state[target === 'player' ? 'player_hp' : 'boss_hp'];
        const max = state[target === 'player' ? 'player_max_hp' : 'boss_max_hp'];
        const node = arena.querySelector(`[data-hp="${target}"]`);
        node.querySelector('meter').value = value;
        node.querySelector('b').textContent = `${format(value)} / ${format(max)}`;
      };
      const impact = target => {
        const event = battle.events.find(e => e.target === target);
        if (!event) return;
        const output = arena.querySelector(`[data-fighter="${target}"] output`);
        output.textContent = event.delta ? `${event.delta > 0 ? '+' : ''}${format(event.delta)} PV` : battle.missed && target === 'enemy' ? 'Raté' : '';
        output.dataset.heal = String(event.delta > 0);
        if (event.delta) { animate(target, 'receiving'); audio?.effect(event.delta > 0 ? 'heal' : 'impact'); }
        health(target, battle.after);
      };
      try {
        arena.dataset.animating = 'true';
        for (const target of ['player', 'enemy']) health(target, battle.before || battle.after);
        caption.textContent = ({ attack: 'Attaque !', heavy: 'Coup lourd !', defend: 'En garde.', heal: 'Potion de soin.', flee: 'Repli au port.' })[battle.action] || 'Résolution du tour';
        await wait(130); if (token !== generation) return;
        animate('player', battle.action === 'defend' ? 'guarding' : battle.action === 'heal' ? 'healing' : 'attacking');
        audio?.effect(battle.action === 'heal' ? 'heal' : battle.action === 'defend' ? 'guard' : 'attack');
        await wait(260); if (token !== generation) return;
        impact('enemy');
        await wait(250); if (token !== generation) return;
        if (battle.action !== 'flee' && battle.after.boss_hp > 0) { animate('enemy', 'attacking'); await wait(200); if (token !== generation) return; }
        impact('player');
        await wait(260); if (token !== generation) return;
        const outcome = battle.after.status;
        if (outcome !== 'active') { animate(outcome === 'victory' ? 'enemy' : 'player', 'vanquished'); audio?.effect(outcome === 'victory' ? 'victory' : 'defeat'); }
      } finally {
        if (token === generation) {
          for (const target of ['player', 'enemy']) health(target, battle.after);
          delete arena.dataset.animating;
          caption.textContent = labels[battle.after.status] || 'Tour résolu';
          arena.querySelectorAll('.attacking,.receiving,.guarding,.healing').forEach(node => node.classList.remove('attacking', 'receiving', 'guarding', 'healing'));
        }
      }
    }
    return { play, setSpeed, get speed() { return speed; }, cancel() { generation++; } };
  }
  return { render, createDirector };
});
