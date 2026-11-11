const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {fixture,ids}=require('./helpers.cjs');
const {createBotConfigFixture}=require('./bot-config-fixture.cjs');
const {recruitmentFixture}=require('./recruitment-fixture.cjs');
const guild='1561826762747285654';
test('candidatures : session Discord, CSRF, identité serveur et décisions Protect indépendantes du rôle site',async t=>{
 const mock=recruitmentFixture(createBotConfigFixture(ids).transport,ids),f=fixture({botTransport:mock.transport});await f.listen();t.after(()=>f.close());
 const anonymous=await f.request('/candidature?guild='+guild,null);assert.equal(anonymous.status,303);assert.match(anonymous.headers.get('location'),/next=/);
 const member=await f.login('USER'),reviewer=await f.login('MODERATOR'),admin=await f.login('ADMIN');
 let response=await f.request(`/api/platform/recruitment/${guild}/context`,member);assert.equal(response.status,200);assert.equal((await response.json()).userId,ids.USER);
 response=await f.request(`/api/platform/recruitment/${guild}`,member,{action:'draft.create',operationId:randomUUID()});const c=await response.json();assert.equal(c.user,ids.USER);
 response=await fetch(f.base+`/api/platform/recruitment/${guild}`,{method:'POST',headers:{cookie:member.cookie,origin:f.config.origin,'content-type':'application/json'},body:JSON.stringify({action:'draft.create',operationId:randomUUID()})});assert.equal(response.status,403);
 response=await f.request(`/api/platform/recruitment/${guild}/reviews`,member);assert.equal(response.status,403);
 response=await f.request(`/api/platform/recruitment/${guild}/reviews`,reviewer);assert.equal(response.status,200);
 response=await f.request(`/api/platform/recruitment/${guild}`,reviewer,{action:'review.decide',id:c.id,version:c.version,status:'ACCEPTED',reason:'Test',operationId:randomUUID()});assert.equal(response.status,403);
 response=await f.request(`/admin/candidatures?guild=${guild}`,admin);assert.equal(response.status,200);assert.match(await response.text(),/recruitment\.js/);
 mock.setEnabled(false);response=await f.request(`/admin/candidatures?guild=${guild}`,admin);assert.equal(response.status,403);
});
test('proxy et retour OAuth acceptent uniquement les routes de candidatures prévues',()=>{
 const {ALLOWED}=require('../api/platform.js'),{nextPath}=require('../server/security.cjs');
 assert.equal(ALLOWED.test('candidature'),true);assert.equal(ALLOWED.test('admin/candidatures'),true);assert.equal(ALLOWED.test(`api/platform/recruitment/${guild}/reviews`),true);
 assert.equal(ALLOWED.test(`api/platform/recruitment/${guild}/private-source`),false);
 assert.equal(nextPath('/candidature?guild='+guild),'/candidature?guild='+guild);assert.equal(nextPath('//evil.invalid/candidature'),'/profile');
});
