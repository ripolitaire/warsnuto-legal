// Developer preview only: fake Discord login, real Game engine, disposable data.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), Module = require('node:module');
if (process.env.NODE_ENV === 'production') throw Error('Local RPG preview is forbidden in production');
if (!process.argv[2]) throw Error('Provide the local Game source directory');
const root = fs.realpathSync(process.argv[2]);
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'warsnuto-rpg-preview-'));
process.env.GAME_DATA_DIR = data;
const load = Module.createRequire(path.join(root, 'src', 'webAdventure.js'));
const store = load('./database'), game = load('./gameService');
const candidate = new Module(path.join(root, 'src', '__local_preview__.js'));
candidate.filename = path.join(root, 'src', '__local_preview__.js'); candidate.paths = Module._nodeModulePaths(path.join(root, 'src'));
candidate._compile(fs.readFileSync(path.join(__dirname, '../ops/bot-config/webAdventure.cjs'), 'utf8'), candidate.filename);
const bridge = candidate.exports.createWebAdventure({ store, game, catalog: load('./gameData'), voyage: load('./infiniteVoyage'), halloween: load('./halloween'), enabled: true });
const { fixture, ids } = require('../tests/helpers.cjs');
const bots = require('../tests/bot-config-fixture.cjs').createBotConfigFixture(ids);
const guild = bots.guildId, actor = ids.OWNER;
game.ensurePlayer(guild, actor); game.chooseClass(guild, actor, 'pirate');
store.db.prepare('UPDATE players SET level=2,berries=500 WHERE guild_id=? AND user_id=?').run(guild, actor);
store.addInventory(guild, actor, 'potion_soin', 3);
const transport = (options, body) => {
  const route = /^\/adventure\/(\d+)\/(normal|admin)$/.exec(options.path);
  if (path.basename(options.socketPath) === 'game.sock' && route) {
    if (route[1] !== guild || options.headers['x-wn-actor'] !== actor) throw Error('Local preview account only');
    return options.method === 'GET' ? bridge.snapshot(guild, actor, route[2]) : bridge.execute(guild, actor, route[2], body);
  }
  return bots.transport(options, body);
};
(async () => {
  const f = fixture({ botTransport: transport }); await f.listen();
  const port = Number(process.argv[3] || 4320), base = 'http://127.0.0.1:' + port;
  f.config.origin = base;
  const server = http.createServer(async (req, res) => {
    if (req.url === '/__rpg-preview') {
      const login = await f.login('OWNER');
      res.writeHead(303, { 'set-cookie': login.cookie + '; HttpOnly; SameSite=Lax; Path=/', location: '/play?guild=' + guild + '&mode=normal' }); return res.end();
    }
    f.backend.app(req, res);
  });
  server.listen(port, '127.0.0.1', () => console.log('LOCAL ONLY - real engine, temporary progression: ' + base + '/__rpg-preview'));
  const stop = () => { server.closeAllConnections(); server.close(async () => { await f.close(); store.db.close(); fs.rmSync(data, { recursive: true, force: true }); process.exit(0); }); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
