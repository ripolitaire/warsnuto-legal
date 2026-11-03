const fs = require('node:fs'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { CEILINGS } = require('./permissions.cjs');
function openDatabase(filename, { create = true } = {}) {
  if (!create && (filename === ':memory:' || !fs.existsSync(filename))) throw Error('Base web absente : restauration ou initialisation CLI explicite requise.');
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  const applicationId = db.prepare('PRAGMA application_id').get().application_id;
  const populated = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' LIMIT 1").get();
  if ((applicationId && applicationId !== 0x574e5742) || (populated && applicationId !== 0x574e5742)) { db.close(); throw Error('Cette base ne fait pas partie de la plateforme web.'); }
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;');
  if (filename !== ':memory:') fs.chmodSync(filename, 0o600);
  const version = Number(db.prepare('PRAGMA user_version').get().user_version);
  if (version > 1) { db.close(); throw Error('Schema web plus recent que cette release.'); }
  if (version < 1) transaction(db, () => {
    db.exec(fs.readFileSync(path.join(__dirname, 'migrations/001-platform.sql'), 'utf8'));
    for (const [role, grants] of Object.entries(CEILINGS)) {
      db.prepare('INSERT INTO roles(name) VALUES(?)').run(role);
      for (const permission of grants) db.prepare('INSERT INTO role_permissions(role,permission) VALUES(?,?)').run(role, permission);
    }
    db.exec('PRAGMA user_version=1; PRAGMA application_id=1464751938');
  });
  return db;
}
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); if (result?.then) throw Error('SQL transaction must be synchronous'); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function audit(db, now, actor, action, target, context = {}, result = 'success') {
  db.prepare('INSERT INTO audit_logs(actor_id,action,target_id,created_at,result,context) VALUES(?,?,?,?,?,?)').run(actor, action, target, now, result, JSON.stringify(context));
}
function maintenance(db, now, idleMs = 30 * 60000) {
  transaction(db, () => {
    db.prepare('DELETE FROM oauth_states WHERE expires_at<=?').run(now);
    db.prepare('DELETE FROM rate_limits WHERE expires_at<=?').run(now);
    db.prepare('DELETE FROM sessions WHERE expires_at<? OR revoked_at<? OR last_seen_at<?').run(now - 7 * 86400000, now - 7 * 86400000, now - idleMs - 7 * 86400000);
    db.prepare('DELETE FROM audit_logs WHERE created_at<?').run(now - 180 * 86400000);
  });
}
module.exports = { openDatabase, transaction, audit, maintenance };
