const path = require('node:path'), S = require('./webDashboardSchema.cjs');
module.exports = root => {
  const load = name => require(path.join(root, 'src', name));
  const database = load('database'), service = load('gameService'), catalog = load('gameData'), state = load('serverState'), auto = load('autoBoss');
  const check = result => { if (result?.ok === false) S.fail(result.message); return result; };
  const general = (id, label, fields) => S.section(id, label, fields, g => Object.fromEntries(fields.map(f => [f.key, ['role', 'channel'].includes(f.type) ? database.getSetting(g.id, f.key, '') || null : f.type === 'number' ? Number(database.getSetting(g.id, f.key, '1')) : database.getSetting(g.id, f.key, '')])), (g, values, actor, patch) => database.db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) { if (value === null) { database.setSetting(g.id, key, ''); database.logAdminAction(g.id, actor, null, 'config:set', key + ' désactivé depuis le site.'); } else check(service.setAdminConfig(g.id, key, value, actor)); }
  })());
  const sections = [
    S.section('availability', 'Activation du jeu', [S.boolean('enabled', 'Activer le jeu sur ce serveur')], g => ({ enabled: state.isGameEnabled(g.id) }), (g, values, actor) => state.setGameEnabled(g.id, actor, values.enabled)),
    general('channels', 'Salons du jeu', catalog.ADMIN_CHANNELS.map(entry => S.channel(entry.key, entry.name))),
    general('access', 'Rôles de l’équipe Game', catalog.ADMIN_PERMISSION_LEVELS.map(entry => S.role(entry.key, entry.name))),
    general('balance', 'Récompenses et difficulté', [['reward_multiplier', 'Multiplicateur de récompenses'], ['xp_multiplier', 'Multiplicateur XP'], ['rare_multiplier', 'Multiplicateur des objets rares'], ['boss_damage_multiplier', 'Multiplicateur des dégâts de boss']].map(([key, label]) => S.number(key, label, 0.2, 5, 0.1))),
    general('notes', 'Notes de boutique et de saison', [S.text('shop_rotation_note', 'Note de boutique', 500, { multiline: true }), S.text('season_note', 'Note de saison', 500, { multiline: true })]),
    S.section('auto-boss', 'Boss automatiques', [S.boolean('enabled', 'Activer les boss automatiques toutes les deux heures')], g => auto.getAutoBossConfig(g.id), (g, values, actor, patch) => check(auto.configureAutoBoss(g.id, actor, patch))),
    S.section('events', 'Événement du jeu', [S.select('eventId', 'Événement actif', Object.values(catalog.EVENTS).map(event => ({ value: event.id, label: event.name })))], g => ({ eventId: service.getEventStatus(g.id).id }), (g, values, actor) => check(service.setActiveEvent(g.id, values.eventId, actor)))
  ];
  const halloween = load('halloween');
  sections.push(S.section('halloween', 'Événement Halloween', [S.boolean('enabled', 'Activer l’événement Halloween'), { ...S.channel('channelId', 'Salon du boss Halloween'), required: true }, S.field('endsAt', 'Fin de l’événement', 'datetime', { maxLength: 30 })], g => { const c = halloween.config(g.id); return { enabled: c.enabled, channelId: c.channelId || null, endsAt: c.endsAt ? new Date(c.endsAt).toISOString() : '' }; }, (g, values, actor, patch) => { const input = { expectedRevision: halloween.config(g.id).revision }; for (const [key, value] of Object.entries(patch)) input[key] = key === 'endsAt' ? value ? Date.parse(value) : 0 : value; halloween.configure(g.id, actor, input); }));
  const roles = load('gameRoles');
  const bindings = roles.gameRoleCatalog();
  sections.push(S.section('player-roles', 'Rôles de progression et notifications', bindings.map(binding => S.role(binding.id, binding.name, true)), g => Object.fromEntries(roles.gameRoleBindings(g.id).map(binding => [binding.id, binding.roleId || null])), async (g, values, actor, patch) => {
    const me = g.members.me || await g.members.fetchMe();
    if (new Set(Object.values(values).filter(Boolean)).size !== Object.values(values).filter(Boolean).length) S.fail('Chaque rôle doit correspondre à un seul objectif.');
    for (const value of Object.values(patch).filter(Boolean)) { const error = roles.roleSafetyError(g, g.roles.cache.get(value), me); if (error) S.fail(error); }
    // All Discord reads and checks finish before the local configuration transaction.
    database.db.transaction(() => { for (const [key, value] of Object.entries(patch)) { database.setSetting(g.id, 'game_role_' + key, value || ''); database.logAdminAction(g.id, actor, null, 'game_role_config', key + ' modifié depuis le site.'); } })();
    if (patch.notifications) load('gameNotifications').scheduleNotifications(g.id, actor);
  }));
  return { sections, audit: (guildId, actor, section, fields, operationId) => database.logAdminAction(guildId, actor, null, 'web:config', JSON.stringify({ section, fields, operationId })) };
};
