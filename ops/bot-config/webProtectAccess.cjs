const TIERS = Object.freeze(['public', 'mod-test', 'mod', 'responsible-mod', 'admin']);
const LABELS = ['Membre', 'Modérateur test', 'Modérateur', 'Responsable modération', 'Administrateur Protect'];
function createProtectAccess(authorization, settings) {
  return (guild, member, actor) => {
    const owner = guild.ownerId === actor;
    const value = owner ? 'admin' : authorization.getMemberAccessLevel(member);
    const level = Math.max(0, TIERS.indexOf(value)), tier = TIERS[level];
    const confirmed = level === 2 && (settings.getGuildSettings(guild.id).confirmedModRoleIds || []).some(id => member.roles.cache.has(id));
    const commands = level ? Object.entries(authorization.commandRoles).filter(([command, roles]) => !roles.includes('public') && (owner || authorization.canUseCommand(member, command))).map(([command]) => command) : [];
    return { tier, level, label: confirmed ? 'Modérateur confirmé' : LABELS[level], canModerate: level > 0, canConfigure: level === 4, commands };
  };
}
module.exports = { createProtectAccess };
