const fs = require('node:fs'), cp = require('node:child_process');
const root = '/opt/warsnuto-web/current', work = '/opt/warsnuto-web-backups/web-20261103-01';
function run(bin, args, options = {}) { return cp.execFileSync(bin, args, { cwd: root, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'], ...options }); }
function bots() { return JSON.parse(run('/usr/bin/pm2', ['jlist'])).map(p => ({ name: p.name, pid: p.pid, status: p.pm2_env.status })); }
function verifyBots(before) { const after = bots(); if (before.some(p => !after.some(a => a.name === p.name && a.pid === p.pid && a.status === p.status))) throw Error('Bot process changed.'); return after; }
(async () => {
  process.umask(0o077);
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!/^\d{17,20}$/.test(input.ownerId || '')) throw Error('OWNER identity missing.');
  const source = input.environment;
  const environment = { NODE_ENV: 'production', APP_BASE_URL: 'https://warsnuto.com', WEB_HOST: '127.0.0.1', WEB_PORT: '3100',
    WEB_DATABASE_PATH: '/var/lib/warsnuto-web/data/web.sqlite', WEB_BACKUP_PATH: '/var/lib/warsnuto-web/backups', WEB_REQUIRE_HTTPS_PROXY: 'true' };
  for (const key of ['DISCORD_OAUTH_CLIENT_ID', 'DISCORD_OAUTH_CLIENT_SECRET', 'SESSION_SECRET', 'WEB_ORIGIN_SECRET']) {
    if (typeof source[key] !== 'string' || !source[key] || /[\r\n\u0000]/.test(source[key])) throw Error('Required environment field missing or invalid: ' + key);
    environment[key] = source[key];
  }
  require(root + '/server/config.cjs').configuration(environment);
  if (fs.existsSync(environment.WEB_DATABASE_PATH)) throw Error('Existing database: review before retrying.');
  if (fs.existsSync('/etc/warsnuto-web/runtime.env')) {
    const existing = require('node:util').parseEnv(fs.readFileSync('/etc/warsnuto-web/runtime.env', 'utf8'));
    if (Object.keys(existing).length !== Object.keys(environment).length || Object.entries(environment).some(([key, value]) => existing[key] !== value)) throw Error('Existing environment differs: refusing replacement.');
  }
  const before = bots();
  fs.mkdirSync('/etc/warsnuto-web', { mode: 0o700, recursive: true });
  if (!fs.existsSync('/etc/warsnuto-web/runtime.env')) fs.writeFileSync('/etc/warsnuto-web/runtime.env', Object.entries(environment).map(([key, value]) => key + '=' + JSON.stringify(value)).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  fs.copyFileSync('/etc/warsnuto-web/runtime.env', work + '/runtime.env.initial'); fs.chmodSync(work + '/runtime.env.initial', 0o600);
  const env = { PATH: '/opt/warsnuto-web-runtime/bin:/usr/sbin:/usr/bin:/sbin:/bin', HOME: '/var/lib/warsnuto-web', ...environment };
  run('runuser', ['-u', 'warsnutoweb', '--', '/opt/warsnuto-web-runtime/bin/node', root + '/server/owner.cjs', input.ownerId, '--confirm'], { env });
  run('runuser', ['-u', 'warsnutoweb', '--', '/opt/warsnuto-web-runtime/bin/node', root + '/server/backup.cjs'], { env });
  run('systemctl', ['enable', '--now', 'warsnuto-web']);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch('http://127.0.0.1:3100/api/platform/session', { headers: { 'x-wn-origin-secret': environment.WEB_ORIGIN_SECRET, 'x-forwarded-proto': 'https' }, signal: AbortSignal.timeout(2000) }); const body = await r.json(); if (r.ok && body.configured && body.user === null) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw Error('Backend readiness not confirmed.');
  const direct = await fetch('http://127.0.0.1:3100/api/platform/session', { signal: AbortSignal.timeout(2000) });
  if (direct.status !== 403) throw Error('Origin credential gate failed.');
  const appHeaders = { 'x-wn-origin-secret': environment.WEB_ORIGIN_SECRET, 'x-forwarded-proto': 'https' };
  const start = await fetch('http://127.0.0.1:3100/auth/discord/start', { headers: appHeaders, redirect: 'manual', signal: AbortSignal.timeout(3000) });
  const cookie = start.headers.getSetCookie().find(value => value.startsWith('__Host-wn_oauth='));
  const security = require(root + '/server/security.cjs');
  if (start.status !== 303 || !cookie || !security.verified(security.cookies(cookie)['__Host-wn_oauth'], environment.SESSION_SECRET)) throw Error('OAuth browser binding or environment parsing failed.');
  const location = new URL(start.headers.get('location'));
  if (location.origin !== 'https://discord.com' || location.searchParams.get('client_id') !== environment.DISCORD_OAUTH_CLIENT_ID || location.searchParams.get('redirect_uri') !== 'https://warsnuto.com/auth/discord/callback') throw Error('OAuth redirect mismatch.');
  const summaryCode = `const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.WEB_DATABASE_PATH,{readOnly:true});console.log(JSON.stringify({integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,users:db.prepare('SELECT count(*) n FROM users').get().n,owners:db.prepare("SELECT u.discord_id FROM user_roles r JOIN users u ON r.user_id=u.id WHERE r.role='OWNER'").all().map(r=>r.discord_id)}));db.close();`;
  const database = JSON.parse(run('runuser', ['-u', 'warsnutoweb', '--', '/opt/warsnuto-web-runtime/bin/node', '-e', summaryCode], { env }));
  if (database.integrity !== 'ok' || database.owners.length !== 1 || database.owners[0] !== input.ownerId) throw Error('Database/OWNER verification failed.');
  const report = { at: new Date().toISOString(), backendReady: true, directAccessDenied: true, oauthRedirectVerified: true, secureBrowserCookieVerified: true,
    database, servicePid: Number(run('systemctl', ['show', 'warsnuto-web', '--property=MainPID', '--value']).trim()), bots: verifyBots(before) };
  fs.writeFileSync(work + '/activation.json', JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
})().catch(error => { console.log(JSON.stringify({ ok: false, code: error.name, message: error instanceof SyntaxError ? 'Invalid activation input' : String(error.message).split('\n')[0].slice(0, 200) })); process.exitCode = 1; });
