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
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('adventure.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
