const { permissions } = require('./permissions.cjs');

async function discordSiteRole(session, { db, config, memberSpace, fresh = false }) {
  if (!session || !config.discordRoleSyncGuildId || session.user.role === 'OWNER') return session;
  const access = await memberSpace.protectSession(session, fresh);
  const guild = access.available && access.guilds.find(guild => guild.id === config.discordRoleSyncGuildId);
  const role = guild?.tier === 'admin' ? 'ADMIN'
    : ['mod-test', 'mod', 'responsible-mod'].includes(guild?.tier) ? 'MODERATOR' : 'USER';
  // Never persist a Discord-derived grant: removal and outages must revoke it.
  return { ...session, user: { ...session.user, role },
    permissions: permissions(db, session.userId, role), protectAccess: access };
}
module.exports = { discordSiteRole };
