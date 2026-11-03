const fs = require('node:fs'), path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');
const { configuration } = require('./config.cjs');
async function main() {
  const config = configuration();
  if (!fs.existsSync(config.databasePath)) throw Error('Base web absente.');
  const directory = path.join(config.root, 'backups'); fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, 'web-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + require('node:crypto').randomUUID() + '.sqlite');
  const db = new DatabaseSync(config.databasePath, { readOnly: true });
  try { await backup(db, target); } finally { db.close(); }
  fs.chmodSync(target, 0o600);
  const copy = new DatabaseSync(target, { readOnly: true });
  try { if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Sauvegarde invalide.'); } finally { copy.close(); }
  console.log('Sauvegarde web coherente creee dans backups/. Conserver une copie externe privee.');
}
if (require.main === module) main().catch(() => { console.error('Sauvegarde web impossible. Verifier stockage et permissions.'); process.exitCode = 1; });
module.exports = { main };
