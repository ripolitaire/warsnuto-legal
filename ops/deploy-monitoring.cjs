// One-time, reviewed deployment. Private payload contains source only, never credentials or live data.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const { DatabaseSync, backup } = require('node:sqlite');
const payload = '/tmp/warsnuto-monitor-20261103', release = '/opt/warsnuto-web/releases/web-20261103-02';
const previous = '/opt/warsnuto-web/releases/web-20261103-01', current = '/opt/warsnuto-web/current';
const work = '/opt/warsnuto-web-backups/web-20261103-02', directory = '/run/warsnuto-bot-monitor';
const node = '/opt/warsnuto-web-runtime/bin/node', environmentFile = '/etc/warsnuto-web/runtime.env';
const bots = [
  { id: 'protect', name: 'warsnuto-bot', root: '/opt/warsnuto-bot', database: 'bot.sqlite' },
  { id: 'game', name: 'warsnuto-game-bot', root: '/opt/warsnuto-game-bot', database: 'game.sqlite' },
  { id: 'support', name: 'warsnuto-ticket-bot', root: '/opt/warsnuto-ticket-bot', database: 'tickets.sqlite' }
];
const run = (bin, args, options = {}) => cp.execFileSync(bin, args, { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'], ...options });
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const processes = () => JSON.parse(run('/usr/bin/pm2', ['jlist'])).map(p => ({ name: p.name, pid: p.pid, status: p.pm2_env.status, restarts: p.pm2_env.restart_time }));
const manifest = () => JSON.parse(fs.readFileSync(payload + '/manifest.json', 'utf8'));
const writeReport = (name, value) => fs.writeFileSync(work + '/' + name + '.json', JSON.stringify(value, null, 2), { mode: 0o600 });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function preflightBots(m) {
  for (const bot of bots) {
    const entry = m.bots[bot.id];
    if (!entry || !fs.lstatSync(bot.root + '/index.js').isFile() || hash(bot.root + '/index.js') !== entry.beforeIndexHash ||
      hash(payload + '/' + bot.id + '-index.js') !== entry.indexHash || hash(payload + '/botTelemetry.cjs') !== entry.moduleHash) throw Error('Bot source changed: ' + bot.id);
    if (fs.existsSync(bot.root + '/utils') && !fs.lstatSync(bot.root + '/utils').isDirectory()) throw Error('Unexpected bot directory');
    if (fs.existsSync(bot.root + '/utils/webTelemetry.cjs')) throw Error('Existing telemetry requires review');
  }
}
async function saveDatabase(source, target) {
  const db = new DatabaseSync(source, { readOnly: true });
  try { await backup(db, target); } finally { db.close(); }
  fs.chmodSync(target, 0o600);
  const copy = new DatabaseSync(target, { readOnly: true });
  try { if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Invalid backup'); } finally { copy.close(); }
}
async function prepare() {
  if (fs.existsSync(release) || fs.existsSync(work) || fs.realpathSync(current) !== previous) throw Error('Deployment already prepared or release changed');
  const m = manifest(); preflightBots(m);
  const old = JSON.parse(fs.readFileSync('/opt/warsnuto-web-backups/web-20261103-01/published-manifest.json'));
  for (const [name, expected] of Object.entries(old.files)) if (hash(previous + '/' + name) !== expected) throw Error('Web source changed');
  const storage = fs.statfsSync('/opt'), backupBytes = bots.reduce((sum, bot) => sum + fs.statSync(bot.root + '/data/' + bot.database).size, 0);
  if (storage.bavail * storage.bsize < 2 * 1024 ** 3 + backupBytes) throw Error('Insufficient backup headroom');
  fs.mkdirSync(work, { mode: 0o700 }); fs.mkdirSync(release, { mode: 0o755 });
  const members = run('tar', ['-tzf', payload + '/source.tgz']).trim().split('\n');
  if (members.some(name => path.isAbsolute(name) || name.split('/').includes('..') || /(?:^|\/)\.env(?!\.example$)/.test(name))) throw Error('Unsafe source archive');
  run('tar', ['-xzf', payload + '/source.tgz', '-C', release]);
  for (const [name, expected] of Object.entries(m.files)) {
    if (path.isAbsolute(name) || name.split('/').includes('..') || !fs.lstatSync(release + '/' + name).isFile() || hash(release + '/' + name) !== expected) throw Error('Invalid release file');
  }
  run('chmod', ['-R', 'a+rX', release]);
  run(node, ['/opt/warsnuto-web-runtime/lib/node_modules/npm/bin/npm-cli.js', 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: release, env: { PATH: '/opt/warsnuto-web-runtime/bin:/usr/bin:/bin', HOME: '/root', NODE_ENV: 'production' }
  });
  run('chmod', ['-R', 'a+rX', release]);
  const tests = fs.readdirSync(release + '/tests').filter(n => n.endsWith('.test.cjs')).map(n => 'tests/' + n);
  run(node, ['--test', ...tests], { cwd: release, env: { PATH: '/opt/warsnuto-web-runtime/bin:/usr/bin:/bin', HOME: '/root', NODE_ENV: 'test' } });
  for (const bot of bots) run('/usr/bin/node', ['--check', payload + '/' + bot.id + '-index.js']);
  run('/usr/bin/node', ['--check', payload + '/botTelemetry.cjs']);
  console.log(JSON.stringify({ phase: 'source-verified', commit: m.commit, linuxTestsPassed: true, node20SyntaxPassed: true }));
  for (const bot of bots) {
    await saveDatabase(bot.root + '/data/' + bot.database, work + '/' + bot.id + '.sqlite');
    fs.copyFileSync(bot.root + '/index.js', work + '/' + bot.id + '-index.before.js');
    console.log(JSON.stringify({ phase: 'backup-verified', bot: bot.id }));
  }
  await saveDatabase('/var/lib/warsnuto-web/data/web.sqlite', work + '/web.sqlite');
  fs.copyFileSync(environmentFile, work + '/runtime.env.before');
  fs.copyFileSync('/etc/systemd/system/warsnuto-web.service', work + '/web-service.before');
  fs.chmodSync(work + '/runtime.env.before', 0o600);
  writeReport('prepared', { at: new Date().toISOString(), commit: m.commit, bots: processes(), backupsVerified: true, linuxTestsPassed: true });
  console.log(JSON.stringify({ phase: 'prepared', commit: m.commit, botsRestarted: false }));
}
async function activate() {
  const m = manifest(), prepared = JSON.parse(fs.readFileSync(work + '/prepared.json'));
  if (prepared.commit !== m.commit || fs.existsSync(work + '/activated.json') || fs.realpathSync(current) !== previous) throw Error('Activation state changed');
  preflightBots(m);
  const originalEnv = fs.readFileSync(environmentFile, 'utf8'), env = require('node:util').parseEnv(originalEnv);
  if (env.WEB_BOT_TELEMETRY_DIRECTORY) throw Error('Monitoring already configured');
  if (originalEnv !== fs.readFileSync(work + '/runtime.env.before', 'utf8')) throw Error('Backend environment changed');
  require(release + '/server/config.cjs').configuration({ ...env, WEB_BOT_TELEMETRY_DIRECTORY: directory });
  if (fs.existsSync('/etc/tmpfiles.d/warsnuto-bot-monitor.conf')) throw Error('Existing runtime directory policy');
  fs.copyFileSync(release + '/ops/warsnuto-bot-monitor.conf', '/etc/tmpfiles.d/warsnuto-bot-monitor.conf');
  fs.chmodSync('/etc/tmpfiles.d/warsnuto-bot-monitor.conf', 0o644);
  run('systemd-tmpfiles', ['--create', '/etc/tmpfiles.d/warsnuto-bot-monitor.conf']);
  const updated = [];
  for (const bot of bots) {
    fs.mkdirSync(bot.root + '/utils', { recursive: true, mode: 0o755 });
    fs.copyFileSync(payload + '/botTelemetry.cjs', bot.root + '/utils/webTelemetry.cjs'); fs.chmodSync(bot.root + '/utils/webTelemetry.cjs', 0o644);
    fs.copyFileSync(payload + '/' + bot.id + '-index.js', bot.root + '/index.js'); fs.chmodSync(bot.root + '/index.js', 0o644);
    const before = processes().find(p => p.name === bot.name);
    run('/usr/bin/pm2', ['restart', bot.name, '--update-env'], { env: { ...process.env, WARSNUTO_TELEMETRY_DIRECTORY: directory } });
    let ready;
    for (let i = 0; i < 60; i++) {
      await pause(1500);
      try {
        const status = processes().find(p => p.name === bot.name), sample = JSON.parse(fs.readFileSync(directory + '/' + bot.id + '.json'));
        if (status?.status === 'online' && status.pid !== before.pid && sample.pid === status.pid && sample.bot === bot.id && sample.gateway.ready && Date.now() - sample.sampledAt < 30000) { ready = status; break; }
      } catch {}
    }
    if (!ready) {
      fs.copyFileSync(work + '/' + bot.id + '-index.before.js', bot.root + '/index.js');
      run('/usr/bin/pm2', ['restart', bot.name]);
      writeReport('partial', { at: new Date().toISOString(), restoredBot: bot.id, updated });
      throw Error('Bot did not reconnect; its previous entrypoint was restored');
    }
    updated.push({ id: bot.id, pid: ready.pid }); console.log(JSON.stringify({ phase: 'bot-connected', bot: bot.id, pid: ready.pid }));
  }
  run('/usr/bin/pm2', ['save']);
  await activateWeb(m);
}
async function activateWeb(m) {
  const prepared = JSON.parse(fs.readFileSync(work + '/prepared.json'));
  if (!prepared.backupsVerified || fs.existsSync(work + '/activated.json') || fs.realpathSync(current) !== previous) throw Error('Invalid web activation state');
  for (const [name, expected] of Object.entries(m.files)) if (hash(release + '/' + name) !== expected) throw Error('Web source changed');
  for (const bot of bots) {
    if (hash(bot.root + '/index.js') !== m.bots[bot.id].indexHash || hash(bot.root + '/utils/webTelemetry.cjs') !== m.bots[bot.id].moduleHash) throw Error('Live bot source changed');
    const signal = JSON.parse(fs.readFileSync(directory + '/' + bot.id + '.json'));
    if (!signal.gateway.ready || Date.now() - signal.sampledAt > 30000 || !processes().some(p => p.name === bot.name && p.pid === signal.pid && p.status === 'online')) throw Error('Bot not ready for web activation');
  }
  run('/usr/sbin/runuser', ['-u', 'warsnutoweb', '--', node, '-e', "require('express');require('oauth4webapi');require('./server/app.cjs')"], { cwd: release });
  const originalEnv = fs.readFileSync(environmentFile, 'utf8'), env = require('node:util').parseEnv(originalEnv);
  if (originalEnv !== fs.readFileSync(work + '/runtime.env.before', 'utf8')) throw Error('Backend environment changed');
  require(release + '/server/config.cjs').configuration({ ...env, WEB_BOT_TELEMETRY_DIRECTORY: directory });
  fs.writeFileSync(environmentFile + '.monitor-next', originalEnv.replace(/\s*$/, '\n') + 'WEB_BOT_TELEMETRY_DIRECTORY=' + directory + '\n', { mode: 0o600, flag: 'wx' });
  fs.renameSync(environmentFile + '.monitor-next', environmentFile);
  fs.symlinkSync(release, current + '.monitor-next'); fs.renameSync(current + '.monitor-next', current);
  fs.copyFileSync(release + '/ops/warsnuto-web.service', '/etc/systemd/system/warsnuto-web.service'); fs.chmodSync('/etc/systemd/system/warsnuto-web.service', 0o644);
  run('systemctl', ['daemon-reload']); run('systemctl', ['restart', 'warsnuto-web']);
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch('http://127.0.0.1:3100/api/platform/session', { headers: { 'x-wn-origin-secret': env.WEB_ORIGIN_SECRET, 'x-forwarded-proto': 'https' }, signal: AbortSignal.timeout(2000) }); if (r.ok && (await r.json()).configured) { healthy = true; break; } } catch {}
    await pause(1000);
  }
  if (!healthy) {
    fs.symlinkSync(previous, current + '.rollback'); fs.renameSync(current + '.rollback', current);
    fs.copyFileSync(work + '/runtime.env.before', environmentFile); fs.chmodSync(environmentFile, 0o600);
    fs.copyFileSync(work + '/web-service.before', '/etc/systemd/system/warsnuto-web.service'); fs.chmodSync('/etc/systemd/system/warsnuto-web.service', 0o644);
    run('systemctl', ['daemon-reload']); run('systemctl', ['restart', 'warsnuto-web']);
    throw Error('Web health failed; prior web release restored');
  }
  const code = `require('${release}/server/botMonitor.cjs').createBotMonitor({telemetryDirectory:'${directory}',now:Date.now})().then(data=>console.log(JSON.stringify(data)))`;
  const monitoring = JSON.parse(run('/usr/sbin/runuser', ['-u', 'warsnutoweb', '--', node, '-e', code]));
  if (monitoring.bots.some(bot => bot.status !== 'available')) throw Error('Web account cannot read current bot snapshots');
  const report = { at: new Date().toISOString(), commit: m.commit, monitoring, bots: processes(), backupsVerified: true, databaseReset: false };
  writeReport('activated', report); console.log(JSON.stringify({ phase: 'activated', ...report }));
}
(async () => { process.umask(0o077); if (process.argv[2] === 'prepare') await prepare(); else if (process.argv[2] === 'activate') await activate(); else if (process.argv[2] === 'activate-web') await activateWeb(manifest()); else throw Error('Choose prepare, activate or activate-web'); })()
  .catch(error => { console.log(JSON.stringify({ ok: false, message: String(error.message).split('\n')[0].slice(0, 180) })); process.exitCode = 1; });
