const { test } = require('node:test');
const assert = require('node:assert/strict');
const combat = require('../adventure-combat.js');
const input = () => ({
  combat: { scope: 'solo', boss_id: 'buggy', status: 'active', turn: 1, session_id: 's', player_hp: 80, player_max_hp: 100, boss_hp: 300, boss_max_hp: 300 },
  catalog: { classes: {}, bosses: { buggy: { name: 'Buggy', minLevel: 2 } }, serverBosses: {}, crewBosses: {}, items: {}, fruits: {} },
  player: { class_id: 'pirate', level: 2 }, user: { displayName: 'Soli' }, inventory: [],
  button: (label, action, input, options) => `<button${options.disabled ? ' disabled' : ''}>${label}</button>`
});
test('combat renderer only exposes existing engine actions and safe text', () => {
  const state = input(); state.user.displayName = '<img src=x onerror=alert(1)>';
  const html = combat.render(state);
  assert.ok(html.includes('harbour.webp')); assert.ok(html.includes('adventurer.webp'));
  assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img src=x'));
  for (const label of ['Attaque', 'Coup lourd', 'Défense', 'Potion', 'Repli']) assert.ok(html.includes(label));
  assert.ok(html.includes('<button disabled>Potion')); assert.ok(!html.includes('data-target='));
});
test('potion availability and outcome use engine state, not invented rewards', () => {
  const state = input(); state.catalog.classes = {};
  state.inventory = [{ item_id: 'potion_soin', quantity: 1 }];
  assert.ok(combat.render(state).includes('<button>Potion'));
  state.combat.status = 'victory'; state.result = { berries: 79, xp: 11, prime: 0 };
  const html = combat.render(state); assert.ok(html.includes('79')); assert.ok(!html.includes('battle-actions'));
});
test('animation preferences are bounded and inaccessible local storage is harmless', () => {
  const director = combat.createDirector({ storage: { getItem() { throw Error('Denied'); }, setItem() { throw Error('Denied'); } } });
  director.setSpeed(2); assert.equal(director.speed, 2);
  director.setSpeed(100); assert.equal(director.speed, 1);
  director.setSpeed(0); assert.equal(director.speed, 0); director.cancel();
});
test('replayed receipts never animate or play audio a second time', async () => {
  let queried = false;
  const director = combat.createDirector();
  await director.play({ querySelectorAll() { queried = true; throw Error('Replay must not access DOM'); } }, { id: 'op' }, { replayed: true });
  assert.equal(queried, false);
});
