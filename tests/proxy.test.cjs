const { test } = require('node:test'), assert = require('node:assert/strict');
const proxy = require('../api/platform.js');
function response() { return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end(value) { this.body = value; return this; } }; }
test('Vercel gateway stays disabled without its secret and never calls upstream', async t => {
  const previous = process.env.WEB_BACKEND_ORIGIN; delete process.env.WEB_BACKEND_ORIGIN; t.after(() => { if (previous === undefined) delete process.env.WEB_BACKEND_ORIGIN; else process.env.WEB_BACKEND_ORIGIN = previous; });
  const res = response(); await proxy({ url: '/api/platform/session', method: 'GET', headers: {} }, res); assert.equal(res.statusCode, 503); assert.equal(res.headers['Cache-Control'], 'private, no-store');
});
test('gateway accepts only exact platform routes, never arbitrary destinations', () => {
  for (const route of ['api/platform/session', 'auth/discord/start', 'profile', 'admin/bots', 'api/platform/admin/bots', 'admin/staff', 'api/platform/admin/users/661720242585600001/role']) assert.ok(proxy.ALLOWED.test(route));
  for (const route of ['https://evil.example', '../.env', 'api/platform/../../api/visits', 'api/platform/internal', 'admin/unknown', 'profile?token=x']) assert.equal(proxy.ALLOWED.test(route), false);
});
test('gateway forwards private cookies and CSRF without exposing its credential to clients', async t => {
  const previous = { fetch: global.fetch, env: { ...process.env } };
  t.after(() => { global.fetch = previous.fetch; for (const key of ['WEB_BACKEND_ORIGIN', 'WEB_ORIGIN_SECRET', 'VERCEL', 'APP_BASE_URL']) { if (previous.env[key] === undefined) delete process.env[key]; else process.env[key] = previous.env[key]; } });
  process.env.WEB_BACKEND_ORIGIN = 'https://origin.example'; process.env.WEB_ORIGIN_SECRET = 'a'.repeat(64); delete process.env.VERCEL;
  let called;
  global.fetch = async (url, options) => { called = { url: String(url), options }; return new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'set-cookie': '__Host-wn_session=fixture; Path=/; HttpOnly; Secure; SameSite=Lax' } }); };
  const res = response();
  await proxy({ url: '/api/platform?route=api/platform/me/preferences', query: { route: 'api/platform/me/preferences' }, method: 'PATCH', headers: { cookie: 'fixture-cookie', origin: 'https://warsnuto.com', 'x-csrf-token': 'csrf-value', 'x-wn-origin-secret': 'attacker' }, body: { reducedMotion: true } }, res);
  assert.equal(res.statusCode, 200); assert.equal(called.options.headers['x-wn-origin-secret'], process.env.WEB_ORIGIN_SECRET);
  assert.equal(called.options.headers['x-csrf-token'], 'csrf-value'); assert.equal(called.options.redirect, 'manual'); assert.equal(called.url, 'https://origin.example/api/platform/me/preferences');
  assert.ok(res.headers['Set-Cookie'][0].includes('HttpOnly')); assert.ok(!String(res.body).includes(process.env.WEB_ORIGIN_SECRET));
  global.fetch = async () => { throw Error('SENSITIVE UPSTREAM'); };
  const failed = response(); await proxy({ url: '/api/platform/session', method: 'GET', headers: {} }, failed); assert.equal(failed.statusCode, 503); assert.doesNotMatch(JSON.stringify(failed.body), /SENSITIVE/);
});
