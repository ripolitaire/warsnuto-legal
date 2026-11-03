const fs = require('node:fs'), cp = require('node:child_process'), path = require('node:path'), crypto = require('node:crypto'), http = require('node:http'), zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises'), { DatabaseSync, backup } = require('node:sqlite');
const release = '/opt/warsnuto-web/releases/web-20261103-04', previous = '/opt/warsnuto-web/releases/web-20261103-03';
const work = '/opt/warsnuto-web-backups/web-20261103-04', payload = '/tmp/warsnuto-member-20261103', current = '/opt/warsnuto-web/current';
const node = '/opt/warsnuto-web-runtime/bin/node', actor = '1360350111611228450';
const bots = [{ id: 'protect', name: 'warsnuto-bot', root: '/opt/warsnuto-bot', db: 'bot.sqlite' }, { id: 'game', name: 'warsnuto-game-bot', root: '/opt/warsnuto-game-bot', db: 'game.sqlite' }, { id: 'support', name: 'warsnuto-ticket-bot', root: '/opt/warsnuto-ticket-bot', db: 'tickets.sqlite' }];
const run = (bin, args, options = {}) => cp.execFileSync(bin, args, { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'], ...options });
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const manifest = () => JSON.parse(fs.readFileSync(payload + '/manifest.json'));
const report = (name, data) => fs.writeFileSync(work + '/' + name + '.json', JSON.stringify(data, null, 2), { mode: 0o600 });
const files = bot => [['webDashboard.cjs', 'webDashboard.cjs'], [bot.id + '.cjs', 'webDashboardAdapter.cjs'], ...(bot.id === 'game' ? [['webGameProfile.cjs', 'webGameProfile.cjs']] : [])];
const processes = () => JSON.parse(run('/usr/bin/pm2', ['jlist'])).map(p => ({ name: p.name, pid: p.pid, status: p.pm2_env.status }));
function verifySource(base, data) {
  for (const [file, expected] of Object.entries(data.files)) {
    if (path.isAbsolute(file) || file.split('/').includes('..') || !fs.lstatSync(base + '/' + file).isFile() || hash(base + '/' + file) !== expected) throw Error('Source changed: ' + file);
  }
}
function verifyInstalled() {
  for (const bot of bots) for (const [source, destination] of files(bot)) {
    const target = bot.root + '/utils/' + destination, prior = previous + '/ops/bot-config/' + source;
    if (fs.existsSync(prior) ? !fs.existsSync(target) || hash(prior) !== hash(target) : fs.existsSync(target)) throw Error('Bot integration changed: ' + bot.id + '/' + destination);
  }
}
async function coherentBackup(source, name) {
  const pending = work + '/' + name + '.sqlite.pending', target = work + '/' + name + '.sqlite.gz';
  const db = new DatabaseSync(source, { readOnly: true }); try { await backup(db, pending); } finally { db.close(); }
  fs.chmodSync(pending, 0o600);
  const check = new DatabaseSync(pending, { readOnly: true }); try { if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Invalid database backup'); } finally { check.close(); }
  const digest = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(pending)) digest.update(chunk);
  await pipeline(fs.createReadStream(pending), zlib.createGzip({ level: 3 }), fs.createWriteStream(target, { flags: 'wx', mode: 0o600 }));
  const restored = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(target).pipe(zlib.createGunzip())) restored.update(chunk);
  if (digest.digest('hex') !== restored.digest('hex') || path.dirname(pending) !== work || fs.realpathSync(work) !== work) throw Error('Compressed backup mismatch');
  fs.unlinkSync(pending);
  console.log(JSON.stringify({ phase: 'backup-verified', name, bytes: fs.statSync(target).size }));
}
async function prepare() {
  if (fs.existsSync(release) || fs.existsSync(work) || fs.realpathSync(current) !== previous) throw Error('Deployment state changed');
  verifySource(previous, JSON.parse(fs.readFileSync('/opt/warsnuto-web-backups/web-20261103-03/published-manifest.json'))); verifyInstalled();
  const disk = fs.statfsSync('/opt'), largest = Math.max(...bots.map(bot => fs.statSync(bot.root + '/data/' + bot.db).size));
  if (disk.bavail * disk.bsize < largest + 1.2 * 1024 ** 3) throw Error('Insufficient disk headroom');
  fs.mkdirSync(work, { mode: 0o700 }); fs.mkdirSync(release, { mode: 0o755 });
  const entries = run('tar', ['-tzf', payload + '/source.tgz']).trim().split('\n');
  if (entries.some(name => path.isAbsolute(name) || name.split('/').includes('..') || /(?:^|\/)\.env(?!\.example$)/.test(name))) throw Error('Unsafe archive');
  run('tar', ['-xzf', payload + '/source.tgz', '-C', release]); verifySource(release, manifest());
  run(node, ['/opt/warsnuto-web-runtime/lib/node_modules/npm/bin/npm-cli.js', 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: release, env: { PATH: '/opt/warsnuto-web-runtime/bin:/usr/bin:/bin', HOME: '/root', NODE_ENV: 'production' } });
  run('chmod', ['-R', 'a+rX', release]);
  run('/usr/sbin/runuser', ['-u', 'warsnutoweb', '--', node, '-e', "require('express');require('./server/app.cjs')"], { cwd: release });
  const output = run(node, ['--test', ...fs.readdirSync(release + '/tests').filter(f => f.endsWith('.test.cjs')).map(f => 'tests/' + f)], { cwd: release });
  report('linux-tests', { output }); console.log(JSON.stringify({ phase: 'linux-tests-passed', commit: manifest().commit }));
  const before = processes();
  for (const bot of bots) {
    await coherentBackup(bot.root + '/data/' + bot.db, bot.id);
    for (const [, destination] of files(bot)) if (fs.existsSync(bot.root + '/utils/' + destination)) fs.copyFileSync(bot.root + '/utils/' + destination, work + '/' + bot.id + '-' + destination);
  }
  await coherentBackup('/var/lib/warsnuto-web/data/web.sqlite', 'web');
  report('prepared', { commit: manifest().commit, before, indices: Object.fromEntries(bots.map(bot => [bot.id, hash(bot.root + '/index.js')])) });
  console.log(JSON.stringify({ phase: 'prepared', commit: manifest().commit }));
}
async function ipc(bot, route) {
  return new Promise((resolve, reject) => {
    const request = http.get({ socketPath: '/run/warsnuto-bot-config/' + bot + '.sock', path: route, headers: { 'x-wn-actor': actor } }, response => {
      const chunks = []; response.on('data', c => chunks.push(c)); response.on('error', reject); response.on('end', () => { try { if (response.statusCode !== 200) throw Error('IPC status ' + response.statusCode); resolve(JSON.parse(Buffer.concat(chunks))); } catch (e) { reject(e); } });
    }); request.setTimeout(20000, () => request.destroy(Error('IPC timeout'))); request.on('error', reject);
  });
}
async function activate() {
  const prepared = JSON.parse(fs.readFileSync(work + '/prepared.json'));
  if (fs.realpathSync(current) !== previous || prepared.commit !== manifest().commit || fs.existsSync(work + '/activated.json')) throw Error('Activation state changed');
  verifySource(release, manifest()); verifyInstalled();
  for (const bot of bots) if (hash(bot.root + '/index.js') !== prepared.indices[bot.id]) throw Error('Bot entrypoint changed');
  const changed = [], checks = [];
  try {
    for (const bot of bots) {
      changed.push(bot);
      for (const [source, destination] of files(bot)) { fs.copyFileSync(release + '/ops/bot-config/' + source, bot.root + '/utils/' + destination); fs.chmodSync(bot.root + '/utils/' + destination, 0o644); }
      const before = processes().find(p => p.name === bot.name); run('/usr/bin/pm2', ['restart', bot.name]);
      let ready = false;
      for (let n = 0; n < 60; n++) {
        await pause(1500);
        try {
          const p = processes().find(p => p.name === bot.name), signal = JSON.parse(fs.readFileSync('/run/warsnuto-bot-monitor/' + bot.id + '.json'));
          if (p.status === 'online' && p.pid !== before.pid && signal.pid === p.pid && signal.gateway.ready) {
            const directory = await ipc(bot.id, '/member/servers');
            let profile = null;
            if (bot.id === 'game') {
              for (const guild of directory.guilds) {
                const normal = await ipc('game', '/member/' + guild.id + '/profile/normal');
                profile = { readable: true, normalAccount: Boolean(normal.player) };
                if (normal.adminAvailable) { await ipc('game', '/member/' + guild.id + '/profile/admin'); profile.adminReadable = true; }
              }
            }
            checks.push({ id: bot.id, servers: directory.guilds.length, profile }); ready = true; break;
          }
        } catch {}
      }
      if (!ready) throw Error('Bot member bridge not ready: ' + bot.id);
      console.log(JSON.stringify({ phase: 'bot-verified', ...checks.at(-1) }));
    }
    fs.symlinkSync(release, current + '.members-next'); fs.renameSync(current + '.members-next', current); run('systemctl', ['restart', 'warsnuto-web']);
    const env = require('node:util').parseEnv(fs.readFileSync('/etc/warsnuto-web/runtime.env', 'utf8')); let healthy = false;
    for (let n = 0; n < 20; n++) { try { const r = await fetch('http://127.0.0.1:3100/api/platform/session', { headers: { 'x-wn-origin-secret': env.WEB_ORIGIN_SECRET, 'x-forwarded-proto': 'https' }, signal: AbortSignal.timeout(2000) }); if (r.ok && (await r.json()).configured) { healthy = true; break; } } catch {} await pause(1000); }
    if (!healthy) throw Error('Web health check failed');
    run('/usr/bin/pm2', ['save']);
    fs.copyFileSync(payload + '/manifest.json', work + '/published-manifest.json');
    const result = { at: new Date().toISOString(), commit: manifest().commit, bots: processes(), checks, reset: false, secretsChanged: false };
    report('activated', result); console.log(JSON.stringify({ phase: 'activated', ...result }));
  } catch (error) {
    if (fs.realpathSync(current) === release) { fs.symlinkSync(previous, current + '.rollback'); fs.renameSync(current + '.rollback', current); run('systemctl', ['restart', 'warsnuto-web']); }
    for (const bot of changed.reverse()) {
      for (const [, destination] of files(bot)) {
        const saved = work + '/' + bot.id + '-' + destination, target = bot.root + '/utils/' + destination;
        if (fs.existsSync(saved)) fs.copyFileSync(saved, target); else if (destination === 'webGameProfile.cjs') fs.unlinkSync(target);
      }
      run('/usr/bin/pm2', ['restart', bot.name]);
    }
    throw error;
  }
}
(async () => { process.umask(0o077); if (process.argv[2] === 'prepare') await prepare(); else if (process.argv[2] === 'activate') await activate(); else throw Error('Choose prepare or activate'); })().catch(error => { console.log(JSON.stringify({ ok: false, message: String(error.message).split('\n')[0].slice(0, 180) })); process.exitCode = 1; });
