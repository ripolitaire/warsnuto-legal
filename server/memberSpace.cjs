const { error, snowflake } = require('./security.cjs');
const { BOTS } = require('./botConfiguration.cjs');
function createMemberSpace(db, config, broker) {
  const cache = new Map();
  db.exec(`CREATE TABLE IF NOT EXISTS game_observations(
    actor TEXT NOT NULL,guild TEXT NOT NULL,mode TEXT NOT NULL,bucket INTEGER NOT NULL,
    sampled_at INTEGER NOT NULL,level INTEGER NOT NULL,total_xp INTEGER NOT NULL,
    PRIMARY KEY(actor,guild,mode,bucket));
    CREATE INDEX IF NOT EXISTS game_observations_time ON game_observations(sampled_at)`);
  async function servers(session) {
    const actor = session.user.id, old = cache.get(actor);
    if (old?.until > config.now()) return old.work;
    const work = (async () => {
      const results = await Promise.all(Object.entries(BOTS).map(async ([id, name]) => {
        try { return { id, name, ...await broker.send(id, '/member/servers', actor, undefined, 5000) }; }
        catch { return { id, name, unavailable: true, guilds: [] }; }
      }));
      const guilds = new Map();
      for (const bot of results) for (const guild of bot.guilds) {
        if (!snowflake(guild.id)) continue;
        if (!guilds.has(guild.id)) guilds.set(guild.id, { id: guild.id, name: guild.name, icon: guild.icon, memberCount: guild.memberCount, bots: [] });
        guilds.get(guild.id).bots.push({ id: bot.id, name: bot.name, canConfigure: guild.canConfigure === true });
      }
      return { guilds: [...guilds.values()].sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0) || a.name.localeCompare(b.name, 'fr')), unavailable: results.filter(bot => bot.unavailable).map(bot => bot.name) };
    })();
    if (cache.size >= 1000) cache.delete(cache.keys().next().value);
    cache.set(actor, { until: config.now() + 15000, work });
    return work;
  }
  async function game(session, guild, mode = 'normal') {
    if (!snowflake(guild) || !['normal', 'admin'].includes(mode)) throw error(400, 'Profil Game invalide.');
    const actor = session.user.id, result = await broker.send('game', '/member/' + guild + '/profile/' + mode, actor);
    const time = config.now();
    if (result.player) {
      const { level, totalXp } = result.player;
      if (!Number.isSafeInteger(level) || !Number.isSafeInteger(totalXp)) throw error(503, 'Progression Game indisponible.');
      db.prepare(`INSERT INTO game_observations VALUES(?,?,?,?,?,?,?) ON CONFLICT(actor,guild,mode,bucket)
        DO UPDATE SET sampled_at=excluded.sampled_at,level=excluded.level,total_xp=excluded.total_xp`)
        .run(actor, guild, mode, Math.floor(time / 1800000), time, level, totalXp);
      db.prepare('DELETE FROM game_observations WHERE sampled_at<?').run(time - 30 * 86400000);
      db.prepare('DELETE FROM game_observations WHERE rowid IN (SELECT rowid FROM game_observations ORDER BY sampled_at DESC LIMIT -1 OFFSET 100000)').run();
    }
    const history = db.prepare('SELECT sampled_at AS sampledAt,level,total_xp AS totalXp FROM game_observations WHERE actor=? AND guild=? AND mode=? AND sampled_at>=? ORDER BY sampled_at DESC LIMIT 48').all(actor, guild, mode, time - 30 * 86400000).reverse();
    return { ...result, history };
  }
  return { servers, game };
}
module.exports = { createMemberSpace };
