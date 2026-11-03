const { test, expect } = require('@playwright/test');
const { ids } = require('../helpers.cjs');
let states;
test.beforeAll(async ({ browser, baseURL }) => {
  states = {};
  for (const role of ['OWNER', 'USER']) {
    const context = await browser.newContext(); const page = await context.newPage();
    await blockExternal(context);
    const started = await context.request.get(baseURL + '/auth/discord/start?next=/profile', { maxRedirects: 0 });
    const url = new URL(started.headers().location);
    await page.goto('/auth/discord/callback?' + new URLSearchParams({ state: url.searchParams.get('state'), iss: 'https://discord.com', code: role + '-' + require('node:crypto').randomUUID() }));
    await expect(page.locator('#platform-content')).toContainText('Ton compte');
    states[role] = await context.storageState(); await context.close();
  }
});
async function prepare(browser, role) {
  const context = await browser.newContext({ storageState: states[role] });
  await blockExternal(context);
  const page = await context.newPage();
  return { context, page };
}
async function blockExternal(context) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'cdn.discordapp.com') return route.fulfill({ path: require('node:path').resolve(__dirname, '../../assets/warsnuto-icon.png'), contentType: 'image/png' });
    return route.abort();
  });
}
for (const [route, text] of [['/profile', 'Ton compte'], ['/profile/settings', 'Sessions actives'], ['/admin', 'État des services'], ['/admin/configuration', 'Titre du module'], ['/admin/bots', 'Protect, Game et Support'], ['/admin/users', 'Rechercher un compte'], ['/admin/staff', 'Autorisations des rôles'], ['/admin/logs', 'Toutes les actions'], ['/admin/settings', 'Nom public']]) {
  test('responsive page ' + route, async ({ browser }, info) => {
    const { context, page } = await prepare(browser, 'OWNER');
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(route); await expect(page.locator('#platform-content')).toContainText(text);
    await expect(page.locator('#platform-content')).toHaveAttribute('aria-busy', 'false');
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator('svg.lucide').count()).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath('page.png'), fullPage: true });
    await context.close();
  });
}
test('account menu uses actual profile and USER cannot see or reach administration', async ({ browser }) => {
  const { context, page } = await prepare(browser, 'USER'); await page.goto('/profile');
  await expect(page.locator('#platform-content')).toContainText('Ton compte'); await page.locator('.wn-account summary').click();
  await expect(page.locator('.wn-account-dropdown')).toContainText(ids.USER);
  await expect(page.locator('.wn-account-dropdown a[href="/admin"]')).toHaveCount(0);
  await page.goto('/admin'); await expect(page.getByRole('heading', { name: 'Accès réservé' })).toBeVisible(); await context.close();
});
test('profile preferences save and confirmation can be cancelled without mutating', async ({ browser }) => {
  const { context, page } = await prepare(browser, 'OWNER'); await page.goto('/profile/settings');
  await page.getByLabel('Réduire les animations de mon espace').check(); await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('[data-notice]')).toContainText('Préférences enregistrées');
  await page.getByRole('button', { name: 'Révoquer les autres', exact: false }).click();
  await expect(page.locator('#confirm-dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('#confirm-dialog')).not.toBeVisible(); await context.close();
});
test('member search and journal filters stay functional', async ({ browser }) => {
  const { context, page } = await prepare(browser, 'OWNER'); await page.goto('/admin/users');
  await page.getByLabel('Rechercher un compte').fill(ids.USER); await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1); await page.getByRole('button', { name: 'Consulter Membre de test' }).click();
  await expect(page.locator('#user-detail')).toContainText('Historique du compte');
  await page.goto('/admin/logs'); await page.getByRole('combobox', { name: 'Action', exact: true }).selectOption('auth.login'); await page.getByRole('button', { name: 'Filtrer', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('Connexion Discord'); await context.close();
});
test('site settings confirmation saves the value and refreshes the version', async ({ browser }) => {
  const { context, page } = await prepare(browser, 'OWNER'); await page.goto('/admin/settings');
  await page.getByLabel('Annonce publique').fill('Annonce de test navigateur');
  await page.getByRole('button', { name: 'Publier les paramètres' }).click();
  await page.locator('#confirm-dialog input[name="confirmation"]').fill('PUBLIER');
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.locator('[data-notice]')).toContainText('Paramètres publiés');
  await page.reload(); await expect(page.getByLabel('Annonce publique')).toHaveValue('Annonce de test navigateur');
  await context.close();
});
test('API outage has a retry state and no fake profile data', async ({ browser }) => {
  const { context, page } = await prepare(browser, 'OWNER');
  await page.route('**/api/platform/me', route => route.fulfill({ status: 503, json: { error: 'Service indisponible pour ce test' } }));
  await page.goto('/profile'); await expect(page.getByRole('heading', { name: 'Chargement indisponible' })).toBeVisible();
  await expect(page.locator('[data-notice]')).toContainText('Service indisponible pour ce test');
  await page.unroute('**/api/platform/me'); await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.locator('#platform-content')).toContainText('Ton compte'); await context.close();
});
test('bot monitoring renders individual live and stale states and refreshes safely', async ({ browser }, info) => {
  const { context, page } = await prepare(browser, 'OWNER'); let calls = 0;
  await page.route('**/api/platform/admin/bots', route => {
    calls++; const now = Date.now();
    return route.fulfill({ json: { checkedAt: now, bots: ['protect', 'game', 'support'].map((id, i) => ({ id, name: 'WarsNuto ' + ['Protect', 'Game', 'Support'][i],
      status: ['available', 'stale', 'disconnected'][i], sampledAt: now - i * 60000, startedAt: now - 86000000, latencyMs: 42, guildCount: 3, rssBytes: 64000000, commandsSinceStart: calls, lastCommandAt: now - 1000 })) } });
  });
  await page.goto('/admin/bots'); await expect(page.locator('.bot-monitor')).toHaveCount(3);
  await expect(page.locator('.bot-monitor').nth(0)).toContainText('Connecté à Discord');
  await expect(page.locator('.bot-monitor').nth(1)).toContainText('Signal trop ancien');
  await expect(page.locator('.bot-monitor').nth(2)).toContainText('Discord déconnecté');
  await page.getByRole('button', { name: 'Actualiser les états' }).click(); await expect.poll(() => calls).toBeGreaterThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('bot-monitoring.png'), fullPage: true }); await context.close();
});
test('bot configuration saves real settings, keeps them after reload and switches bots', async ({ browser }, info) => {
  const { context, page } = await prepare(browser, 'OWNER'); await page.goto('/admin/configuration');
  await expect(page.getByLabel('Titre du module')).toBeVisible();
  await page.getByLabel('Titre du module').fill('Réglage navigateur ' + info.project.name);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('#confirm-dialog textarea[name="reason"]').fill('Test navigateur de configuration');
  await page.locator('#confirm-dialog input[name="confirmation"]').fill('ENREGISTRER');
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.locator('[data-notice]')).toContainText('Configuration enregistrée dans le bot');
  await page.reload(); await expect(page.getByLabel('Titre du module')).toHaveValue('Réglage navigateur ' + info.project.name);
  await page.getByRole('combobox', { name: 'Bot', exact: true }).selectOption('support');
  await expect(page.getByLabel('Titre du module')).toHaveValue(/support/);
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByLabel('Nom de la règle').fill('Nouvelle règle');
  await expect(page.locator('[data-config-changes]')).toContainText('non enregistré');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('bot-configuration.png'), fullPage: true });
  await context.close();
});
test('unavailable bot clears the previous editor and supports retry without saving into another bot', async ({ browser }) => {
  const { context, page } = await prepare(browser, 'OWNER'); await page.goto('/admin/configuration');
  await expect(page.getByLabel('Titre du module')).toBeVisible();
  await page.route('**/api/platform/admin/bot-config/game/guilds', route => route.fulfill({ status: 503, json: { error: 'Game indisponible pour ce test' } }));
  await page.getByRole('combobox', { name: 'Bot', exact: true }).selectOption('game');
  await expect(page.getByRole('heading', { name: 'Configuration indisponible' })).toBeVisible();
  await expect(page.getByLabel('Titre du module')).toHaveCount(0);
  await page.unroute('**/api/platform/admin/bot-config/game/guilds');
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.getByLabel('Titre du module')).toHaveValue('game de test'); await context.close();
});
test('public home keeps existing navigation and animations with the account menu', async ({ browser }, info) => {
  const { context, page } = await prepare(browser, 'OWNER');
  await page.route('**/api/bots**', route => route.fulfill({ json: require('../../api/bots-data.json') }));
  await page.route('**/api/youtube', route => route.fulfill({ json: { videos: [], channel: {} } }));
  await page.goto('/'); await expect(page.locator('.wn-account summary')).toBeVisible();
  await expect(page.locator('.v2-nav a')).toHaveCount(5); await expect(page.locator('.site-intro')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('public-home.png'), fullPage: true }); await context.close();
});
