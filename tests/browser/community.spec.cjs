const { test, expect } = require('@playwright/test');
const { loginPage } = require('./test-session.cjs');
const snapshot = require('../../api/bots-data.json');

async function publicSources(page) {
  await page.route('**/api/bots**', route => route.fulfill({ json: snapshot }));
  await page.route('**/api/youtube', route => route.fulfill({ json: { videos: [] } }));
  await page.route('**/_vercel/**', route => route.abort());
}
for (const route of ['/', '/game', '/cards', '/discord', '/youtube', '/bots', '/protect', '/support', '/docs', '/privacy', '/terms']) {
  test('community layout and real local media ' + route, async ({ page }, info) => {
    await publicSources(page); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(route); await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('.community-header')).toBeVisible();
    if (info.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Menu principal', exact: true }).click();
      await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Collection', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Menu principal', exact: true })).toBeFocused();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Local source images must actually decode, rather than just have an img element.
    await expect.poll(() => page.locator('main img[src^="/assets/"]').evaluateAll(images => images.filter(img => img.getBoundingClientRect().top < innerHeight).every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath('community.png'), fullPage: true, animations: 'disabled' });
  });
}
test('catalogue filters persist in URL, detail links work and empty results recover', async ({ page }) => {
  await page.goto('/cards?rarity=signature');
  await expect(page.locator('.card-item')).toHaveCount(5);
  await expect(page.locator('#card-odds')).toContainText('0,0005');
  await page.locator('#card-search').fill('Soli'); await expect(page.locator('.card-item')).toHaveCount(1);
  await page.reload(); await expect(page.locator('#card-search')).toHaveValue('Soli');
  await page.getByRole('button', { name: 'Voir Soli', exact: true }).click();
  await expect(page.locator('#card-detail')).toBeVisible(); await expect(page).toHaveURL(/card=WN-201/);
  await expect.poll(() => page.locator('#card-art').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Voir Soli', exact: true })).toBeFocused();
  await page.locator('#card-search').fill('introuvable-xyz'); await expect(page.locator('.card-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Effacer les filtres' }).click(); await expect(page.locator('.card-item')).toHaveCount(20);
  await page.locator('#card-next').click(); await expect(page.locator('#card-page')).toHaveText('2 / 11');
  await page.goto('/cards?card=WN-204'); await expect(page.locator('#card-title')).toHaveText('WarsNuto');
});
test('personal collection keeps guild scope and exposes progress, universes, missing cards and duplicates', async ({ browser, baseURL }, info) => {
  const { page, context } = await loginPage(browser, baseURL, 'USER');
  try {
    await page.route('**/api/platform/me/game/**', async route => {
      const response = await route.fetch(), data = await response.json();
      return route.fulfill({ json: { ...data, collection: { available: true, cards: [{ id: 'WN-001', quantity: 3 }, { id: 'WN-201', quantity: 1 }] } } });
    });
    await page.goto('/profile/cards'); await expect(page.locator('.card-item')).toHaveCount(2);
    await expect(page.locator('.collection-totals')).toContainText('2 / 205');
    await page.locator('[data-collection-view]').selectOption('duplicates'); await expect(page.locator('.card-item')).toHaveCount(1);
    await page.locator('[data-collection-view]').selectOption('missing'); await expect(page.locator('[data-collection-stats]')).toContainText('203 carte(s)');
    await page.locator('[data-collection-universe]').selectOption('WarsNuto UNIVERS'); await expect(page.locator('.card-item')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Menu de mon espace' }).click();
      await expect(page.locator('.platform-sidebar a[href="/profile/cards"]')).toBeVisible(); await page.keyboard.press('Escape');
    }
    await page.screenshot({ path: info.outputPath('collection.png'), fullPage: true });
  } finally { await context.close(); }
});
test('YouTube outage offers a bounded manual retry', async ({ page }) => {
  await publicSources(page); let calls = 0;
  await page.route('**/api/youtube', route => { calls++; return route.fulfill({ status: 503, json: {} }); });
  await page.goto('/youtube'); await expect(page.getByRole('button', { name: 'Réessayer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect.poll(() => calls).toBe(2); await expect(page.locator('[data-youtube-videos]')).toHaveAttribute('aria-busy', 'false');
});

test('documentation stays visible even when its modules exceed the viewport', async ({ page }) => {
  await publicSources(page); await page.goto('/docs');
  await expect(page.locator('.docs-bot-section')).toHaveCount(3);
  for (const article of await page.locator('.docs-bot-section').all()) await expect(article).toHaveCSS('opacity', '1');
  expect(await page.locator('.docs-grid').evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(2400);
  await page.locator('#protect-doc summary').first().click(); await expect(page.locator('#protect-doc ul')).toBeVisible();
  await page.locator('#game-doc').scrollIntoViewIfNeeded(); await expect(page.locator('#game-doc')).toHaveCSS('opacity', '1');
});

test('home counters require a fresh live source rather than presenting the static snapshot as live', async ({ page }) => {
  await publicSources(page); await page.goto('/'); await expect(page.locator('[data-community-members]')).toHaveText('Indisponible');
  await page.evaluate(() => localStorage.clear());
  await page.route('**/api/bots**', route => route.fulfill({ json: { ...snapshot, live: { source: 'Discord Invite', countsFetchedAt: new Date().toISOString() } } }));
  await page.reload(); await expect(page.locator('[data-community-members]')).toHaveText(snapshot.bots.find(bot => bot.slug === 'protect').community.membersLabel);
});

test('profile shares concurrent directory reads instead of requesting the same bot directory twice', async ({ browser, baseURL }) => {
  const { page, context } = await loginPage(browser, baseURL, 'USER');
  try {
    let reads = 0;
    await page.route('**/api/platform/servers', async route => { reads++; const response = await route.fetch(); await new Promise(resolve => setTimeout(resolve, 80)); await route.fulfill({ response }); });
    await page.goto('/profile');
    await expect(page.locator('[data-profile-game]')).toContainText('Niveau 42');
    await expect(page.locator('[data-profile-protect]')).toContainText('Niveau 12');
    expect(reads).toBe(1);
  } finally { await context.close(); }
});
