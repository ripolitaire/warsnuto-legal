// Isolated browser fixtures only. Excluded from deployment, never reads .env or bot data.
if (process.env.NODE_ENV === 'production') throw Error('Fixtures are forbidden in production');
const { fixture } = require('./helpers.cjs');
(async () => {
  const f = fixture({ port: Number(process.env.PLAYWRIGHT_PORT || 4317) });
  // Browser scenarios exercise layout independently; real limiter behavior has its own API tests.
  f.beforeRequest = () => f.db.prepare('DELETE FROM rate_limits').run();
  const base = await f.listen();
  console.log('Browser fixtures: ' + base);
  process.on('SIGTERM', () => f.close().then(() => process.exit(0)));
  process.on('SIGINT', () => f.close().then(() => process.exit(0)));
})();
