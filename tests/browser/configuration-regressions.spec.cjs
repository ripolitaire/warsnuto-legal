const { test, expect } = require('@playwright/test');
const { loginPage } = require('./test-session.cjs');
const guild = '661720242585600500', channel = '661720242585600502';
const config = section => '/admin/configuration?bot=protect&guild=' + guild + '&section=' + section;
async function welcomeValues(page, values) {
  await page.route('**/api/platform/admin/bot-config/protect/' + guild + '/welcome', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(), data = await response.json();
    return route.fulfill({ json: { ...data, values: { ...data.values, ...values } } });
  });
}

test('empty references have one None choice and no phantom unavailable value', async ({ browser, baseURL }) => {
  const { context, page } = await loginPage(browser, baseURL);
  try {
    await welcomeValues(page, { publicChannelId: null, verificationChannelId: null, rulesChannelId: null, announcementsChannelId: null, discussionChannelId: null });
    await page.goto(config('welcome'));
    for (const key of ['publicChannelId', 'verificationChannelId', 'rulesChannelId', 'announcementsChannelId', 'discussionChannelId']) {
      const field = page.locator('[data-config-field="' + key + '"]'); await field.locator('summary').click();
      await expect(field.getByRole('button', { name: 'Aucun', exact: true })).toHaveCount(1);
      await expect(field.locator('select option[value=""]')).toHaveCount(1);
      await expect(field.locator('[data-picker-value][aria-pressed="true"]')).toHaveCount(1);
      await expect(field.locator('.reference-options')).not.toContainText('Indisponible');
      await page.keyboard.press('Escape');
    }
    await expect(page.locator('[data-save-config]')).toBeDisabled();
  } finally { await context.close(); }
});

test('choosing the current channel keeps it selected and clearing uses None explicitly', async ({ browser, baseURL }) => {
  const { context, page } = await loginPage(browser, baseURL);
  try {
    await welcomeValues(page, { publicChannelId: channel }); await page.goto(config('welcome'));
    const field = page.locator('[data-config-field="publicChannelId"]'); await field.locator('summary').click();
    await field.getByRole('button', { name: 'journal-test', exact: true }).click();
    await expect(field.locator('[data-picker-caption]')).toHaveText('journal-test'); await expect(page.locator('[data-save-config]')).toBeDisabled();
    await field.locator('summary').click(); await field.getByRole('button', { name: 'Aucun', exact: true }).click();
    await expect(field.locator('[data-picker-caption]')).toHaveText('Aucun');
    await expect(page.locator('[data-config-changes]')).toContainText('1 réglage');
  } finally { await context.close(); }
});

test('welcome fields are grouped and invalid public activation never sends a save', async ({ browser, baseURL }, info) => {
  const { context, page } = await loginPage(browser, baseURL); let writes = 0;
  try {
    await welcomeValues(page, { publicEnabled: false, publicChannelId: null });
    page.on('request', request => { if (request.method() === 'PATCH' && request.url().endsWith('/welcome')) writes++; });
    await page.goto(config('welcome'));
    await expect(page.locator('.config-group-heading')).toHaveText(['Diffusion', 'Salons importants', 'Message de bienvenue', 'Apparence']);
    await page.getByRole('switch', { name: 'Activer l’accueil à chaque arrivée dans le salon', exact: true }).check();
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const field = page.locator('[data-config-field="publicChannelId"]');
    await expect(field.locator('.field-error')).toBeVisible(); await expect(page.locator('#confirm-dialog')).not.toBeVisible(); expect(writes).toBe(0);
    await field.getByRole('button', { name: 'journal-test', exact: true }).click(); await expect(field.locator('.field-error')).toHaveCount(0);
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.getByRole('switch', { name: 'Activer l’accueil à chaque arrivée dans le salon', exact: true })).toBeChecked();
    await page.screenshot({ path: info.outputPath('welcome-organized.png'), fullPage: true });
  } finally { await context.close(); }
});

test('picker is keyboard accessible and stays inside the viewport after scrolling and resize', async ({ browser, baseURL }, info) => {
  const { context, page } = await loginPage(browser, baseURL);
  try {
    await page.goto(config('welcome')); const field = page.locator('[data-config-field="discussionChannelId"]');
    await field.locator('summary').click(); await expect(field.locator('.reference-popover')).toBeVisible();
    await field.getByRole('searchbox').press('ArrowDown'); await expect(field.locator('[data-picker-value]').first()).toBeFocused();
    await page.keyboard.press('Escape'); await expect(field.locator('summary')).toBeFocused();
    await field.locator('summary').click();
    await page.setViewportSize({ width: info.project.name === 'mobile' ? 360 : 1280, height: 640 });
    await expect.poll(() => field.locator('.reference-popover').evaluate(node => { const b = node.getBoundingClientRect(), header = document.querySelector('.platform-header').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= header.bottom && b.bottom <= innerHeight; })).toBe(true);
    await page.screenshot({ path: info.outputPath('picker-viewport.png') });
  } finally { await context.close(); }
});

test('sections are searchable and the selected module is remembered when switching bots', async ({ browser, baseURL }, info) => {
  const { context, page } = await loginPage(browser, baseURL);
  try {
    await page.goto(config('access'));
    if (info.project.name === 'desktop') {
      await page.getByRole('searchbox', { name: 'Rechercher une rubrique', exact: true }).fill('accueil');
      await expect(page.locator('[data-section-link]:visible')).toHaveCount(1);
      await page.locator('[data-section-link="welcome"]').click();
    } else {
      await expect.poll(() => page.locator('[data-config-section] optgroup').count()).toBeGreaterThan(1);
      await page.getByRole('combobox', { name: 'Rubrique', exact: true }).selectOption('welcome');
    }
    await expect(page).toHaveURL(/section=welcome/);
    await page.getByRole('tab', { name: 'Game', exact: true }).click(); await expect(page.getByLabel('Titre du module')).toHaveValue('game de test');
    await page.getByRole('tab', { name: 'Protect', exact: true }).click();
    await expect(page).toHaveURL(/section=welcome/); await expect(page.getByRole('heading', { name: 'Accueil des membres', exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('refreshing servers through the icon can recover after an API error', async ({ browser, baseURL }) => {
  const { context, page } = await loginPage(browser, baseURL);
  try {
    await page.goto('/servers'); await expect(page.locator('.server-item')).toHaveCount(1);
    await page.route('**/api/platform/servers', route => route.fulfill({ status: 503, json: { error: 'Panne temporaire de test' } }));
    await page.locator('[data-refresh-servers] svg').click(); await expect(page.locator('[data-notice]')).toContainText('Panne temporaire');
    await expect(page.locator('[data-refresh-servers]')).toBeEnabled();
    await page.unroute('**/api/platform/servers'); await page.locator('[data-refresh-servers]').click(); await expect(page.locator('.server-item')).toHaveCount(1);
  } finally { await context.close(); }
});

test('reauthentication keeps configuration context and does not discard unsaved fields', async ({ browser, baseURL }) => {
  const { context, page } = await loginPage(browser, baseURL);
  try {
    await page.goto(config('welcome')); await page.getByLabel('Titre commun · variable {guild}', { exact: true }).fill('Bienvenue à tester');
    await page.route('**/api/platform/admin/bot-config/protect/' + guild + '/welcome', route => route.request().method() === 'PATCH' ? route.fulfill({ status: 428, json: { error: 'Confirme ta connexion avec Discord.' } }) : route.continue());
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.locator('#confirm-dialog textarea[name="reason"]').fill('Vérifier la reconnexion'); await page.locator('#confirm-dialog input[name="confirmation"]').fill('ENREGISTRER');
    await page.locator('#confirm-dialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expect(page.getByLabel('Titre commun · variable {guild}', { exact: true })).toHaveValue('Bienvenue à tester');
    const href = await page.locator('[data-notice] a').getAttribute('href'); expect(new URL(href, baseURL).searchParams.get('next')).toBe(config('welcome'));
  } finally { await context.close(); }
});

test('a late private response cannot replace the expired-session screen', async ({ browser, baseURL }) => {
  const { context, page } = await loginPage(browser, baseURL, 'USER'); let release, reached;
  const gate = new Promise(resolve => { release = resolve; }), waiting = new Promise(resolve => { reached = resolve; });
  try {
    await page.clock.install();
    await page.route('**/api/platform/session', async route => { const response = await route.fetch(), data = await response.json(); await route.fulfill({ json: { ...data, expiresAt: data.serverNow + 1000, idleExpiresAt: data.serverNow + 1000 } }); });
    await page.route('**/api/platform/me', async route => { const response = await route.fetch(); reached(); await gate; await route.fulfill({ response }); });
    await page.goto('/profile'); await waiting; await page.clock.fastForward(6000);
    await expect(page.getByRole('heading', { name: 'Ta session a expiré', exact: true })).toBeVisible();
    const response = page.waitForResponse('**/api/platform/me'); release(); await response;
    await page.clock.runFor(20);
    await expect(page.getByRole('heading', { name: 'Ta session a expiré', exact: true })).toBeVisible();
    await expect(page.locator('.profile-identity')).toHaveCount(0);
    await expect(page.locator('.sidebar-account')).toHaveCount(0);
    await expect(page.locator('.connection-state')).toHaveText('Session expirée');
  } finally { release(); await context.close(); }
});
