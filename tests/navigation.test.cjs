const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, ids } = require('./helpers.cjs');
const { nextPath } = require('../server/security.cjs');
const { createBotConfigFixture, guildId } = require('./bot-config-fixture.cjs');

test('Vercel page rewrites do not inject a section capture into the module query', () => {
  const { rewrites } = require('../vercel.json');
  for (const path of [...Object.keys(require('../server/views.cjs').pages), '/auth/discord/start', '/auth/discord/callback']) {
    const rule = rewrites.find(rule => rule.source === path);
    assert.ok(rule, 'Exact rewrite required: ' + path);
    const destination = new URL(rule.destination, 'https://warsnuto.com');
    assert.equal(destination.searchParams.get('route'), path.slice(1));
    assert.deepEqual([...destination.searchParams.keys()], ['route']);
  }
  assert.ok(!rewrites.some(rule => /^\/(?:admin|profile|auth\/discord)\/:/.test(rule.source)));
});

test('safe return paths retain exact configuration context but refuse open redirects and unknown parameters', () => {
  const path = '/admin/configuration?bot=protect&guild=' + guildId + '&section=welcome';
  assert.equal(nextPath(path), path);
  assert.equal(nextPath('/profile/game?guild=' + guildId + '&mode=admin'), '/profile/game?guild=' + guildId + '&mode=admin');
  for (const value of ['//evil.example', '/\\evil.example', '/admin?next=evil', '/admin/configuration?bot=protect&bot=game', '/admin/configuration?section=welcome&redirect=https://evil.example', '/profile/game#https://evil.example', '/profile\n']) assert.equal(nextPath(value), '/profile');
  assert.equal(nextPath('/admin/configuration?guild=invalid&section=welcome'), '/admin/configuration?section=welcome');
});
test('a logged-out member returns to the selected bot/module after OAuth without gaining site staff privileges', async t => {
  const bots = createBotConfigFixture(ids); bots.tiers.set(ids.USER, 'admin');
  const f = fixture({ botTransport: bots.transport }); t.after(() => f.close()); await f.listen();
  const path = '/admin/configuration?bot=protect&guild=' + guildId + '&section=welcome';
  const page = await f.request(path); assert.equal(page.status, 303);
  const entry = new URL(page.headers.get('location'), f.base); assert.equal(entry.searchParams.get('next'), path);
  const started = await f.request(entry.pathname + entry.search), authorization = new URL(started.headers.get('location'));
  const cookie = started.headers.getSetCookie()[0].split(';')[0];
  const response = await f.request('/auth/discord/callback?' + new URLSearchParams({ state: authorization.searchParams.get('state'), code: 'USER-deep-link', iss: 'https://discord.com' }), { cookie });
  assert.equal(response.status, 303); assert.equal(response.headers.get('location'), path);
  const sessionCookie = response.headers.getSetCookie().find(c => c.startsWith('wn_session=')).split(';')[0];
  const session = await (await f.request('/api/platform/session', { cookie: sessionCookie })).json();
  assert.equal(session.user.role, 'USER'); assert.ok(!session.permissions.includes('admin:read'));
  assert.equal((await f.request('/admin/users', { cookie: sessionCookie })).status, 403);
});
