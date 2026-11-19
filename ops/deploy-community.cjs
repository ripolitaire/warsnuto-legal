// Website-only release: no bot writes, no environment changes, atomic rollback.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run = (bin, args, options = {}) => cp.execFileSync(bin, args, { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'], ...options });
const publicFiles = ['app.js', 'styles.css', 'theme.css', 'appearance.js', 'platform.js', 'platform.css', 'bot-configuration.js', 'configuration-picker.js', 'feature-dashboard.js', 'member-space.js', 'recruitment.js', 'personal-cards.js', 'cards.js', 'cards.css', 'community.js', 'community.css', 'adventure.css', 'adventure.js', 'adventure-audio.js', 'adventure-combat.js', 'robots.txt', 'sitemap.xml'];
function walk(directory, relative, list) {
  for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
    const file = path.posix.join(relative, entry.name);
    if (entry.name === '.gitkeep') continue;
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) throw Error('Unexpected hidden file or symlink: ' + file);
    if (entry.isDirectory()) walk(directory, file, list);
    else if (entry.isFile() && /\.(?:cjs|js|json|html|css|png|webp|jpg|jpeg|gif|svg|ico|txt|xml|sql|wav|md)$/.test(entry.name)) list.push(file);
    else throw Error('Unexpected release file: ' + file);
  }
}
function pack(root) {
  const name = 'community-' + new Date().toISOString().replace(/[-:.TZ]/g, '');
  const directory = path.join(root, 'artifacts', name); fs.mkdirSync(directory, { recursive: true });
  const files = [...publicFiles, ...fs.readdirSync(root).filter(file => file.endsWith('.html')), 'package.json', 'package-lock.json', 'vercel.json', 'scripts/build.cjs', 'scripts/check.cjs', 'ui/icons.js', 'ops/deploy-community.cjs', 'ops/deploy-game-adventure.cjs'];
  for (const relative of ['server', 'api', 'assets', 'tests', 'ops/bot-config']) walk(root, relative, files);
  const manifest = { name, createdAt: new Date().toISOString(), files: Object.fromEntries([...new Set(files)].sort().map(file => [file, hash(path.join(root, file))])) };
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(directory, 'files.txt'), Object.keys(manifest.files).join('\n') + '\n');
  run('tar', ['-czf', path.join(directory, 'source.tgz'), '-C', root, '-T', path.join(directory, 'files.txt')]);
  const frontend = path.join(directory, 'frontend'); fs.mkdirSync(frontend);
  const selected = Object.keys(manifest.files).filter(file => (publicFiles.includes(file) || file.endsWith('.html') || file.startsWith('api/') || file.startsWith('assets/') || ['package.json', 'package-lock.json', 'scripts/build.cjs', 'ui/icons.js'].includes(file)) && !file.endsWith('.md'));
  for (const file of [...selected, 'vercel.json', '.vercelignore', '.vercel/project.json']) {
    const target = path.join(frontend, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, file), target);
  }
  console.log(JSON.stringify({ name, directory, frontend, files: Object.keys(manifest.files).length, bytes: fs.statSync(path.join(directory, 'source.tgz')).size }));
}
async function remote(mode, name) {
  if (process.platform !== 'linux' || !/^community-\d{17}$/.test(name)) throw Error('Invalid remote deployment');
  process.umask(0o077);
  const base = '/opt/warsnuto-web', current = base + '/current', release = base + '/releases/' + name;
  const payload = '/tmp/' + name, work = '/opt/warsnuto-web-backups/' + name;
  const node = '/opt/warsnuto-web-runtime/bin/node';
  const processes = () => JSON.parse(run('/usr/bin/pm2', ['jlist'])).map(p => ({ name: p.name, pid: p.pid, status: p.pm2_env.status }));
  const report = (file, value) => fs.writeFileSync(work + '/' + file + '.json', JSON.stringify(value, null, 2), { mode: 0o600 });
  const manifest = JSON.parse(fs.readFileSync(payload + '/manifest.json'));
  if (manifest.name !== name) throw Error('Manifest identity mismatch');
  function verify() {
    for (const [file, expected] of Object.entries(manifest.files)) {
      if (path.isAbsolute(file) || file.split('/').some(part => part === '..' || part.startsWith('.')) || /(?:^|\/)(?:data|backups|artifacts|node_modules)\//.test(file)) throw Error('Forbidden release path');
      const target = path.join(release, file), resolved = fs.realpathSync(target);
      if (!resolved.startsWith(release + '/') || !fs.lstatSync(target).isFile() || hash(target) !== expected) throw Error('Release hash mismatch: ' + file);
    }
  }
  const unchangedBots = before => {
    const after = processes();
    if (before.some(p => !after.some(a => a.name === p.name && a.pid === p.pid && a.status === p.status))) throw Error('Bot process changed during web deployment');
    return after;
  };
  function switchTo(target) {
    const next = current + '.' + name;
    if (fs.existsSync(next)) throw Error('Pending release pointer exists');
    fs.symlinkSync(target, next); fs.renameSync(next, current); run('systemctl', ['restart', 'warsnuto-web']);
  }
  async function healthy() {
    const env = require('node:util').parseEnv(fs.readFileSync('/etc/warsnuto-web/runtime.env', 'utf8'));
    for (let attempt = 0; attempt < 25; attempt++) {
      try {
        const headers = { 'x-wn-origin-secret': env.WEB_ORIGIN_SECRET, 'x-forwarded-proto': 'https' };
        const response = await fetch('http://127.0.0.1:3100/api/platform/session', { headers, signal: AbortSignal.timeout(2500) });
        const data = await response.json();
        if (response.ok && data.user === null && data.configured === true) {
          for (const file of ['community.css', 'community.js', 'cards.js', 'adventure.js', 'adventure-audio.js']) {
            const asset = await fetch('http://127.0.0.1:3100/' + file, { headers, signal: AbortSignal.timeout(2500) });
            if (!asset.ok || crypto.createHash('sha256').update(Buffer.from(await asset.arrayBuffer())).digest('hex') !== manifest.files[file]) throw Error('Asset readiness failed');
          }
          const denied = await fetch('http://127.0.0.1:3100/api/platform/session', { signal: AbortSignal.timeout(2500) });
          if (denied.status !== 403) throw Error('Private origin gate failed');
          const privateAPI = await fetch('http://127.0.0.1:3100/api/platform/admin/overview', { headers, signal: AbortSignal.timeout(2500) });
          if (privateAPI.status !== 401) throw Error('Anonymous administration access not denied');
          return true;
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    throw Error('Backend readiness not confirmed');
  }
  if (mode === 'prepare') {
    if (fs.existsSync(release) || fs.existsSync(work)) throw Error('Release already exists');
    const previous = fs.realpathSync(current), disk = fs.statfsSync(base);
    if (!previous.startsWith(base + '/releases/') || disk.bavail * disk.bsize < 2 * 1024 ** 3) throw Error('Unsafe source release or insufficient disk space');
    const entries = run('tar', ['-tzf', payload + '/source.tgz']).trim().split('\n');
    if (entries.some(file => !Object.hasOwn(manifest.files, file))) throw Error('Unexpected archive entry');
    fs.mkdirSync(work, { mode: 0o700 });
    const before = processes(), envHash = hash('/etc/warsnuto-web/runtime.env');
    run('cp', ['-a', '--reflink=auto', previous, release]);
    for (const file of Object.keys(manifest.files)) {
      const target = path.join(release, file), parent = path.dirname(target);
      fs.mkdirSync(parent, { recursive: true });
      if (!fs.realpathSync(parent).startsWith(release + '/') && parent !== release) throw Error('Symlink escape');
      if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw Error('Symlink file in payload');
    }
    run('tar', ['--no-same-owner', '-xzf', payload + '/source.tgz', '-C', release]); verify();
    // The production dependency lock is unchanged: retain its native Linux dependencies.
    if (hash(previous + '/package-lock.json') !== manifest.files['package-lock.json']) throw Error('Dependency lock changed: review required');
    run(node, ['-e', "require('./server/app.cjs');require('./server/views.cjs')"], { cwd: release });
    const tests = fs.readdirSync(release + '/tests').filter(file => file.endsWith('.test.cjs')).map(file => 'tests/' + file);
    const output = run(node, ['--test', ...tests], { cwd: release });
    report('linux-tests', { output });
    const { DatabaseSync, backup } = require('node:sqlite');
    const env = require('node:util').parseEnv(fs.readFileSync('/etc/warsnuto-web/runtime.env', 'utf8'));
    const db = new DatabaseSync(env.WEB_DATABASE_PATH, { readOnly: true });
    try { await backup(db, work + '/web.sqlite'); } finally { db.close(); }
    fs.chmodSync(work + '/web.sqlite', 0o600);
    const check = new DatabaseSync(work + '/web.sqlite', { readOnly: true });
    try { if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Database backup invalid'); } finally { check.close(); }
    run('chmod', ['-R', 'a+rX', release]);
    report('prepared', { previous, release, before, envHash, manifestHash: hash(payload + '/manifest.json') });
    console.log(JSON.stringify({ phase: 'prepared', previous, release, files: Object.keys(manifest.files).length, linuxTestsPassed: true, databaseBackupVerified: true, bots: unchangedBots(before) }));
  } else if (mode === 'activate') {
    const prepared = JSON.parse(fs.readFileSync(work + '/prepared.json'));
    if (fs.realpathSync(current) !== prepared.previous || hash('/etc/warsnuto-web/runtime.env') !== prepared.envHash || hash(payload + '/manifest.json') !== prepared.manifestHash) throw Error('Production changed after preparation');
    verify(); unchangedBots(prepared.before);
    try {
      switchTo(release); await healthy();
      const result = { phase: 'activated', release, secretsUnchanged: hash('/etc/warsnuto-web/runtime.env') === prepared.envHash, bots: unchangedBots(prepared.before), at: new Date().toISOString() };
      report('activated', result); console.log(JSON.stringify(result));
    } catch (error) { switchTo(prepared.previous); report('rolled-back', { at: new Date().toISOString() }); throw error; }
  } else throw Error('Unknown mode');
}
(async () => {
  if (process.argv[2] === 'pack') pack(path.resolve(__dirname, '..'));
  else await remote(process.argv[2], process.argv[3]);
})().catch(error => { console.error(JSON.stringify({ ok: false, message: String(error.message).split('\n')[0].slice(0, 180) })); process.exitCode = 1; });
