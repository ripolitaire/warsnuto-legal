const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const file = relative => path.join(root, relative);

test('adventure page and staged Game bridge reference complete local assets', () => {
  const page = fs.readFileSync(file('adventure.js'), 'utf8');
  assert.match(page, /world-map\.jpg/);
  assert.match(page, /enemy\.png/);
  assert.doesNotMatch(page, /map\.webp|enemy\.webp/);

  for (const relative of [
    'assets/adventure/world-map.jpg',
    'assets/adventure/island.webp',
    'assets/adventure/enemy.png',
    'assets/adventure/audio/theme.wav',
    'assets/adventure/audio/harbour.wav',
    'assets/adventure/audio/storm.wav',
    'assets/adventure/audio/battle.wav',
    'assets/adventure/audio/boss.wav',
    'assets/adventure/audio/sea.wav',
    'assets/adventure/audio/impact.wav',
    'assets/adventure/audio/guard.wav',
    'assets/adventure/audio/heal.wav',
    'assets/adventure/rpg/harbour.webp',
    'assets/adventure/rpg/adventurer.webp',
    'adventure-combat.js',
    'ops/bot-config/webAdventure.cjs'
  ]) assert.ok(fs.statSync(file(relative)).isFile(), relative);

  const stagedAdapter = fs.readFileSync(file('ops/bot-config/game.cjs'), 'utf8');
  const stagedGateway = fs.readFileSync(file('ops/bot-config/webDashboard.cjs'), 'utf8');
  const stagedAdventure = fs.readFileSync(file('ops/bot-config/webAdventure.cjs'), 'utf8');
  assert.match(stagedAdapter, /src', 'webAdventure'/);
  assert.match(stagedGateway, /adapter\.adventure/);
  assert.match(stagedAdventure, /createWebAdventure/);
});
