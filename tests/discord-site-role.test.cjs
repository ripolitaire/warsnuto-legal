const test = require('node:test'), assert = require('node:assert/strict');
const { discordSiteRole } = require('../server/discordSiteRole.cjs');
const { CEILINGS } = require('../server/permissions.cjs');
const guildId = '1052863089692905493';
const session = { user: { id: '1360350111611228450', role: 'USER' }, userId: 1, permissions: [], csrf: 'unchanged' };
const db = { prepare: () => ({ all: role => CEILINGS[role].map(permission => ({ permission })) }) };
const config = { discordRoleSyncGuildId: guildId };

test('Protect tiers determine the site role and bounded permissions', async () => {
  for (const [tier, expected] of [['admin', 'ADMIN'], ['responsible-mod', 'MODERATOR'], ['mod', 'MODERATOR'], ['mod-test', 'MODERATOR'], ['public', 'USER']]) {
    const memberSpace = { protectSession: async () => ({ available: true, guilds: [{ id: guildId, tier }] }) };
    const result = await discordSiteRole(session, { db, config, memberSpace });
    assert.equal(result.user.role, expected);
    assert.deepEqual(result.permissions, CEILINGS[expected]);
    assert.equal(result.csrf, session.csrf);
    assert.equal(session.user.role, 'USER');
  }
});

test('removed roles, other guilds and unavailable Protect do not retain admin rights', async () => {
  const admin = { ...session, user: { ...session.user, role: 'ADMIN' }, permissions: CEILINGS.ADMIN };
  for (const access of [{ available: false, guilds: [] }, { available: true, guilds: [] }, { available: true, guilds: [{ id: '1558664695450173561', tier: 'admin' }] }]) {
    let fresh;
    const memberSpace = { protectSession: async (actor, refresh) => { fresh = refresh; return access; } };
    const result = await discordSiteRole(admin, { db, config, memberSpace, fresh: true });
    assert.equal(result.user.role, 'USER');
    assert.deepEqual(result.permissions, []);
    assert.equal(fresh, true);
  }
});

test('Discord never grants OWNER and the bootstrap owner is preserved', async () => {
  const owner = { ...session, user: { ...session.user, role: 'OWNER' }, permissions: CEILINGS.OWNER };
  assert.equal(await discordSiteRole(owner, { db, config, memberSpace: {} }), owner);
  assert.equal(await discordSiteRole(null, { db, config, memberSpace: {} }), null);
});

test('HTTP pages and APIs honor Protect promotion and revoke writes without waiting for the read cache', async t => {
  const { fixture, ids } = require('./helpers.cjs');
  const { createBotConfigFixture, guildId: testGuild } = require('./bot-config-fixture.cjs');
  const bots = createBotConfigFixture(ids), f = fixture({ botTransport: bots.transport });
  t.after(() => f.close());
  f.config.discordRoleSyncGuildId = testGuild;
  await f.listen();
  bots.tiers.set(ids.USER, 'admin');
  const login = await f.login('USER');
  assert.equal(login.session.user.role, 'ADMIN');
  assert.equal((await f.request('/admin', login)).status, 200);
  assert.equal((await f.request('/api/platform/admin/overview', login)).status, 200);
  bots.tiers.set(ids.USER, 'public');
  const denied = await f.request('/api/platform/admin/users/' + ids.MODERATOR + '/revoke', login, {});
  assert.equal(denied.status, 403);
  assert.equal((await (await f.request('/api/platform/session', login)).json()).user.role, 'USER');
  assert.equal((await f.request('/admin', login)).status, 403);
  assert.equal(f.db.prepare('SELECT role FROM user_roles r JOIN users u ON u.id=r.user_id WHERE u.discord_id=?').get(ids.USER).role, 'USER');
});
