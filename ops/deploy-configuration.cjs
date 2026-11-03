const fs = require('node:fs'), cp = require('node:child_process'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib'), http = require('node:http');
const { pipeline } = require('node:stream/promises');
const { DatabaseSync, backup } = require('node:sqlite');
const payload = '/tmp/warsnuto-config-20261103', work = '/opt/warsnuto-web-backups/web-20261103-03';
const release = '/opt/warsnuto-web/releases/web-20261103-03', previous = '/opt/warsnuto-web/releases/web-20261103-02', current = '/opt/warsnuto-web/current';
const node = '/opt/warsnuto-web-runtime/bin/node', directory = '/run/warsnuto-bot-config', envFile = '/etc/warsnuto-web/runtime.env', actor = '1360350111611228450';
const bots = [{ id: 'protect', name: 'warsnuto-bot', root: '/opt/warsnuto-bot', db: 'bot.sqlite' }, { id: 'game', name: 'warsnuto-game-bot', root: '/opt/warsnuto-game-bot', db: 'game.sqlite' }, { id: 'support', name: 'warsnuto-ticket-bot', root: '/opt/warsnuto-ticket-bot', db: 'tickets.sqlite' }];
const run = (bin, args, options = {}) => cp.execFileSync(bin, args, { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'], ...options });
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const processes = () => JSON.parse(run('/usr/bin/pm2', ['jlist'])).map(p => ({ name: p.name, pid: p.pid, status: p.pm2_env.status }));
const m = () => JSON.parse(fs.readFileSync(payload + '/manifest.json'));
const report = (name, value) => fs.writeFileSync(work + '/' + name + '.json', JSON.stringify(value, null, 2), { mode: 0o600 });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function verifySource(manifest) {
  for (const [file, expected] of Object.entries(manifest.files)) if (path.isAbsolute(file) || file.split('/').includes('..') || !fs.lstatSync(release + '/' + file).isFile() || hash(release + '/' + file) !== expected) throw Error('Release hash mismatch: ' + file);
}
function verifyBots(manifest) {
  for (const bot of bots) {
    if (hash(bot.root + '/index.js') !== manifest.bots[bot.id].beforeIndexHash || hash(payload + '/' + bot.id + '-index.js') !== manifest.bots[bot.id].indexHash) throw Error('Bot source changed: ' + bot.id);
    for (const name of ['webDashboard.cjs', 'webDashboardSchema.cjs', 'webDashboardAdapter.cjs']) if (fs.existsSync(bot.root + '/utils/' + name)) throw Error('Existing dashboard requires review');
  }
}
async function coherentBackup(source, name) {
  const temporary = work + '/' + name + '.sqlite.pending', target = work + '/' + name + '.sqlite.gz';
  const db = new DatabaseSync(source, { readOnly: true }); try { await backup(db, temporary); } finally { db.close(); }
  fs.chmodSync(temporary, 0o600);
  const copy = new DatabaseSync(temporary, { readOnly: true }); try { if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Backup integrity failed'); } finally { copy.close(); }
  const original = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(temporary)) original.update(chunk);
  await pipeline(fs.createReadStream(temporary), zlib.createGzip({ level: 3 }), fs.createWriteStream(target, { mode: 0o600, flags: 'wx' }));
  const restored = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(target).pipe(zlib.createGunzip())) restored.update(chunk);
  if (original.digest('hex') !== restored.digest('hex')) throw Error('Compressed backup mismatch');
  // Remove only this verified intermediate, never the live database or an older backup.
  if (path.dirname(temporary) !== work || fs.realpathSync(work) !== work) throw Error('Unsafe backup path'); fs.unlinkSync(temporary);
  console.log(JSON.stringify({ phase: 'backup-verified', name, compressedBytes: fs.statSync(target).size }));
}
async function prepare() {
  const manifest = m(); if (fs.existsSync(release) || fs.existsSync(work) || fs.realpathSync(current) !== previous) throw Error('Deployment state changed'); verifyBots(manifest);
  const old = JSON.parse(fs.readFileSync('/opt/warsnuto-web-backups/web-20261103-02/published-manifest.json'));
  for (const [file, expected] of Object.entries(old.files)) if (hash(previous + '/' + file) !== expected) throw Error('Live web source changed');
  const disk = fs.statfsSync('/opt'), largest = Math.max(...bots.map(bot => fs.statSync(bot.root + '/data/' + bot.db).size));
  if (disk.bavail * disk.bsize < 1.5 * 1024 ** 3 + largest) throw Error('Insufficient headroom for a safe backup');
  fs.mkdirSync(work, { mode: 0o700 }); fs.mkdirSync(release, { mode: 0o755 });
  const members = run('tar', ['-tzf', payload + '/source.tgz']).trim().split('\n');
  if (members.some(name => path.isAbsolute(name) || name.split('/').includes('..') || /(?:^|\/)\.env(?!\.example$)/.test(name))) throw Error('Unsafe archive');
  run('tar', ['-xzf', payload + '/source.tgz', '-C', release]); verifySource(manifest);
  run(node, ['/opt/warsnuto-web-runtime/lib/node_modules/npm/bin/npm-cli.js', 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: release, env: { PATH: '/opt/warsnuto-web-runtime/bin:/usr/bin:/bin', HOME: '/root', NODE_ENV: 'production' } });
  run('chmod', ['-R', 'a+rX', release]);
  run('/usr/sbin/runuser', ['-u', 'warsnutoweb', '--', node, '-e', "require('express');require('./server/app.cjs')"], { cwd: release });
  run(node, ['--test', ...fs.readdirSync(release + '/tests').filter(file => file.endsWith('.test.cjs')).map(file => 'tests/' + file)], { cwd: release, env: { PATH: '/opt/warsnuto-web-runtime/bin:/usr/bin:/bin', HOME: '/root', NODE_ENV: 'test' } });
  for (const bot of bots) run('/usr/bin/node', ['--check', payload + '/' + bot.id + '-index.js']);
  for (const file of fs.readdirSync(release + '/ops/bot-config').filter(file => file.endsWith('.cjs'))) run('/usr/bin/node', ['--check', release + '/ops/bot-config/' + file]);
  console.log(JSON.stringify({ phase: 'linux-tests-passed', commit: manifest.commit }));
  for (const bot of bots) { await coherentBackup(bot.root + '/data/' + bot.db, bot.id); fs.copyFileSync(bot.root + '/index.js', work + '/' + bot.id + '-index.before.js'); }
  await coherentBackup('/var/lib/warsnuto-web/data/web.sqlite', 'web');
  fs.copyFileSync(envFile, work + '/runtime.env.before'); fs.chmodSync(work + '/runtime.env.before', 0o600);
  fs.copyFileSync('/etc/systemd/system/warsnuto-web.service', work + '/web-service.before');
  report('prepared', { at: new Date().toISOString(), commit: manifest.commit, bots: processes(), backupsVerified: true });
  console.log(JSON.stringify({ phase: 'prepared', commit: manifest.commit }));
}
async function ipc(bot, route, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath: directory + '/' + bot + '.sock', path: route, method: body ? 'PATCH' : 'GET', headers: { 'x-wn-actor': actor, 'content-type': 'application/json' } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => { try { const data = JSON.parse(Buffer.concat(chunks)); if (response.statusCode !== 200) reject(Error('Bot configuration response: ' + response.statusCode)); else resolve(data); } catch (e) { reject(e); } });
    }); request.setTimeout(20000, () => request.destroy(Error('IPC timeout'))); request.on('error', reject); request.end(body ? JSON.stringify(body) : undefined);
  });
}
async function verifyConfiguration(bot) {
  const list = await ipc(bot, '/guilds'); if (!list.guilds?.length) throw Error('No Discord server accessible to the confirmed owner: ' + bot);
  const guild = list.guilds.find(guild => /soli|test/i.test(guild.name)) || list.guilds[0];
  const meta = await ipc(bot, '/config/' + guild.id); const sections = [];
  for (const section of meta.sections) { const data = await ipc(bot, '/config/' + guild.id + '/' + section.id); if (!/^[a-f\d]{64}$/.test(data.revision) || !data.values) throw Error('Invalid configuration payload'); sections.push({ id: section.id, fields: section.fields.length }); }
  let writeVerified = false;
  if (/soli|test/i.test(guild.name)) {
    const [section, field] = bot === 'protect' ? ['appearance', 'footerText'] : bot === 'game' ? ['balance', 'xp_multiplier'] : ['options', 'closeDelaySeconds'];
    const route = '/config/' + guild.id + '/' + section, before = await ipc(bot, route);
    const saved = await ipc(bot, route, { values: { [field]: before.values[field] }, revision: before.revision, confirmation: 'ENREGISTRER', reason: 'Vérification technique sans changement de valeur', operationId: crypto.randomUUID() });
    if (saved.revision !== before.revision || !saved.saved) throw Error('Configuration write verification failed'); writeVerified = true;
  }
  return { id: bot, accessibleGuilds: list.guilds.length, sections, writeVerifiedOnTestGuild: writeVerified };
}
async function activate() {
  const manifest = m(), prepared = JSON.parse(fs.readFileSync(work + '/prepared.json'));
  if (prepared.commit !== manifest.commit || fs.realpathSync(current) !== previous || fs.existsSync(work + '/activated.json')) throw Error('Invalid activation state'); verifySource(manifest); verifyBots(manifest);
  const original = fs.readFileSync(envFile, 'utf8'); if (original !== fs.readFileSync(work + '/runtime.env.before', 'utf8') || require('node:util').parseEnv(original).WEB_BOT_SOCKET_DIRECTORY) throw Error('Environment changed');
  if (fs.existsSync('/etc/tmpfiles.d/warsnuto-bot-config.conf')) throw Error('Existing socket policy');
  fs.copyFileSync(release + '/ops/warsnuto-bot-config.conf', '/etc/tmpfiles.d/warsnuto-bot-config.conf'); fs.chmodSync('/etc/tmpfiles.d/warsnuto-bot-config.conf', 0o644); run('systemd-tmpfiles', ['--create', '/etc/tmpfiles.d/warsnuto-bot-config.conf']);
  const configured = [];
  for (const bot of bots) {
    for (const [source, destination] of [['webDashboard.cjs', 'webDashboard.cjs'], ['webDashboardSchema.cjs', 'webDashboardSchema.cjs'], [bot.id + '.cjs', 'webDashboardAdapter.cjs']]) { fs.copyFileSync(release + '/ops/bot-config/' + source, bot.root + '/utils/' + destination); fs.chmodSync(bot.root + '/utils/' + destination, 0o644); }
    fs.copyFileSync(payload + '/' + bot.id + '-index.js', bot.root + '/index.js'); fs.chmodSync(bot.root + '/index.js', 0o644);
    const before = processes().find(p => p.name === bot.name);
    run('/usr/bin/pm2', ['restart', bot.name, '--update-env'], { env: { ...process.env, WARSNUTO_DASHBOARD_DIRECTORY: directory } });
    let ready = false;
    for (let i = 0; i < 60; i++) { await pause(1500); try { const p = processes().find(p => p.name === bot.name), signal = JSON.parse(fs.readFileSync('/run/warsnuto-bot-monitor/' + bot.id + '.json')); if (p.status === 'online' && p.pid !== before.pid && signal.pid === p.pid && signal.gateway.ready) { await ipc(bot.id, '/guilds'); ready = true; break; } } catch {} }
    if (!ready) { fs.copyFileSync(work + '/' + bot.id + '-index.before.js', bot.root + '/index.js'); run('/usr/bin/pm2', ['restart', bot.name]); throw Error('Bot dashboard not ready; previous entrypoint restored: ' + bot.id); }
    const details = await verifyConfiguration(bot.id); configured.push(details); report('bots-connected', { configured }); console.log(JSON.stringify({ phase: 'bot-configured', ...details }));
  }
  run('/usr/bin/pm2', ['save']);
  fs.writeFileSync(envFile + '.config-next', original.replace(/\s*$/, '\n') + 'WEB_BOT_SOCKET_DIRECTORY=' + directory + '\n', { mode: 0o600, flag: 'wx' }); fs.renameSync(envFile + '.config-next', envFile);
  fs.symlinkSync(release, current + '.config-next'); fs.renameSync(current + '.config-next', current);
  fs.copyFileSync(release + '/ops/warsnuto-web.service', '/etc/systemd/system/warsnuto-web.service'); fs.chmodSync('/etc/systemd/system/warsnuto-web.service', 0o644); run('systemctl', ['daemon-reload']); run('systemctl', ['restart', 'warsnuto-web']);
  const secret = require('node:util').parseEnv(original).WEB_ORIGIN_SECRET; let healthy = false;
  for (let i = 0; i < 30; i++) { try { const r = await fetch('http://127.0.0.1:3100/api/platform/session', { headers: { 'x-wn-origin-secret': secret, 'x-forwarded-proto': 'https' }, signal: AbortSignal.timeout(2000) }); if (r.ok && (await r.json()).configured) { healthy = true; break; } } catch {} await pause(1000); }
  if (!healthy) {
    fs.symlinkSync(previous, current + '.rollback'); fs.renameSync(current + '.rollback', current); fs.copyFileSync(work + '/runtime.env.before', envFile); fs.chmodSync(envFile, 0o600); fs.copyFileSync(work + '/web-service.before', '/etc/systemd/system/warsnuto-web.service'); fs.chmodSync('/etc/systemd/system/warsnuto-web.service', 0o644); run('systemctl', ['daemon-reload']); run('systemctl', ['restart', 'warsnuto-web']); throw Error('Web health failed; prior web release restored');
  }
  const code = `const {createBotConfiguration}=require('./server/botConfiguration.cjs');const bridge=createBotConfiguration(null,{botSocketDirectory:'${directory}',now:Date.now});(async()=>{const out=[];for(const id of ['protect','game','support'])out.push({id,guilds:(await bridge.guilds(id,{user:{id:'${actor}'}})).guilds.length});console.log(JSON.stringify(out));})()`;
  const webAccess = JSON.parse(run('/usr/sbin/runuser', ['-u', 'warsnutoweb', '--', node, '-e', code], { cwd: release }));
  const db = new DatabaseSync('/var/lib/warsnuto-web/data/web.sqlite', { readOnly: true }); let integrity;
  try { integrity = db.prepare('PRAGMA integrity_check').get().integrity_check; if (integrity !== 'ok' || !db.prepare("SELECT 1 FROM role_permissions WHERE role='OWNER' AND permission='bots:configure'").get()) throw Error('Owner permission or database check failed'); } finally { db.close(); }
  const result = { at: new Date().toISOString(), commit: manifest.commit, configured, webAccess, bots: processes(), integrity, backupsVerified: true, reset: false };
  fs.copyFileSync(payload + '/manifest.json', work + '/published-manifest.json'); fs.chmodSync(work + '/published-manifest.json', 0o600); report('activated', result); console.log(JSON.stringify({ phase: 'activated', ...result }));
}
(async () => { process.umask(0o077); if (process.argv[2] === 'prepare') await prepare(); else if (process.argv[2] === 'activate') await activate(); else throw Error('Choose prepare or activate'); })().catch(error => { console.log(JSON.stringify({ ok: false, message: String(error.message).split('\n')[0].slice(0, 180) })); process.exitCode = 1; });
