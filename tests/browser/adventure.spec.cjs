const { test, expect } = require('@playwright/test');
const path = require('node:path');
const crypto = require('node:crypto');

async function blockExternal(context) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'cdn.discordapp.com') return route.fulfill({ path: path.resolve(__dirname, '../../assets/warsnuto-icon.png'), contentType: 'image/png' });
    return route.abort();
  });
}

async function signedInPage(browser, baseURL) {
  const context = await browser.newContext();
  await blockExternal(context);
  const page = await context.newPage();
  const started = await context.request.get(baseURL + '/auth/discord/start?next=/play', { maxRedirects: 0 });
  const url = new URL(started.headers().location);
  await page.goto('/auth/discord/callback?' + new URLSearchParams({
    state: url.searchParams.get('state'),
    iss: 'https://discord.com',
    code: 'OWNER-' + crypto.randomUUID()
  }));
  return { context, page };
}

test('browser adventure renders the interactive world without client errors', async ({ browser, baseURL }, info) => {
  const { context, page } = await signedInPage(browser, baseURL);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/play?guild=661720242585600500&mode=normal');
    await expect(page.locator('#game-main h1')).toHaveText('Le monde');
    await expect(page.locator('.world-atlas img')).toHaveAttribute('src', '/assets/adventure/world-map.jpg');
    await expect(page.locator('#world-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Récompense quotidienne' }).click();
    await expect(page.locator('#game-notice')).toContainText('Action de test enregistrée.');
    await page.getByRole('button', { name: 'Missions' }).click();
    await expect(page.locator('#game-main')).toContainText('Livraison');
    for (const label of ['Combats', 'Personnage', 'Inventaire', 'Marchand', 'Grand Line', 'Équipage', 'Raids', 'Échanges', 'Le guide', 'Le monde']) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.locator('#game-main h1')).toBeVisible();
      await expect(page.locator('#game-main')).not.toContainText('Aventure indisponible');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('adventure.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('illustrated combat plays a server turn and preserves the final reward screen', async ({ browser, baseURL }, info) => {
  const { context, page } = await signedInPage(browser, baseURL);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.playedSounds = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.playedSounds.push({ src: this.src, volume: this.volume }); return play.call(this); };
  });
  let current, receipts = [], operation;
  // Visual fixtures only. The real engine is exercised in adventure-engine.test.cjs.
  await page.route('**/api/platform/adventure/**', async route => {
    const response = await route.fetch(), state = await response.json();
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.action === 'boss.start') current = { scope: 'solo', boss_id: 'bandit_port', status: 'active', turn: 1, session_id: 'fixture-solo', player_hp: 280, player_max_hp: 280, boss_hp: 100, boss_max_hp: 100, log: 'Le duel commence.' };
      if (body.action === 'combat') {
        operation = body.operationId;
        const after = { ...current, boss_hp: 0, turn: 2, status: 'victory', log: 'Le boss est vaincu.' };
        state.result = { action: 'combat', message: 'Victoire enregistrée.', finished: true, victory: true, berries: 123, xp: 14, prime: 9,
          battle: { id: operation, profileMode: 'normal', action: body.input.action, before: current, after, events: [{ target: 'enemy', kind: 'health', delta: -100 }, { target: 'player', kind: 'health', delta: 0 }] } };
        receipts.unshift(state.result); current = null;
      }
    }
    state.combats = current ? [current] : []; state.recentBattles = receipts;
    await route.fulfill({ response, json: state });
  });
  try {
    await page.goto('/play?guild=661720242585600500&mode=normal');
    await page.getByRole('button', { name: 'Combats', exact: true }).click();
    await page.getByRole('button', { name: 'Affronter', exact: true }).click();
    await expect(page.locator('.battle-stage')).toBeVisible();
    await expect(page.locator('.battle-scenery')).toHaveJSProperty('naturalWidth', 1600);
    expect(await page.locator('.battle-player img').evaluate(img => img.naturalHeight > 0)).toBe(true);
    expect(await page.evaluate(() => window.playedSounds.length)).toBe(0);
    await page.getByRole('button', { name: 'Son et ambiance', exact: true }).click();
    await page.locator('#audio-enabled').check();
    await expect(page.locator('#audio-master')).toHaveValue('80');
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await expect(page.locator('i[data-lucide]')).toHaveCount(0);
    await expect(page.locator('.battle-move button').filter({ hasText: 'Potion' })).toBeDisabled();
    await page.screenshot({ path: info.outputPath('battle-active.png'), fullPage: true });
    await page.getByRole('button', { name: 'Attaque', exact: true }).click();
    await expect(page.locator('.battle')).toHaveAttribute('data-animating', 'true');
    await expect(page.locator('.battle-outcome')).toBeVisible();
    await expect(page.locator('.battle')).not.toHaveAttribute('data-animating', 'true');
    await expect(page.locator('.battle-outcome')).toContainText('123');
    await expect(page.locator('.battle-actions')).toHaveCount(0);
    const sounds = await page.evaluate(() => window.playedSounds.map(sound => sound.src.split('/').pop()));
    expect(sounds).toContain('attack.wav'); expect(sounds).toContain('impact.wav'); expect(sounds).toContain('victory.wav');
    await page.getByRole('button', { name: 'Son et ambiance', exact: true }).click();
    await page.locator('#audio-enabled').uncheck();
    const muted = await page.evaluate(() => { const count = window.playedSounds.length; window.WarsAdventureAudio.effect('attack'); return count === window.playedSounds.length; });
    expect(muted).toBe(true);
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Combats', exact: true }).click();
    await expect(page.locator('.battle-outcome')).toContainText('123');
    await expect(page.locator('.battle')).not.toHaveAttribute('data-animating', 'true');
    expect(operation).toBeTruthy(); expect(receipts).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath('battle-victory.png'), fullPage: true });
  } finally { await context.close(); }
});
