const http = require('node:http'), path = require('node:path');
const { error, object, text, snowflake } = require('./security.cjs');
const { audit } = require('./database.cjs');
const BOTS = Object.freeze({ protect: 'WarsNuto Protect', game: 'WarsNuto Game', support: 'WarsNuto Support' });
function createBotConfiguration(db, config, transport) {
  async function send(bot, route, actor, body) {
    if (!Object.hasOwn(BOTS, bot)) throw error(404, 'Bot inconnu.');
    if (!snowflake(actor)) throw error(403, 'Identité Discord invalide.');
    if (!config.botSocketDirectory && !transport) throw error(503, 'La liaison de configuration des bots n’est pas activée.');
    if (!/^\/(?:guilds|config\/\d{17,20}(?:\/[a-z][a-z0-9_-]{0,39})?)$/.test(route)) throw error(404, 'Rubrique inconnue.');
    const options = { socketPath: path.join(config.botSocketDirectory || '.', bot + '.sock'), path: route,
      method: body ? 'PATCH' : 'GET', headers: { 'x-wn-actor': actor, ...(body ? { 'content-type': 'application/json' } : {}) } };
    if (transport) return transport(options, body);
    return new Promise((resolve, reject) => {
      const unavailable = () => error(503, 'Le bot n’a pas répondu. Actualise les réglages avant de retenter une modification.');
      const request = http.request(options, response => {
        let size = 0; const chunks = [];
        response.on('data', chunk => { size += chunk.length; if (size > 262144) { reject(unavailable()); response.destroy(); } else chunks.push(chunk); });
        response.on('error', () => reject(unavailable()));
        response.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (response.statusCode !== 200) {
              const status = [400, 403, 404, 409, 413].includes(response.statusCode) ? response.statusCode : 503;
              reject(error(status, typeof data.error === 'string' && data.error.length <= 300 ? data.error : 'Configuration refusée par le bot.'));
            } else resolve(data);
          } catch { reject(unavailable()); }
        });
      });
      const timer = setTimeout(() => request.destroy(unavailable()), 12000); timer.unref();
      request.on('error', () => reject(unavailable())); request.on('close', () => clearTimeout(timer));
      request.end(body ? JSON.stringify(body) : undefined);
    });
  }
  return {
    catalog() { return { bots: Object.entries(BOTS).map(([id, name]) => ({ id, name })) }; },
    async guilds(bot, session) { return send(bot, '/guilds', session.user.id); },
    async read(bot, guild, section, session) {
      if (!snowflake(guild)) throw error(400, 'Serveur Discord invalide.');
      return send(bot, '/config/' + guild + (section ? '/' + section : ''), session.user.id);
    },
    async save(bot, guild, section, session, body) {
      object(body, ['values', 'revision', 'reason', 'confirmation', 'operationId']);
      if (!snowflake(guild) || !/^[a-z][a-z0-9_-]{0,39}$/.test(section) || body.confirmation !== 'ENREGISTRER' || !/^[a-f\d]{64}$/.test(body.revision || '') || !/^[a-f\d-]{36}$/.test(body.operationId || '') || !body.values || typeof body.values !== 'object' || Array.isArray(body.values)) throw error(400, 'Formulaire de configuration invalide.');
      if (!Object.hasOwn(BOTS, bot)) throw error(404, 'Bot inconnu.');
      const reason = text(body.reason, 300, 3), context = { bot, guild, section, operationId: body.operationId, fields: Object.keys(body.values).slice(0, 100) };
      audit(db, config.now(), session.user.id, 'bot.config.requested', guild, context, 'pending');
      try {
        const result = await send(bot, '/config/' + guild + '/' + section, session.user.id, { ...body, reason });
        audit(db, config.now(), session.user.id, 'bot.config.saved', guild, context); return result;
      } catch (err) { audit(db, config.now(), session.user.id, 'bot.config.refused', guild, context, err.status === 503 ? 'uncertain' : 'failure'); throw err; }
    }
  };
}
module.exports = { createBotConfiguration, BOTS };
