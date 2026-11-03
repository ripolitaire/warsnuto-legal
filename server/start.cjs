const { configuration } = require('./config.cjs');
const { openDatabase } = require('./database.cjs');
const { createApp } = require('./app.cjs');
function start() {
  const config = configuration(), db = openDatabase(config.databasePath, { create: !config.production }), backend = createApp({ db, config });
  backend.maintain();
  const timer = setInterval(() => { try { backend.maintain(); } catch { console.error('{"event":"web.maintenance_failure"}'); } }, 60000).unref();
  const server = backend.app.listen(config.port, config.host, () => console.log(`WarsNuto web : http://${config.host}:${config.port}`));
  server.headersTimeout = 15000; server.requestTimeout = 20000;
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true; clearInterval(timer);
    const timeout = setTimeout(() => process.exit(1), 12000).unref();
    server.close(() => { clearTimeout(timeout); db.close(); process.exit(0); });
  };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  return server;
}
if (require.main === module) { try { start(); } catch { console.error('Backend non demarre : verifier configuration et base web. Aucun secret n’est affiche.'); process.exitCode = 1; } }
module.exports = { start };
