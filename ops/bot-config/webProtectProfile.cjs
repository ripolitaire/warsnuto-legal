const S = require('./webDashboardSchema.cjs');
function createProtectProfile(level, store, getDatabase) {
  return (guild, actor, mode, now = Date.now()) => {
    if (mode !== 'normal') S.fail('Protect ne possède pas de profil Admin Mod.', 403);
    // Read the live cache, including pending XP, without ensureUser or guild-wide synchronization.
    const state = store.loadLevelData().guilds[guild], config = state?.config || store.getDefaultLevelConfig();
    const base = { sampledAt: now, enabled: config.xpEnabled !== false, voiceEnabled: config.xpEnabled !== false && config.voiceXpEnabled !== false, maxLevel: config.maxLevel, progression: null };
    const record = state?.users?.[actor]; if (!record) return base;
    const computed = level.getLevelStateFromTotalXp(record.totalXP, config);
    const override = getDatabase().prepare('SELECT level_label,badge_label,rank_label,lock_progress FROM level_profile_overrides WHERE guild_id=? AND user_id=?').get(guild, actor);
    return { ...base, progression: {
      level: computed.level, xp: computed.xp, totalXp: computed.totalXP, nextXp: computed.xpRequired,
      levelLabel: override?.level_label || null, badgeLabel: override?.badge_label || null,
      progressLocked: Boolean(override?.lock_progress), reachedMax: computed.level >= config.maxLevel,
      lastMessageXpAt: record.lastXpMessageAt || null, lastVoiceXpAt: record.lastVoiceXpAt || null
    } };
  };
}
module.exports = { createProtectProfile };
