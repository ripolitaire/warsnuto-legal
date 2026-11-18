const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
// Anonymous GET-only smoke check: no OAuth, account, write request or bot action.
(async () => {
  const output = path.resolve(__dirname, '../artifacts/continuation-production'); fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true }), results = [];
  try {
    for (const [device, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
      const context = await browser.newContext({ viewport }), page = await context.newPage();
      await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      for (const route of ['/', '/cards', '/discord', '/game']) {
        const response = await page.goto('https://warsnuto.com' + route, { waitUntil: 'networkidle', timeout: 45000 });
        await page.locator('main').waitFor();
        const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
          images: [...document.querySelectorAll('main img')].filter(img => img.getBoundingClientRect().top < innerHeight)
            .every(img => img.complete && img.naturalWidth > 0), header: Boolean(document.querySelector('.community-header')) }));
        assert.equal(response.status(), 200); assert.equal(state.overflow, false); assert.equal(state.images, true); assert.equal(state.header, true); assert.deepEqual(errors, []);
        await page.screenshot({ path: path.join(output, device + '-' + (route.slice(1) || 'home') + '.png'), animations: 'disabled' });
        results.push({ device, route, status: response.status(), ...state });
      }
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'verified.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify({ verified: results.length, output, writes: 0 }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
