const {test,expect}=require('@playwright/test');
const {loginPage}=require('./test-session.cjs');
const guild='1561826762747285654';
test('rank-up campaigns have independent controls and a non-eligible administrator cannot apply',async({browser,baseURL},info)=>{
 const {context,page}=await loginPage(browser,baseURL,'OWNER');
 try{
  await page.goto('/admin/candidatures?guild='+guild+'&track=confirmed');
  await expect(page.locator('.recruitment-brand h2')).toHaveText('Candidature Modérateur Confirmé');
  await page.getByRole('button',{name:'Configurer le recrutement',exact:true}).click();
  await expect(page.locator('[data-phase]')).toHaveValue('CLOSED');
  await expect(page.getByLabel('Clôture programmée (heure locale)',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Publier ou actualiser le panneau',exact:true})).toBeDisabled();
  await expect(page.locator('[data-review-roles]').locator('..')).toBeHidden();
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});
  await page.screenshot({path:info.outputPath('rankup-settings.png'),fullPage:true});
  await page.getByRole('link',{name:'Passer R-Modo',exact:true}).click();
  await expect(page).toHaveURL(/track=responsible/);await expect(page.locator('.recruitment-brand h2')).toHaveText('Candidature Responsable Modération');
  await page.getByRole('link',{name:'Mon espace candidat',exact:true}).click();
  await expect(page.getByRole('button',{name:'Commencer ma candidature',exact:true})).toHaveCount(0);
  await expect(page.locator('.notice')).toContainText('grade Modérateur Confirmé');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('rankup-campaigns.png'),fullPage:true});
 }finally{await context.close();}
});
test('an ordinary member cannot inspect internal applications or access recruitment controls',async({browser,baseURL})=>{
 const {context,page}=await loginPage(browser,baseURL,'USER');
 try{
  const r=await context.request.get(baseURL+'/api/platform/recruitment/'+guild+'/reviews?track=responsible');expect(r.status()).toBe(403);
  await page.goto('/candidature?guild='+guild+'&track=responsible');
  await expect(page.locator('.recruitment-brand h2')).toHaveText('Candidature Responsable Modération');
  await expect(page.getByRole('button',{name:'Commencer ma candidature',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Espace recruteurs',exact:true})).toHaveCount(0);
 }finally{await context.close();}
});
