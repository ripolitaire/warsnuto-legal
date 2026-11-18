const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
test('public card index has complete illustrations and truthful base rarity rates', () => {
  const root = path.join(__dirname, '..', 'assets', 'cards');
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'catalogue.js'), 'utf8'), context);
  const data = context.window.WARSNUTO_CARDS;
  assert.equal(data.cards.length, 205); assert.equal(data.rarities.length, 9);
  assert.equal(new Set(data.cards.map(card => card.id)).size, 205);
  assert.equal(data.cards.filter(card => card.rarity === 'signature').length, 5);
  assert.ok(Math.abs(data.rarities.reduce((sum, tier) => sum + tier.percent, 0) - 100) < 1e-9);
  assert.ok(Math.abs(data.rarities.find(tier => tier.id === 'signature').percent - 0.0005) < 1e-12);
  for (const card of data.cards) {
    assert.match(card.id, /^WN-\d{3}$/);
    assert.ok(data.rarities.some(tier => tier.id === card.rarity));
    assert.equal(card.discordUserId, undefined);
    for (const prefix of ['', 'thumbs/']) {
      const file = path.join(root, prefix + card.id + '.webp');
      const bytes = fs.readFileSync(file);
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      assert.ok(bytes.length < 8 * 1024 * 1024);
    }
  }
});
