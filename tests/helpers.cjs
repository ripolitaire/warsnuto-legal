const { randomBytes } = require('node:crypto');
const http = require('node:http');
const { once } = require('node:events');
const { openDatabase } = require('../server/database.cjs');
const { configuration } = require('../server/config.cjs');
const { createApp } = require('../server/app.cjs');
const ids = Object.fromEntries(['USER', 'MODERATOR', 'ADMIN', 'OWNER'].map((role, i) => [role, String((BigInt(Date.UTC(2020, 0, 1) - 1420070400000) << 22n) + BigInt(i + 1))]));
function fixture({ database = ':memory:', port = 0, telemetryDirectory = '', botTransport } = {}) {
  const db = openDatabase(database), config = configuration({ SESSION_SECRET: randomBytes(32).toString('base64url'), DISCORD_OAUTH_CLIENT_ID: ids.OWNER,
    DISCORD_OAUTH_CLIENT_SECRET: randomBytes(32).toString('base64url') });
  let time = Date.now(); config.now = () => time;
  config.telemetryDirectory = telemetryDirectory;
  const used = new Set(), calls = [];
  function seed(id, role, name = 'Compte de test') {
    const now = config.now();
    db.prepare('INSERT INTO users(discord_id,username,display_name,account_created_at,created_at,first_login_at,last_login_at) VALUES(?,?,?,?,?,?,?)').run(id, role.toLowerCase() + '_test', name, Date.UTC(2020, 0, 1), now, now, now);
    const user = db.prepare('SELECT id FROM users WHERE discord_id=?').get(id); db.prepare('INSERT INTO user_roles(user_id,role) VALUES(?,?)').run(user.id, role);
  }
  for (const [role, id] of Object.entries(ids)) seed(id, role, role === 'OWNER' ? 'Propriétaire de test' : role === 'ADMIN' ? 'Admin de test' : role === 'MODERATOR' ? 'Modérateur de test' : 'Membre de test');
  async function fetcher(input, init = {}) {
    const url = new URL(input), body = new URLSearchParams(init.body); calls.push({ url: url.pathname, body, headers: new Headers(init.headers) });
    if (url.origin !== 'https://discord.com') throw Error('Test tried external network');
    if (url.pathname.endsWith('/oauth2/token')) {
      const code = body.get('code');
      if (!code || used.has(code) || code === 'expired' || !body.get('code_verifier')) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      used.add(code); return Response.json({ access_token: 'fixture-access-' + code, refresh_token: 'fixture-refresh-' + code, token_type: 'Bearer', expires_in: 3600, scope: 'identify' });
    }
    if (url.pathname.endsWith('/oauth2/token/revoke')) return new Response(null, { status: 200 });
    if (url.pathname === '/api/v10/users/@me') {
      const token = new Headers(init.headers).get('authorization'), role = Object.keys(ids).find(role => token.includes(role)) || 'USER';
      return Response.json({ id: ids[role], username: role.toLowerCase() + '_test', global_name: role === 'OWNER' ? 'Propriétaire de test' : role === 'ADMIN' ? 'Admin de test' : role === 'MODERATOR' ? 'Modérateur de test' : 'Membre de test', avatar: null, banner: null });
    }
    throw Error('Unexpected fixture endpoint');
  }
  const logger = { messages: [], error(message) { this.messages.push(message); } };
  let backend, server, base;
  return { db, config, calls, logger, ids, seed, fetcher,
    advance(ms) { time += ms; },
    async listen() {
      server = http.createServer(); server.listen(port, '127.0.0.1'); await once(server, 'listening');
      base = `http://127.0.0.1:${server.address().port}`; config.origin = base;
      backend = createApp({ db, config, fetcher, botTransport, logger }); server.on('request', (req, res) => { this.beforeRequest?.(); backend.app(req, res); });
      this.backend = backend; this.base = base; return base;
    },
    async login(role = 'USER', code = role + '-' + randomBytes(8).toString('hex'), existing = '') {
      const started = await fetch(base + '/auth/discord/start?next=/profile', { redirect: 'manual' });
      const authorization = new URL(started.headers.get('location'));
      const browserCookie = started.headers.getSetCookie()[0].split(';')[0];
      const response = await fetch(base + '/auth/discord/callback?' + new URLSearchParams({ code, state: authorization.searchParams.get('state'), iss: 'https://discord.com' }), { redirect: 'manual', headers: { cookie: [existing, browserCookie].filter(Boolean).join('; ') } });
      const cookie = response.headers.getSetCookie().find(cookie => cookie.startsWith('wn_session='))?.split(';')[0];
      const session = cookie ? await fetch(base + '/api/platform/session', { headers: { cookie } }).then(response => response.json()) : null;
      return { cookie, session, response, authorization, browserCookie };
    },
    async request(route, login, body, method = 'POST') {
      return fetch(base + route, { method: body === undefined ? 'GET' : method, redirect: 'manual',
        headers: { ...(login?.cookie ? { cookie: login.cookie } : {}), ...(body === undefined ? {} : { origin: config.origin, 'content-type': 'application/json', 'x-csrf-token': login?.session?.csrf || '' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    },
    async close() { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } db.close(); }
  };
}
module.exports = { fixture, ids };
