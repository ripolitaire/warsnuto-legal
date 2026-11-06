const { expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
async function loginPage(browser, baseURL, role = 'OWNER') {
  const context = await browser.newContext();
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'cdn.discordapp.com') return route.fulfill({ path: path.resolve(__dirname, '../../assets/warsnuto-icon.png'), contentType: 'image/png' });
    return route.abort();
  });
  const page = await context.newPage();
  const started = await context.request.get(baseURL + '/auth/discord/start?next=/profile', { maxRedirects: 0 });
  const authorization = new URL(started.headers().location);
  await page.goto(baseURL + '/auth/discord/callback?' + new URLSearchParams({ state: authorization.searchParams.get('state'), iss: 'https://discord.com', code: role + '-' + randomUUID() }));
  await expect(page.locator('#platform-content')).toContainText('Ton compte');
  return { context, page };
}
module.exports = { loginPage };
