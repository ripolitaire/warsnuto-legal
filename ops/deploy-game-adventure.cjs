// Controlled Game browser-bridge deployment. Run on the VPS only.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { DatabaseSync, backup } = require('node:sqlite');

const bot = { name: 'warsnuto-game-bot', root: '/opt/warsnuto-game-bot', database: 'data/game.sqlite' };
const sourceRoot = fs.realpathSync(path.resolve(__dirname, '..'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run = (bin, args, options = {}) => cp.execFileSync(bin, args, { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'], ...options });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const files = [
  ['ops/bot-config/webDashboard.cjs', 'utils/webDashboard.cjs'],
  ['ops/bot-config/webDashboardSchema.cjs', 'utils/webDashboardSchema.cjs'],
  ['ops/bot-config/game.cjs', 'utils/webDashboardAdapter.cjs'],
  ['ops/bot-config/webAdventure.cjs', 'src/webAdventure.js']
];

const processState = () => {
  const entry = JSON.parse(run('/usr/bin/pm2', ['jlist'])).find(item => item.name === bot.name);
  if (!entry) throw Error('Game PM2 process is missing.');
  return { pid: entry.pid, status: entry.pm2_env.status, restarts: entry.pm2_env.restart_time };
};

function safeRelease(value) {
  if (!/^adventure-\d{8}T\d{6}Z$/.test(value || '')) throw Error('Invalid deployment identifier.');
  return value;
}

function validateSource() {
  if (process.platform !== 'linux' || !sourceRoot.startsWith('/opt/warsnuto-web/releases/')) throw Error('This deployment may only run from a prepared VPS web release.');
  for (const [source] of files) {
    const target = path.join(sourceRoot, source);
    if (!fs.existsSync(target) || !fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink()) throw Error('Missing staged source: ' + source);
    run(process.execPath, ['--check', target]);
  }
}

async function verifiedBackup(source, destination) {
  const db = new DatabaseSync(source, { readOnly: true });
  try { await backup(db, destination); } finally { db.close(); }
  fs.chmodSync(destination, 0o600);
  const check = new DatabaseSync(destination, { readOnly: true });
  try {
    if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Game database backup is not valid.');
  } finally { check.close(); }
}

function copySources() {
  for (const [source, destination] of files) {
    const target = path.join(bot.root, destination);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, source), target);
    fs.chmodSync(target, 0o644);
  }
}

function restoreFiles(work, prepared) {
  for (const [, destination] of files) {
    const target = path.join(bot.root, destination);
    const saved = path.join(work, 'before', destination.replaceAll('/', '__'));
    if (prepared.existing[destination]) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(saved, target);
      fs.chmodSync(target, 0o644);
    } else if (fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
  }
}

async function prepare(id) {
  validateSource();
  const work = path.join('/opt/warsnuto-game-backups', id);
  if (fs.existsSync(work)) throw Error('A deployment with this identifier already exists.');
  const database = path.join(bot.root, bot.database);
  if (!fs.existsSync(database)) throw Error('Game database is missing.');
  const disk = fs.statfsSync('/opt');
  if (disk.bavail * disk.bsize < fs.statSync(database).size * 2 + 256 * 1024 ** 2) throw Error('Insufficient disk space for a verified backup.');
  fs.mkdirSync(path.join(work, 'before'), { recursive: true, mode: 0o700 });
  try {
    await verifiedBackup(database, path.join(work, 'game.sqlite'));
    const existing = {}, sources = {};
    for (const [source, destination] of files) {
      const target = path.join(bot.root, destination);
      existing[destination] = fs.existsSync(target);
      if (existing[destination]) fs.copyFileSync(target, path.join(work, 'before', destination.replaceAll('/', '__')));
      sources[source] = hash(path.join(sourceRoot, source));
    }
    const prepared = { id, at: new Date().toISOString(), sourceRoot, process: processState(), existing, sources };
    fs.writeFileSync(path.join(work, 'prepared.json'), JSON.stringify(prepared, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ phase: 'prepared', id, databaseBackupVerified: true, process: prepared.process }));
  } catch (error) {
    fs.rmSync(work, { recursive: true, force: true });
    throw error;
  }
}

async function activate(id) {
  validateSource();
  const work = path.join('/opt/warsnuto-game-backups', id);
  const prepared = JSON.parse(fs.readFileSync(path.join(work, 'prepared.json'), 'utf8'));
  if (prepared.id !== id || prepared.sourceRoot !== sourceRoot || fs.existsSync(path.join(work, 'activated.json'))) throw Error('Prepared deployment state changed.');
  for (const [source] of files) if (hash(path.join(sourceRoot, source)) !== prepared.sources[source]) throw Error('Staged source changed after preparation: ' + source);
  const before = processState();
  if (before.pid !== prepared.process.pid || before.status !== prepared.process.status) throw Error('Game process changed after preparation.');
  try {
    copySources();
    run('/usr/bin/pm2', ['restart', bot.name]);
    let online = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await wait(1000);
      const current = processState();
      if (current.status === 'online' && current.pid !== before.pid) { online = current; break; }
    }
    if (!online) throw Error('Game did not confirm online after the browser bridge update.');
    const result = { phase: 'activated', id, at: new Date().toISOString(), process: online, databaseRestored: false, environmentChanged: false };
    fs.writeFileSync(path.join(work, 'activated.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result));
  } catch (error) {
    restoreFiles(work, prepared);
    run('/usr/bin/pm2', ['restart', bot.name]);
    fs.writeFileSync(path.join(work, 'rolled-back.json'), JSON.stringify({ at: new Date().toISOString(), reason: String(error.message).slice(0, 240) }, null, 2), { mode: 0o600 });
    throw error;
  }
}

(async () => {
  process.umask(0o077);
  const phase = process.argv[2], id = safeRelease(process.argv[3]);
  if (phase === 'prepare') await prepare(id);
  else if (phase === 'activate') await activate(id);
  else throw Error('Choose prepare or activate.');
})().catch(error => {
  console.error(JSON.stringify({ ok: false, message: String(error.message).split('\n')[0].slice(0, 220) }));
  process.exitCode = 1;
});
