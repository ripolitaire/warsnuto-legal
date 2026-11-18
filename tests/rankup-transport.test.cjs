const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{fixture,ids}=require('./helpers.cjs');
const {recruitmentFixture}=require('./recruitment-fixture.cjs'),{createBotConfigFixture}=require('./bot-config-fixture.cjs');
const guild='1561826762747285654';
test('HTTP reads and writes preserve the internal track and reject arbitrary namespaces',async t=>{
 const mock=recruitmentFixture(createBotConfigFixture(ids).transport,ids),requests=[];
 const f=fixture({botTransport:(options,body)=>{requests.push(options.path);return mock.transport(options,body);}});await f.listen();t.after(()=>f.close());
 const anonymous=await f.request(`/candidature?guild=${guild}&track=confirmed`,null);assert.equal(anonymous.status,303);
 assert.equal(new URL(anonymous.headers.get('location'),f.base).searchParams.get('next'),`/candidature?guild=${guild}&track=confirmed`);
 const user=await f.login('USER'),admin=await f.login('ADMIN');
 let r=await f.request(`/api/platform/recruitment/${guild}/context?track=confirmed`,user);assert.equal((await r.json()).track,'confirmed');
 r=await f.request(`/api/platform/recruitment/${guild}?track=confirmed`,admin,{action:'settings.save',operationId:randomUUID(),version:1,settings:{phase:'OPEN'}});assert.equal(r.status,200);
 r=await f.request(`/api/platform/recruitment/${guild}?track=confirmed`,user,{action:'draft.create',operationId:randomUUID()});const c=await r.json();assert.equal(r.status,200);
 assert.ok(requests.some(p=>p.endsWith('/actions?track=confirmed')));
 r=await f.request(`/api/platform/recruitment/${guild}/application/${c.id}?track=responsible`,user);assert.equal(r.status,403);
 r=await f.request(`/api/platform/recruitment/${guild}/settings?track=__proto__`,admin);assert.equal(r.status,400);
});

test('OAuth return paths preserve the selected track without opening arbitrary redirects',()=>{
 const {nextPath}=require('../server/security.cjs');
 for(const track of ['staff','confirmed','responsible'])for(const page of ['/candidature','/admin/candidatures']){
  const value=`${page}?guild=${guild}&track=${track}`;assert.equal(nextPath(value),value);
 }
 for(const value of ['/candidature?track=__proto__','/candidature?track=confirmed&track=responsible','//evil.invalid/candidature?track=staff','/profile?track=staff'])assert.equal(nextPath(value),'/profile');
});
