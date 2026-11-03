const { opaque, digest, hmac, cookies, signed, verified, cookie, seal, unseal, snowflake, nextPath, error, equal } = require('./security.cjs');
const { transaction, audit } = require('./database.cjs');
const { permissions } = require('./permissions.cjs');
const AS = Object.freeze({ issuer: 'https://discord.com', authorization_endpoint: 'https://discord.com/oauth2/authorize',
  token_endpoint: 'https://discord.com/api/v10/oauth2/token', revocation_endpoint: 'https://discord.com/api/v10/oauth2/token/revoke',
  authorization_response_iss_parameter_supported: true, code_challenge_methods_supported: ['S256'] });
function publicUser(row) {
  const id = row.discord_id;
  const asset = (kind, value) => typeof value === 'string' && /^(?:a_)?[a-f0-9]{32}$/.test(value)
    ? `https://cdn.discordapp.com/${kind}/${id}/${value}.${value.startsWith('a_') ? 'gif' : 'png'}?size=512` : null;
  return { id, username: row.username, displayName: row.display_name || row.username || id,
    avatar: asset('avatars', row.avatar) || `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`,
    banner: asset('banners', row.banner), accountCreatedAt: row.account_created_at, createdAt: row.created_at,
    firstLoginAt: row.first_login_at, lastLoginAt: row.last_login_at, status: row.status, role: row.role,
    preferences: JSON.parse(row.preferences), version: row.version };
}
function createAuth(db, config, fetcher = fetch) {
  const sessionName = config.secure ? '__Host-wn_session' : 'wn_session';
  const stateName = config.secure ? '__Host-wn_oauth' : 'wn_oauth';
  const client = { client_id: config.clientId };
  const redirectUri = config.origin + '/auth/discord/callback';
  function sessionToken(header) { return verified(cookies(header)[sessionName], config.secret); }
  function read(header) {
    const token = sessionToken(header); if (!token) return null;
    const row = db.prepare(`SELECT s.*,u.discord_id,u.username,u.display_name,u.avatar,u.banner,u.account_created_at,u.created_at AS user_created_at,
      u.first_login_at,u.last_login_at,u.status,u.preferences,u.version,r.role FROM sessions s JOIN users u ON s.user_id=u.id
      JOIN user_roles r ON r.user_id=u.id WHERE s.token_hash=? AND s.revoked_at IS NULL`).get(digest(token));
    const now = config.now();
    if (!row) return null;
    if (row.status !== 'active' || row.expires_at <= now || row.last_seen_at + config.sessionIdleMs <= now) {
      db.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').run(now, row.token_hash); return null;
    }
    return { user: publicUser({ ...row, created_at: row.user_created_at }), userId: row.user_id, hash: row.token_hash,
      csrf: hmac(config.secret, 'csrf:' + token), authenticatedAt: row.authenticated_at,
      expiresAt: row.expires_at, idleExpiresAt: row.last_seen_at + config.sessionIdleMs,
      permissions: permissions(db, row.user_id, row.role) };
  }
  function touch(session) {
    db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=? AND revoked_at IS NULL').run(config.now(), session.hash);
  }
  function csrf(req, session) {
    if (!session) throw error(401, 'Connecte-toi avec Discord.');
    if (req.headers.origin !== config.origin || req.headers['sec-fetch-site'] === 'cross-site' ||
      !equal(req.headers['x-csrf-token'], session.csrf)) throw error(403, 'Validation de sécurité expirée. Recharge la page.');
  }
  return { read, touch, csrf, sessionName,
    fresh(session) { if (config.now() - session.authenticatedAt > 10 * 60000) throw error(428, 'Reconnecte-toi avec Discord pour confirmer cette action sensible.'); },
    clearCookie: () => cookie(sessionName, '', config.secure, 0),
    logout(session) { if (session) transaction(db, () => {
      db.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?').run(config.now(), session.hash);
      audit(db, config.now(), session.user.id, 'session.logout', session.user.id);
    }); },
    async start(destination) {
      if (!config.clientId || !config.clientSecret) throw error(503, 'La connexion Discord doit encore être configurée.');
      if (db.prepare('SELECT count(*) n FROM oauth_states WHERE expires_at>?').get(config.now()).n >= 5000) throw error(503, 'Trop de connexions en cours. Réessaie plus tard.');
      const oauth = await import('oauth4webapi');
      const verifier = oauth.generateRandomCodeVerifier(), state = oauth.generateRandomState(), browser = opaque();
      db.prepare('INSERT INTO oauth_states(state_hash,browser_hash,verifier,destination,expires_at) VALUES(?,?,?,?,?)')
        .run(digest(state), digest(browser), seal(verifier, config.secret), nextPath(destination), config.now() + 600000);
      const params = new URLSearchParams({ client_id: config.clientId, response_type: 'code', scope: 'identify',
        redirect_uri: redirectUri, state, code_challenge: await oauth.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', prompt: 'consent' });
      return { location: AS.authorization_endpoint + '?' + params, cookies: [cookie(stateName, signed(browser, config.secret), config.secure, 600)] };
    },
    async callback(url, header, userAgent = '') {
      const state = url.searchParams.get('state'), browser = verified(cookies(header)[stateName], config.secret);
      if (typeof state !== 'string' || !/^[\w-]{43}$/.test(state) || !browser) throw error(400, 'Connexion expirée ou invalide.');
      // Consume once before any asynchronous network operation; another callback cannot replay it.
      const flow = db.prepare('DELETE FROM oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *').get(digest(state), digest(browser), config.now());
      if (!flow) throw error(400, 'Connexion expirée ou déjà utilisée.');
      let identity, token;
      const oauth = await import('oauth4webapi');
      try {
        const params = oauth.validateAuthResponse(AS, client, url, state);
        const response = await oauth.authorizationCodeGrantRequest(AS, client, oauth.ClientSecretPost(config.clientSecret), params,
          redirectUri, unseal(flow.verifier, config.secret), { [oauth.customFetch]: fetcher, signal: AbortSignal.timeout(8000) });
        token = await oauth.processAuthorizationCodeResponse(AS, client, response);
        if (token.scope && token.scope !== 'identify') throw Error('Unexpected OAuth scope');
        const userResponse = await fetcher('https://discord.com/api/v10/users/@me', { headers: { Authorization: 'Bearer ' + token.access_token }, redirect: 'error', signal: AbortSignal.timeout(8000) });
        if (!userResponse.ok) throw Error('Discord identity unavailable');
        identity = await userResponse.json();
        if (!snowflake(identity?.id) || typeof identity.username !== 'string' || identity.username.length > 100 ||
          (identity.global_name != null && (typeof identity.global_name !== 'string' || identity.global_name.length > 100))) throw Error('Invalid Discord identity');
      } catch {
        audit(db, config.now(), null, 'auth.failure', null, {}, 'failure');
        throw error(400, 'Discord ne permet pas de terminer la connexion. Recommence depuis le site.');
      } finally {
        if (token?.access_token) await oauth.revocationRequest(AS, client, oauth.ClientSecretPost(config.clientSecret), token.access_token,
          { [oauth.customFetch]: fetcher, signal: AbortSignal.timeout(5000) }).catch(() => {});
      }
      const tokenId = opaque(), now = config.now();
      let destination;
      transaction(db, () => {
        const existing = db.prepare('SELECT id,status FROM users WHERE discord_id=?').get(identity.id);
        if (existing?.status === 'suspended') throw error(403, 'Ce compte est suspendu sur le site.');
        const created = Number((BigInt(identity.id) >> 22n) + 1420070400000n);
        if (created > now + 60000) throw error(400, 'Identité Discord invalide.');
        db.prepare(`INSERT INTO users(discord_id,username,display_name,avatar,banner,account_created_at,created_at,first_login_at,last_login_at)
          VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,
          avatar=excluded.avatar,banner=excluded.banner,first_login_at=COALESCE(users.first_login_at,excluded.first_login_at),last_login_at=excluded.last_login_at`)
          .run(identity.id, identity.username, identity.global_name || identity.username, identity.avatar || null, identity.banner || null, created, now, now, now);
        const user = db.prepare('SELECT id FROM users WHERE discord_id=?').get(identity.id);
        db.prepare("INSERT INTO user_roles(user_id,role) VALUES(?,'USER') ON CONFLICT(user_id) DO NOTHING").run(user.id);
        const previous = sessionToken(header);
        if (previous) db.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?').run(now, digest(previous));
        const browserLabel = /Firefox/i.test(userAgent) ? 'Firefox' : /Edg\//i.test(userAgent) ? 'Edge' : /Chrome/i.test(userAgent) ? 'Chrome' : /Safari/i.test(userAgent) ? 'Safari' : 'Navigateur';
        db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,authenticated_at,last_seen_at,expires_at,browser) VALUES(?,?,?,?,?,?,?)')
          .run(digest(tokenId), user.id, now, now, now, now + config.sessionMaxMs, browserLabel);
        db.prepare(`UPDATE sessions SET revoked_at=? WHERE token_hash IN (SELECT token_hash FROM sessions WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC,token_hash DESC LIMIT -1 OFFSET 10)`)
          .run(now, user.id);
        const role = db.prepare('SELECT role FROM user_roles WHERE user_id=?').get(user.id).role;
        destination = flow.destination.startsWith('/admin') && !['/admin/configuration', '/admin/moderation'].includes(flow.destination) && !permissions(db, user.id, role).includes('admin:read') ? '/profile' : flow.destination;
        audit(db, now, identity.id, 'auth.login', identity.id);
      });
      return { location: destination, cookies: [cookie(sessionName, signed(tokenId, config.secret), config.secure, config.sessionMaxMs / 1000), cookie(stateName, '', config.secure, 0)] };
    }
  };
}
module.exports = { createAuth, publicUser, AS };
