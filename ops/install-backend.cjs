const fs = require('node:fs'), cp = require('node:child_process'), path = require('node:path'), crypto = require('node:crypto');
const RELEASE = 'web-20261103-01';
const root = '/opt/warsnuto-web', release = root + '/releases/' + RELEASE;
const work = '/opt/warsnuto-web-backups/' + RELEASE;
const runtime = '/opt/warsnuto-web-runtime';
const report = { release: RELEASE, startedAt: new Date().toISOString(), steps: [] };
function run(bin, args, options = {}) {
  return cp.execFileSync(bin, args, { encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
function record(step, extra = {}) {
  report.steps.push({ at: new Date().toISOString(), step, ...extra });
  fs.writeFileSync(work + '/installation.json', JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ step, ...extra }));
}
function processes() {
  return JSON.parse(run('/usr/bin/pm2', ['jlist'])).map(p => ({ name: p.name, pid: p.pid, status: p.pm2_env.status, cwd: p.pm2_env.pm_cwd }));
}
function disk() {
  const info = fs.statfsSync('/opt');
  if (info.bavail * info.bsize < 2 * 1024 ** 3) throw Error('Less than 2 GiB free: stop without deleting other data.');
}
function unchanged() {
  const after = processes();
  for (const p of report.before) if (!after.some(a => a.name === p.name && a.pid === p.pid && a.status === p.status)) throw Error('Bot process changed: ' + p.name);
  return after;
}
(async () => {
  process.umask(0o077);
  fs.mkdirSync(work, { recursive: true, mode: 0o700 });
  if (fs.existsSync(release) || fs.existsSync('/etc/systemd/system/warsnuto-web.service')) throw Error('Backend already exists; manual review required.');
  report.before = processes(); disk(); record('preflight', { bots: report.before });
  const manifest = JSON.parse(fs.readFileSync('/tmp/' + RELEASE + '-manifest.json', 'utf8'));
  fs.mkdirSync(release, { recursive: true, mode: 0o755 });
  run('tar', ['-xzf', '/tmp/' + RELEASE + '.tgz', '-C', release]);
  for (const [file, expected] of Object.entries(manifest.files)) {
    if (path.isAbsolute(file) || file.split('/').includes('..') || file === '.env.web') throw Error('Invalid archive path');
    if (crypto.createHash('sha256').update(fs.readFileSync(path.join(release, file))).digest('hex') !== expected) throw Error('Release hash mismatch: ' + file);
  }
  fs.copyFileSync('/tmp/' + RELEASE + '-manifest.json', work + '/manifest.json');
  record('source-installed', { files: Object.keys(manifest.files).length, git: manifest.commit });
  if (fs.existsSync(runtime)) throw Error('Runtime directory already exists; refusing replacement.');
  const checksums = await fetch('https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt', { signal: AbortSignal.timeout(30000) }).then(r => { if (!r.ok) throw Error('Node manifest unavailable'); return r.text(); });
  const match = checksums.match(/^([a-f\d]{64})\s+(node-v24\.\d+\.\d+-linux-x64\.tar\.xz)$/m);
  if (!match) throw Error('Supported Node 24 archive not found');
  const archive = work + '/' + match[2];
  run('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--tlsv1.2', 'https://nodejs.org/dist/latest-v24.x/' + match[2], '--output', archive]);
  if (crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== match[1]) throw Error('Node checksum mismatch');
  fs.mkdirSync(runtime, { mode: 0o755 }); run('tar', ['-xJf', archive, '-C', runtime, '--strip-components=1']);
  run('chmod', ['-R', 'a+rX', runtime]);
  record('node-runtime', { version: run(runtime + '/bin/node', ['--version']).trim(), checksumVerified: true });
  if (cp.spawnSync('id', ['warsnutoweb'], { stdio: 'ignore' }).status !== 0) run('useradd', ['--system', '--home-dir', '/var/lib/warsnuto-web', '--create-home', '--shell', '/usr/sbin/nologin', 'warsnutoweb']);
  fs.mkdirSync('/var/lib/warsnuto-web/data', { recursive: true, mode: 0o700 });
  run('chown', ['-R', 'warsnutoweb:warsnutoweb', '/var/lib/warsnuto-web']);
  run('chown', ['-R', 'warsnutoweb:warsnutoweb', release]);
  run('chmod', ['-R', 'a+rX', root]);
  const npmEnv = { PATH: runtime + '/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', HOME: '/var/lib/warsnuto-web', NODE_ENV: 'production', npm_config_cache: '/var/lib/warsnuto-web/.npm' };
  run('runuser', ['-u', 'warsnutoweb', '--', runtime + '/bin/node', runtime + '/lib/node_modules/npm/bin/npm-cli.js', 'ci', '--omit=dev', '--ignore-scripts', '--no-fund'], { cwd: release, env: npmEnv });
  run('chown', ['-R', 'root:root', root]); run('chmod', ['-R', 'a+rX', root]);
  fs.symlinkSync(release, root + '/current');
  record('dependencies-installed', { runtimeIsolated: true }); disk(); unchanged();
  const aptEnv = { ...process.env, DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'l' };
  if (fs.existsSync('/etc/caddy/Caddyfile') || fs.existsSync('/etc/apt/sources.list.d/caddy-stable.list')) throw Error('Existing proxy configuration requires review.');
  run('curl', ['--fail', '--silent', '--show-error', '--location', 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key', '--output', work + '/caddy-stable.key']);
  run('gpg', ['--dearmor', '--batch', '--yes', '--output', '/usr/share/keyrings/caddy-stable-archive-keyring.gpg', work + '/caddy-stable.key']);
  fs.chmodSync('/usr/share/keyrings/caddy-stable-archive-keyring.gpg', 0o644);
  run('curl', ['--fail', '--silent', '--show-error', '--location', 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt', '--output', '/etc/apt/sources.list.d/caddy-stable.list']);
  fs.chmodSync('/etc/apt/sources.list.d/caddy-stable.list', 0o644);
  run('apt-get', ['update', '-q'], { env: aptEnv });
  run('apt-get', ['install', '-y', '--no-upgrade', '--no-install-recommends', 'caddy'], { env: aptEnv });
  fs.copyFileSync('/etc/caddy/Caddyfile', work + '/Caddyfile.package-default');
  fs.copyFileSync(release + '/ops/Caddyfile', '/etc/caddy/Caddyfile'); fs.chmodSync('/etc/caddy/Caddyfile', 0o644);
  run('caddy', ['validate', '--config', '/etc/caddy/Caddyfile']);
  fs.copyFileSync(release + '/ops/warsnuto-web.service', '/etc/systemd/system/warsnuto-web.service');
  fs.chmodSync('/etc/systemd/system/warsnuto-web.service', 0o644);
  run('systemctl', ['daemon-reload']);
  run('systemctl', ['enable', 'caddy']); run('systemctl', ['reload', 'caddy']);
  record('https-proxy-installed', { version: run('caddy', ['version']).split('\n')[0], accessLogsEnabled: false });
  report.after = unchanged(); report.completedAt = new Date().toISOString(); disk();
  record('infrastructure-ready', { botsUnchanged: true, backendStarted: false });
})().catch(error => {
  const message = String(error.message).split('\n')[0].slice(0, 250);
  try { record('failed', { message }); } catch {}
  console.log(JSON.stringify({ ok: false, message })); process.exitCode = 1;
});
