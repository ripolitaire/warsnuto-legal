const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const { createBotMonitor, normalize } = require('../server/botMonitor.cjs');
const { snapshot, startBotTelemetry } = require('../ops/botTelemetry.cjs');
const { fixture } = require('./helpers.cjs');
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warsnuto-telemetry-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir;
}
function sample(bot, now = Date.now()) {
  return { version: 1, bot, sampledAt: now, startedAt: now - 60000, pid: 1234,
    gateway: { ready: true, botUserId: '661720242585600001', guildCount: 3, latencyMs: 42 },
    runtime: { rssBytes: 67108864 }, activity: { commandsSinceStart: 8, lastCommandAt: now - 1000 } };
}
const save = (dir, id, data) => fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(data));
function client() {
  const value = new EventEmitter(); value.isReady = () => true; value.user = { id: '661720242585600001', token: 'never-export-this' };
  value.ws = { ping: 32 }; value.guilds = { cache: new Map([['test', {}]]) }; value.token = 'private-token'; return value;
}
async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw Error('Telemetry did not settle');
}
test('snapshot exports only explicit operational data, never Discord secrets', () => {
  const result = snapshot(client(), 'protect', { commandsSinceStart: 4, lastCommandAt: null });
  assert.equal(result.gateway.ready, true); assert.equal(result.gateway.latencyMs, 32);
  assert.equal(result.gateway.guildCount, 1); assert.equal(result.activity.commandsSinceStart, 4);
  assert.doesNotMatch(JSON.stringify(result), /token|never-export|private/);
  assert.equal(Object.keys(result.gateway).length, 4);
});
test('publisher remains disabled without an explicit directory', () => {
  const instance = client(); startBotTelemetry(instance, 'protect', { directory: '' })();
  assert.equal(instance.listenerCount('interactionCreate'), 0);
  assert.doesNotThrow(() => startBotTelemetry(instance, '../secrets', { directory: os.tmpdir(), logger: { warn() {} } }));
  assert.equal(instance.listenerCount('interactionCreate'), 0);
});
test('publisher writes atomic snapshots and counts commands without retaining member data', async t => {
  const dir = directory(t), instance = client();
  const stop = startBotTelemetry(instance, 'game', { directory: dir }); t.after(stop);
  assert.equal(startBotTelemetry(instance, 'game', { directory: dir }), stop);
  const file = path.join(dir, 'game.json');
  await waitFor(() => fs.existsSync(file)); await new Promise(resolve => setTimeout(resolve, 20));
  instance.emit('interactionCreate', { isChatInputCommand: () => false, user: { id: 'secret-member' } });
  instance.emit('interactionCreate', { isChatInputCommand: () => true, user: { id: 'secret-member' }, commandName: 'secret-command' });
  instance.emit('clientReady');
  await waitFor(() => JSON.parse(fs.readFileSync(file, 'utf8')).activity.commandsSinceStart === 1);
  const raw = fs.readFileSync(file, 'utf8'); assert.doesNotMatch(raw, /secret-member|secret-command|private-token/);
  assert.equal(JSON.parse(raw).gateway.ready, true);
  stop(); assert.equal(instance.listenerCount('interactionCreate'), 0);
});
test('unavailable output storage does not interrupt Discord events or leak details', async t => {
  const dir = directory(t), instance = client(), warnings = [];
  const stop = startBotTelemetry(instance, 'support', { directory: path.join(dir, 'missing'), logger: { warn: value => warnings.push(value) } }); t.after(stop);
  let calls = 0; instance.on('interactionCreate', () => calls++);
  instance.emit('interactionCreate', { isChatInputCommand: () => true });
  await waitFor(() => warnings.length === 1);
  assert.equal(calls, 1); assert.doesNotMatch(warnings[0], /missing|token|secret|password/i);
});
test('normalization distinguishes real connection, disconnection and stale signals', () => {
  const now = Date.now(), data = sample('protect', now);
  assert.equal(normalize(data, 'protect', now).status, 'available');
  assert.equal(normalize({ ...data, gateway: { ...data.gateway, ready: false } }, 'protect', now).status, 'disconnected');
  assert.equal(normalize(data, 'protect', now + 45001).status, 'stale');
  const clean = normalize({ ...data, token: 'secret', pid: 9000, database: '/private/database' }, 'protect', now);
  assert.equal(clean.pid, undefined); assert.equal(clean.database, undefined); assert.equal(clean.token, undefined);
});
test('invalid identity, timestamps, numeric IDs and negative metrics are rejected', () => {
  const now = Date.now(), data = sample('game', now);
  for (const broken of [{ ...data, bot: 'protect' }, { ...data, version: 2 }, { ...data, sampledAt: now + 6000 },
    { ...data, gateway: { ...data.gateway, botUserId: 661720242585600000 } },
    { ...data, runtime: { rssBytes: -1 } }, { ...data, activity: { ...data.activity, lastCommandAt: now + 1 } }]) {
    assert.throws(() => normalize(broken, 'game', now));
  }
});
test('reader caches concurrent calls and independently refreshes each bot', async t => {
  const dir = directory(t); let now = Date.now();
  for (const id of ['protect', 'game', 'support']) save(dir, id, sample(id, now));
  const read = createBotMonitor({ telemetryDirectory: dir, now: () => now });
  const first = await read(); assert.equal(first.bots.length, 3); assert.ok(first.bots.every(bot => bot.status === 'available'));
  save(dir, 'game', { ...sample('game', now), gateway: { ...sample('game', now).gateway, ready: false } });
  assert.equal(await read(), first);
  now += 5001; const [a, b] = await Promise.all([read(), read()]); assert.equal(a, b);
  assert.equal(a.bots[1].status, 'disconnected'); assert.equal(a.bots[0].status, 'available');
  now += 45001; assert.ok((await read()).bots.every(bot => bot.status === 'stale'));
});
test('missing, oversized and malformed files fail closed without breaking the site', async t => {
  const dir = directory(t); fs.writeFileSync(path.join(dir, 'game.json'), 'x'.repeat(9000)); fs.writeFileSync(path.join(dir, 'support.json'), '{bad');
  const result = await createBotMonitor({ telemetryDirectory: dir, now: Date.now })();
  assert.ok(result.bots.every(bot => bot.status === 'unavailable'));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
test('reader refuses symlinks rather than following them to other files', async t => {
  if (process.platform === 'win32') { t.skip('Symlink permissions vary on Windows; exercised in Linux CI.'); return; }
  const dir = directory(t), target = path.join(dir, 'private'); fs.writeFileSync(target, JSON.stringify(sample('protect')));
  fs.symlinkSync(target, path.join(dir, 'protect.json'));
  const result = await createBotMonitor({ telemetryDirectory: dir, now: Date.now })();
  assert.equal(result.bots[0].status, 'unavailable');
});
test('unconfigured monitoring never invents a live state', async () => {
  const result = await createBotMonitor({ telemetryDirectory: '', now: Date.now })();
  assert.ok(result.bots.every(bot => bot.status === 'not_connected'));
});
test('live monitoring API is admin-only, read-only and contains no raw bot information', async t => {
  const dir = directory(t), f = fixture({ telemetryDirectory: dir }); t.after(() => f.close());
  for (const id of ['protect', 'game', 'support']) save(dir, id, { ...sample(id, f.config.now()), token: 'private-secret', databasePath: '/private/bot.sqlite' });
  await f.listen(); assert.equal((await f.request('/api/platform/admin/bots')).status, 401);
  for (const role of ['USER', 'MODERATOR']) assert.equal((await f.request('/api/platform/admin/bots', await f.login(role))).status, 403);
  for (const role of ['ADMIN', 'OWNER']) {
    const login = await f.login(role), response = await f.request('/api/platform/admin/bots?bot=../../.env', login);
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
    const body = await response.json(); assert.ok(body.bots.every(bot => bot.status === 'available'));
    assert.doesNotMatch(JSON.stringify(body), /private-secret|databasePath|\/private|pid/);
    const overview = await (await f.request('/api/platform/admin/overview', login)).json();
    assert.equal(overview.services.length, 5); assert.equal(overview.services[2].name, 'WarsNuto Protect');
    assert.equal((await f.request('/api/platform/admin/bots', login, {}, 'POST')).status, 404);
  }
});
