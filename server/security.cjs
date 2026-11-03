const { randomBytes, createHash, createHmac, timingSafeEqual, createCipheriv, createDecipheriv } = require('node:crypto');
const opaque = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(String(value)).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest('base64url');
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
function error(status, message) { return Object.assign(new Error(message), { status, publicMessage: message }); }
function cookies(header) {
  const values = Object.create(null);
  for (const item of String(header || '').split(';')) {
    const at = item.indexOf('='); if (at < 1) continue;
    const key = item.slice(0, at).trim();
    try { values[key] = Object.hasOwn(values, key) ? null : decodeURIComponent(item.slice(at + 1).trim()); } catch { values[key] = null; }
  }
  return values;
}
function signed(value, secret) { return value + '.' + hmac(secret, value); }
function verified(value, secret) {
  if (typeof value !== 'string' || !/^[\w-]{43}\.[\w-]{43}$/.test(value)) return null;
  const [token, signature] = value.split('.'); return equal(signature, hmac(secret, token)) ? token : null;
}
function cookie(name, value, secure, age) { return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(age))}${secure ? '; Secure' : ''}`; }
function seal(text, secret) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(digest(secret), 'hex'), iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}
function unseal(text, secret) {
  const bytes = Buffer.from(text, 'base64url'), decipher = createDecipheriv('aes-256-gcm', Buffer.from(digest(secret), 'hex'), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}
function object(value, fields) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(key => !fields.includes(key))) throw error(400, 'Formulaire invalide.');
  return value;
}
function text(value, max, min = 0) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw error(400, 'Texte invalide.');
  return value.trim();
}
function snowflake(value) { return typeof value === 'string' && /^\d{17,20}$/.test(value) && BigInt(value) > 0n && BigInt(value) < (1n << 64n); }
function nextPath(value) { return typeof value === 'string' && /^\/(?:servers|profile(?:\/(?:settings|game))?|admin(?:\/(?:bots|configuration|users|staff|logs|settings|moderation))?)$/.test(value) ? value : '/profile'; }
function headers(req, res, next) {
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com https://media.discordapp.net; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" }); next();
}
module.exports = { opaque, digest, hmac, equal, error, cookies, signed, verified, cookie, seal, unseal, object, text, snowflake, nextPath, headers };
