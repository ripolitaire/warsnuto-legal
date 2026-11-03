const { configuration } = require('./config.cjs');
const { openDatabase, transaction, audit } = require('./database.cjs');
const { snowflake, error } = require('./security.cjs');
function bootstrap(db, id, now = Date.now()) {
  if (!snowflake(id)) throw error(400, 'Identifiant Discord invalide.');
  transaction(db, () => {
    if (db.prepare("SELECT count(*) n FROM user_roles WHERE role='OWNER'").get().n) throw error(409, 'Un propriétaire existe déjà. Utiliser le panneau propriétaire.');
    db.prepare('INSERT INTO users(discord_id,account_created_at,created_at) VALUES(?,?,?) ON CONFLICT(discord_id) DO NOTHING').run(id, Number((BigInt(id) >> 22n) + 1420070400000n), now);
    const user = db.prepare('SELECT id,status FROM users WHERE discord_id=?').get(id);
    if (user.status !== 'active') throw error(409, 'Le compte est suspendu.');
    db.prepare("INSERT INTO user_roles(user_id,role) VALUES(?,'OWNER') ON CONFLICT(user_id) DO UPDATE SET role='OWNER'").run(user.id);
    db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(now, user.id);
    audit(db, now, null, 'owner.bootstrap', id);
  });
}
if (require.main === module) {
  let db;
  try {
    if (process.argv[3] !== '--confirm' || process.argv.length !== 4) throw Error('Usage: npm run owner -- ID_DISCORD --confirm');
    const config = configuration(); db = openDatabase(config.databasePath); bootstrap(db, process.argv[2], config.now()); console.log('Proprietaire initial enregistre. Reconnexion Discord requise.');
  } catch (error) { console.error(error.publicMessage || error.message); process.exitCode = 1; } finally { db?.close(); }
}
module.exports = { bootstrap };
