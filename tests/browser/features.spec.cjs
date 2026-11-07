const { test, expect } = require('@playwright/test');
const { loginPage } = require('./test-session.cjs');
const guild = '661720242585600500';
async function confirmation(page, reason = 'Décision administrative de test') {
  const dialog = page.locator('#confirm-dialog'); await expect(dialog).toBeVisible();
  await dialog.locator('textarea[name="reason"]').fill(reason); await dialog.locator('input[name="confirmation"]').fill('CONFIRMER'); await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
}
test('prison workspace creates multiple members, keeps individual decisions and closes safely', async ({ browser, baseURL }, info) => {
  const { context, page } = await loginPage(browser, baseURL);
  try {
    await page.goto('/admin/prisons?guild=' + guild);
    const create = page.locator('[data-prison-create]'); await expect(create).toBeVisible();
    await create.locator('textarea').fill('661720242585600001\n661720242585600002');
    await create.getByRole('button', { name: 'Créer une prison', exact: true }).click(); await confirmation(page);
    await expect(page.locator('[data-prison-detail] h3').first()).toHaveText(/Prison #/);
    await expect(page.locator('[data-feature-member] option')).toHaveCount(3);
    await page.locator('[data-feature-member]').selectOption('661720242585600001');
    await page.locator('[data-prison-decision] select[name="decision"]').selectOption('derank');
    await page.getByRole('button', { name: 'Confirmer la décision', exact: true }).click(); await confirmation(page);
    await expect(page.locator('[data-prison-detail]')).toContainText('Dérank');
    await page.locator('[data-feature-member]').selectOption('661720242585600001');
    await expect(page.locator('[data-feature-member-info]')).toContainText('661720242585600501');
    await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath('prison-workspace.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.feature-prison-item').first().evaluate(node => getComputedStyle(node).display)).toBe('grid');
    await page.getByRole('button', { name: 'Libérer tous et fermer', exact: true }).click(); await confirmation(page);
    await expect(page.locator('.feature-prison-item')).toHaveCount(0);
  } finally { await context.close(); }
});
test('YouTube settings and real preview are reachable from the existing configuration panel', async ({ browser, baseURL }, info) => {
  const { context, page } = await loginPage(browser, baseURL);
  try {
    await page.goto('/admin/configuration?bot=protect&guild=' + guild + '&section=youtube');
    await expect(page.getByRole('heading', { name: 'Surveillance YouTube', exact: true })).toBeVisible();
    await expect(page.locator('[data-config-field="videoMentionEnabled"]')).toBeVisible();
    await expect(page.locator('[data-config-field="shortChannelId"]')).toBeVisible();
    await page.getByRole('button', { name: 'Aperçu privé', exact: true }).click(); await confirmation(page);
    await expect(page.locator('[data-feature-preview]')).toContainText('Nouvelle vidéo WarsNuto');
    await page.getByRole('button', { name: 'Envoyer un test sans ping', exact: true }).click(); await confirmation(page);
    await expect(page.locator('[data-notice]')).toContainText('Opération terminée');
    await page.screenshot({ path: info.outputPath('youtube-settings.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
test('an ordinary logged-in member never sees the prison navigation or private prison API', async ({ browser, baseURL }) => {
  const { context, page } = await loginPage(browser, baseURL, 'USER');
  try {
    await expect(page.getByRole('link', { name: 'Prisons', exact: true })).toHaveCount(0);
    expect((await context.request.get(baseURL + '/api/platform/admin/features/' + guild + '/prison')).status()).toBe(403);
    await page.goto('/admin/prisons'); await expect(page.getByRole('heading', { name: 'Accès réservé', exact: true })).toBeVisible();
  } finally { await context.close(); }
});
