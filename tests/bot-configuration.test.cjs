const test = require('node:test'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const S = require('../ops/bot-config/webDashboardSchema.cjs');
const { fixture, ids } = require('./helpers.cjs');
const { createBotConfigFixture, guildId, roleId } = require('./bot-config-fixture.cjs');
const route = bot => '/api/platform/admin/bot-config/' + bot + '/' + guildId + '/general';
const body = revision => ({ revision, operationId: randomUUID(), reason: 'Configuration de test', confirmation: 'ENREGISTRER', values: { title: 'Titre modifié' } });
test('configuration follows live Discord permissions without granting global site staff access', async t => {
  const bots = createBotConfigFixture(ids), f = fixture({ botTransport: bots.transport }); t.after(() => f.close()); await f.listen();
  assert.equal((await f.request('/api/platform/admin/bot-config')).status, 401);
  for (const role of ['USER', 'MODERATOR', 'ADMIN']) {
    const login = await f.login(role); assert.equal((await f.request('/admin/configuration', login)).status, 200);
    assert.equal((await f.request('/api/platform/admin/bot-config', login)).status, 200);
    assert.equal((await f.request(route('game'), login)).status, role === 'ADMIN' ? 200 : 403);
  }
  const owner = await f.login('OWNER'); assert.equal((await f.request('/admin/configuration', owner)).status, 200);
  assert.equal((await f.request('/api/platform/admin/bot-config', await f.login('ADMIN'))).status, 200);
});
for (const bot of ['protect', 'game', 'support']) test('persistent API round trip for ' + bot + ' and audit without configuration values', async t => {
  const bots = createBotConfigFixture(ids), f = fixture({ botTransport: bots.transport }); t.after(() => f.close()); await f.listen(); const owner = await f.login('OWNER');
  const before = await (await f.request(route(bot), owner)).json();
  const result = await f.request(route(bot), owner, body(before.revision), 'PATCH'); assert.equal(result.status, 200);
  const saved = await result.json(); assert.equal(saved.values.title, 'Titre modifié'); assert.notEqual(saved.revision, before.revision);
  assert.equal((await (await f.request(route(bot), owner)).json()).values.title, 'Titre modifié');
  assert.equal(bots.writes[0].actor, ids.OWNER); assert.equal(bots.writes[0].bot, bot);
  assert.equal((await f.request(route(bot), owner, body(before.revision), 'PATCH')).status, 409);
  const logs = f.db.prepare("SELECT * FROM audit_logs WHERE action LIKE 'bot.config.%'").all();
  assert.ok(logs.some(log => log.action === 'bot.config.saved')); assert.doesNotMatch(JSON.stringify(logs), /Titre modifié/);
});
test('CSRF, stale authentication, forged actor, and non-whitelisted settings cannot write', async t => {
  const bots = createBotConfigFixture(ids), f = fixture({ botTransport: bots.transport }); t.after(() => f.close()); await f.listen(); const owner = await f.login('OWNER');
  const current = await (await f.request(route('protect'), owner)).json();
  const requestBody = body(current.revision);
  assert.equal((await f.request(route('protect'), owner, { ...requestBody, actor: ids.ADMIN }, 'PATCH')).status, 400);
  assert.equal((await f.request(route('protect'), owner, { ...requestBody, values: { token: 'do-not-store' } }, 'PATCH')).status, 400);
  const response = await fetch(f.base + route('protect'), { method: 'PATCH', headers: { cookie: owner.cookie, origin: f.base, 'content-type': 'application/json' }, body: JSON.stringify(requestBody) }); assert.equal(response.status, 403);
  f.advance(11 * 60000); assert.equal((await f.request(route('protect'), owner, requestBody, 'PATCH')).status, 428);
  assert.equal(bots.writes.length, 0);
});
test('Discord guild permissions are checked independently of the website role', async t => {
  const bots = createBotConfigFixture(ids), f = fixture({ botTransport: bots.transport }); t.after(() => f.close()); await f.listen();
  const owner = await f.login('OWNER'); bots.guild.ownerId = ids.ADMIN; bots.guild.members.fetch = async () => ({ permissions: { has: () => false } });
  assert.equal((await f.request(route('protect'), owner)).status, 403);
  assert.deepEqual(await (await f.request('/api/platform/admin/bot-config/protect/guilds', owner)).json(), { guilds: [] });
  assert.equal(bots.writes.length, 0);
});
test('roles from other guilds, @everyone, invalid channels, and values beyond bounds are refused', async t => {
  const bots = createBotConfigFixture(ids), f = fixture({ botTransport: bots.transport }); t.after(() => f.close()); await f.listen(); const owner = await f.login('OWNER');
  const current = await (await f.request(route('game'), owner)).json();
  for (const values of [{ count: 101 }, { roles: [guildId] }, { roles: ['661720242585699999'] }, { channel: roleId }, { rules: [{ name: 'test', amount: -1 }] }]) {
    assert.equal((await f.request(route('game'), owner, { ...body(current.revision), values }, 'PATCH')).status, 400);
  }
  assert.equal(bots.writes.length, 0);
});

test('everyone is accepted only for explicitly permitted YouTube notification roles', async t => {
  const bots = createBotConfigFixture(ids), f = fixture({ botTransport: bots.transport }); t.after(() => f.close()); await f.listen(); const owner = await f.login('OWNER');
  const endpoint = '/api/platform/admin/bot-config/protect/' + guildId + '/youtube';
  let current = await (await f.request(endpoint, owner)).json();
  for (const field of ['videoRoleId', 'shortRoleId', 'liveRoleId']) {
    const response = await f.request(endpoint, owner, { ...body(current.revision), values: { [field]: guildId } }, 'PATCH');
    assert.equal(response.status, 200); current = await response.json(); assert.equal(current.values[field], guildId);
  }
  assert.equal(current.values.videoMentionEnabled, false);
  const prison = '/api/platform/admin/bot-config/protect/' + guildId + '/prison', before = await (await f.request(prison, owner)).json();
  assert.equal((await f.request(prison, owner, { ...body(before.revision), values: { quarantineRoleId: guildId } }, 'PATCH')).status, 400);
});
test('Discord changes invalidate the revision instead of being silently overwritten', async t => {
  const bots = createBotConfigFixture(ids), f = fixture({ botTransport: bots.transport }); t.after(() => f.close()); await f.listen(); const owner = await f.login('OWNER');
  const current = await (await f.request(route('support'), owner)).json(); bots.configs.get('support').title = 'Changement Discord';
  assert.equal((await f.request(route('support'), owner, body(current.revision), 'PATCH')).status, 409);
  assert.equal(bots.configs.get('support').title, 'Changement Discord'); assert.equal(bots.writes.length, 0);
});
test('socket routing never accepts a browser-selected destination or identity', async t => {
  const bots = createBotConfigFixture(ids), f = fixture({ botTransport: bots.transport }); t.after(() => f.close()); await f.listen(); const owner = await f.login('OWNER');
  assert.equal((await f.request('/api/platform/admin/bot-config/unknown/guilds', owner)).status, 404);
  await f.request('/api/platform/admin/bot-config/protect/guilds?actor=' + ids.ADMIN + '&url=https://evil.test', owner);
  assert.equal(bots.calls.at(-1).options.headers['x-wn-actor'], ids.OWNER);
  assert.equal(bots.calls.at(-1).options.path, '/guilds'); assert.match(bots.calls.at(-1).options.socketPath, /protect\.sock$/);
});
test('schema rejects prototype keys, malformed lists and non-HTTPS URLs', () => {
  const fields = [S.text('title', 'Titre'), S.field('url', 'Image', 'url', { maxLength: 500 }), S.list('rows', 'Lignes', [S.role('role', 'Rôle')])];
  for (const values of [JSON.parse('{"__proto__":{}}'), { rows: [{ role: null }] }, { url: 'http://evil.test/image' }, { rows: [{ role: roleId, extra: true }] }]) assert.throws(() => S.validate(values, fields));
  assert.equal(S.fingerprint({ b: 1, a: 2 }), S.fingerprint({ a: 2, b: 1 }));
});
test('bot configuration write failures remain uncertain and never become success logs', async t => {
  const f = fixture({ botTransport: async () => { throw Object.assign(Error('offline'), { status: 503 }); } }); t.after(() => f.close()); await f.listen(); const owner = await f.login('OWNER');
  assert.equal((await f.request(route('protect'), owner, body('a'.repeat(64)), 'PATCH')).status, 503);
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit_logs WHERE action='bot.config.saved'").get().n, 0);
  assert.equal(f.db.prepare("SELECT result FROM audit_logs WHERE action='bot.config.refused'").get().result, 'uncertain');
});
test('real Unix socket connects the protected web API to the bot handler', async t => {
  if (process.platform === 'win32') { t.skip('Unix transport exercised on Linux CI and the production host.'); return; }
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-config-')), bots = createBotConfigFixture(ids);
  const server = http.createServer(bots.adapters.protect.handler);
  await new Promise(resolve => server.listen(path.join(dir, 'protect.sock'), resolve));
  const f = fixture(); f.config.botSocketDirectory = dir;
  t.after(async () => { await f.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  await f.listen(); const owner = await f.login('OWNER');
  const current = await (await f.request(route('protect'), owner)).json();
  assert.equal((await f.request(route('protect'), owner, body(current.revision), 'PATCH')).status, 200);
  assert.equal(bots.configs.get('protect').title, 'Titre modifié');
});
