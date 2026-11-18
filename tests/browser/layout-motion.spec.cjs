const {test,expect}=require('@playwright/test');
const {loginPage}=require('./test-session.cjs');

test('site settings are reachable from the account menu without exposing them to ordinary members',async({browser,baseURL})=>{
 for(const role of ['OWNER','USER','MODERATOR']){
  const {context,page}=await loginPage(browser,baseURL,role);
  try{
   await page.goto('/profile');await page.locator('.wn-account summary').click();
   const settings=page.locator('.wn-account-dropdown a[href="/admin/settings"]');
   if(role==='OWNER'){
    await expect(settings).toBeVisible();await settings.click();
    await expect(page.locator('h1')).toHaveText('Paramètres du site');
    await expect(page.locator('#platform-content')).toContainText('Nom public');
   }else{
    await expect(settings).toHaveCount(0);
    expect((await context.request.get(baseURL+'/api/platform/admin/settings')).status()).toBe(403);
   }
  }finally{await context.close();}
 }
});

test('the workspace menu scrolls to site settings on tablets and short desktop screens',async({browser,baseURL},info)=>{
 const {context,page}=await loginPage(browser,baseURL,'OWNER');
 try{
  for(const width of [360,700,780,1024]){
   await page.setViewportSize({width,height:560});await page.goto('/admin');
   const sidebar=page.locator('.platform-sidebar'),toggle=page.getByRole('button',{name:'Menu de mon espace',exact:true});
   if(width<=780){await expect(sidebar).not.toBeVisible();await expect(toggle).toBeVisible();await toggle.click();}
   else await expect(toggle).not.toBeVisible();
   await expect(sidebar).toBeVisible();
   const settings=sidebar.locator('a[href="/admin/settings"]');await settings.scrollIntoViewIfNeeded();await expect(settings).toBeVisible();
   const bounds=await settings.boundingBox();expect(bounds.y).toBeGreaterThanOrEqual(72);expect(bounds.y+bounds.height).toBeLessThanOrEqual(561);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:info.outputPath('navigation-'+width+'.png'),animations:'disabled'});
   await settings.click();await expect(page.locator('h1')).toHaveText('Paramètres du site');
  }
 }finally{await context.close();}
});

test('yellow section labels remain readable and the staff band has no clipping frame',async({page},info)=>{
 await page.route('**/api/bots**',route=>route.fulfill({json:require('../../api/bots-data.json')}));
 await page.route('**/_vercel/**',route=>route.abort());
 await page.goto('/discord');
 const staff=page.locator('[data-staff-tree]');await staff.scrollIntoViewIfNeeded();
 await expect(staff.locator('.v2-kicker')).toHaveText(/staff/i);
 const metrics=await staff.locator('.v2-kicker').evaluate(node=>{const s=getComputedStyle(node);return{font:parseFloat(s.fontSize),line:parseFloat(s.lineHeight),height:node.getBoundingClientRect().height};});
 expect(metrics.font).toBeGreaterThanOrEqual(13);expect(metrics.line).toBeGreaterThanOrEqual(metrics.font*1.4);expect(metrics.height).toBeGreaterThanOrEqual(metrics.line);
 expect(await staff.evaluate(n=>getComputedStyle(n).overflow)).toBe('visible');
 expect(await staff.evaluate(n=>parseFloat(getComputedStyle(n).borderLeftWidth))).toBe(0);
 if(await staff.locator('[data-retry-staff]').count())expect(await staff.locator('[data-retry-staff]').evaluate(n=>parseFloat(getComputedStyle(n).minHeight))).toBeGreaterThanOrEqual(42);
 await page.screenshot({path:info.outputPath('staff-labels.png'),animations:'disabled'});
 await page.setViewportSize({width:320,height:640});
 await staff.locator('.v2-kicker').evaluate(n=>n.textContent='CONFIGURATION ET PARAMÈTRES DU SERVEUR');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('interactive feedback respects both system and account reduced-motion preferences',async({browser,baseURL})=>{
 const {context,page}=await loginPage(browser,baseURL,'OWNER');
 try{
  await page.addInitScript(()=>{const original=Element.prototype.animate;window.motionCalls=[];Element.prototype.animate=function(...args){window.motionCalls.push(this.tagName);return original.apply(this,args);};});
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/profile');
  await page.evaluate(()=>window.wnAppearance.apply({theme:'dark',reducedMotion:false}));
  const summary=page.locator('.wn-account summary');await summary.click();
  await expect.poll(()=>page.evaluate(()=>window.motionCalls.includes('SUMMARY'))).toBe(true);
  await expect(page.locator('.wn-account-dropdown')).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  let count=await page.evaluate(()=>window.motionCalls.length);await summary.click();await summary.click();
  expect(await page.evaluate(()=>window.motionCalls.length)).toBe(count);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>window.wnAppearance.apply({theme:'dark',reducedMotion:true}));
  count=await page.evaluate(()=>window.motionCalls.length);await summary.click();await summary.press('Enter');
  expect(await page.evaluate(()=>window.motionCalls.length)).toBe(count);
  await expect(page.locator('.wn-account-dropdown')).toBeVisible();
 }finally{await context.close();}
});
