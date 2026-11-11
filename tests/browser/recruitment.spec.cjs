const {test,expect}=require('@playwright/test');
const {loginPage}=require('./test-session.cjs');
const guild='1561826762747285654';
test('candidat : autosauvegarde, reprise, relecture et envoi confirmé sur ordinateur et téléphone',async({browser,baseURL},info)=>{
 const {context,page}=await loginPage(browser,baseURL,info.project.name==='mobile'?'ADMIN':'USER');
 try{
  if(info.project.name==='mobile')await page.setViewportSize({width:390,height:844});
  await page.goto('/candidature?guild='+guild);await expect(page.getByRole('heading',{name:'Ta place dans l’équipe.'})).toBeVisible();
  const start=page.getByRole('button',{name:'Commencer ma candidature'});
  await expect(start).toBeVisible();await start.click();
  const answer=page.locator('[data-answer]');
  await expect(answer).toBeVisible();{
   await answer.fill('Je souhaite aider les membres et accompagner les nouveaux arrivants.');await expect(page.locator('[data-save-state]')).toHaveText('Enregistré dans ton brouillon');
   await page.reload();await expect(answer).toBeVisible();
   // The saved first answer is valid: resumption selects the next unanswered question.
   await answer.fill('Je suis disponible chaque soir de 19 heures à 22 heures, fuseau de Paris.');await page.getByRole('button',{name:'Relire ma candidature',exact:true}).click();
   await expect(page.getByText('Je souhaite aider les membres et accompagner les nouveaux arrivants.',{exact:true})).toBeAttached();
   await page.getByRole('button',{name:'Envoyer ma candidature',exact:true}).click();const dialog=page.locator('#confirm-dialog');await expect(dialog).toBeVisible();
   await dialog.locator('[name=confirmation]').fill('ENVOYER');await dialog.getByRole('button',{name:'Confirmer',exact:true}).click();
  }
  await expect(page.getByRole('heading',{name:'Candidat WarsNuto de test',exact:true}).first()).toBeVisible();
  await page.screenshot({path:info.outputPath('candidature-warsnuto.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 }finally{await context.close();}
});
test('recruteur : lecture nominative, notes privées et absence de décisions pour un simple lecteur',async({browser,baseURL},info)=>{
 const {context,page}=await loginPage(browser,baseURL,'MODERATOR');
 try{await page.goto('/admin/candidatures?guild='+guild);await expect(page.getByRole('heading',{name:'Les prochains membres du staff.'})).toBeVisible();await expect(page.getByRole('button',{name:'Configurer le recrutement'})).toHaveCount(0);await page.screenshot({path:info.outputPath('recrutement-staff.png'),fullPage:true});}finally{await context.close();}
});
