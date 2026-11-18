// Public local preview: no dotenv, no production database, no simulated account.
const { randomBytes } = require('node:crypto');
const { configuration } = require('../server/config.cjs');
const { openDatabase } = require('../server/database.cjs');
const { createApp } = require('../server/app.cjs');
if (process.env.NODE_ENV === 'production') throw Error('Apercu local uniquement.');
const port = Number(process.argv[2] || 4318);
const config = configuration({ SESSION_SECRET: randomBytes(32).toString('base64url'), WEB_PORT: String(port), APP_BASE_URL: 'http://127.0.0.1:' + port });
const db = openDatabase(':memory:'), backend = createApp({ db, config });
const server = backend.app.listen(port, '127.0.0.1', () => console.log('Apercu public local : http://127.0.0.1:' + port + ' (connexion Discord non configuree)'));
server.on('error', error => { db.close(); console.error(error.code); process.exitCode = 1; });
const stop = () => { server.closeAllConnections(); server.close(() => { db.close(); process.exit(0); }); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
