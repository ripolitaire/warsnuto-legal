const { test } = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./helpers.cjs');
for (const role of ['USER', 'MODERATOR', 'ADMIN', 'OWNER']) test('server authorization matrix for ' + role, async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const login = await f.login(role);
  for (const [route, permitted] of [['/admin', ['ADMIN', 'OWNER'].includes(role)], ['/admin/bots', ['ADMIN', 'OWNER'].includes(role)], ['/admin/users', ['ADMIN', 'OWNER'].includes(role)], ['/admin/staff', role === 'OWNER'], ['/admin/settings', ['ADMIN', 'OWNER'].includes(role)]]) {
    assert.equal((await f.request(route, login)).status, permitted ? 200 : 403, route);
  }
  assert.equal((await f.request('/api/platform/admin/users', login)).status, ['ADMIN', 'OWNER'].includes(role) ? 200 : 403);
  assert.equal((await f.request('/api/platform/admin/bots', login)).status, ['ADMIN', 'OWNER'].includes(role) ? 200 : 403);
});
test('anonymous users cannot read private APIs and are redirected on protected pages', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close());
  for (const route of ['/api/platform/me', '/api/platform/admin/overview', '/api/platform/admin/bots', '/api/platform/admin/users', '/api/platform/admin/settings']) assert.equal((await f.request(route)).status, 401);
  const result = await f.request('/admin'); assert.equal(result.status, 303); assert.match(result.headers.get('location'), /^\/auth\/discord\/start\?/);
});
test('CSRF, foreign origins and forbidden role input are refused', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const login = await f.login('OWNER');
  const response = await fetch(f.base + '/api/platform/me/preferences', { method: 'PATCH', headers: { cookie: login.cookie, origin: 'https://evil.example', 'content-type': 'application/json', 'x-csrf-token': login.session.csrf }, body: JSON.stringify({ reducedMotion: true }) });
  assert.equal(response.status, 403);
  assert.equal((await f.request('/api/platform/me/preferences', login, { reducedMotion: true, role: 'OWNER' }, 'PATCH')).status, 400);
  assert.equal((await f.request('/api/platform/admin/users/' + f.ids.OWNER + '/role', login, { role: 'USER', reason: 'test de sécurité', confirmation: 'CONFIRMER ' + f.ids.OWNER, version: 0 }, 'PATCH')).status, 403);
});
test('ADMIN cannot escalate or change another administrator, OWNER can promote with confirmation', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const admin = await f.login('ADMIN'), owner = await f.login('OWNER');
  const body = { role: 'OWNER', confirmation: 'CONFIRMER ' + f.ids.USER, reason: 'Test de promotion', version: 0 };
  assert.equal((await f.request('/api/platform/admin/users/' + f.ids.USER + '/role', admin, body, 'PATCH')).status, 403);
  assert.equal((await f.request('/api/platform/admin/users/' + f.ids.OWNER + '/status', admin, { status: 'suspended', confirmation: 'CONFIRMER ' + f.ids.OWNER, reason: 'Test de sécurité', version: 0 }, 'PATCH')).status, 403);
  assert.equal((await f.request('/api/platform/admin/users/' + f.ids.USER + '/role', owner, body, 'PATCH')).status, 200);
});
test('role changes immediately revoke sessions and stale concurrent updates conflict', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const user = await f.login('USER'), owner = await f.login('OWNER');
  const body = { role: 'MODERATOR', confirmation: 'CONFIRMER ' + f.ids.USER, reason: 'Test de promotion', version: 0 };
  assert.equal((await f.request('/api/platform/admin/users/' + f.ids.USER + '/role', owner, body, 'PATCH')).status, 200);
  assert.equal((await (await f.request('/api/platform/session', user)).json()).user, null);
  assert.equal((await f.request('/api/platform/admin/users/' + f.ids.USER + '/role', owner, body, 'PATCH')).status, 409);
});
test('suspension prevents access and later OAuth login, no data is removed', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const user = await f.login('USER'), admin = await f.login('ADMIN');
  const body = { status: 'suspended', confirmation: 'CONFIRMER ' + f.ids.USER, reason: 'Test de suspension', version: 0 };
  assert.equal((await f.request('/api/platform/admin/users/' + f.ids.USER + '/status', admin, body, 'PATCH')).status, 200);
  assert.equal((await f.request('/api/platform/me', user)).status, 401);
  assert.equal((await f.login()).response.status, 403);
  assert.equal(f.db.prepare('SELECT count(*) n FROM users').get().n, 4);
});
test('a normal user cannot read another account and cannot inject SQL through search', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const user = await f.login(), owner = await f.login('OWNER');
  assert.equal((await f.request('/api/platform/admin/users/' + f.ids.OWNER, user)).status, 403);
  const response = await f.request('/api/platform/admin/users?q=' + encodeURIComponent("%' OR 1=1 --"), owner);
  assert.equal(response.status, 200); assert.equal((await response.json()).total, 0);
  assert.equal((await f.request('/api/platform/admin/users?page=-1', owner)).status, 400);
});
test('critical operations need a recent Discord authentication and cannot expand role ceilings', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const owner = await f.login('OWNER');
  const body = { role: 'ADMIN', permissions: ['staff:manage'], confirmation: 'CONFIRMER ADMIN', reason: 'Test de sécurité', version: 0 };
  assert.equal((await f.request('/api/platform/admin/permissions', owner, body, 'PATCH')).status, 400);
  f.advance(600001);
  assert.equal((await f.request('/api/platform/admin/permissions', owner, { ...body, permissions: ['users:read'] }, 'PATCH')).status, 428);
});
test('permission reductions revoke the affected staff sessions and use a version check', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const admin = await f.login('ADMIN'), owner = await f.login('OWNER');
  const body = { role: 'ADMIN', permissions: ['admin:read'], confirmation: 'CONFIRMER ADMIN', reason: 'Test des permissions', version: 0 };
  assert.equal((await f.request('/api/platform/admin/permissions', owner, body, 'PATCH')).status, 200);
  assert.equal((await (await f.request('/api/platform/session', admin)).json()).user, null);
  assert.equal((await f.request('/api/platform/admin/permissions', owner, body, 'PATCH')).status, 409);
});
test('public settings are whitelisted, versioned and maintenance is OWNER only', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const admin = await f.login('ADMIN'), owner = await f.login('OWNER');
  const body = { name: 'WarsNuto', description: 'Description du site', announcement: 'Maintenance prévue', maintenance: true, version: 0, confirmation: 'PUBLIER' };
  assert.equal((await f.request('/api/platform/admin/settings', admin, body, 'PATCH')).status, 403);
  assert.equal((await f.request('/api/platform/admin/settings', owner, { ...body, SESSION_SECRET: 'bad' }, 'PATCH')).status, 400);
  assert.equal((await f.request('/api/platform/admin/settings', owner, body, 'PATCH')).status, 200);
  assert.equal((await f.request('/api/platform/admin/settings', owner, body, 'PATCH')).status, 409);
  assert.equal((await f.request('/api/platform/me', admin)).status, 503);
  assert.equal((await f.request('/api/platform/admin/overview', owner)).status, 200);
});
test('all sensitive mutations are audited and filters are server paginated', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close()); const owner = await f.login('OWNER');
  await f.request('/api/platform/admin/users/' + f.ids.USER + '/role', owner, { role: 'ADMIN', confirmation: 'CONFIRMER ' + f.ids.USER, reason: 'Équipe de test', version: 0 }, 'PATCH');
  const result = await (await f.request('/api/platform/admin/logs?action=staff.role&target=' + f.ids.USER, owner)).json();
  assert.equal(result.total, 1); assert.equal(result.logs[0].actor_id, f.ids.OWNER); assert.ok(result.logs[0].context.includes('Équipe de test'));
});
