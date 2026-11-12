// Existing public-site regression suite, retained in its own repository.
﻿const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const snapshot=require('../api/bots-data.json');
const source=fs.readFileSync(require.resolve('../api/bots'),'utf8');
const MOD='1465459339241193524',TEST='1052991598096560179';

test('staff palettes survive CSP using CSSOM and reject CSS injection', () => {
 const script=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const fragment=script.slice(script.indexOf('function normalizeHexColor'),script.indexOf('function applyRoleColors'));
 const context={};vm.runInNewContext(fragment,context);
 const properties={};const card={dataset:{staffPrimary:'#123456',staffSecondary:'#000000',staffTertiary:'#abcdef'},style:{setProperty:(k,v)=>properties[k]=v}};
 context.applyStaffColors({querySelectorAll:()=>[card]});assert.match(properties['background-image'],/#00000018/);assert.match(properties['background-image'],/#abcdef18/);assert.equal(properties['--staff-color'],'#123456');
 delete properties['background-image'];card.dataset.staffSecondary='red; background:url(https://invalid.example)';
 context.applyStaffColors({querySelectorAll:()=>[card]});assert.equal(properties['background-image'],undefined);
 const renderer=script.slice(script.indexOf('function renderStaff'),script.indexOf('function renderRoleGuide'));
 assert.match(renderer,/applyStaffColors\(target\)/);assert.doesNotMatch(renderer,/style=/);
});
function api(fetcher){let now=Date.now();class Clock extends Date{static now(){return now;}}
 const module={exports:{}};const env={DISCORD_BOT_TOKEN:'fixture-token',WARSNUTO_GUILD_ID:'fixture-guild'};
 const context={module,exports:module.exports,require:()=>snapshot,process:{env},Date:Clock,URL,AbortController,setTimeout,clearTimeout,fetch:fetcher,console};
 vm.runInNewContext(source,context);
 return {members:()=>context.fetchGuildMembers('fixture-guild','fixture-token'),advance:()=>now+=61000,call:async(url='/?live=1')=>{let body;const headers={};await module.exports({method:'GET',url},{setHeader:(k,v)=>headers[k]=v,status(){return this;},json(d){body=d;}});return {body,headers};}};
}
test('hierarchy waits for paginated members, refreshes changed roles and excludes absent pinned profiles',async()=>{
 let promoted=false;let memberCalls=0;const fetched=[];
 const app=api(async url=>{const u=new URL(url);fetched.push(u.pathname);let data;
 if(u.pathname.endsWith('/roles'))data=[{id:MOD,name:'MODO',color:0xffffff,colors:{primary_color:0xffffff,secondary_color:0,tertiary_color:0x123456}},{id:TEST,name:'Modo test',color:0xff7800}];
 else if(u.pathname.endsWith('/members')){memberCalls++;if(!promoted)await new Promise(r=>setTimeout(r,1100));
 data=BigInt(u.searchParams.get('after'))>2000n?[]:u.searchParams.get('after')==='0'?Array.from({length:1000},(_,n)=>({user:{id:String(n+1),username:'Member '+n},roles:[]})):[{user:{id:'2000',username:'New moderator'},roles:[promoted?MOD:TEST]}];}
 else data={approximate_member_count:1001,approximate_presence_count:10};
 return {ok:true,json:async()=>data};});
 let result=await app.call();assert.equal(result.body.live.staffSource,'Roles Discord lus automatiquement');assert.match(result.headers['Cache-Control'],/s-maxage=15, stale-while-revalidate=15/);assert.equal(memberCalls,5);
 const tier=label=>result.body.discord.staff.tiers.find(t=>t.label===label);
 assert.equal(tier('Modo test').nodes.length,1);assert.equal(tier('Moderation').nodes.length,0);assert.equal(tier('Administration').nodes.length,0);
 promoted=true;app.advance();result=await app.call();assert.equal(tier('Modo test').nodes.length,0);assert.equal(tier('Moderation').nodes.length,1);assert.equal(memberCalls,10);assert.equal(tier('Moderation').nodes[0].colors.secondary,'#000000');assert.equal(tier('Moderation').nodes[0].colors.tertiary,'#123456');
 assert.doesNotMatch(JSON.stringify(result.body),/fixture-token|Authorization/);
});
test('hierarchy page renders the snapshot first and loads counts and staff separately',async()=>{
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8').split('function escapeHtml')[0];let rendered=0;const calls=[];
 const live={bots:[],discord:{staff:{tiers:[]}},live:{staffSource:'Roles Discord lus automatiquement'}};
 const context={URL,Date,AbortController,setTimeout,clearTimeout,document:{querySelector:s=>s==='[data-staff-tree]'?{}:null},localStorage:{getItem:()=>null,setItem(){}},applyBotData:data=>{rendered++;return data;},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>live};}};
 vm.runInNewContext(source,context);
 await context.loadBotData();assert.equal(calls[0].url,'/api/bots');assert.equal(calls[0].options.cache,'no-cache');
 await context.refreshBotDataInBackground();assert.equal(calls[1].url,'/api/bots?live=1&staff=0');assert.equal(rendered,1);
 await context.refreshStaffInBackground();assert.equal(calls[2].url,'/api/bots?live=1');assert.equal(rendered,2);
});
test('role guide uses Discord palettes including black gradient stops and neutral uncolored roles',async()=>{
 let changed=false;
 const roles=()=>[
  {id:'members',name:'Membres',color:0x111111,colors:{primary_color:changed?0xaabbcc:0x123456,secondary_color:0,tertiary_color:null}},
  {id:'uncolored',name:'Non abonnées',color:0,colors:{primary_color:0,secondary_color:null,tertiary_color:null}},
  {id:'tricolor',name:'OG',color:0x00ff72,colors:{primary_color:0x00ff72,secondary_color:0xffffff,tertiary_color:0x123456}},
 ];
 const app=api(async url=>({ok:true,json:async()=>new URL(url).pathname.endsWith('/roles')?roles():new URL(url).pathname.endsWith('/members')?[]:{approximate_member_count:1}}));
 let result=await app.call();const badges=()=>result.body.discord.roleGuide.categories.flatMap(c=>c.roles.flatMap(e=>e.names));
 let members=badges().find(r=>r.id==='members');assert.equal(members.color,'#123456');assert.equal(members.colors.secondary,'#000000');
 const neutral=badges().find(r=>r.id==='uncolored');assert.equal(neutral.hasColor,false);assert.equal(neutral.colors.primary,null);assert.notEqual(neutral.color,'#ffcc4d');
 assert.equal(badges().find(r=>r.id==='tricolor').colors.tertiary,'#123456');
 changed=true;app.advance();result=await app.call();assert.equal(badges().find(r=>r.id==='members').color,'#aabbcc');
});
test('role badge palette is applied through CSSOM instead of CSP-blocked inline HTML styles',()=>{
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const fragment=source.slice(source.indexOf('function applyRoleColors'),source.indexOf('function staffIconSvg'));
 const properties={};let gradient;const badge={dataset:{rolePrimary:'#123456',roleSecondary:'#000000',roleTertiary:'#aabbcc'},style:{setProperty:(k,v)=>properties[k]=v},classList:{toggle:(k,v)=>gradient=v}};
 const context={normalizeHexColor:(value)=>value,hexToRgb:()=>({r:18,g:52,b:86})};vm.runInNewContext(fragment,context);
 context.applyRoleColors({querySelectorAll:()=>[badge]});assert.equal(properties['--role-color'],'#123456');assert.equal(properties['--role-gradient'],'linear-gradient(90deg, #123456, #000000, #aabbcc)');assert.equal(gradient,true);
 const render=source.slice(source.indexOf('function renderRoleGuide'),source.indexOf('async function refreshDiscordRoles'));
 assert.doesNotMatch(render,/style=/);assert.match(render,/applyRoleColors\(target\)/);
});
test('parallel member ranges preserve every member at boundaries and fetch at most four pages concurrently',async()=>{
 const snow=date=>BigInt(Date.parse(date)-1420070400000)<<22n;
 const year=new Date().getUTCFullYear();
 const starts=[0n,...[`${year-5}-01-01`,`${year-3}-01-01`,`${year-1}-01-01`].map(snow).sort((a,b)=>a<b?-1:1)];
 const all=starts.flatMap(start=>Array.from({length:1200},(_,n)=>({user:{id:String(start+BigInt(n)+(start===0n?1n:0n))},roles:[]})));
 let active=0,maxActive=0;
 const app=api(async url=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,5));active--;
 const after=BigInt(new URL(url).searchParams.get('after'));return {ok:true,json:async()=>all.filter(m=>BigInt(m.user.id)>after).slice(0,1000)};});
 const members=await app.members();assert.equal(members.length,4800);assert.equal(new Set(members.map(m=>m.user.id)).size,4800);assert.equal(maxActive,4);
 for(const m of all)assert.ok(members.some(found=>found.user.id===m.user.id));
});
test('concurrent live requests share response work and one guild-role lookup',async()=>{
 let roleRequests=0,memberRequests=0,invites=0;
 const app=api(async url=>{const u=new URL(url);await new Promise(r=>setTimeout(r,10));let data;
 if(u.pathname.endsWith('/roles')){roleRequests++;data=[{id:MOD,name:'MODO',color:123}];}
 else if(u.pathname.endsWith('/members')){memberRequests++;data=u.searchParams.get('after')==='0'?[{user:{id:'42',username:'Staff'},roles:[MOD]}]:[];}
 else{invites++;data={approximate_member_count:1};}return {ok:true,json:async()=>data};});
 const [a,b]=await Promise.all([app.call(),app.call()]);assert.equal(roleRequests,1);assert.equal(memberRequests,4);assert.equal(invites,1);assert.equal(a.body.live.staffSource,'Roles Discord lus automatiquement');
 a.body.discord.staff.title='Changed client copy';assert.notEqual(b.body.discord.staff.title,a.body.discord.staff.title);
 const c=await app.call();assert.equal(invites,1);assert.notEqual(c.body.discord.staff.title,a.body.discord.staff.title);
});
test('light live mode avoids member scans and member listing retries a Discord rate limit',async()=>{
 let members=0,limited=false;
 const app=api(async url=>{const u=new URL(url);
 if(u.pathname.endsWith('/roles'))return {ok:true,json:async()=>[{id:MOD,name:'MODO',color:123}]};
 if(u.pathname.endsWith('/members')){members++;if(!limited){limited=true;return {ok:false,status:429,json:async()=>({retry_after:0.001})};}return {ok:true,json:async()=>[]};}
 return {ok:true,json:async()=>({approximate_member_count:2})};});
 const light=await app.call('/?live=1&staff=0');assert.equal(members,0);assert.equal(light.body.live.source,'Discord Invite');
 await app.members();assert.equal(members,5);assert.equal(limited,true);
});
test('staff promotions and demotions follow live roles, including previously curated administrators',async()=>{
 const ADMIN='1052987822908391464',RESP='1498292470117830816';let stage=0;
 const members=()=>[
  {user:{id:'963503650314022922',username:'Sam'},roles:stage===0?[ADMIN]:[]},
  {user:{id:'1124329929031565423',username:'Sariel'},roles:stage===0?[RESP]:[ADMIN,RESP]},
  {user:{id:'1438997182404366438',username:'Ayden'},roles:stage===0?[MOD]:[RESP,MOD]},
 ];
 const app=api(async url=>{const u=new URL(url);let data;
 if(u.pathname.endsWith('/roles'))data=[{id:ADMIN,name:'Administrateur',color:123},{id:RESP,name:'Responsable Moderation',color:456},{id:MOD,name:'Moderateur',color:789}];
 else if(u.pathname.endsWith('/members'))data=BigInt(u.searchParams.get('after'))<963503650314022922n?members().filter(m=>BigInt(m.user.id)>BigInt(u.searchParams.get('after'))):members().filter(m=>BigInt(m.user.id)>BigInt(u.searchParams.get('after')));
 else data={approximate_member_count:3};return {ok:true,json:async()=>data};});
 let result=await app.call();let tiers=result.body.discord.staff.tiers;assert.ok(tiers.find(t=>t.label==='Administration').nodes.some(n=>n.name==='RSam'));
 stage=1;app.advance();result=await app.call();tiers=result.body.discord.staff.tiers;
 assert.ok(!tiers.flatMap(t=>t.nodes).some(n=>n.name==='RSam'));
 assert.ok(tiers.find(t=>t.label==='Administration').nodes.some(n=>n.name==='W-Sariel'));
 assert.ok(tiers.find(t=>t.label==='Encadrement').nodes.some(n=>n.name==='AYDEN'));
 assert.equal(tiers.flatMap(t=>t.nodes).filter(n=>n.name==='W-Sariel').length,1);
});
test('stale snapshot staff is not presented as a current hierarchy and cannot overwrite a live tree',()=>{
 const code=fs.readFileSync(require.resolve('../app.js'),'utf8');const fragment=code.slice(code.indexOf('function renderStaffTree'),code.indexOf('function renderRoleGuide'));
 const target={dataset:{},innerHTML:''};const context={document:{querySelector:()=>target}};vm.runInNewContext(fragment,context);
 context.renderStaffTree({discord:{staff:{tiers:[{nodes:[{name:'Old admin'}]}]}},live:{staffSource:'Snapshot local'}});assert.doesNotMatch(target.innerHTML,/Old admin/);assert.match(target.innerHTML,/Synchronisation/);
 target.dataset.hasLiveStaff='true';target.innerHTML='Current live tree';context.renderStaffTree({live:{staffSource:'Snapshot local'}});assert.equal(target.innerHTML,'Current live tree');
});

test('CRB is excluded by account ID while the real WarsNuto retains the leader card',async()=>{
 const LEADER='1052953841156497521';
 const all=[{user:{id:'974031935510818866',username:'sub2crb_mp5',global_name:'CRB'},roles:[LEADER]},
 {user:{id:'689040179943702547',username:'warsnuto',global_name:'WarsNut0'},roles:[LEADER]}];
 const app=api(async url=>{const u=new URL(url);let data;
 if(u.pathname.endsWith('/roles'))data=[{id:LEADER,name:'LEADER',color:0xff0000}];
 else if(u.pathname.endsWith('/members'))data=all.filter(m=>BigInt(m.user.id)>BigInt(u.searchParams.get('after')));
 else data={approximate_member_count:2};return {ok:true,json:async()=>data};});
 const result=await app.call(),nodes=result.body.discord.staff.tiers.flatMap(t=>t.nodes);
 assert.equal(nodes.length,1);assert.equal(nodes[0].id,'689040179943702547');assert.equal(nodes[0].name,'WarsNuto');
 assert.doesNotMatch(JSON.stringify(result.body.discord.staff),/sub2crb_mp5|974031935510818866/);
});

test('light counters skip role lookups and keep a bounded shared cache',async()=>{
 const app=api(async url=>{assert.match(url,/\/invites\//);return {ok:true,json:async()=>({approximate_member_count:15500,approximate_presence_count:0})};});
 const result=await app.call('/?live=1&staff=0');
 assert.equal(result.body.live.source,'Discord Invite');assert.equal(result.body.bots[0].community.onlineLabel,'0');
 assert.match(result.headers['Cache-Control'],/s-maxage=15/);assert.ok(result.body.live.countsFetchedAt);
});

test('a slow hierarchy request does not delay independent live counters',async()=>{
 let release;const members=new Promise(resolve=>{release=resolve;});
 const app=api(async url=>{const u=new URL(url);
 if(u.pathname.endsWith('/members')){await members;return {ok:true,json:async()=>[]};}
 return {ok:true,json:async()=>u.pathname.endsWith('/roles')?[]:{approximate_member_count:15500}};
 });
 const pending=app.call('/?live=1');
 try{const light=await Promise.race([app.call('/?live=1&staff=0'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Counts blocked by staff')),1000))]);assert.equal(light.body.live.source,'Discord Invite');}
 finally{release();await pending;}
});
