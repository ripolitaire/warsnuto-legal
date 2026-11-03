const path = require('node:path'), S = require('./webDashboardSchema.cjs');
module.exports = root => {
  const load = name => require(path.join(root, 'utils', name));
  const settings = load('guildSettings'), types = load('ticketTypes'), db = load('database').getDb();
  const sections = [], general = (id, label, fields) => sections.push(S.section(id, label, fields, g => settings.getGuildSettings(g.id), (g, values, actor, patch) => settings.updateGuildSettings(g.id, patch)));
  general('channels', 'Salons du support', [S.channel('categoryId', 'Catégorie des tickets', [4]), S.channel('logChannelId', 'Journal et transcriptions'), S.channel('panelChannelId', 'Salon du panneau public')]);
  general('team', 'Équipes et accès', [S.roles('managerRoleIds', 'Gestionnaires du support', 10), S.roles('moderatorRoleIds', 'Équipe de support', 10)]);
  general('appearance', 'Panneau public', [S.text('panelTitle', 'Titre', 100, { required: true }), S.text('panelDescription', 'Présentation', 2000, { required: true, multiline: true }), S.field('panelImageUrl', 'Image HTTPS', 'url', { maxLength: 500 }), S.text('panelSelectLabel', 'Texte du menu', 100, { required: true }), S.text('panelSelectDescription', 'Description du type par défaut', 100, { required: true })]);
  general('options', 'Fonctionnement des tickets', [S.text('ticketNamePrefix', 'Préfixe des salons', 32, { required: true, pattern: '^[a-zA-Z0-9_-]+$' }), S.number('closeDelaySeconds', 'Délai de suppression, en secondes', 0, 300), S.boolean('allowMultipleTickets', 'Autoriser plusieurs tickets actifs'), S.boolean('mentionTeamOnOpen', 'Mentionner l’équipe à l’ouverture'), S.text('ticketOpenMessage', 'Message d’accueil', 800, { required: true, multiline: true })]);
  sections.push(S.section('types', 'Types de demandes', [S.list('types', 'Catégories du menu d’ouverture', [S.text('key', 'Identifiant', 32, { required: true, pattern: '^[a-z0-9_-]+$' }), S.text('label', 'Nom', 80, { required: true }), S.text('description', 'Description', 100, { required: true }), S.text('emoji', 'Emoji', 80), S.roles('moderatorRoleIds', 'Équipe dédiée', 10)], 25, 1)], g => ({ types: types.getTicketTypes(g.id).map(type => ({ ...type, emoji: type.emoji || '' })) }), (g, values) => {
    if (new Set(values.types.map(t => t.key)).size !== values.types.length) S.fail('Chaque type doit avoir un identifiant unique.');
    db.transaction(() => { const keys = new Set(values.types.map(t => t.key)); for (const old of types.getTicketTypes(g.id)) if (!old.isDefault && !keys.has(old.key)) types.deleteTicketType(g.id, old.key); values.types.forEach((type, sortOrder) => types.upsertTicketType(g.id, { ...type, sortOrder })); })();
  }));
  db.exec('CREATE TABLE IF NOT EXISTS web_configuration_audit(id INTEGER PRIMARY KEY,guild_id TEXT NOT NULL,actor_id TEXT NOT NULL,section TEXT NOT NULL,operation_id TEXT NOT NULL,created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS web_configuration_audit_time ON web_configuration_audit(created_at)');
  return { sections,
    async afterWrite(guild, section) {
      if (!['appearance', 'types'].includes(section)) return;
      if (!await load('ticketService').refreshPanel(guild)) return 'Configuration enregistrée. Aucun panneau public existant à actualiser ; sa publication reste disponible dans Discord.';
    },
    audit(guildId, actor, section, fields, operationId) { db.prepare('INSERT INTO web_configuration_audit(guild_id,actor_id,section,operation_id,created_at) VALUES(?,?,?,?,?)').run(guildId, actor, section, operationId, Date.now()); db.prepare('DELETE FROM web_configuration_audit WHERE created_at<?').run(Date.now() - 180 * 86400000); }
  };
};
