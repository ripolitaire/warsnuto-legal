const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{fixture,ids}=require('./helpers.cjs');
const {recruitmentFixture}=require('./recruitment-fixture.cjs'),{createBotConfigFixture}=require('./bot-config-fixture.cjs');
const guild='1561826762747285654';
test('HTTP reads and writes preserve the internal track and reject arbitrary namespaces',async t=>{
 const mock=recruitmentFixture(createBotConfigFixture(ids).transport,ids),requests=[];
 const f=fixture({botTransport:(options,body)=>{requests.push(options.path);return mock.transport(options,body);}});await f.listen();t.after(()=>f.close());
 const user=await f.login('USER'),admin=await f.login('ADMIN');
 let r=await f.request(`/api/platform/recruitment/${guild}/context?track=confirmed`,user);assert.equal((await r.json()).track,'confirmed');
 r=await f.request(`/api/platform/recruitment/${guild}?track=confirmed`,admin,{action:'settings.save',operationId:randomUUID(),version:1,settings:{phase:'OPEN'}});assert.equal(r.status,200);
 r=await f.request(`/api/platform/recruitment/${guild}?track=confirmed`,user,{action:'draft.create',operationId:randomUUID()});const c=await r.json();assert.equal(r.status,200);
 assert.ok(requests.some(p=>p.endsWith('/actions?track=confirmed')));
 r=await f.request(`/api/platform/recruitment/${guild}/application/${c.id}?track=responsible`,user);assert.equal(r.status,403);
 r=await f.request(`/api/platform/recruitment/${guild}/settings?track=__proto__`,admin);assert.equal(r.status,400);
});
