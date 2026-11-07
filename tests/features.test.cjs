const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, ids } = require('./helpers.cjs');
const { createBotConfigFixture, guildId } = require('./bot-config-fixture.cjs');
const crypto = require('node:crypto');
const endpoint = module => '/api/platform/admin/features/' + guildId + '/' + module;
test('feature APIs refuse anonymous members, ordinary moderators and website-only administrators', async t => {
  const bots = createBotConfigFixture(ids), f = fixture({ botTransport: bots.transport }); await f.listen(); t.after(() => f.close());
  assert.equal((await f.request(endpoint('prison'))).status, 401);
  for (const tier of ['public', 'mod-test', 'mod']) {
    bots.tiers.set(ids.USER, tier); const user = await f.login('USER');
    assert.equal((await f.request(endpoint('prison'), user)).status, 403); assert.equal((await f.request('/admin/prisons', user)).status, 403);
  }
  bots.tiers.set(ids.ADMIN, 'public'); const admin = await f.login('ADMIN'); assert.equal((await f.request(endpoint('prison'), admin)).status, 403);
});
test('R Modo manages prisons without global website admin or access to YouTube configuration', async t => {
  const bots = createBotConfigFixture(ids); bots.tiers.set(ids.USER, 'responsible-mod');
  const f = fixture({ botTransport: bots.transport }); await f.listen(); t.after(() => f.close()); const user = await f.login('USER');
  assert.equal((await f.request(endpoint('prison'), user)).status, 200); assert.equal((await f.request('/admin/prisons', user)).status, 200);
  assert.equal((await f.request(endpoint('youtube'), user)).status, 403); assert.equal((await f.request('/api/platform/admin/users', user)).status, 403);
  const body = { action: 'create', input: { userIds: [ids.MODERATOR], reason: 'Incident de test' }, operationId: crypto.randomUUID(), confirmation: 'CONFIRMER' };
  const result = await f.request(endpoint('prison'), user, body); assert.equal(result.status, 200); assert.equal((await result.json()).job.status, 'applied');
  assert.equal(bots.calls.at(-1).options.headers['x-wn-actor'], ids.USER);
  assert.equal((await f.request(endpoint('prison') + '/1', user)).status, 200);
  assert.equal((await f.request(endpoint('prison') + '/job/' + body.operationId, user)).status, 200);
  bots.tiers.set(ids.USER, 'mod'); assert.equal((await f.request(endpoint('prison') + '/1', user)).status, 403);
});
test('feature writes enforce CSRF, fresh authentication, confirmation, body boundaries and guild scope', async t => {
  const bots = createBotConfigFixture(ids), f = fixture({ botTransport: bots.transport }); await f.listen(); t.after(() => f.close()); const user = await f.login('OWNER');
  const body = { action: 'test', input: { kind: 'video', reason: 'Test contrôlé sans ping' }, operationId: crypto.randomUUID(), confirmation: 'CONFIRMER' };
  const badCsrf = await fetch(f.base + endpoint('youtube'), { method: 'POST', headers: { cookie: user.cookie, origin: f.base, 'content-type': 'application/json' }, body: JSON.stringify(body) }); assert.equal(badCsrf.status, 403);
  assert.equal((await f.request(endpoint('youtube'), user, { ...body, actor: ids.USER })).status, 400);
  assert.equal((await f.request(endpoint('youtube'), user, { ...body, confirmation: 'NON' })).status, 400);
  assert.equal((await f.request(endpoint('youtube'), user, { ...body, action: '<script>bad</script>' })).status, 400);
  assert.equal((await f.request(endpoint('youtube'), user, { ...body, input: { ...body.input, apiKey: 'must-not-be-accepted' } })).status, 400);
  assert.equal((await f.request('/api/platform/admin/features/661720242585699999/prison', user)).status, 404);
  assert.equal((await f.request(endpoint('youtube'), user, body)).status, 200);
  f.advance(600001); assert.equal((await f.request(endpoint('youtube'), user, { ...body, operationId: crypto.randomUUID() })).status, 428);
  assert.equal((await f.request('/api/platform/admin/features/' + guildId + '/game', user)).status, 400);
});
