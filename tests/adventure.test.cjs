const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, ids } = require('./helpers.cjs');
const { createBotConfigFixture, guildId } = require('./bot-config-fixture.cjs');

const path = `/api/platform/adventure/${guildId}/normal`;
const operation = '123e4567-e89b-42d3-a456-426614174000';

test('browser adventure keeps the Discord session actor and requires the Game connector', async t => {
  const bots = createBotConfigFixture(ids);
  const f = fixture({ botTransport: bots.transport });
  t.after(() => f.close());
  await f.listen();
  const user = await f.login('USER');
  const snapshot = await f.request(path, user);
  assert.equal(snapshot.status, 200);
  const data = await snapshot.json();
  assert.equal(data.actor, ids.USER);
  assert.equal(data.mode, 'normal');
  assert.equal(bots.calls.at(-1).options.headers['x-wn-actor'], ids.USER);
  assert.equal((await f.request(`/api/platform/adventure/${guildId}/admin`, user)).status, 403);
});

test('browser adventure action requires CSRF, fixed schema and an allowed mode', async t => {
  const bots = createBotConfigFixture(ids);
  const f = fixture({ botTransport: bots.transport });
  t.after(() => f.close());
  await f.listen();
  const user = await f.login('USER');
  const valid = { operationId: operation, revision: 'a'.repeat(64), action: 'daily', input: {} };
  const saved = await f.request(path, user, valid);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).result.action, 'daily');
  assert.equal((await f.request(path, user, { ...valid, extra: true })).status, 400);
  assert.equal((await f.request(`/api/platform/adventure/${guildId}/other`, user)).status, 400);
});

test('private play page redirects before login and serves only approved static assets', async t => {
  const bots = createBotConfigFixture(ids);
  const f = fixture({ botTransport: bots.transport });
  t.after(() => f.close());
  await f.listen();
  const anonymous = await f.request('/play');
  assert.equal(anonymous.status, 303);
  assert.match(anonymous.headers.get('location'), /auth\/discord\/start/);
  const user = await f.login('USER');
  const page = await f.request('/play', user);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /WARSNUTO/);
  for (const asset of ['/adventure.css', '/adventure.js', '/adventure-audio.js', '/assets/adventure/world-map.jpg', '/assets/adventure/audio/reward.wav']) {
    assert.equal((await f.request(asset)).status, 200, asset);
  }
});
