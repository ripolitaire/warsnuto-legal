const path = require('node:path');
const { isIP } = require('node:net');
const root = path.resolve(__dirname, '..');
function configuration(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const url = new URL(env.APP_BASE_URL || 'http://127.0.0.1:3100');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    (url.protocol !== 'https:' && (production || !['localhost', '127.0.0.1'].includes(url.hostname)))) throw Error('APP_BASE_URL invalide.');
  const host = env.WEB_HOST || '127.0.0.1';
  if (!['127.0.0.1', '::1'].includes(host)) throw Error('Le backend doit ecouter uniquement en boucle locale.');
  const port = Number(env.WEB_PORT || 3100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('WEB_PORT invalide.');
  const secret = env.SESSION_SECRET || '';
  if (secret.length < 43 || new Set(secret).size < 12) throw Error('SESSION_SECRET requis : generer au moins 32 octets aleatoires en base64url.');
  if (production && (!/^[a-f\d]{64}$/i.test(env.WEB_ORIGIN_SECRET || '') || env.WEB_REQUIRE_HTTPS_PROXY !== 'true')) throw Error('Configurer WEB_ORIGIN_SECRET et le proxy HTTPS en production.');
  const clientId = env.DISCORD_OAUTH_CLIENT_ID || '';
  if (clientId && !/^\d{17,20}$/.test(clientId)) throw Error('DISCORD_OAUTH_CLIENT_ID invalide.');
  return { root, production, host, port, origin: url.origin, secure: url.protocol === 'https:', secret,
    databasePath: path.resolve(root, env.WEB_DATABASE_PATH || 'data/web.sqlite'), backupPath: path.resolve(root, env.WEB_BACKUP_PATH || 'backups'), clientId,
    clientSecret: env.DISCORD_OAUTH_CLIENT_SECRET || '', originSecret: env.WEB_ORIGIN_SECRET || '',
    requireHttpsProxy: env.WEB_REQUIRE_HTTPS_PROXY === 'true', sessionMaxMs: 2 * 3600000,
    sessionIdleMs: 30 * 60000, now: Date.now };
}
module.exports = { configuration };
