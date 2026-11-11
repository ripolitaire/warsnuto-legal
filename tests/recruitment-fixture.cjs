const {randomUUID}=require('node:crypto');
function recruitmentFixture(base,ids){
 const applications=new Map(),operations=new Map();const guild='1561826762747285654';
 const questions=[{id:'motivation',section:'Motivation',label:'Pourquoi rejoindre le staff WarsNuto ?',description:'Explique ton envie d’aider la communauté.',minLength:5,maxLength:1500},{id:'availability',section:'Disponibilités',label:'Quand peux-tu être disponible ?',description:'Précise les jours et les horaires.',minLength:5,maxLength:1500}];
 const config={phase:'OPEN',version:1,session:1,questions,reviewChannelId:null,interviewCategoryId:null,reviewerRoleIds:[]};
 const deny=(message,status=403)=>{throw Object.assign(Error(message),{status,publicMessage:message});};
 let enabled=true;
 return {applications,config,setEnabled:value=>{enabled=value;},async transport(options,body){
   if(!options.path.startsWith('/recruitment/'))return base(options,body);
   const url=new URL(options.path,'http://fixture'),parts=url.pathname.split('/'),actor=options.headers['x-wn-actor'],view=parts[3];
   const admin=enabled&&[ids.ADMIN,ids.OWNER].includes(actor),review=enabled&&(admin||actor===ids.MODERATOR);
   if(parts[2]!==guild)deny('Serveur inconnu.',404);
   const owns=c=>c&&c.user===actor;
   const visible=c=>structuredClone(c);
   if(options.method==='GET'){
     if(view==='context')return{guild:{id:guild,name:'WarsNuto · test'},userId:actor,phase:config.phase,session:1,access:{admin,decide:admin,review},canApply:config.phase==='OPEN'&&![...applications.values()].some(c=>c.user===actor),instructions:'Présente-toi avec tes propres mots. Tes réponses sont enregistrées progressivement.'};
     if(view==='settings'){if(!admin)deny('Administration Protect requise.');return{settings:config,roles:[],channels:[]};}
     if(view==='application'){const c=applications.get(parts[4]);if(!owns(c)&&!review)deny('Dossier inaccessible.');const out=visible(c);if(!review)delete out.events;return out;}
     if(view==='reviews'&&!review)deny('Recrutement réservé au staff.');
     const items=[...applications.values()].filter(c=>view==='mine'?owns(c):c.status!=='DRAFT').map(visible);return{items,total:items.length,pages:1,page:1,active:view==='mine'?items.find(c=>['DRAFT','PENDING','UNDER_REVIEW','ACCEPTED','INTERVIEW'].includes(c.status)):null};
   }
   if(body.action.startsWith('review.')&&!review)deny('Accès staff refusé.');
   if(['review.decide','review.hire','settings.save'].includes(body.action)&&!admin)deny('Décision réservée aux responsables.');
   const key=actor+body.operationId;if(operations.has(key))return operations.get(key);
   let c=applications.get(body.id);
   if(body.action==='draft.create'){
     c=[...applications.values()].find(c=>owns(c));if(!c){c={id:randomUUID(),user:actor,guild,version:1,status:'DRAFT',session:1,displayName:'Candidat WarsNuto de test',created:Date.now(),questions,answers:[]};applications.set(c.id,c);}
   }else if(body.action==='settings.save'){Object.assign(config,body.settings);config.version++;return{settings:config};}
   else{
     if(!c||(!body.action.startsWith('review.')&&!owns(c)))deny('Ce dossier ne t’appartient pas.');
     if(c.version!==body.version)deny('Le dossier a changé.',409);
     if(body.action==='draft.save'){if(config.phase!=='OPEN')deny('Recrutements fermés.',409);c.answers[body.index]={value:body.value,questionId:questions[body.index].id};}
     else if(body.action==='draft.submit'){if(body.confirmation!=='ENVOYER'||questions.some((q,i)=>!c.answers[i]?.value))deny('Réponses et confirmation requises.',400);c.status='PENDING';}
     else if(body.action==='review.claim'){c.status='UNDER_REVIEW';c.assignee=actor;}
     else if(body.action==='review.note'){c.events=[...(c.events||[]),{kind:'review.note',actor,created:Date.now(),data:{note:body.note}}];}
     else if(body.action==='review.decide'){c.status=body.status==='ACCEPTED'?'INTERVIEW':body.status;c.reason=body.reason;if(c.status==='INTERVIEW'){c.interviewChannelId='1561826762747285690';c.interviewState='ready';c.notification='sent';}}
     else deny('Action inconnue.',400);
     c.version++;
   }
   const result=visible(c);operations.set(key,result);return result;
 }};
}
module.exports={recruitmentFixture};
