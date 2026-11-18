const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const cheerio = require('cheerio');
const { fixture } = require('./helpers.cjs');

test('all public pages share navigation, local assets, landmarks and valid metadata', async t => {
  const f = fixture(); await f.listen(); t.after(() => f.close());
  for (const name of ['index', 'game', 'cards', 'discord', 'youtube', 'bots', 'protect', 'support', 'docs', 'privacy', 'terms']) {
    const response = await f.request(name === 'index' ? '/' : '/' + name);
    assert.equal(response.status, 200, name);
    const html = await response.text(), $ = cheerio.load(html);
    assert.equal($('main').length, 1, name);
    assert.equal($('h1').length, 1, name);
    assert.equal($('meta[charset]').attr('charset'), 'utf-8');
    assert.equal($('link[href="/community.css"]').length, 1, name);
    assert.equal($('script[src="/community.js"]').length, 1, name);
    assert.deepEqual($('.v2-nav a').map((i, a) => $(a).attr('href')).get(), ['/', '/game', '/cards', '/discord', '/bots', '/docs']);
    assert.doesNotMatch(html, /\uFFFD|Ã©|Ã¨|â€™/);
  }
  for (const file of ['cards.js', 'cards.css', 'community.js', 'community.css']) assert.equal((await f.request('/' + file)).status, 200);
  for (const file of ['.env.web', 'server/auth.cjs', 'tests/browser-server.cjs']) assert.notEqual((await f.request('/' + file)).status, 200);
});

test('rework does not change the 205 cards or their rates', () => {
  const bytes = fs.readFileSync(path.join(__dirname, '../assets/cards/catalogue.js'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), 'ba93d0c5a2b79c5d47bc3df83d0eb8c5c4026af3ab192268e0ff9499916071bb');
});
