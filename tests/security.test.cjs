const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fixture } = require('./helpers.cjs');
const { openDatabase, maintenance } = require('../server/database.cjs');
const { configuration } = require('../server/config.cjs');
const { bootstrap } = require('../server/owner.cjs');
test('configuration is fail-closed without secrets, invalid origins or external binds', () => {
  assert.throws(() => configuration({}), /SESSION_SECRET/);
  for (const env of [{ APP_BASE_URL: 'http://evil.example' }, { APP_BASE_URL: 'https://warsnuto.com/path' }, { WEB_HOST: '0.0.0.0' }, { NODE_ENV: 'production', APP_BASE_URL: 'https://warsnuto.com' }]) assert.throws(() => configuration({ SESSION_SECRET: require('node:crypto').randomBytes(32).toString('base64url'), ...env }));
});
test('first OWNER requires CLI bootstrap, never OAuth or Discord role membership', () => {
  const db = openDatabase(':memory:');
  try {
    const id = '661720242585600001'; bootstrap(db, id);
    assert.equal(db.prepare('SELECT role FROM user_roles').get().role, 'OWNER');
    assert.throws(() => bootstrap(db, '661720242585600002'), { status: 409 });
    assert.equal(db.prepare('SELECT first_login_at FROM users').get().first_login_at, null);
  } finally { db.close(); }
});
test('last active OWNER cannot be demoted or suspended even with a stale actor snapshot', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const actor = f.backend.auth.read((await f.login('OWNER')).cookie);
  const staleActor = { ...actor, user: { ...actor.user, id: f.ids.ADMIN } };
  assert.throws(() => f.backend.service.role(staleActor, f.ids.OWNER, { role: 'USER', confirmation: 'CONFIRMER ' + f.ids.OWNER, reason: 'Test de protection', version: 0 }), { status: 409 });
  assert.throws(() => f.backend.service.status(staleActor, f.ids.OWNER, { status: 'suspended', confirmation: 'CONFIRMER ' + f.ids.OWNER, reason: 'Test de protection', version: 0 }), { status: 409 });
});
test('database refuses bot databases and preserves their content', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-foreign-test-')), file = path.join(directory, 'foreign.sqlite');
  const db = new (require('node:sqlite').DatabaseSync)(file); db.exec('CREATE TABLE sanctions(id TEXT); INSERT INTO sanctions VALUES(\'preserve\');'); db.close();
  try {
    assert.throws(() => openDatabase(file), /ne fait pas partie/);
    const check = new (require('node:sqlite').DatabaseSync)(file, { readOnly: true });
    assert.equal(check.prepare('SELECT id FROM sanctions').get().id, 'preserve'); assert.equal(check.prepare('PRAGMA user_version').get().user_version, 0); check.close();
  } finally { fs.rmSync(directory, { recursive: true }); }
});
test('production refuses a missing database instead of silently recreating accounts', () => {
  const filename = path.join(os.tmpdir(), 'wn-never-created-' + require('node:crypto').randomUUID() + '.sqlite');
  assert.throws(() => openDatabase(filename, { create: false }), /Base web absente/);
  assert.equal(fs.existsSync(filename), false);
});
test('API errors never expose database messages, env values or authentication headers', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const owner = await f.login('OWNER');
  f.db.exec('DROP TABLE audit_logs');
  const result = await f.request('/api/platform/admin/overview', owner);
  assert.equal(result.status, 503); const body = await result.text();
  assert.doesNotMatch(body, /sqlite|audit_logs|SELECT|SESSION_SECRET|Bearer/); assert.ok(f.logger.messages.length);
  assert.doesNotMatch(f.logger.messages.join(''), /SELECT|audit_logs|fixture-access/);
});
test('request body limits and strict JSON content types are enforced', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const login = await f.login();
  const large = await fetch(f.base + '/api/platform/me/preferences', { method: 'PATCH', headers: { cookie: login.cookie, origin: f.base, 'x-csrf-token': login.session.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ reducedMotion: 'x'.repeat(20000) }) });
  assert.equal(large.status, 413);
  const bad = await fetch(f.base + '/api/platform/me/preferences', { method: 'PATCH', headers: { cookie: login.cookie, 'content-type': 'text/plain' }, body: '{}' }); assert.equal(bad.status, 415);
});
test('rate limits survive repeated requests and reset after their window', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); let response;
  for (let i = 0; i < 181; i++) response = await f.request('/api/platform/session');
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60');
  f.advance(60001); assert.equal((await f.request('/api/platform/session')).status, 200);
});
test('only public assets are served; environment, source and database paths stay private', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close());
  for (const route of ['/.env', '/.env.web', '/.git/config', '/data/web.sqlite', '/server/config.cjs', '/package.json', '/assets/../server/auth.cjs']) assert.equal((await f.request(route)).status, 404, route);
  const response = await f.request('/api/platform/session');
  assert.match(response.headers.get('cache-control'), /no-store/); assert.equal(response.headers.get('x-frame-options'), 'DENY'); assert.ok(response.headers.get('content-security-policy').includes("object-src 'none'")); assert.equal(response.headers.get('access-control-allow-origin'), null);
});
test('audit, sessions and OAuth have a bounded retention policy', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); await f.login();
  f.advance(181 * 86400000); maintenance(f.db, f.config.now());
  assert.equal(f.db.prepare('SELECT count(*) n FROM sessions').get().n, 0); assert.equal(f.db.prepare('SELECT count(*) n FROM audit_logs').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM users').get().n, 4);
});
test('all generated pages escape Discord and stored site text', () => {
  const views = require('../server/views.cjs');
  const result = views.page('/profile', { user: { displayName: '<img src=x onerror=alert(1)>', avatar: 'https://cdn.discordapp.com/embed/avatars/1.png', role: 'USER' }, permissions: [] }, { name: '</title><script>alert(1)</script>' });
  assert.doesNotMatch(result, /<script>alert|<img src=x/); assert.match(result, /&lt;img/);
});
test('secure deployment uses host cookies and the private origin credential', async t => {
  const f = fixture(); f.config.secure = true; f.config.production = true; f.config.originSecret = 'a'.repeat(64); f.config.requireHttpsProxy = true;
  await f.listen(); t.after(() => f.close());
  assert.equal((await fetch(f.base + '/api/platform/session')).status, 403);
  assert.equal((await fetch(f.base + '/api/platform/session', { headers: { 'x-wn-origin-secret': f.config.originSecret, 'x-forwarded-proto': 'https' } })).status, 200);
  const result = await f.backend.auth.start('/profile'); assert.match(result.cookies[0], /^__Host-wn_oauth=/); assert.match(result.cookies[0], /; Secure/);
});
