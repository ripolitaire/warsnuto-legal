const {test}=require('node:test'),assert=require('node:assert/strict');
const {createDashboardHandler}=require('../ops/bot-config/webDashboard.cjs');
test('liaison Protect : identité fraîche du membre, routes limitées et aucun accès administrateur implicite',async()=>{
 const id='1561826762747285654',actor='1561826762747285601';let requests=0,calls=0,absent=false;
 const member={id:actor,permissions:{has:()=>false}},guild={id,ownerId:'1561826762747285699',members:{fetch:async options=>{requests++;assert.equal(options.force,true);assert.equal(options.user,actor);if(absent)throw Object.assign(Error('gone'),{code:10007});return member;}}};
 const client={isReady:()=>true,guilds:{cache:new Map([[id,guild]])}};
 const adapter={sections:[],recruitment:async(g,m,method,view,application,query,body)=>{calls++;return{member:m.id,view,page:query.get('page'),method};}};
 const handler=createDashboardHandler(client,adapter);
 let result=await handler.dispatch({url:`/recruitment/${id}/context`,method:'GET',headers:{'x-wn-actor':actor}});assert.equal(result.member,actor);
 result=await handler.dispatch({url:`/recruitment/${id}/reviews?page=2`,method:'GET',headers:{'x-wn-actor':actor}});assert.equal(result.page,'2');assert.equal(requests,2);
 await assert.rejects(handler.dispatch({url:`/recruitment/${id}/context?actor=admin`,method:'GET',headers:{'x-wn-actor':actor}}));
 absent=true;await assert.rejects(handler.dispatch({url:`/recruitment/${id}/context`,method:'GET',headers:{'x-wn-actor':actor}}));assert.equal(calls,2);
});
