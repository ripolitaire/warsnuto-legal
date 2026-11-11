const { isIP } = require('node:net');
const LEGACY_ALLOWED = /^(?:auth\/discord\/(?:start|callback)|servers|profile(?:\/(?:settings|game|protect))?|admin(?:\/(?:bots|configuration|users|staff|logs|settings|moderation|prisons))?|api\/platform\/(?:public|session|servers|moderation\/\d{17,20}|logout|activity|me(?:\/(?:game|protect)\/\d{17,20}|\/preferences|\/sessions\/revoke-others)?|admin\/(?:features\/\d{17,20}\/(?:prison|youtube)(?:\/\d{1,10}|\/job\/[a-f\d-]{36})?|overview|bots|bot-config(?:\/(?:protect|game|support)\/(?:guilds|\d{17,20}(?:\/[a-z][a-z0-9_-]{0,39})?))?|users(?:\/\d{17,20}(?:\/(?:role|status|revoke))?)?|staff|permissions|logs|settings)))$/;
const RECRUITMENT = /^(?:candidature|admin\/candidatures|api\/platform\/recruitment\/\d{17,20}(?:\/(?:context|mine|reviews|settings|application\/[a-f\d-]{36}))?)$/;
const ALLOWED = new RegExp('(?:' + LEGACY_ALLOWED.source + ')|(?:' + RECRUITMENT.source + ')');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const origin = process.env.WEB_BACKEND_ORIGIN, secret = process.env.WEB_ORIGIN_SECRET;
  if (!origin || !/^[a-f\d]{64}$/i.test(secret || '')) return res.status(503).json({ error: 'Espace membre en cours de configuration.' });
  try {
    const base = new URL(origin);
    if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('Invalid backend origin');
    if (process.env.VERCEL) {
      const canonical = new URL(process.env.APP_BASE_URL || '');
      if (canonical.protocol !== 'https:' || canonical.host !== req.headers.host) return res.status(403).json({ error: 'Utilise le domaine officiel pour te connecter.' });
    }
    const incoming = new URL(req.url, 'https://warsnuto.com');
    const route = req.query?.route || incoming.searchParams.get('route') || incoming.pathname.replace(/^\//, '');
    if (typeof route !== 'string' || !ALLOWED.test(route)) return res.status(404).json({ error: 'Route introuvable.' });
    if (!['GET', 'HEAD', 'POST', 'PATCH'].includes(req.method)) return res.status(405).json({ error: 'Méthode non autorisée.' });
    incoming.searchParams.delete('route');
    const url = new URL('/' + route, base); url.search = incoming.search;
    const headers = { 'x-wn-origin-secret': secret };
    for (const name of ['cookie', 'origin', 'content-type', 'x-csrf-token', 'sec-fetch-site', 'user-agent']) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
    const ip = req.headers['x-vercel-forwarded-for'];
    if (process.env.VERCEL && typeof ip === 'string' && isIP(ip)) headers['x-wn-client-ip'] = ip;
    const body = ['POST', 'PATCH'].includes(req.method) ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})) : undefined;
    if (body && Buffer.byteLength(body) > (route.startsWith('api/platform/recruitment/') ? 65536 : 16384)) return res.status(413).json({ error: 'Formulaire trop volumineux.' });
    const response = await fetch(url, { method: req.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    for (const name of ['content-type', 'content-security-policy', 'x-frame-options', 'permissions-policy', 'retry-after']) {
      const value = response.headers.get(name); if (value) res.setHeader(name, value);
    }
    const setCookies = response.headers.getSetCookie(); if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
    const location = response.headers.get('location');
    if (location) {
      const valid = /^\/(?!\/)[^\\\r\n]*$/.test(location) || location.startsWith('https://discord.com/oauth2/authorize?');
      if (!valid) throw Error('Invalid upstream redirect');
      res.setHeader('Location', location);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2097152) throw Error('Upstream response too large');
    res.status(response.status).end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.status(503).json({ error: 'Le service est temporairement indisponible.' }); }
};
module.exports.ALLOWED = ALLOWED;
