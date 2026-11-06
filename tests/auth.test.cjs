const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fixture } = require('./helpers.cjs');
const { openDatabase } = require('../server/database.cjs');
test('OAuth uses identify only, S256, single-use state, issuer check, and no tokens persisted', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close());
  const login = await f.login('USER'); assert.equal(login.response.status, 303); assert.equal(login.authorization.searchParams.get('scope'), 'identify');
  assert.equal(login.authorization.searchParams.get('code_challenge_method'), 'S256'); assert.ok(login.authorization.searchParams.get('code_challenge'));
  assert.equal(login.session.user.role, 'USER'); assert.equal(login.session.user.id, f.ids.USER);
  assert.ok(login.response.headers.getSetCookie()[0].includes('HttpOnly')); assert.ok(login.response.headers.getSetCookie()[0].includes('SameSite=Lax'));
  const response = await fetch(f.base + '/auth/discord/callback?' + new URLSearchParams({ code: 'replay', state: login.authorization.searchParams.get('state'), iss: 'https://discord.com' }), { headers: { cookie: login.browserCookie } });
  assert.equal(response.status, 400);
  assert.ok(f.calls.some(call => call.url.endsWith('/oauth2/token/revoke')));
  const stored = JSON.stringify(f.db.prepare('SELECT * FROM sessions').all()) + JSON.stringify(f.db.prepare('SELECT * FROM users').all()) + JSON.stringify(f.db.prepare('SELECT * FROM audit_logs').all());
  assert.doesNotMatch(stored, /fixture-access|fixture-refresh|wn_session|Bearer/); assert.ok(!stored.includes(decodeURIComponent(login.cookie.split('=')[1])));
});
for (const kind of ['state', 'issuer', 'browser', 'expired-code', 'expired-state']) test('OAuth rejects ' + kind, async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close());
  const started = await f.backend.auth.start('/profile'), authorization = new URL(started.location);
  if (kind === 'expired-state') f.advance(600001);
  const url = new URL('/auth/discord/callback', f.base); url.search = new URLSearchParams({ code: kind === 'expired-code' ? 'expired' : 'USER-unique', state: kind === 'state' ? 'x'.repeat(43) : authorization.searchParams.get('state'), iss: kind === 'issuer' ? 'https://evil.example' : 'https://discord.com' });
  await assert.rejects(f.backend.auth.callback(url, kind === 'browser' ? '' : started.cookies[0].split(';')[0]), { status: 400 });
  assert.equal(f.db.prepare('SELECT count(*) n FROM sessions').get().n, 0);
});
test('return path cannot leave the site and profile is not duplicated on reconnection', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close());
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/admin/../../evil', '/admin?next=evil']) {
    const result = await f.backend.auth.start(value); assert.equal(f.db.prepare('SELECT destination FROM oauth_states WHERE state_hash=?').get(require('../server/security.cjs').digest(new URL(result.location).searchParams.get('state'))).destination, '/profile');
  }
  const first = await f.login(), count = f.db.prepare('SELECT count(*) n FROM users').get().n;
  await f.login('USER', undefined, first.cookie); assert.equal(f.db.prepare('SELECT count(*) n FROM users').get().n, count);
  assert.equal((await f.request('/api/platform/session', first)).status, 200);
  assert.equal((await (await f.request('/api/platform/session', first)).json()).user, null);
});
test('successful first login creates exactly one USER profile with real snowflake date', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close());
  f.db.prepare('DELETE FROM user_roles WHERE user_id=(SELECT id FROM users WHERE discord_id=?)').run(f.ids.USER);
  f.db.prepare('DELETE FROM users WHERE discord_id=?').run(f.ids.USER);
  const a = await f.login(); const b = await f.login();
  assert.equal(a.session.user.role, 'USER'); assert.equal(b.session.user.accountCreatedAt, Date.UTC(2020, 0, 1));
  assert.equal(f.db.prepare('SELECT count(*) n FROM users WHERE discord_id=?').get(f.ids.USER).n, 1);
});
test('Discord failure returns a safe error without leaking tokens or client secret', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close());
  const { createAuth } = require('../server/auth.cjs');
  const auth = createAuth(f.db, f.config, async () => { throw new Error('SECRET-CONTENT'); });
  const started = await auth.start('/profile'), location = new URL(started.location);
  await assert.rejects(auth.callback(new URL('/auth/discord/callback?' + new URLSearchParams({ code: 'x', state: location.searchParams.get('state'), iss: 'https://discord.com' }), f.base), started.cookies[0].split(';')[0]), error => error.status === 400 && !error.message.includes('SECRET-CONTENT'));
});
test('sessions persist after reopening the database and signed cookies reject tampering', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-web-test-')), filename = path.join(directory, 'site.sqlite');
  const f = fixture({ database: filename }); await f.listen(); const login = await f.login();
  const config = f.config; await f.close();
  const db = openDatabase(filename); t.after(() => { db.close(); fs.rmSync(directory, { recursive: true }); });
  const auth = require('../server/auth.cjs').createAuth(db, config, async () => { throw Error('No network'); });
  assert.equal(auth.read(login.cookie).user.id, f.ids.USER); assert.equal(auth.read(login.cookie + 'x'), null);
  assert.equal(auth.read(login.cookie + '; ' + login.cookie), null);
});
for (const expiration of ['idle', 'absolute', 'logout']) test('session expires through ' + expiration, async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const login = await f.login();
  if (expiration === 'idle') f.advance(f.config.sessionIdleMs + 1);
  if (expiration === 'absolute') { f.advance(f.config.sessionMaxMs - 1000); f.db.prepare('UPDATE sessions SET last_seen_at=?').run(f.config.now()); f.advance(1001); }
  if (expiration === 'logout') assert.equal((await f.request('/api/platform/logout', login, {})).status, 200);
  assert.equal((await (await f.request('/api/platform/session', login)).json()).user, null);
});
test('revoking other sessions preserves the current one', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const a = await f.login(), b = await f.login();
  assert.equal((await f.request('/api/platform/me/sessions/revoke-others', a, { confirmation: 'REVOQUER' })).status, 200);
  assert.ok((await (await f.request('/api/platform/session', a)).json()).user);
  assert.equal((await (await f.request('/api/platform/session', b)).json()).user, null);
});

test('the session limit always retains the new login even when timestamps are identical', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close());
  for (let n = 0; n < 15; n++) {
    f.db.prepare('DELETE FROM rate_limits').run();
    const login = await f.login('USER');
    assert.equal(login.session.user?.id, f.ids.USER);
    assert.equal(f.db.prepare('SELECT count(*) n FROM sessions WHERE revoked_at IS NULL').get().n, Math.min(n + 1, 10));
  }
});
