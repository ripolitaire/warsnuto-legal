const S = require('../ops/bot-config/webDashboardSchema.cjs');
const { createDashboardHandler } = require('../ops/bot-config/webDashboard.cjs');
const guildId = '661720242585600500', roleId = '661720242585600501', channelId = '661720242585600502';
function createBotConfigFixture(ids) {
  const calls = [], writes = [], audits = [], configs = new Map();
  const tiers = new Map([[ids.OWNER, 'admin'], [ids.ADMIN, 'admin'], [ids.MODERATOR, 'mod-test']]);
  const member = actor => ({ roles: { cache: new Map() }, protectTier: tiers.get(actor) || 'public', permissions: { has: () => [ids.OWNER, ids.ADMIN].includes(actor) } });
  const safeRole = { id: roleId, name: 'Rôle de test', managed: false, position: 1, permissions: { has: () => false } };
  const roleNames = ['Administrateur', 'Modérateur confirmé', 'Modérateur', 'Modérateur en test', 'Responsable support', 'Équipe événement', 'Notifications', 'Membre'];
  const extraRoles = roleNames.map((name, i) => ({ ...safeRole, id: String(661720242585600610n + BigInt(i)), name }));
  const guild = { id: guildId, name: 'Serveur de test', ownerId: ids.OWNER,
    members: { fetch: async ({ user }) => member(user), me: { permissions: { has: () => true }, roles: { highest: { position: 100 } } } },
    roles: { cache: new Map([safeRole, ...extraRoles].map(role => [role.id, role])), fetch: async () => {} },
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
    if (bot === 'protect') {
      adapter.profile = (guild, actor, mode, now) => {
        if (mode !== 'normal') S.fail('Protect ne possède pas de profil Admin Mod.', 403);
        return { sampledAt: now, enabled: true, voiceEnabled: true, maxLevel: 100, progression: { level: 12, xp: 234, totalXp: 50834, nextXp: 14400, levelLabel: null, badgeLabel: null, progressLocked: false, reachedMax: false, lastMessageXpAt: now - 60000, lastVoiceXpAt: now - 120000 } };
      };
      adapter.memberAccess = (g, member) => {
        const tier = member.protectTier || 'public', level = ['public', 'mod-test', 'mod', 'responsible-mod', 'admin'].indexOf(tier);
        return { tier, level, label: ['Membre', 'Modérateur test', 'Modérateur', 'Responsable modération', 'Administrateur Protect'][level], canModerate: level > 0, canConfigure: level === 4, canManagePrisons: level >= 3, commands: level ? ['mute', 'kick', ...(level >= 2 ? ['give-role'] : []), ...(level >= 3 ? ['ban', 'prison'] : []), ...(level === 4 ? ['dashboard'] : [])] : [] };
      };
      adapter.canConfigure = (g, member) => member.protectTier === 'admin';
      const featureSettings = {};
      for (const [id, schema] of Object.entries(require('./feature-schema.json'))) {
        featureSettings[id] = structuredClone(schema.defaults);
        adapter.sections.push(S.section(id, schema.label, schema.fields, () => featureSettings[id], (g, values, actor, patch) => { Object.assign(featureSettings[id], patch); writes.push({ bot, actor, module: id, patch }); }));
      }
      const featureJobs = new Map(), prisons = new Map(); let nextPrison = 1;
      adapter.feature = async (g, actor, method, path, body) => {
        const level = ['public', 'mod-test', 'mod', 'responsible-mod', 'admin'].indexOf(tiers.get(actor) || 'public'), module = path[0];
        if (level < (module === 'prison' ? 3 : 4)) S.fail('Accès au module refusé par Protect.', 403);
        if (method === 'GET' && path[1] === 'job') { const job = featureJobs.get(path[2]); if (!job || job.module !== module) S.fail('Opération inconnue.', 404); return { job }; }
        const jobs = [...featureJobs.values()].filter(job => job.module === module).map(job => ({ id: job.id, status: job.status, action: job.action, updated_at: job.updated_at }));
        if (method === 'GET' && module === 'youtube') return { channelId: 'UCabcdefghijklmnopqrstuv', apiConfigured: true, lastSuccess: Date.now(), lastError: null, publications: [{ video_id: 'new00000000', kind: 'video' }], deliveries: [], jobs };
        if (method === 'GET' && path[1]) { const prison = prisons.get(Number(path[1])); if (!prison) S.fail('Prison inconnue.', 404); return { prison }; }
        if (method === 'GET') return { prisons: [...prisons.values()].filter(p => p.status !== 'closed').map(p => ({ ...p, members: p.members.map(m => ({ userId: m.user_id, status: m.status })) })), jobs };
        S.object(body);
        if (body.confirmation !== 'CONFIRMER' || !/^[a-f\d-]{36}$/.test(body.operationId || '') || typeof body.input?.reason !== 'string' || body.input.reason.trim().length < 3) S.fail('Confirmation et motif requis.');
        if (module === 'youtube' && body.action === 'preview') return { preview: { kind: 'video', title: 'Publication de test', channel: 'WarsNuto', url: 'https://www.youtube.com/watch?v=fixture0000', thumbnail: null, date: '2026-11-07T10:00:00Z' } };
        if (featureJobs.has(body.operationId)) return { job: featureJobs.get(body.operationId) };
        const job = { id: body.operationId, guild_id: g.id, module, action: body.action, payload: body.input, status: 'applied', result: {}, updated_at: Date.now() };
        if (module === 'prison') {
          if (body.action === 'create') {
            const id = nextPrison++;
            prisons.set(id, { id, creator_id: actor, status: 'open', reason: body.input.reason, created_at: Date.now(), members: body.input.userIds.map(user_id => ({ user_id, status: 'active', snapshot: { displayName: 'Membre de test', roles: [{ id: roleId, name: safeRole.name }] }, excluded_roles: [] })), history: [] }); job.result.prisonId = id;
          } else {
            const p = prisons.get(body.input.prisonId); if (!p) S.fail('Prison inconnue.', 404);
            if (body.action === 'close') { p.status = 'closed'; p.members.forEach(m => { m.status = 'released'; }); }
            else if (body.action === 'add') p.members.push(...body.input.userIds.map(user_id => ({ user_id, status: 'active', snapshot: { roles: [] }, excluded_roles: [] })));
            else { const m = p.members.find(m => m.user_id === body.input.userId); if (m && body.action === 'release') m.status = 'released'; if (m && body.action === 'derank') m.excluded_roles = [roleId]; if (m && body.action === 'ban') m.status = 'banned'; }
            p.history.unshift({ action: body.action, actor_id: actor, user_id: body.input.userId, details: { reason: body.input.reason } }); job.result.prisonId = p.id;
          }
        }
        featureJobs.set(job.id, job); writes.push({ bot, actor, module, action: body.action }); return { job };
      };
      const access = { adminRoleIds: [extraRoles[0].id], confirmedModRoleIds: [extraRoles[1].id], modRoleIds: [extraRoles[2].id], testModRoleIds: [extraRoles[3].id], staffOfTheWeekRoleId: null, warnBanRoleId: null, warnBanDurationDays: 7 };
      adapter.sections.push(S.section('access', 'Équipes et accès', [S.roles('adminRoleIds', 'Administrateurs du bot'), S.roles('confirmedModRoleIds', 'Modérateurs confirmés'), S.roles('modRoleIds', 'Modérateurs'), S.roles('testModRoleIds', 'Modérateurs en test'), S.role('staffOfTheWeekRoleId', 'Staff de la semaine'), S.role('warnBanRoleId', 'Rôle WarnBan'), S.number('warnBanDurationDays', 'Durée WarnBan, en jours', 0, 3650)], () => access, (g, next, actor, patch) => { Object.assign(access, patch); writes.push({ bot, actor, patch }); }));
      const logs = { moderationLogChannelId: channelId, logSanctionsChannelId: channelId };
      adapter.sections.push(S.section('logs', 'Salons et journaux', [S.channel('moderationLogChannelId', 'Journal de modération'), S.channel('logSanctionsChannelId', 'Sanctions')], () => logs, (g, next, actor, patch) => Object.assign(logs, patch)));
      const automod = { enabled: true, blockInvites: true, maxMentions: 5 };
      adapter.sections.push(S.section('automod', 'Modération automatique', [S.boolean('enabled', 'Activer l’AutoMod'), S.boolean('blockInvites', 'Bloquer les invitations Discord'), S.number('maxMentions', 'Mentions maximum', 0, 100)], () => automod, (g, next, actor, patch) => Object.assign(automod, patch)));
      const welcome = { enabled: false, publicEnabled: false, publicChannelId: null, verificationChannelId: null, rulesChannelId: null, announcementsChannelId: null, discussionChannelId: null, embedEnabled: true, title: 'Bienvenue sur {guild}', message: 'Bienvenue dans la communauté de WarsNuto !', color: '#FEE75C', footerEnabled: true };
      adapter.sections.push(S.section('welcome', 'Accueil des membres', [S.boolean('enabled', 'Activer les MP de bienvenue'), S.boolean('publicEnabled', 'Activer l’accueil à chaque arrivée dans le salon'), S.channel('publicChannelId', 'Salon d’accueil sur le serveur'), S.channel('verificationChannelId', 'Vérification (facultatif)'), S.channel('rulesChannelId', 'Règlement (facultatif)'), S.channel('announcementsChannelId', 'Annonces (facultatif)'), S.channel('discussionChannelId', 'Discussion (facultatif)'), S.boolean('embedEnabled', 'Utiliser la carte Components V2'), S.text('title', 'Titre commun · variable {guild}', 256, { required: true }), S.text('message', 'Message commun · variable {guild}', 2000, { required: true, multiline: true }), S.field('color', 'Couleur', 'color', { pattern: '^#[a-fA-F0-9]{6}$' }), S.boolean('footerEnabled', 'Afficher le pied de carte')], () => welcome, (g, next, actor, patch) => { Object.assign(welcome, patch); writes.push({ bot, actor, patch }); }, { validate: value => { if (value.publicEnabled && !value.publicChannelId) S.fail('Choisis un salon d’accueil.'); } }));
    }
    adapters[bot] = createDashboardHandler(client, adapter);
  }
  const transport = async (options, body) => {
    calls.push({ options, body }); const bot = require('node:path').basename(options.socketPath, '.sock');
    return adapters[bot].dispatch({ url: options.path, method: options.method, headers: options.headers }, body);
  };
  return { transport, calls, writes, audits, configs, tiers, guild, client, adapters, guildId, roleId, channelId };
}
module.exports = { createBotConfigFixture, guildId, roleId, channelId };
