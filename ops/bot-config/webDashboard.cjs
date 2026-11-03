const http = require('node:http'), net = require('node:net'), fs = require('node:fs/promises'), path = require('node:path');
const S = require('./webDashboardSchema.cjs');
const ADMINISTRATOR = 8n, MANAGE_ROLES = 268435456n;
function createDashboardHandler(client, adapter, { now = Date.now } = {}) {
  const locks = new Set(), members = new Map(), pending = new Map();
  async function membership(guildId, actor, fresh = false) {
    if (!/^\d{17,20}$/.test(actor || '')) S.fail('Identité Discord requise.', 403);
    const guild = client.guilds.cache.get(guildId); if (!guild) S.fail('Serveur indisponible pour ce bot.', 404);
    const key = guildId + ':' + actor, cached = members.get(key);
    if (!fresh && cached?.until > now()) return { guild, member: cached.member };
    if (!fresh && pending.has(key)) return pending.get(key);
    const work = (async () => {
      let member;
      try { member = await guild.members.fetch({ user: actor, force: true, cache: false }); }
      catch (error) { if (error.code === 10007) member = null; else S.fail('Vérification Discord indisponible. Réessaie dans un instant.', 503); }
      if (members.size >= 5000) members.delete(members.keys().next().value);
      members.set(key, { member, until: now() + 30000 });
      return { guild, member };
    })();
    if (!fresh) pending.set(key, work);
    try { return await work; } finally { if (!fresh) pending.delete(key); }
  }
  const canConfigure = (guild, member, actor) => Boolean(member && (guild.ownerId === actor || member.permissions.has(ADMINISTRATOR) || adapter.canConfigure?.(guild, member, actor)));
  const describe = guild => ({ id: guild.id, name: guild.name, icon: guild.iconURL?.({ extension: 'png', size: 128 }) || null, memberCount: guild.memberCount || null });
  async function authorize(guildId, actor) {
    const { guild, member } = await membership(guildId, actor, true);
    if (!canConfigure(guild, member, actor)) S.fail('Un rôle administrateur du bot ou la permission Administrateur Discord est requis sur ce serveur.', 403);
    return guild;
  }
  async function references(guild, values, fields) {
    for (const f of fields) {
      const value = values[f.key]; if (f.type === 'list') { for (const row of value || []) await references(guild, row, f.itemFields); continue; }
      if (value === null || value === undefined || !['role', 'roles', 'channel', 'channels'].includes(f.type)) continue;
      const ids = Array.isArray(value) ? value : [value];
      for (const id of ids) {
        if (f.type.startsWith('role')) {
          const role = guild.roles.cache.get(id); if (!role || id === guild.id || role.managed) S.fail('Rôle invalide : ' + f.label + '.');
          if (f.assignable) {
            const me = guild.members.me || await guild.members.fetchMe();
            const dangerous = ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageWebhooks', 'BanMembers', 'KickMembers', 'ModerateMembers', 'ManageMessages', 'MentionEveryone'];
            if (!me.permissions.has(MANAGE_ROLES) || role.position >= me.roles.highest.position || dangerous.some(p => role.permissions.has(p))) S.fail('Ce rôle ne peut pas être attribué automatiquement : ' + f.label + '.');
          }
        } else {
          const channel = guild.channels.cache.get(id);
          if (!channel || channel.guildId !== guild.id || !f.channelTypes.includes(channel.type)) S.fail('Salon invalide : ' + f.label + '.');
          const me = guild.members.me || await guild.members.fetchMe();
          if (!channel.permissionsFor(me)?.has(1024n) || ([0, 5].includes(channel.type) && !channel.permissionsFor(me).has(2048n))) S.fail('Le bot ne peut pas accéder au salon : ' + f.label + '.');
        }
      }
    }
  }
  async function dispatch(req, body = {}) {
    if (!client.isReady()) S.fail('Ce bot se reconnecte à Discord. Réessaie dans un instant.', 503);
    const url = new URL(req.url, 'http://localhost'), actor = req.headers['x-wn-actor'];
    if (url.search || !['GET', 'PATCH'].includes(req.method)) S.fail('Route indisponible.', 404);
    if (url.pathname === '/member/servers' && req.method === 'GET') {
      const guilds = [];
      for (const entry of client.guilds.cache.values()) {
        const { guild, member } = await membership(entry.id, actor, Boolean(adapter.memberAccess));
        if (member) guilds.push({ ...describe(guild), canConfigure: canConfigure(guild, member, actor), ...(adapter.memberAccess ? { access: adapter.memberAccess(guild, member, actor) } : {}) });
      }
      return { guilds };
    }
    const access = /^\/member\/(\d{17,20})\/access$/.exec(url.pathname);
    if (access && req.method === 'GET') {
      const { guild, member } = await membership(access[1], actor, true);
      if (!member) S.fail('Tu ne fais pas partie de ce serveur.', 403);
      if (!adapter.memberAccess) S.fail('Ce bot ne propose pas de droits de modération.', 404);
      return { guild: describe(guild), access: adapter.memberAccess(guild, member, actor) };
    }
    const profile = /^\/member\/(\d{17,20})\/profile\/(normal|admin)$/.exec(url.pathname);
    if (profile && req.method === 'GET') {
      const { guild, member } = await membership(profile[1], actor, true);
      if (!member) S.fail('Tu ne fais pas partie de ce serveur.', 403);
      if (!adapter.profile) S.fail('Ce bot ne propose pas de profil Game.', 404);
      return { guild: describe(guild), ...await adapter.profile(guild.id, actor, profile[2], now()) };
    }
    if (url.pathname === '/guilds' && req.method === 'GET') {
      const guilds = [];
      for (const entry of client.guilds.cache.values()) { try { const guild = await authorize(entry.id, actor); guilds.push({ id: guild.id, name: guild.name }); } catch (error) { if (error.status !== 403) throw error; } }
      return { guilds };
    }
    const match = /^\/config\/(\d{17,20})(?:\/([a-z][a-z0-9_-]{0,39}))?$/.exec(url.pathname);
    if (!match) S.fail('Route indisponible.', 404);
    const guild = await authorize(match[1], actor);
    if (!match[2] && req.method === 'GET') {
      await guild.roles.fetch(); await guild.channels.fetch();
      return { guild: { id: guild.id, name: guild.name }, sections: adapter.sections.map(({ id, label, fields }) => ({ id, label, fields })),
        roles: [...guild.roles.cache.values()].filter(r => r.id !== guild.id && !r.managed).map(r => ({ id: r.id, name: r.name })),
        channels: [...guild.channels.cache.values()].filter(c => [0, 2, 4, 5, 13, 15, 16].includes(c.type)).map(c => ({ id: c.id, name: c.name, type: c.type })) };
    }
    const section = adapter.sections.find(section => section.id === match[2]); if (!section) S.fail('Rubrique inconnue.', 404);
    const read = () => { const values = section.read(guild); return { values, revision: S.fingerprint(values) }; };
    if (req.method === 'GET') return read();
    S.object(body);
    if (Object.keys(body).some(key => !['values', 'revision', 'reason', 'confirmation', 'operationId'].includes(key)) || body.confirmation !== 'ENREGISTRER' || !/^[a-f\d]{64}$/.test(body.revision || '') || !/^[a-f\d-]{36}$/.test(body.operationId || '') || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 300) S.fail('Confirmation, révision et motif requis.');
    const values = S.validate(body.values, section.fields); if (!Object.keys(values).length) S.fail('Aucun réglage à enregistrer.');
    const lock = guild.id; if (locks.has(lock)) S.fail('Une modification est en cours. Actualise dans un instant.', 409);
    locks.add(lock);
    try {
      await guild.roles.fetch(); await guild.channels.fetch(); await references(guild, values, section.fields);
      await authorize(guild.id, actor);
      const before = read();
      if (before.revision !== body.revision) S.fail('Les réglages ont changé sur Discord ou le site. Actualise avant de recommencer.', 409);
      const next = { ...before.values, ...values }; section.validate?.(next);
      await section.write(guild, next, actor, values);
      await adapter.audit?.(guild.id, actor, section.id, Object.keys(values), body.operationId);
      let warning;
      if (adapter.afterWrite) { try { warning = await adapter.afterWrite(guild, section.id); } catch { warning = 'Configuration enregistrée. Le panneau Discord n’a pas pu être actualisé.'; } }
      return { ...read(), saved: true, ...(warning ? { warning } : {}) };
    } finally { locks.delete(lock); }
  }
  const handler = async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    try {
      let length = 0; const chunks = [];
      for await (const chunk of req) { length += chunk.length; if (length > 16384) S.fail('Formulaire trop volumineux.', 413); chunks.push(chunk); }
      let body = {}; if (length) { try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { S.fail('Formulaire JSON invalide.'); } }
      const data = await dispatch(req, body); res.end(JSON.stringify(data));
    } catch (error) { res.statusCode = error.status || 503; res.end(JSON.stringify({ error: error.publicMessage || 'Le bot n’a pas pu appliquer cette configuration.' })); }
  };
  return { handler, dispatch };
}
async function startBotDashboard(client, id, root, { directory = process.env.WARSNUTO_DASHBOARD_DIRECTORY, logger = console } = {}) {
  if (!directory) return null;
  try {
    if (!path.isAbsolute(directory) || !['protect', 'game', 'support'].includes(id)) throw Error('Invalid configuration');
    const filename = path.join(directory, id + '.sock');
    try {
      const stat = await fs.lstat(filename); if (!stat.isSocket()) throw Error('Unexpected socket file');
      const active = await new Promise((resolve, reject) => { const socket = net.createConnection(filename); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', error => ['ECONNREFUSED', 'ENOENT'].includes(error.code) ? resolve(false) : reject(error)); });
      if (active) throw Error('Socket already active'); await fs.unlink(filename);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const adapter = require(path.join(root, 'utils/webDashboardAdapter.cjs'))(root);
    const server = http.createServer(createDashboardHandler(client, adapter).handler);
    server.requestTimeout = 15000; server.headersTimeout = 10000; server.maxConnections = 8;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(filename, resolve); });
    await fs.chmod(filename, 0o660);
    server.on('error', () => logger.warn('[WebDashboard] Local dashboard unavailable.'));
    server.unref(); return server;
  } catch { logger.warn('[WebDashboard] Configuration dashboard unavailable; bot operation unchanged.'); return null; }
}
module.exports = { createDashboardHandler, startBotDashboard };
