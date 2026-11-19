// Opt-in integration: real Game modules, exclusively a fresh temporary database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

test('RPG presentation preserves the real Game engine and atomic rewards', { skip: !process.env.WARSNUTO_GAME_TEST_ROOT }, async t => {
  assert.equal(process.env.NODE_ENV === 'production', false, 'Never run integration fixtures in production mode');
  const root = fs.realpathSync(process.env.WARSNUTO_GAME_TEST_ROOT);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'warsnuto-rpg-engine-'));
  process.env.GAME_DATA_DIR = directory;
  const load = Module.createRequire(path.join(root, 'src', 'webAdventure.js'));
  const store = load('./database'), game = load('./gameService'), catalog = load('./gameData');
  const adapter = new Module(path.join(root, 'src', '__rpg_test__.js'));
  adapter.filename = path.join(root, 'src', '__rpg_test__.js');
  adapter.paths = Module._nodeModulePaths(path.join(root, 'src'));
  adapter._compile(fs.readFileSync(path.join(__dirname, '../ops/bot-config/webAdventure.cjs'), 'utf8'), adapter.filename);
  const create = () => adapter.exports.createWebAdventure({ store, game, catalog, voyage: load('./infiniteVoyage'), halloween: load('./halloween'), enabled: true });
  let bridge = create();
  const guild = '100000000000000001', user = '100000000000000002';
  const act = (action, input = {}, override = {}) => bridge.execute(guild, user, 'normal', { operationId: randomUUID(), revision: bridge.snapshot(guild, user).revision, action, input, ...override });
  const active = () => bridge.snapshot(guild, user).combats.find(c => c.scope === 'solo');
  const turn = action => { const c = active(); return act('combat', { scope: c.scope, sessionId: c.session_id || String(c.created_at), turn: c.turn, action }); };
  const start = () => { store.db.prepare('DELETE FROM cooldowns WHERE guild_id=? AND user_id=?').run(guild, user); act('boss.start', { id: 'bandit_port' }); };
  try {
    await t.test('enrolment and stale revisions', () => {
      act('enrol'); act('class', { id: 'pirate' });
      store.db.prepare('UPDATE players SET level=2,energy=100,max_energy=100 WHERE guild_id=? AND user_id=?').run(guild, user);
      assert.throws(() => act('daily', {}, { revision: 'f'.repeat(64) }), error => error.status === 409);
      assert.equal(bridge.snapshot(guild, user).player.class_id, 'pirate');
    });
    await t.test('turns contain engine states and can resume with a fresh bridge', () => {
      start(); const before = active(); const data = turn('defend');
      assert.equal(data.result.battle.before.player_hp, before.player_hp);
      assert.equal(data.result.battle.after.turn, before.turn + 1);
      assert.equal(data.result.battle.events[0].delta, data.result.battle.after.boss_hp - before.boss_hp);
      bridge = create(); assert.equal(active().turn, before.turn + 1);
    });
    await t.test('victory survives deleted sessions and cannot grant twice', () => {
      store.db.prepare("UPDATE combat_sessions SET boss_hp=1 WHERE guild_id=? AND user_id=? AND scope='solo'").run(guild, user);
      const c = active(), body = { operationId: randomUUID(), revision: bridge.snapshot(guild, user).revision, action: 'combat', input: { scope: 'solo', sessionId: c.session_id, turn: c.turn, action: 'attack' } };
      const first = bridge.execute(guild, user, 'normal', body);
      assert.equal(first.result.victory, true); assert.equal(first.result.battle.after.status, 'victory');
      assert.equal(active(), undefined);
      const money = first.player.berries, xp = first.player.xp;
      const replay = bridge.execute(guild, user, 'normal', body);
      assert.equal(replay.replayed, true); assert.equal(replay.player.berries, money); assert.equal(replay.player.xp, xp);
      assert.deepEqual(replay.result, JSON.parse(JSON.stringify(first.result)));
      assert.equal(create().snapshot(guild, user).recentBattles[0].battle.after.status, 'victory');
      assert.throws(() => bridge.execute(guild, user, 'normal', { ...body, operationId: randomUUID() }), error => error.status === 409);
    });
    await t.test('potion is consumed once and its state is authoritative', () => {
      start(); store.addInventory(guild, user, 'potion_soin', 2);
      const potionsBefore = store.getInventory(guild, user).find(i => i.item_id === 'potion_soin').quantity;
      store.db.prepare("UPDATE combat_sessions SET player_hp=70 WHERE guild_id=? AND user_id=? AND scope='solo'").run(guild, user);
      const result = turn('heal'); assert.equal(result.result.battle.after.potion_used, 1);
      assert.equal(store.getInventory(guild, user).find(i => i.item_id === 'potion_soin').quantity, potionsBefore - 1);
      assert.throws(() => turn('heal'), error => error.status === 400);
      turn('flee'); assert.equal(active(), undefined);
    });
    await t.test('defeat remains visible after refresh without new rewards', () => {
      start(); store.db.prepare("UPDATE combat_sessions SET player_hp=1,turn=30 WHERE guild_id=? AND user_id=? AND scope='solo'").run(guild, user);
      const result = turn('defend'); assert.equal(result.result.victory, false); assert.equal(result.result.finished, true);
      assert.notEqual(result.result.battle.after.status, 'active');
      assert.equal(active(), undefined); assert.equal(create().snapshot(guild, user).recentBattles[0].finished, true);
    });
    await t.test('the isolated database can be backed up and opened intact', async () => {
      const backup = path.join(directory, 'verified-copy.sqlite'); await store.db.backup(backup);
      const Database = load('better-sqlite3'); const copy = new Database(backup, { readonly: true });
      try { assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok'); assert.ok(copy.prepare('SELECT COUNT(*) n FROM adventure_web_receipts').get().n > 0); }
      finally { copy.close(); }
    });
    await t.test('Admin Mod stays isolated and stale browser URLs follow the active Discord mode', () => {
      const master = load('./gameMaster'); store.addGameAdmins(guild, [user], user);
      const normalMoney = bridge.snapshot(guild, user).player.berries;
      assert.equal(master.setGameMasterMode(guild, user, 'on').ok, true);
      const admin = bridge.snapshot(guild, user, 'normal');
      assert.equal(admin.mode, 'admin'); assert.equal(admin.recentBattles.length, 0);
      act('enrol');
      assert.equal(store.getPlayer(guild, user).berries, normalMoney);
      assert.equal(master.setGameMasterMode(guild, user, 'off').ok, true);
      assert.equal(bridge.snapshot(guild, user, 'admin').mode, 'normal');
      assert.equal(bridge.snapshot(guild, user).player.berries, normalMoney);
    });
    const worker = body => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, 'adventure-engine-worker.cjs')], { env: { ...process.env, NODE_ENV: 'test', WARSNUTO_ISOLATED_TEST: '1' }, windowsHide: true });
      let output = '', errors = '';
      child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { errors += data; });
      child.on('error', reject); child.on('exit', code => { if (code) return reject(Error(errors)); try { resolve(JSON.parse(output)); } catch (error) { reject(error); } });
      child.stdin.end(JSON.stringify({ guild, user, body }));
    });
    await t.test('two devices cannot commit two actions for one turn', async () => {
      start(); store.db.prepare("UPDATE combat_sessions SET boss_hp=1000000,boss_max_hp=1000000,player_hp=1000000,player_max_hp=1000000 WHERE guild_id=? AND user_id=? AND scope='solo'").run(guild, user);
      const c = active(), revision = bridge.snapshot(guild, user).revision;
      const body = { revision, action: 'combat', input: { scope: 'solo', sessionId: c.session_id, turn: c.turn, action: 'defend' } };
      const results = await Promise.all([worker({ ...body, operationId: randomUUID() }), worker({ ...body, operationId: randomUUID() })]);
      assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.find(r => !r.ok).status, 409);
      assert.equal(active().turn, c.turn + 1);
    });
    await t.test('two devices retrying the same operation share one receipt', async () => {
      const c = active(); const body = { operationId: randomUUID(), revision: bridge.snapshot(guild, user).revision, action: 'combat', input: { scope: 'solo', sessionId: c.session_id, turn: c.turn, action: 'defend' } };
      const results = await Promise.all([worker(body), worker(body)]);
      assert.ok(results.every(r => r.ok)); assert.equal(results.filter(r => r.replayed).length, 1);
      assert.equal(active().turn, c.turn + 1);
      assert.equal(store.db.prepare('SELECT COUNT(*) n FROM adventure_web_receipts WHERE operation_id=?').get(body.operationId).n, 1);
      turn('flee');
    });
  } finally { store.db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
