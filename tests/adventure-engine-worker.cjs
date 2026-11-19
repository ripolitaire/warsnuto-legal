// A second real SQLite connection, restricted to the integration fixture directory.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), Module = require('node:module');
const directory = fs.realpathSync(process.env.GAME_DATA_DIR || '.');
if (process.env.WARSNUTO_ISOLATED_TEST !== '1' || process.env.NODE_ENV !== 'test' ||
  path.dirname(directory) !== fs.realpathSync(os.tmpdir()) || !path.basename(directory).startsWith('warsnuto-rpg-engine-')) throw Error('Isolated test directory required');
const root = fs.realpathSync(process.env.WARSNUTO_GAME_TEST_ROOT);
const load = Module.createRequire(path.join(root, 'src', 'webAdventure.js'));
const store = load('./database');
const adapter = new Module(path.join(root, 'src', '__rpg_worker__.js'));
adapter.filename = path.join(root, 'src', '__rpg_worker__.js'); adapter.paths = Module._nodeModulePaths(path.join(root, 'src'));
adapter._compile(fs.readFileSync(path.join(__dirname, '../ops/bot-config/webAdventure.cjs'), 'utf8'), adapter.filename);
const bridge = adapter.exports.createWebAdventure({ store, game: load('./gameService'), catalog: load('./gameData'), voyage: load('./infiniteVoyage'), halloween: load('./halloween'), enabled: true });
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try { const data = JSON.parse(input); const result = bridge.execute(data.guild, data.user, 'normal', data.body); console.log(JSON.stringify({ ok: true, replayed: result.replayed, turn: result.result.battle.after.turn })); }
  catch (error) { console.log(JSON.stringify({ ok: false, status: error.status || 500, error: error.message })); }
  finally { store.db.close(); }
});
