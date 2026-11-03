const S = require('../ops/bot-config/webDashboardSchema.cjs');
const { createDashboardHandler } = require('../ops/bot-config/webDashboard.cjs');
const guildId = '661720242585600500', roleId = '661720242585600501', channelId = '661720242585600502';
function createBotConfigFixture(ids) {
  const calls = [], writes = [], audits = [], configs = new Map();
  const member = actor => ({ roles: { cache: new Map() }, permissions: { has: () => [ids.OWNER, ids.ADMIN].includes(actor) } });
  const safeRole = { id: roleId, name: 'Rôle de test', managed: false, position: 1, permissions: { has: () => false } };
  const guild = { id: guildId, name: 'Serveur de test', ownerId: ids.OWNER,
    members: { fetch: async ({ user }) => member(user), me: { permissions: { has: () => true }, roles: { highest: { position: 100 } } } },
    roles: { cache: new Map([[roleId, safeRole]]), fetch: async () => {} },
    channels: { cache: new Map([[channelId, { id: channelId, guildId, name: 'journal-test', type: 0, permissionsFor: () => ({ has: () => true }) }]]), fetch: async () => {} } };
  const client = { isReady: () => true, guilds: { cache: new Map([[guildId, guild]]) } };
  const adapters = {};
  for (const bot of ['protect', 'game', 'support']) {
    const settings = { enabled: true, title: bot + ' de test', count: 5, multiplier: 1.25, channel: channelId, roles: [roleId], rules: [] }; configs.set(bot, settings);
    const fields = [S.boolean('enabled', 'Activer le module'), S.text('title', 'Titre du module', 80, { required: true }), S.number('count', 'Quantité', 0, 100), S.number('multiplier', 'Multiplicateur de test', 0.2, 5, 0.1), S.channel('channel', 'Salon du journal'), S.roles('roles', 'Rôles autorisés'), S.list('rules', 'Règles', [S.text('name', 'Nom de la règle', 50, { required: true }), S.number('amount', 'Valeur de la règle', 0, 100)])];
    const adapter = { sections: [S.section('general', 'Réglages généraux', fields, () => settings, (guild, next, actor, patch) => { Object.assign(settings, patch); writes.push({ bot, actor, patch }); })], audit: (...args) => audits.push(args),
      profile: bot === 'game' ? (guild, actor, mode, now) => {
        const adminAvailable = actor === ids.OWNER;
        if (mode === 'admin' && !adminAvailable) S.fail('Profil Admin Mod inaccessible.', 403);
        return { mode, adminAvailable, sampledAt: now, player: { level: mode === 'admin' ? 10000 : 42, xp: 85, nextXp: 2355, totalXp: mode === 'admin' ? 9999999 : 49285, className: 'Épéiste', classXp: 1500, berries: 125000, bounty: 4500000, energy: 85, maxEnergy: 120,
          fruit: { name: 'Fruit Nika', mastery: 340, awakened: 1 }, crew: { name: 'Les aventuriers', level: 12 }, weapon: 'Katana', accessory: null, inventory: [{ name: 'Clé de raid', quantity: 3 }], activity: [], seasonPoints: 25 } };
      } : undefined };
    adapters[bot] = createDashboardHandler(client, adapter);
  }
  const transport = async (options, body) => {
    calls.push({ options, body }); const bot = require('node:path').basename(options.socketPath, '.sock');
    return adapters[bot].dispatch({ url: options.path, method: options.method, headers: options.headers }, body);
  };
  return { transport, calls, writes, audits, configs, guild, client, adapters, guildId, roleId, channelId };
}
module.exports = { createBotConfigFixture, guildId, roleId, channelId };
