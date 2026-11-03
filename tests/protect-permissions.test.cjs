const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, ids } = require('./helpers.cjs');
const { createBotConfigFixture, guildId } = require('./bot-config-fixture.cjs');
const { createProtectAccess } = require('../ops/bot-config/webProtectAccess.cjs');
test('Protect access delegates to the bot hierarchy and its command-specific authorization', () => {
  const tiers = ['public', 'mod-test', 'mod', 'responsible-mod', 'admin'], calls = [];
  const auth = { commandRoles: { aide: ['public'], mute: ['testMod', 'admin'], 'give-role': ['mod', 'admin'], ban: ['responsibleMod', 'admin'], dashboard: ['admin'] },
    getMemberAccessLevel: member => member.tier,
    canUseCommand: (member, name) => { calls.push(name); return ({ mute: 1, 'give-role': 2, ban: 3, dashboard: 4 })[name] <= tiers.indexOf(member.tier); } };
  const access = createProtectAccess(auth, { getGuildSettings: () => ({ confirmedModRoleIds: ['confirmed'] }) });
  for (const [level, tier] of tiers.entries()) {
    const result = access({ ownerId: ids.OWNER, id: guildId }, { tier, roles: { cache: new Map() } }, ids.USER);
    assert.equal(result.level, level); assert.equal(result.canModerate, level > 0); assert.equal(result.canConfigure, level === 4);
    assert.equal(result.commands.includes('dashboard'), level === 4); assert.equal(result.commands.includes('ban'), level >= 3);
    assert.equal(result.commands.includes('give-role'), level >= 2); assert.ok(!result.commands.includes('aide'));
  }
  assert.ok(calls.includes('ban'));
  const confirmed = access({ ownerId: ids.OWNER, id: guildId }, { tier: 'mod', roles: { cache: new Map([['confirmed', {}]]) } }, ids.USER);
  assert.equal(confirmed.level, 2); assert.equal(confirmed.label, 'Modérateur confirmé');
  assert.equal(access({ ownerId: ids.OWNER, id: guildId }, { tier: 'unexpected', roles: { cache: new Map() } }, ids.USER).level, 0);
  assert.equal(access({ ownerId: ids.OWNER, id: guildId }, { tier: 'public', roles: { cache: new Map() } }, ids.OWNER).level, 4);
});
for (const [tier, level] of [['mod-test', 1], ['mod', 2], ['responsible-mod', 3], ['admin', 4]]) test('site USER inherits scoped Protect tier ' + tier + ', never global site administration', async t => {
  const bots = createBotConfigFixture(ids); bots.tiers.set(ids.USER, tier);
  const f = fixture({ botTransport: bots.transport }); t.after(() => f.close()); await f.listen(); const user = await f.login('USER');
  assert.equal(user.session.user.role, 'USER'); assert.deepEqual(user.session.permissions, []);
  assert.equal(user.session.protectAccess.canModerate, true); assert.equal(user.session.protectAccess.guilds[0].level, level);
  const page = await f.request('/admin/moderation', user); assert.equal(page.status, 200); assert.match(await page.text(), /data-protect-link/);
  const own = await (await f.request('/api/platform/moderation/' + guildId, user)).json(); assert.equal(own.access.level, level);
  const config = '/api/platform/admin/bot-config/protect/' + guildId + '/general';
  assert.equal((await f.request(config, user)).status, level === 4 ? 200 : 403);
  assert.equal((await f.request('/api/platform/admin/users', user)).status, 403);
  assert.equal((await f.request('/api/platform/admin/logs', user)).status, 403);
  assert.equal((await f.request('/admin/staff', user)).status, 403);
  assert.equal(f.db.prepare('SELECT role FROM user_roles r JOIN users u ON r.user_id=u.id WHERE u.discord_id=?').get(ids.USER).role, 'USER');
});
test('removed roles, non-members, other servers and outages fail closed for scoped moderation data', async t => {
  const bots = createBotConfigFixture(ids); bots.tiers.set(ids.USER, 'mod');
  const f = fixture({ botTransport: bots.transport }); t.after(() => f.close()); await f.listen(); const user = await f.login('USER');
  const route = '/api/platform/moderation/' + guildId;
  assert.equal((await f.request(route + '?actor=' + ids.OWNER, user)).status, 200);
  assert.equal(bots.calls.at(-1).options.headers['x-wn-actor'], ids.USER);
  bots.tiers.set(ids.USER, 'public'); assert.equal((await f.request(route, user)).status, 403);
  assert.equal((await f.request('/admin/moderation', user)).status, 403);
  f.advance(5001); assert.equal((await (await f.request('/api/platform/session', user)).json()).protectAccess.canModerate, false);
  assert.equal((await f.request('/api/platform/moderation/661720242585699999', user)).status, 404);
  bots.guild.members.fetch = async () => { throw Object.assign(Error('Missing member'), { code: 10007 }); };
  assert.equal((await f.request(route, user)).status, 403);
  bots.guild.members.fetch = async () => { throw Error('Discord unavailable'); };
  assert.equal((await f.request(route, user)).status, 503);
  assert.equal((await f.request(route, user, {}, 'PATCH')).status, 404);
});
test('Protect failure does not break login or promote a user from an old role snapshot', async t => {
  const f = fixture({ botTransport: async () => { throw Error('Offline'); } }); t.after(() => f.close()); await f.listen(); const user = await f.login();
  assert.equal(user.session.user.role, 'USER'); assert.equal(user.session.protectAccess.available, false);
  assert.equal((await f.request('/profile', user)).status, 200);
  assert.equal((await f.request('/admin/moderation', user)).status, 403);
});
