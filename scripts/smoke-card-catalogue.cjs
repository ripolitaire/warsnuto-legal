const {chromium}=require('@playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'warsnuto-catalogue-qa-'));
 const browser=await chromium.launch({headless:true});
 try{
  for(const[name,viewport]of [['desktop',{width:1365,height:900}],['mobile',{width:390,height:844}]]){
   const page=await browser.newPage({viewport});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://warsnuto.com/cards',{waitUntil:'networkidle'});
   await page.locator('.card-item').first().waitFor();
   if(!await page.locator('.card-item').first().innerText().then(s=>s.includes('pour cette carte')))throw Error('Missing per-card odds');
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Horizontal overflow '+name);
   await page.locator('.card-item').first().scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.querySelector('.card-item img')?.naturalWidth>0);
   await page.screenshot({path:path.join(directory,name+'.png')});
   await page.locator('.card-image').first().click();await page.locator('#card-detail').waitFor({state:'visible'});
   if(!await page.locator('#card-meta').innerText().then(s=>s.includes('hors bonus')))throw Error('Missing detail odds');
   if(errors.length)throw Error(errors.join('; '));
   console.log(JSON.stringify({viewport:name,cards:await page.locator('.card-item').count(),imagesLoaded:true,overflow:false,detailWorks:true}));
   await page.close();
  }
  console.log(directory);
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
