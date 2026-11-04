const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, ids } = require('./helpers.cjs');
const { DEFAULTS, normalizePreferences, validatePreferences } = require('../server/preferences.cjs');
const { createBotConfigFixture, guildId } = require('./bot-config-fixture.cjs');
const { createProtectProfile } = require('../ops/bot-config/webProtectProfile.cjs');
const { DatabaseSync } = require('node:sqlite');

test('legacy and corrupt preferences normalize to safe defaults', () => {
  assert.deepEqual(normalizePreferences('{bad json'), DEFAULTS);
  assert.deepEqual(normalizePreferences('{"reducedMotion":true}'), { ...DEFAULTS, reducedMotion: true });
  assert.deepEqual(normalizePreferences({ theme: '<script>', density: 'wide', hideBalances: 'true', role: 'OWNER' }), DEFAULTS);
  for (const input of [{}, { theme: 'LIGHT' }, { theme: 'url(evil)' }, { density: [] }, { autoRefresh: 0 }, { hideBalances: 'false' }, { role: 'OWNER' }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => validatePreferences(input), { status: 400 });
});

test('preferences persist for the own account, merge against latest storage and retain security expiry', async t => {
  const f = fixture(); t.after(() => f.close()); await f.listen(); const user = await f.login('USER');
  const path = '/api/platform/me/preferences';
  assert.equal((await f.request(path, user, { theme: 'light', density: 'compact', reducedMotion: true, autoRefresh: false, hideBalances: true, showProfileBanner: false }, 'PATCH')).status, 200);
  assert.equal((await f.request(path, user, { theme: 'system' }, 'PATCH')).status, 200);
  const saved = (await (await f.request('/api/platform/me', user)).json()).user.preferences;
  assert.deepEqual(saved, { theme: 'system', density: 'compact', reducedMotion: true, autoRefresh: false, hideBalances: true, showProfileBanner: false });
  assert.deepEqual((await (await f.request('/api/platform/session', await f.login('OWNER'))).json()).user.preferences, DEFAULTS);
  const again = await f.login('USER'); assert.deepEqual(again.session.user.preferences, saved);
  const page = await (await f.request('/profile/settings', again)).text(); assert.match(page, /data-theme="system"/); assert.match(page, /data-density="compact"/);
  f.advance(31 * 60000); assert.equal((await f.request('/api/platform/me', again)).status, 401);
  const fresh = await f.login('USER');
  const noCsrf = await fetch(f.base + path, { method: 'PATCH', headers: { cookie: fresh.cookie, origin: f.base, 'content-type': 'application/json' }, body: '{"theme":"dark"}' });
  assert.equal(noCsrf.status, 403);
});

test('Protect XP binds to own membership without requiring or granting moderator permissions', async t => {
  const bots = createBotConfigFixture(ids), f = fixture({ botTransport: bots.transport }); t.after(() => f.close()); await f.listen();
  const path = '/api/platform/me/protect/' + guildId;
  assert.equal((await f.request(path)).status, 401);
  const user = await f.login('USER');
  const result = await f.request(path + '?actor=' + ids.OWNER, user); assert.equal(result.status, 200);
  assert.equal((await result.json()).progression.level, 12); assert.equal(bots.calls.at(-1).options.headers['x-wn-actor'], ids.USER);
  assert.equal((await f.request('/profile/protect', user)).status, 200);
  assert.equal((await f.request('/api/platform/admin/bot-config/protect/' + guildId, user)).status, 403);
  assert.equal((await f.request('/api/platform/me/protect/661720242585600999', user)).status, 404);
  bots.guild.members.fetch = async () => { throw Object.assign(Error('missing'), { code: 10007 }); };
  assert.equal((await f.request(path, user)).status, 403);
});

test('Protect XP uses live pending XP and server formula without creating or mutating users', t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec('CREATE TABLE level_profile_overrides(guild_id TEXT,user_id TEXT,level_label TEXT,badge_label TEXT,rank_label TEXT,lock_progress INTEGER)');
  const config = Object.freeze({ xpEnabled: true, voiceXpEnabled: true, maxLevel: 100, baseXp: 100 });
  const record = Object.freeze({ totalXP: 1234, lastXpMessageAt: 55, lastVoiceXpAt: 66 });
  const users = Object.freeze({ [ids.USER]: record });
  const state = Object.freeze({ guilds: Object.freeze({ [guildId]: Object.freeze({ config, users }) }) });
  const level = { getLevelStateFromTotalXp(total, cfg) { assert.equal(total, 1234); assert.equal(cfg, config); return { level: 4, xp: 12, totalXP: total, xpRequired: 1600 }; } };
  const read = createProtectProfile(level, { loadLevelData: () => state, getDefaultLevelConfig: () => ({ xpEnabled: false, maxLevel: 100 }) }, () => db);
  assert.equal(read(guildId, ids.USER, 'normal', 77).progression.totalXp, 1234);
  assert.equal(read(guildId, ids.USER, 'normal', 77).sampledAt, 77);
  assert.equal(read(guildId, ids.OWNER, 'normal').progression, null);
  assert.equal(Object.keys(users).length, 1);
  assert.equal(read('missing', ids.USER, 'normal').enabled, false);
  assert.equal(read('missing', ids.USER, 'normal').voiceEnabled, false);
  assert.throws(() => read(guildId, ids.USER, 'admin'), { status: 403 });
  db.prepare('INSERT INTO level_profile_overrides VALUES(?,?,?,?,?,?)').run(guildId, ids.USER, '∞', 'Légende', null, 1);
  assert.equal(read(guildId, ids.USER, 'normal').progression.levelLabel, '∞');
  assert.equal(read(guildId, ids.USER, 'normal').progression.progressLocked, true);
  assert.equal(db.prepare('SELECT count(*) n FROM level_profile_overrides').get().n, 1);
});
