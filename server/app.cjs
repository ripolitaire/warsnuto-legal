const express = require('express'), path = require('node:path');
const { isIP } = require('node:net');
const { headers, error, equal, digest, nextPath, object } = require('./security.cjs');
const { createAuth } = require('./auth.cjs');
const { createService } = require('./service.cjs');
const { requirePermission } = require('./permissions.cjs');
const { audit, maintenance } = require('./database.cjs');
const views = require('./views.cjs');
function createApp({ db, config, fetcher, botTransport, logger = console }) {
  const app = express(), auth = createAuth(db, config, fetcher), service = createService(db, config);
  const botConfiguration = require('./botConfiguration.cjs').createBotConfiguration(db, config, botTransport);
  const memberSpace = require('./memberSpace.cjs').createMemberSpace(db, config, botConfiguration);
  app.disable('x-powered-by'); app.set('query parser', 'simple');
  app.use(headers);
  app.use((req, res, next) => {
    try {
      if (req.originalUrl.length > 4096) throw error(414, 'Adresse trop longue.');
      if (config.production) {
        if (!equal(req.headers['x-wn-origin-secret'], config.originSecret)) throw error(403, 'Accès uniquement via le site officiel.');
        if (config.requireHttpsProxy && req.headers['x-forwarded-proto'] !== 'https') throw error(403, 'HTTPS requis.');
        res.set('Strict-Transport-Security', 'max-age=31536000');
      }
      // Forwarded client IP is accepted only after the private origin credential.
      const forwarded = req.headers['x-wn-client-ip'];
      req.clientKey = config.production && isIP(String(forwarded)) ? forwarded : req.socket.remoteAddress;
      limit('ip:' + req.clientKey, 180);
      next();
    } catch (err) { next(err); }
  });
  function limit(key, maximum, period = 60000) {
    const now = config.now();
    if (!db.prepare('SELECT 1 FROM rate_limits WHERE bucket=?').get(digest(key)) && db.prepare('SELECT count(*) n FROM rate_limits WHERE expires_at>?').get(now).n >= 20000) throw error(429, 'Le service reçoit trop de requêtes. Réessaie plus tard.');
    const row = db.prepare(`INSERT INTO rate_limits(bucket,counter,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET
      counter=CASE WHEN rate_limits.expires_at<=? THEN 1 ELSE rate_limits.counter+1 END,
      expires_at=CASE WHEN rate_limits.expires_at<=? THEN excluded.expires_at ELSE rate_limits.expires_at END RETURNING counter,expires_at`)
      .get(digest(key), now + period, now, now);
    if (row.counter > maximum) throw error(429, 'Trop de requêtes. Réessaie dans une minute.');
  }
  app.use((req, res, next) => {
    if (['POST', 'PATCH'].includes(req.method) && !req.is('application/json')) return next(error(415, 'Un formulaire JSON est requis.'));
    next();
  });
  app.use('/api/platform/recruitment',express.json({limit:'64kb',strict:true,inflate:false}));
  app.use(express.json({ limit: '16kb', strict: true, inflate: false }));
  app.get('/auth/discord/start', async (req, res) => {
    limit('oauth:' + req.clientKey, 10);
    const result = await auth.start(req.query.next);
    res.set('Set-Cookie', result.cookies).redirect(303, result.location);
  });
  app.get('/auth/discord/callback', async (req, res) => {
    limit('oauth:' + req.clientKey, 10);
    const result = await auth.callback(new URL(req.originalUrl, config.origin), req.headers.cookie, req.headers['user-agent']);
    res.set('Set-Cookie', result.cookies).redirect(303, result.location);
  });
  app.get('/api/platform/public', (req, res) => res.json(service.publicSettings()));
  app.use((req, res, next) => { req.session = auth.read(req.headers.cookie); next(); });
  app.get('/api/platform/session', async (req, res) => {
    const session = req.session;
    if (!session) { res.set('Set-Cookie', auth.clearCookie()); return res.json({ user: null, configured: Boolean(config.clientId && config.clientSecret), serverNow: config.now() }); }
    res.json({ user: session.user, permissions: session.permissions, protectAccess: await memberSpace.protectSession(session), csrf: session.csrf, expiresAt: session.expiresAt, idleExpiresAt: session.idleExpiresAt, serverNow: config.now() });
  });
  app.use('/api/platform', (req, res, next) => {
    try {
      if (!req.session) throw error(401, 'Connecte-toi avec Discord.');
      if (service.publicSettings().maintenance && req.session.user.role !== 'OWNER' && req.path !== '/logout') throw error(503, 'L’espace membre est en maintenance. Réessaie plus tard.');
      if (!['GET', 'HEAD', 'POST', 'PATCH'].includes(req.method)) throw error(405, 'Méthode non autorisée.');
      if (['POST', 'PATCH'].includes(req.method)) { auth.csrf(req, req.session); limit('write:' + req.session.user.id, req.path.startsWith('/recruitment/')?60:20); auth.touch(req.session); }
      next();
    } catch (err) { next(err); }
  });
  const permit = permission => (req, res, next) => { try { requirePermission(req.session, permission); next(); } catch (err) { next(err); } };
  const fresh = (req, res, next) => { try { auth.fresh(req.session); next(); } catch (err) { next(err); } };
  app.get('/api/platform/recruitment/:guild/:view',async(req,res)=>res.json(await botConfiguration.recruitment(req.params.guild,req.params.view,req.session,undefined,req.query)));
  app.get('/api/platform/recruitment/:guild/application/:id',async(req,res)=>res.json(await botConfiguration.recruitment(req.params.guild,'application/'+req.params.id,req.session)));
  app.post('/api/platform/recruitment/:guild',async(req,res)=>{
    if(!['draft.create','draft.save','draft.submit','interview.redeem','withdraw'].includes(req.body?.action))auth.fresh(req.session);
    res.json(await botConfiguration.recruitment(req.params.guild,'actions',req.session,req.body));
  });
  app.post('/api/platform/logout', (req, res) => { object(req.body, []); auth.logout(req.session); res.set('Set-Cookie', auth.clearCookie()).json({ ok: true }); });
  app.post('/api/platform/activity', (req, res) => { object(req.body, []); res.json({ ok: true }); });
  app.get('/api/platform/me', (req, res) => res.json({ user: req.session.user, sessions: service.sessions(req.session) }));
  app.get('/api/platform/servers', async (req, res) => res.json(await memberSpace.servers(req.session)));
  app.get('/api/platform/moderation/:guild', async (req, res) => res.json(await memberSpace.protect(req.session, req.params.guild)));
  app.get('/api/platform/me/game/:guild', async (req, res) => {
    limit('game-read:' + req.session.user.id, 15);
    res.json(await memberSpace.game(req.session, req.params.guild, req.query.mode || 'normal'));
  });
  app.get('/api/platform/me/protect/:guild', async (req, res) => {
    limit('protect-xp-read:' + req.session.user.id, 15);
    res.json(await memberSpace.protectProfile(req.session, req.params.guild));
  });
  app.patch('/api/platform/me/preferences', (req, res) => res.json(service.preferences(req.session, req.body)));
  app.post('/api/platform/me/sessions/revoke-others', (req, res) => {
    object(req.body, ['confirmation']); if (req.body.confirmation !== 'REVOQUER') throw error(400, 'Confirmation requise.');
    res.json(service.revokeOthers(req.session));
  });
  app.get('/api/platform/admin/overview', permit('admin:read'), async (req, res) => res.json(await service.overview()));
  app.get('/api/platform/admin/bots', permit('admin:read'), async (req, res) => res.json(await service.botMonitor()));
  // Bot permissions are checked live on Discord, independently of site staff roles.
  app.get('/api/platform/admin/features/:guild/:module', async (req, res) => res.json(await botConfiguration.feature(req.params.guild, req.params.module, '', req.session)));
  app.get('/api/platform/admin/features/:guild/:module/job/:id', async (req, res) => res.json(await botConfiguration.feature(req.params.guild, req.params.module, 'job/' + req.params.id, req.session)));
  app.get('/api/platform/admin/features/:guild/:module/:id', async (req, res) => res.json(await botConfiguration.feature(req.params.guild, req.params.module, req.params.id, req.session)));
  app.post('/api/platform/admin/features/:guild/:module', fresh, async (req, res) => res.json(await botConfiguration.feature(req.params.guild, req.params.module, '', req.session, req.body)));
  app.get('/api/platform/admin/bot-config', (req, res) => res.json(botConfiguration.catalog()));
  app.get('/api/platform/admin/bot-config/:bot/guilds', async (req, res) => res.json(await botConfiguration.guilds(req.params.bot, req.session)));
  app.get('/api/platform/admin/bot-config/:bot/:guild', async (req, res) => res.json(await botConfiguration.read(req.params.bot, req.params.guild, null, req.session)));
  app.get('/api/platform/admin/bot-config/:bot/:guild/:section', async (req, res) => res.json(await botConfiguration.read(req.params.bot, req.params.guild, req.params.section, req.session)));
  app.patch('/api/platform/admin/bot-config/:bot/:guild/:section', fresh, async (req, res) => res.json(await botConfiguration.save(req.params.bot, req.params.guild, req.params.section, req.session, req.body)));
  app.get('/api/platform/admin/users', permit('users:read'), (req, res) => res.json(service.users(new URL(req.originalUrl, config.origin).searchParams)));
  app.get('/api/platform/admin/users/:id', permit('users:read'), (req, res) => res.json(service.detail(req.params.id)));
  app.patch('/api/platform/admin/users/:id/status', permit('users:moderate'), fresh, (req, res) => res.json(service.status(req.session, req.params.id, req.body)));
  app.post('/api/platform/admin/users/:id/revoke', permit('users:moderate'), fresh, (req, res) => res.json(service.revoke(req.session, req.params.id, req.body)));
  app.patch('/api/platform/admin/users/:id/role', permit('staff:manage'), fresh, (req, res) => res.json(service.role(req.session, req.params.id, req.body)));
  app.get('/api/platform/admin/staff', permit('staff:manage'), (req, res) => res.json({ ...service.users(new URL(req.originalUrl, config.origin).searchParams, true), ...service.grants() }));
  app.patch('/api/platform/admin/permissions', permit('permissions:manage'), fresh, (req, res) => res.json(service.updateGrants(req.session, req.body)));
  app.get('/api/platform/admin/logs', permit('audit:read'), (req, res) => res.json(service.logs(new URL(req.originalUrl, config.origin).searchParams)));
  app.get('/api/platform/admin/settings', permit('settings:write'), (req, res) => res.json(service.settings()));
  app.patch('/api/platform/admin/settings', permit('settings:write'), fresh, (req, res) => res.json(service.updateSettings(req.session, req.body)));
  const pagePermissions = { '/admin': 'admin:read', '/admin/bots': 'admin:read', '/admin/users': 'users:read', '/admin/staff': 'staff:manage', '/admin/logs': 'audit:read', '/admin/settings': 'settings:write', '/admin/moderation': 'moderation:read' };
  for (const route of Object.keys(views.pages)) app.get(route, async (req, res) => {
    if (!req.session) return res.redirect(303, '/auth/discord/start?next=' + encodeURIComponent(nextPath(req.originalUrl)));
    if (pagePermissions[route] && route !== '/admin/moderation') requirePermission(req.session, pagePermissions[route]);
    if (service.publicSettings().maintenance && req.session.user.role !== 'OWNER') throw error(503, 'L’espace membre est en maintenance. Réessaie plus tard.');
    const scoped = { ...req.session, protectAccess: await memberSpace.protectSession(req.session, ['/admin/moderation', '/admin/prisons'].includes(route)) };
    if(route==='/admin/candidatures') {
      const guild=String(req.query.guild||'1052863089692905493'),context=await botConfiguration.recruitment(guild,'context',req.session);
      if(!context.access.review)throw error(403,'Espace réservé aux recruteurs configurés dans Protect.');
    }
    if (route === '/admin/prisons' && !scoped.protectAccess.guilds.some(g => g.canManagePrisons)) throw error(403, 'Accès prison réservé aux Admins et R Modo configurés dans Protect.');
    if (route === '/admin/moderation' && !scoped.protectAccess.canModerate) requirePermission(req.session, 'moderation:read');
    res.type('html').send(views.page(route, scoped, service.publicSettings()));
  });
  // Only public files are served. Never expose the checkout, SQLite, env, or sources.
  const publicFiles = ['app.js', 'styles.css', 'theme.css', 'appearance.js', 'platform.js', 'platform.css', 'bot-configuration.js', 'configuration-picker.js', 'feature-dashboard.js', 'member-space.js', 'recruitment.js'];
  for (const file of publicFiles) app.get('/' + file, (req, res) => res.sendFile(path.join(config.root, file), { dotfiles: 'deny' }));
  app.use('/assets', express.static(path.join(config.root, 'assets'), { dotfiles: 'deny', index: false, redirect: false }));
  if (!config.production) {
    const apiFiles = { '/api/bots': 'bots', '/api/youtube': 'youtube', '/api/visits': 'visits' };
    for (const [route, file] of Object.entries(apiFiles)) app.get(route, require(path.join(config.root, 'api', file + '.js')));
    const pages = ['index', 'bots', 'discord', 'youtube', 'docs', 'protect', 'support', 'game', 'privacy', 'terms'];
    for (const name of pages) app.get(name === 'index' ? '/' : '/' + name, (req, res) => {
      res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://va.vercel-scripts.com; style-src 'self'; img-src 'self' data: https://*.ytimg.com https://yt3.googleusercontent.com https://cdn.discordapp.com; connect-src 'self' https://discord.com https://discordapp.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
      res.sendFile(path.join(config.root, name + '.html'));
    });
  }
  app.use((req, res, next) => next(error(404, 'Page introuvable.')));
  app.use((err, req, res, next) => {
    const status = err.status >= 400 && err.status < 500 ? err.status : 503;
    const requestId = require('node:crypto').randomUUID();
    if (status === 503) {
      logger.error(JSON.stringify({ event: 'web.error', requestId, code: err.code || err.name, route: req.route?.path || 'unknown' }));
      try { audit(db, config.now(), req.session?.user.id || null, 'application.error', null, { requestId }, 'failure'); } catch { /* No logging recursion during a database outage. */ }
    } else if (req.session && [403, 409, 428].includes(status)) {
      try { audit(db, config.now(), req.session.user.id, 'request.denied', null, { status, route: req.route?.path || 'unknown' }, 'failure'); } catch {}
    }
    if (status === 429) res.set('Retry-After', '60');
    const message = err.publicMessage || (status === 400 ? 'Formulaire invalide.' : status === 413 ? 'Formulaire trop volumineux.' : 'Le service est temporairement indisponible.');
    if (req.path.startsWith('/api/')) return res.status(status).json({ error: message, requestId });
    res.status(status).type('html').send(views.failurePage(status, message));
  });
  return { app, auth, service, maintain: () => maintenance(db, config.now(), config.sessionIdleMs) };
}
module.exports = { createApp };
