const { test, expect } = require('@playwright/test');
const { ids } = require('../helpers.cjs');
let states;
test.beforeAll(async ({ browser, baseURL }) => {
  states = {};
  for (const role of ['OWNER', 'USER', 'MODERATOR']) {
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
for (const [route, text] of [['/profile', 'Ton compte'], ['/profile/settings', 'Sessions actives'], ['/profile/protect', 'Niveau 12'], ['/profile/game', 'Niveau 42'], ['/servers', 'Tes serveurs WarsNuto'], ['/admin', 'État des services'], ['/admin/configuration', 'Choisir un serveur'], ['/admin/moderation', 'Tous les réglages'], ['/admin/bots', 'Protect, Game et Support'], ['/admin/users', 'Rechercher un compte'], ['/admin/staff', 'Autorisations des rôles'], ['/admin/logs', 'Toutes les actions'], ['/admin/settings', 'Nom public']]) {
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

test('server-first navigation filters servers and does not expose configuration to ordinary members', async ({ browser }, info) => {
  const { context, page } = await prepare(browser, 'USER'); await page.goto('/servers');
  await expect(page.locator('.server-item')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Configurer', exact: true })).toHaveCount(0);
  await page.getByLabel('Rechercher un serveur').fill('introuvable'); await expect(page.locator('.server-item')).not.toBeVisible();
  await page.getByLabel('Rechercher un serveur').fill('test'); await expect(page.locator('.server-item')).toBeVisible();
  await page.getByRole('link', { name: 'Ma progression', exact: true }).click(); await expect(page.locator('[data-game-data]')).toContainText('Niveau 42');
  await expect(page.locator('[data-game-mode="admin"]')).not.toBeVisible();
  await page.screenshot({ path: info.outputPath('member-game.png'), fullPage: true }); await context.close();
});

test('real Game profile shows XP, equipment and separated Admin Mod with refresh and safe outage state', async ({ browser }, info) => {
  const { context, page } = await prepare(browser, 'OWNER'); await page.goto('/profile/game');
  await expect(page.locator('[data-game-data]')).toContainText('Fruit Nika');
  await expect(page.locator('progress')).toHaveAttribute('value', '85');
  await expect(page.locator('.inventory-grid')).toContainText('Clé de raid');
  await page.getByRole('button', { name: 'Admin Mod', exact: true }).click(); await expect(page.locator('[data-game-data] h2')).toContainText('10');
  await expect(page.locator('[data-game-data]')).toContainText('progression séparée');
  await page.getByRole('button', { name: 'Normal', exact: true }).click(); await expect(page.locator('[data-game-data] h2')).toHaveText('Niveau 42');
  await page.route('**/api/platform/me/game/**', route => route.fulfill({ status: 503, json: { error: 'Game indisponible pour ce test' } }));
  await page.getByRole('button', { name: 'Actualiser ma progression', exact: true }).click();
  await expect(page.locator('[data-game-data]')).toContainText('Game indisponible'); await expect(page.locator('progress')).toHaveCount(0);
  await page.unroute('**/api/platform/me/game/**'); await page.getByRole('button', { name: 'Actualiser ma progression', exact: true }).click();
  await expect(page.locator('[data-game-data]')).toContainText('Niveau 42');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('game-profile.png'), fullPage: true }); await context.close();
});
test('profile preferences save and confirmation can be cancelled without mutating', async ({ browser }) => {
  const { context, page } = await prepare(browser, 'OWNER'); await page.goto('/profile/settings');
  await page.getByLabel('Réduire les animations de mon espace').check(); await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('[data-notice]')).toContainText('Préférences enregistrées');
  await page.getByRole('button', { name: 'Révoquer les autres', exact: false }).click();
  await expect(page.locator('#confirm-dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('#confirm-dialog')).not.toBeVisible(); await context.close();
});

async function preferences(context, patch) {
  const session = await (await context.request.get('/api/platform/session')).json();
  const result = await context.request.patch('/api/platform/me/preferences', { data: patch, headers: { origin: 'http://127.0.0.1:4317', 'x-csrf-token': session.csrf } });
  expect(result.ok()).toBe(true);
}
const defaults = { theme: 'dark', density: 'comfortable', reducedMotion: false, autoRefresh: true, hideBalances: false, showProfileBanner: true };

test('Protect community XP is separate from Game, read-only, member accessible and clears stale levels on outage', async ({ browser }, info) => {
  const { context, page } = await prepare(browser, 'USER');
  await page.goto('/profile');
  await expect(page.locator('[data-profile-protect]')).toContainText('Niveau 12');
  await expect(page.locator('[data-profile-game]')).toContainText('Niveau 42');
  await page.goto('/profile/protect');
  await expect(page.locator('[data-protect-xp-data]')).toContainText('Dernière XP vocale');
  await expect(page.locator('progress')).toHaveAttribute('value', '234');
  await page.route('**/api/platform/me/protect/**', route => route.fulfill({ status: 503, json: { error: 'Protect indisponible pour ce test' } }));
  await page.getByRole('button', { name: 'Actualiser mon XP Protect', exact: true }).click();
  await expect(page.locator('[data-protect-xp-data]')).toContainText('Protect indisponible');
  await expect(page.locator('progress')).toHaveCount(0);
  await page.unroute('**/api/platform/me/protect/**');
  await page.getByRole('button', { name: 'Actualiser mon XP Protect', exact: true }).click();
  await expect(page.locator('[data-protect-xp-data]')).toContainText('Niveau 12');
  await page.screenshot({ path: info.outputPath('protect-xp.png'), fullPage: true }); await context.close();
});

test('appearance previews, cancels, saves, follows system and carries to public pages without private storage', async ({ browser }, info) => {
  const { context, page } = await prepare(browser, 'USER');
  try {
    await preferences(context, defaults); await page.goto('/profile/settings');
    await page.getByLabel('Clair', { exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 248, 250)');
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByLabel('Clair', { exact: true }).check();
    await page.getByLabel('Densité de mon espace').selectOption('compact');
    await page.getByLabel('Masquer mes soldes à l’écran').check();
    await page.getByLabel('Afficher ma bannière Discord').uncheck();
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.locator('[data-notice]')).toContainText('Préférences enregistrées');
    await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
    await expect(page.getByLabel('Clair', { exact: true })).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('preferences-light.png'), fullPage: true });
    await page.goto('/profile/game'); await expect(page.locator('[data-game-data]')).toContainText('Masqué');
    await expect(page.locator('.game-metrics')).not.toContainText('125');
    await page.goto('/'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 248, 250)');
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem('wn-appearance-v1')));
    expect(Object.keys(local).sort()).toEqual(['density', 'reducedMotion', 'theme']);
    await expect(page.locator('.site-intro')).toHaveCSS('opacity', '0');
    await expect(page.locator('.v2-hero-copy')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: info.outputPath('public-light.png') });
    await preferences(context, { theme: 'system' }); await page.goto('/profile/settings');
    await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 248, 250)');
    await page.emulateMedia({ colorScheme: 'dark' }); await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(5, 5, 6)');
    await preferences(context, { reducedMotion: true }); await page.goto('/profile/settings');
    await expect(page.getByLabel('Réduire les animations de mon espace')).toBeChecked();
    await page.goto('/'); await expect(page.locator('.site-intro')).not.toBeVisible();
    await expect(page.locator('.v2-hero-copy')).toHaveCSS('opacity', '1');
  } finally { await preferences(context, defaults); await context.close(); }
});

test('automatic statistics may stop but session validation and manual refresh continue', async ({ browser }) => {
  const { context, page } = await prepare(browser, 'USER'); let stats = 0, sessions = 0;
  try {
    await preferences(context, { autoRefresh: false });
    page.on('request', request => { if (request.url().includes('/api/platform/me/protect/')) stats++; if (request.url().endsWith('/api/platform/session')) sessions++; });
    await page.clock.install(); await page.goto('/profile/protect');
    await expect(page.locator('[data-protect-xp-data]')).toContainText('Niveau 12');
    const before = sessions; await page.clock.fastForward(61000);
    await expect.poll(() => sessions).toBeGreaterThan(before); expect(stats).toBe(1);
    await page.getByRole('button', { name: 'Actualiser mon XP Protect', exact: true }).click();
    await expect.poll(() => stats).toBe(2);
  } finally { await preferences(context, defaults); await context.close(); }
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
  await page.getByRole('link', { name: 'Configurer', exact: true }).click();
  await expect(page.getByLabel('Titre du module')).toBeVisible();
  await page.getByLabel('Titre du module').fill('Réglage navigateur ' + info.project.name);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('#confirm-dialog textarea[name="reason"]').fill('Test navigateur de configuration');
  await page.locator('#confirm-dialog input[name="confirmation"]').fill('ENREGISTRER');
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.locator('[data-notice]')).toContainText('Configuration enregistrée dans le bot');
  await page.reload(); await expect(page.getByLabel('Titre du module')).toHaveValue('Réglage navigateur ' + info.project.name);
  await page.getByRole('tab', { name: 'Support', exact: true }).click();
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
  await page.getByRole('link', { name: 'Configurer', exact: true }).click();
  await expect(page.getByLabel('Titre du module')).toBeVisible();
  await page.route('**/api/platform/admin/bot-config/game/guilds', route => route.fulfill({ status: 503, json: { error: 'Game indisponible pour ce test' } }));
  await page.getByRole('tab', { name: 'Game', exact: true }).click();
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

test('compact role menus search, remove, save and persist without native multiselect boxes', async ({ browser, baseURL }, info) => {
  const { context, page } = await prepare(browser, 'OWNER');
  const endpoint = baseURL + '/api/platform/admin/bot-config/protect/661720242585600500/access';
  const before = await (await context.request.get(endpoint)).json(), session = await (await context.request.get(baseURL + '/api/platform/session')).json();
  const reset = await context.request.patch(endpoint, { headers: { origin: baseURL, 'x-csrf-token': session.csrf }, data: { values: { adminRoleIds: ['661720242585600610'] }, revision: before.revision, operationId: require('node:crypto').randomUUID(), reason: 'Initialisation du scénario navigateur', confirmation: 'ENREGISTRER' } });
  expect(reset.status()).toBe(200);
  await page.goto('/admin/configuration?bot=protect&guild=661720242585600500&section=access');
  const field = page.locator('[data-config-field="adminRoleIds"]'), picker = field.locator('details');
  await expect(field.locator('.reference-token')).toContainText('Administrateur');
  await expect(page.locator('select[multiple]:visible')).toHaveCount(0);
  await field.locator('summary').click(); await expect(picker).toHaveAttribute('open', '');
  await field.getByRole('searchbox').fill('équipe');
  await expect(field.locator('[data-picker-value]:visible')).toHaveCount(1);
  await field.locator('[data-picker-value]:visible').click();
  await expect(field.locator('.reference-tokens')).toContainText('Équipe événement');
  await field.getByRole('searchbox').fill('introuvable'); await expect(field.locator('[data-picker-empty]')).toBeVisible();
  await field.getByRole('searchbox').fill('');
  expect(await picker.locator('.reference-popover').evaluate(node => { const b = node.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 64 && b.bottom <= innerHeight; })).toBe(true);
  await page.screenshot({ path: info.outputPath('roles-search.png'), fullPage: true });
  await page.keyboard.press('Escape'); await expect(picker).not.toHaveAttribute('open', '');
  await expect(field.locator('summary')).toBeFocused();
  await field.getByRole('button', { name: 'Retirer Administrateur', exact: true }).click();
  await expect(page.locator('[data-config-changes]')).toContainText('1 réglage');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('#confirm-dialog textarea[name="reason"]').fill('Vérification des menus de rôles');
  await page.locator('#confirm-dialog input[name="confirmation"]').fill('ENREGISTRER');
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.locator('[data-notice]')).toContainText('Configuration enregistrée');
  await page.reload(); await expect(field.locator('.reference-tokens')).toHaveText(/Équipe événement/);
  await expect(field.locator('.reference-tokens')).not.toContainText('Administrateur');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('access-settings.png'), fullPage: true }); await context.close();
});

test('module navigation protects pending edits and custom channel picker can clear a saved channel', async ({ browser }, info) => {
  const { context, page } = await prepare(browser, 'OWNER');
  await page.goto('/admin/configuration?bot=protect&guild=661720242585600500&section=logs');
  const field = page.locator('[data-config-field="moderationLogChannelId"]');
  await field.locator('summary').click(); await field.getByRole('button', { name: 'Aucun', exact: true }).click();
  await expect(field.locator('[data-picker-caption]')).toHaveText('Aucun');
  await expect(page.locator('[data-config-changes]')).toContainText('1 réglage');
  const mobile = info.project.name === 'mobile';
  if (mobile) await page.getByRole('combobox', { name: 'Rubrique', exact: true }).selectOption('access');
  else await page.locator('[data-section-link="access"]').click();
  await expect(page.locator('#confirm-dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/section=logs/); await expect(field.locator('[data-picker-caption]')).toHaveText('Aucun');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(field.locator('[data-picker-caption]')).toHaveText('journal-test');
  await expect(page.locator('[data-save-config]')).toBeDisabled();
  if (mobile) await page.getByRole('combobox', { name: 'Rubrique', exact: true }).selectOption('automod');
  else await page.locator('[data-section-link="automod"]').click();
  await expect(page.getByRole('switch', { name: 'Activer l’AutoMod', exact: true })).toBeChecked();
  await page.getByRole('switch', { name: 'Activer l’AutoMod', exact: true }).uncheck();
  await expect(page.locator('[data-config-changes]')).toContainText('1 réglage');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.getByRole('tab', { name: 'Protect', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Game', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Titre du module')).toHaveValue('game de test'); await context.close();
});

test('welcome configuration saves public delivery, optional channels and common V2 content', async ({ browser }, info) => {
  const { context, page } = await prepare(browser, 'OWNER');
  await page.goto('/admin/configuration?bot=protect&guild=661720242585600500&section=welcome');
  await expect(page.getByRole('heading', { name: 'Accueil des membres', exact: true })).toBeVisible();
  for (const key of ['publicChannelId', 'rulesChannelId', 'announcementsChannelId', 'discussionChannelId']) {
    const field = page.locator('[data-config-field="' + key + '"]'); await field.locator('summary').click(); await field.getByRole('button', { name: 'journal-test', exact: true }).click();
  }
  await page.getByRole('switch', { name: 'Activer l’accueil à chaque arrivée dans le salon', exact: true }).check();
  await expect(page.getByRole('switch', { name: 'Utiliser la carte Components V2', exact: true })).toBeChecked();
  await page.locator('[data-config-field="message"] textarea').fill('Bienvenue dans la communauté de **{guild}** ! ' + info.project.name);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('#confirm-dialog textarea[name="reason"]').fill('Configurer le message d’accueil commun');
  await page.locator('#confirm-dialog input[name="confirmation"]').fill('ENREGISTRER');
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.locator('[data-notice]')).toContainText('Configuration enregistrée');
  await page.reload(); await expect(page.getByRole('switch', { name: 'Activer l’accueil à chaque arrivée dans le salon', exact: true })).toBeChecked();
  await expect(page.locator('[data-config-field="rulesChannelId"] [data-picker-caption]')).toHaveText('journal-test');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('welcome-config.png'), fullPage: true }); await context.close();
});

test('YouTube fallback videos show real relative labels, working thumbnails and safe titles', async ({ browser }, info) => {
  const { context, page } = await prepare(browser, 'USER');
  await page.route('**/api/youtube', route => route.fulfill({ json: { ok: true, source: 'YouTube channel', videos: [{ id: 'j2tpYXhhuFM', title: 'Une vidéo de WarsNuto <script>', url: 'https://www.youtube.com/watch?v=j2tpYXhhuFM', thumbnail: 'https://i.ytimg.com/vi/j2tpYXhhuFM/hqdefault.jpg', publishedAt: null, publishedLabel: 'il y a 2 jours', viewsLabel: '14 mille vues' }] } }));
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ path: require('node:path').resolve(__dirname, '../../assets/warsnuto-icon.png'), contentType: 'image/png' }));
  await page.goto('/youtube'); const cards = page.locator('[data-youtube-videos]');
  await expect(cards).toContainText('il y a 2 jours'); await expect(cards).toContainText('14 mille vues');
  await expect(cards.locator('script')).toHaveCount(0); await expect(cards).not.toContainText('1970');
  await expect(cards.locator('img')).toBeVisible(); expect(await cards.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: info.outputPath('youtube-videos.png'), fullPage: true }); await context.close();
});

test('moderation workspace links to real Protect modules and handles an outage honestly', async ({ browser }) => {
  const { context, page } = await prepare(browser, 'OWNER'); await page.goto('/admin/moderation');
  await expect(page.locator('.moderation-module')).toHaveCount(3);
  await expect(page.locator('#platform-content')).not.toContainText('Connecteur de modération non activé');
  await expect(page.locator('.moderation-history-note')).toContainText('ne sont pas reliés');
  await page.getByRole('link', { name: /Équipes et accès/ }).click();
  await expect(page).toHaveURL(/section=access/); await expect(page.locator('[data-config-field="adminRoleIds"]')).toBeVisible();
  await page.goto('/admin/moderation');
  await page.route('**/api/platform/admin/bot-config/protect/661720242585600500', route => route.fulfill({ status: 503, json: { error: 'Protect indisponible pour ce test' } }));
  await page.getByRole('button', { name: 'Actualiser Protect', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Réglages Protect indisponibles' })).toBeVisible();
  await expect(page.locator('.moderation-module')).toHaveCount(0);
  await page.unroute('**/api/platform/admin/bot-config/protect/661720242585600500'); await page.getByRole('button', { name: 'Actualiser Protect', exact: true }).click();
  await expect(page.locator('.moderation-module')).toHaveCount(3); await context.close();
});

test('Protect moderators see their actual grade but no administration or configuration controls', async ({ browser }, info) => {
  const { context, page } = await prepare(browser, 'MODERATOR'); let configReads = 0;
  page.on('request', request => { if (request.url().includes('/api/platform/admin/bot-config/')) configReads++; });
  await page.goto('/servers'); await expect(page.locator('.protect-server-grade')).toContainText('Modérateur test');
  await expect(page.getByRole('link', { name: 'Configurer', exact: true })).toHaveCount(0);
  await page.locator('.server-item').getByRole('link', { name: 'Modération', exact: true }).click();
  await expect(page.locator('.protect-grade')).toContainText('Niveau 1 / 4');
  await expect(page.locator('.protect-access-lines')).toContainText('Configuration réservée');
  await expect(page.getByRole('link', { name: 'Tous les réglages' })).toHaveCount(0); expect(configReads).toBe(0);
  await page.locator('.protect-command-list summary').click(); await expect(page.locator('.protect-command-list')).toContainText('/mute');
  await expect(page.locator('.protect-command-list')).not.toContainText('/ban');
  await page.locator('.wn-account summary').click(); await expect(page.locator('.wn-account-dropdown a[href="/admin"]')).toHaveCount(0);
  await page.locator('.wn-account summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('protect-moderator.png'), fullPage: true });
  await page.route('**/api/platform/moderation/**', route => route.fulfill({ status: 403, json: { error: 'Rôle Protect retiré' } }));
  await page.getByRole('button', { name: 'Actualiser Protect', exact: true }).click();
  await expect(page.locator('.protect-command-list')).toHaveCount(0); await expect(page.locator('.protect-grade')).toHaveCount(0);
  await context.close();
});

test('public website and private panel share their visual theme and typography', async ({ browser }, info) => {
  const { context, page } = await prepare(browser, 'OWNER');
  await page.route('**/api/bots**', route => route.fulfill({ json: require('../../api/bots-data.json') }));
  await page.route('**/api/youtube', route => route.fulfill({ json: { videos: [], channel: {} } }));
  const theme = () => page.evaluate(() => { const css = getComputedStyle(document.documentElement); return { gold: css.getPropertyValue('--gold').trim(), bg: css.getPropertyValue('--bg').trim(), line: css.getPropertyValue('--line').trim(), font: getComputedStyle(document.body).fontFamily, radius: css.getPropertyValue('--button-radius').trim() }; });
  await page.goto('/'); const publicTheme = await theme();
  await page.goto('/admin/configuration?bot=protect&guild=661720242585600500&section=access');
  await expect(page.locator('.config-editor-heading')).toContainText('Équipes et accès');
  expect(await theme()).toEqual(publicTheme);
  expect(await page.locator('[data-save-config]').evaluate(node => getComputedStyle(node).borderRadius)).toBe(publicTheme.radius);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('shared-site-theme.png'), fullPage: true }); await context.close();
});
