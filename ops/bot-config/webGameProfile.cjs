const S = require('./webDashboardSchema.cjs');
function createGameProfile(database, catalog) {
  const db = database.db;
  const label = (entries, id) => entries?.[id]?.name || Object.values(entries || {}).find(entry => entry.id === id)?.name || id || null;
  return (guild, actor, mode, now = Date.now()) => {
    const adminAvailable = database.isGameAdminMember(guild, actor);
    if (mode === 'admin' && !adminAvailable) S.fail('Ton profil Admin Mod n’est pas accessible.', 403);
    // Read raw rows: getPlayer/getInventory also create or update game accounts.
    const partition = mode === 'admin' ? `adminmod|${guild}|${actor}` : guild;
    const player = db.prepare('SELECT * FROM players WHERE guild_id=? AND user_id=?').get(partition, actor);
    const base = { mode, adminAvailable, sampledAt: now, player: null };
    if (!player) return base;
    const level = Math.max(1, player.level), nextXp = 100 + (level - 1) * 55;
    const crew = database.getCrewByUser(partition, actor);
    const inventory = db.prepare('SELECT item_id,quantity FROM inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY item_id LIMIT 200').all(partition, actor);
    const fruit = player.fruit_id ? { id: player.fruit_id, name: label(catalog.FRUITS, player.fruit_id), mastery: player.fruit_mastery, awakened: player.fruit_awakened || 0 } : null;
    return { ...base, player: {
      level, xp: player.xp, nextXp, totalXp: 100 * (level - 1) + 55 * (level - 1) * (level - 2) / 2 + player.xp,
      className: label(catalog.CLASSES, player.class_id), classXp: player.class_xp,
      berries: player.berries, bounty: player.prime, seasonPoints: player.season_points || 0,
      energy: Math.min(player.max_energy, player.energy + Math.floor(Math.max(0, now - player.last_energy_at) / 480000)), maxEnergy: player.max_energy,
      fruit, weapon: label(catalog.ITEMS, player.equipped_weapon), accessory: label(catalog.ITEMS, player.equipped_accessory),
      crew: crew ? { name: crew.name, level: crew.level, role: crew.member_role } : null,
      createdAt: player.created_at, updatedAt: player.updated_at,
      inventory: inventory.map(item => ({ name: label({ ...catalog.FRUITS, ...catalog.ITEMS }, item.item_id), quantity: item.quantity }))
    } };
  };
}
module.exports = { createGameProfile };
