const { test, expect } = require('@playwright/test');
const { loginPage } = require('./test-session.cjs');
test('one skip link stays outside the viewport until focused and reaches the workspace', async ({ browser, baseURL }, info) => {
  const { context, page } = await loginPage(browser, baseURL);
  try {
    await page.goto('/admin/configuration?bot=protect&guild=661720242585600500&section=welcome');
    await expect(page.locator('[data-config-editor]')).toHaveAttribute('aria-busy', 'false');
    if (info.project.name === 'mobile') {
      const first = await page.locator('[data-config-field="enabled"]').boundingBox();
      const toolbar = await page.locator('.config-save-bar').boundingBox();
      expect(first.y + first.height).toBeLessThan(toolbar.y);
      expect(toolbar.height).toBeLessThan(85);
    }
    const skip = page.locator('.skip-link');
    await expect(skip).toHaveCount(1);
    expect(await skip.evaluate(node => node.getBoundingClientRect().bottom)).toBeLessThan(0);
    await skip.focus();
    expect(await skip.evaluate(node => node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('rework-configuration.png'), animations: 'disabled' });
  } finally { await context.close(); }
});

test('bot switching is locked during reads and a picker keeps normal text-editing keys', async ({ browser, baseURL }) => {
  const { context, page } = await loginPage(browser, baseURL);
  let release;
  try {
    await page.goto('/admin/configuration?bot=protect&guild=661720242585600500&section=welcome');
    const field = page.locator('[data-config-field="discussionChannelId"]');
    await field.locator('summary').click();
    const search = field.getByRole('searchbox'); await search.fill('journal');
    await search.press('Home'); await expect(search).toBeFocused();
    await search.press('End'); await expect(search).toBeFocused();
    await page.keyboard.press('Escape');
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/platform/admin/bot-config/game/guilds', async route => { await gate; await route.continue(); });
    await page.getByRole('tab', { name: 'Game', exact: true }).click();
    await expect(page.locator('#config-workspace')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('tab', { name: 'Protect', exact: true })).toBeDisabled();
    release();
    await expect(page.locator('#config-workspace')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByRole('tab', { name: 'Protect', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Titre du module')).toHaveValue('game de test');
  } finally { release?.(); await context.close(); }
});
