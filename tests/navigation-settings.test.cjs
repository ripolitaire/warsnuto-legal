const {test}=require('node:test'),assert=require('node:assert/strict');
const {page}=require('../server/views.cjs');
const user={id:'1561826762747285601',displayName:'Compte fictif',avatar:'/assets/warsnuto-icon.png',preferences:{},role:'OWNER'};
test('site settings stay available from the member workspace only with their actual permission',()=>{
 const session=permissions=>({user,permissions,protectAccess:{canModerate:false,guilds:[]}});
 assert.match(page('/profile',session(['admin:read','settings:write'])),/href="\/admin\/settings"/);
 assert.doesNotMatch(page('/profile',session(['admin:read'])),/href="\/admin\/settings"/);
 assert.doesNotMatch(page('/profile',session([])),/href="\/admin\/settings"/);
 assert.match(page('/admin/settings',session(['admin:read','settings:write'])),/href="\/admin\/settings" aria-current="page"/);
});
