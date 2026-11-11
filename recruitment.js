window.wnRecruitment = async function({content,request,write,confirmAction,notice,E,icon,icons}) {
  const staff=location.pathname==='/admin/candidatures';
  const params=new URLSearchParams(location.search);let guild=params.get('guild')||'1052863089692905493';
  let context,current,index=0,dirty=false,saving=false,timer,chain=Promise.resolve(),page=1,status='ALL',search='',loading=false;
  const states={DRAFT:'Brouillon',PENDING:'À examiner',UNDER_REVIEW:'En analyse',ACCEPTED:'Présélection pour entretien',INTERVIEW:'Entretien en préparation',REJECTED:'Non retenue',PRIORITY:'Prioritaire à la prochaine session',WITHDRAWN:'Retirée',HIRED:'Retenue après entretien'};
  const phase={OPEN:'Candidatures ouvertes',CLOSED:'Candidatures fermées',REVIEW:'Analyse des dossiers',INTERVIEWS:'Entretiens',FINISHED:'Session terminée'};
  const base=()=>`recruitment/${guild}`;
  const read=(view,query='')=>request(`${base()}/${view}${query}`);
  const mutate=(action,input={})=>write(base(),{action,operationId:crypto.randomUUID(),...input});
  const report=error=>notice(error.message||'Opération indisponible.');
  const button=(label,fn,primary=false)=>{const b=document.createElement('button');b.type='button';b.className=primary?'primary':'';b.textContent=label;b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await fn();icons();}catch(e){report(e);}finally{if(b.isConnected)b.disabled=false;}};return b;};
  const section=(html)=>{const node=document.createElement('section');node.className='workspace-section recruitment-card';node.innerHTML=html;return node;};
  const link=(url,label)=>{const a=document.createElement('a');a.className='button';a.href=url;a.textContent=label;return a;};
  const appendAction=(node,label,fn,primary)=>{let actions=node.querySelector('.form-actions');if(!actions){actions=document.createElement('div');actions.className='form-actions';node.append(actions);}actions.append(button(label,fn,primary));};
  async function save() {
    clearTimeout(timer);const input=content.querySelector('[data-answer]');if(!input||!dirty||!current)return chain;
    const value=input.value,question=index,id=current.id;
    const work=async()=>{
      if(current.id!==id)return;
      saving=true;setSaveLabel('Enregistrement…');
      try {current=await mutate('draft.save',{id,version:current.version,index:question,value});dirty=input.isConnected&&input.value!==value;setSaveLabel(dirty?'Modifications en cours…':'Enregistré dans ton brouillon');if(dirty)timer=setTimeout(()=>void save().catch(report),1200);}
      catch(error){dirty=true;setSaveLabel('Réponse conservée à l’écran · enregistrement à reprendre');throw error;}
      finally{saving=false;}
    };
    chain=chain.catch(()=>{}).then(work);return chain;
  }
  function setSaveLabel(value){const node=content.querySelector('[data-save-state]');if(node)node.textContent=value;}
  window.addEventListener('beforeunload',event=>{if(dirty||saving){event.preventDefault();event.returnValue='';}});
  function header(){
    const node=section(`<div class="recruitment-brand"><img src="/assets/protect-logo.png" alt=""><div><span class="eyebrow">WARSNUTO UNIVERS · RECRUTEMENT</span><h2>${staff?'Les prochains membres du staff.':'Ta place dans l’équipe.'}</h2><p>${E(phase[context.phase]||context.phase)}</p></div></div><p>${E(context.instructions)}</p>`);
    if(context.access.review&&!staff)node.append(link(`/admin/candidatures?guild=${guild}`,'Espace recruteurs'));
    if(staff)node.append(link(`/candidature?guild=${guild}`,'Mon espace candidat'));
    content.append(node);
  }
  function summary(c,full=false){
    const node=section(`<div class="section-heading"><div><span class="eyebrow">${E(states[c.status]||c.status)}</span><h2>${E(c.displayName||'Ma candidature')}</h2></div>${c.priority?'<span class="badge">Prioritaire</span>':''}</div><p class="muted">${new Date(c.created).toLocaleDateString('fr-FR')} · Session ${c.session}</p>${c.reason?`<h3>Retour communiqué au candidat</h3><p class="preserve-lines">${E(c.reason)}</p>`:''}${c.blacklisted?'<p class="notice error">Les prochains dépôts sont suspendus. Contacte le staff par ticket.</p>':''}`);
    if(full&&c.questions)for(const [i,q]of c.questions.entries()){
      const details=document.createElement('details');details.className='recruitment-answer';details.innerHTML=`<summary>${E(q.label)}</summary><p class="preserve-lines">${E(c.answers[i]?.value||'Sans réponse')}</p>`;node.append(details);
    }
    return node;
  }
  async function member(){
    context=await read('context');const list=await read('mine');content.replaceChildren();header();
    const active=list.active||list.items.find(c=>['DRAFT','PENDING','UNDER_REVIEW','ACCEPTED','INTERVIEW'].includes(c.status));
    if(active){current=await read('application/'+active.id);if(current.status==='DRAFT'){index=current.questions.findIndex((q,i)=>!current.answers[i]?.value||current.answers[i].value.trim().length<q.minLength);if(index<0)index=current.questions.length;renderDraft();return;}await memberDetail(current);}
    else if(context.canApply){const node=section('<h2>Présente-toi à l’équipe.</h2><p>Ton parcours, tes disponibilités et tes réactions face aux situations de modération. Tu pourras tout relire avant l’envoi.</p>');appendAction(node,'Commencer ma candidature',async()=>{current=await mutate('draft.create');if(current.status!=='DRAFT'){await member();return;}index=0;renderDraft();},true);content.append(node);}
    else content.append(section('<h2>Retrouve ici le suivi de tes candidatures.</h2><p>Le dépôt dépend de la session en cours. Une candidature présélectionnée reste active pendant son entretien.</p>'));
    for(const c of list.items.filter(c=>c.id!==active?.id)){const node=summary(c);appendAction(node,'Lire le dossier',async()=>{current=await read('application/'+c.id);content.replaceChildren();header();await memberDetail(current);});content.append(node);}
  }
  function renderDraft(){
    content.replaceChildren();header();const q=current.questions[index];
    if(!q){const node=summary(current,true);appendAction(node,'Relire et modifier',()=>{index=0;renderDraft();});
      if(context.phase==='OPEN')appendAction(node,'Envoyer ma candidature',async()=>{const ok=await confirmAction('Transmettre toutes tes réponses aux recruteurs WarsNuto ? Elles ne seront plus modifiables.','ENVOYER',false);if(!ok)return;current=await mutate('draft.submit',{id:current.id,version:current.version,confirmation:ok.confirmation});dirty=false;notice('Ta candidature a été transmise.','success');await member();},true);
      content.append(node);return;}
    const saved=current.answers[index]?.value||'';
    const node=section(`<div class="recruitment-progress"><span>Question ${index+1} sur ${current.questions.length}</span><progress value="${index}" max="${current.questions.length}" aria-label="Progression du questionnaire"></progress></div><span class="eyebrow">${E(q.section)}</span><h2>${E(q.label)}</h2><p class="preserve-lines">${E(q.description)}</p><label for="recruitment-answer">Ta réponse<textarea id="recruitment-answer" data-answer maxlength="${q.maxLength}" rows="7" ${context.phase==='OPEN'?'':'disabled'}>${E(saved)}</textarea></label><div class="recruitment-save"><span data-save-state>Enregistré dans ton brouillon</span><span data-count>${saved.length} / ${q.maxLength}</span></div>`);
    const input=node.querySelector('[data-answer]');input.addEventListener('input',()=>{dirty=true;node.querySelector('[data-count]').textContent=`${input.value.length} / ${q.maxLength}`;setSaveLabel('Modifications en cours…');clearTimeout(timer);timer=setTimeout(()=>void save().catch(report),1200);});
    if(context.phase==='OPEN'){
      appendAction(node,'Enregistrer',save);
      appendAction(node,index===current.questions.length-1?'Relire ma candidature':'Continuer',async()=>{if(input.value.trim().length<q.minLength){notice(`Développe ta réponse : au moins ${q.minLength} caractères.`);return;}await save();index++;renderDraft();},true);
    }else node.append(section('<p>Les candidatures sont fermées. Ton brouillon est conservé.</p>'));
    if(index>0)appendAction(node,'Question précédente',async()=>{await save();index--;renderDraft();});
    appendAction(node,'Retour à mon espace',async()=>{await save();await member();});content.append(node);input.focus({preventScroll:true});
  }
  async function memberDetail(c){
    const node=summary(c,true);content.append(node);
    if(c.status==='ACCEPTED'){
      if(c.notification!=='sent')node.append(section('<p>Ta présélection est enregistrée. Le message privé contenant ton code est en cours d’envoi ou doit être vérifié par les recruteurs.</p>'));
      else{
        const box=section(`<h3>Préparer mon entretien</h3><p>Recopie le code personnel reçu en MP. Il expire le ${new Date(c.interviewExpiresAt).toLocaleString('fr-FR')}.</p><label>Code personnel<input data-interview-code maxlength="12" autocomplete="off"></label><label>Disponibilités<textarea data-availability rows="4" maxlength="1000" placeholder="Jours, horaires et fuseau horaire"></textarea></label><label class="recruitment-check"><input type="checkbox" data-two-factor> J’ai activé la double authentification sur mon compte Discord.</label><p class="muted">Ne fournis jamais ton mot de passe, un code 2FA ou un code de secours.</p>`);
        appendAction(box,'Confirmer mes disponibilités',async()=>{current=await mutate('interview.redeem',{id:c.id,version:c.version,code:box.querySelector('[data-interview-code]').value,availability:box.querySelector('[data-availability]').value,twoFactor:box.querySelector('[data-two-factor]').checked});notice('Tes disponibilités sont transmises. Protect prépare le salon privé.','success');await member();},true);node.append(box);
      }
    }
    if(c.interviewChannelId)node.append(link(`https://discord.com/channels/${guild}/${c.interviewChannelId}`,'Ouvrir mon salon d’entretien'));
    else if(c.status==='INTERVIEW')node.append(section('<p>La préparation du salon est en cours. Les recruteurs vérifieront tout incident avant une nouvelle création.</p>'));
    if(['PENDING','UNDER_REVIEW'].includes(c.status))appendAction(node,'Retirer ma candidature',async()=>{const ok=await confirmAction('Retirer cette candidature de la session ?','RETIRER',false);if(ok){await mutate('withdraw',{id:c.id,version:c.version,confirmation:ok.confirmation});await member();}});
    appendAction(node,'Actualiser le suivi',member);
  }
  async function reviews(){
    if(!context.access.review)throw Error('Cet espace est réservé aux recruteurs configurés dans Protect.');
    content.replaceChildren();header();
    const toolbar=section(`<div class="recruitment-filters"><label>État<select data-status><option value="ALL">Tous les dossiers</option>${Object.entries(states).filter(([k])=>k!=='DRAFT').map(([k,v])=>`<option value="${k}" ${status===k?'selected':''}>${E(v)}</option>`).join('')}</select></label><label>Candidat<input data-search maxlength="80" value="${E(search)}" placeholder="Nom ou identifiant Discord"></label></div>`);
    appendAction(toolbar,'Filtrer',async()=>{status=toolbar.querySelector('[data-status]').value;search=toolbar.querySelector('[data-search]').value;page=1;await reviews();});
    if(context.access.admin)appendAction(toolbar,'Configurer le recrutement',configure);
    content.append(toolbar);
    const list=await read('reviews','?'+new URLSearchParams({page:String(page),status,search}));
    for(const c of list.items){const node=summary(c);appendAction(node,'Examiner le dossier',()=>review(c.id),true);content.append(node);}
    if(!list.items.length)content.append(section('<h2>Aucun dossier dans cette vue.</h2>'));
    const pagination=section(`<p>Page ${list.page} sur ${list.pages} · ${list.total} dossier(s)${list.bounded?' · recherche limitée aux 1 000 plus récents':''}</p>`);
    if(page>1)appendAction(pagination,'Page précédente',async()=>{page--;await reviews();});if(page<list.pages)appendAction(pagination,'Page suivante',async()=>{page++;await reviews();});content.append(pagination);
  }
  async function review(id){
    const c=await read('application/'+id);current=c;content.replaceChildren();header();const node=summary(c,true);content.append(node);
    node.append(section(`<p>Identifiant Discord : <strong>${E(c.user)}</strong>${c.assignee?` · Dossier pris par ${E(c.assignee)}`:''}</p>`));
    if(['PENDING','UNDER_REVIEW'].includes(c.status)&&(!c.assignee||c.assignee===context.userId))appendAction(node,'Prendre en charge',async()=>{await mutate('review.claim',{id:c.id,version:c.version});await review(c.id);});
    const notes=section('<h3>Échanges internes du recrutement</h3><p class="muted">Ces notes restent réservées aux recruteurs.</p>');
    for(const event of c.events||[])if(event.kind==='review.note')notes.append(section(`<p class="preserve-lines">${E(event.data.note)}</p><small>${new Date(event.created).toLocaleString('fr-FR')} · ${E(event.actor)}</small>`));
    const note=document.createElement('textarea');note.rows=3;note.maxLength=1500;note.setAttribute('aria-label','Note interne');notes.append(note);
    appendAction(notes,'Ajouter une note interne',async()=>{await mutate('review.note',{id:c.id,version:c.version,note:note.value});await review(c.id);});node.append(notes);
    if(context.access.decide){
      if(context.access.admin&&c.blacklisted)appendAction(node,'Débloquer les prochains dépôts',async()=>{const ok=await confirmAction('Lever la suspension des candidatures de ce membre.','DEBLOQUER');if(ok){await mutate('review.unblock',{id:c.id,version:c.version,reason:ok.reason,confirmation:ok.confirmation});await review(c.id);}});
      if(['PENDING','UNDER_REVIEW'].includes(c.status))for(const [choice,label]of [['ACCEPTED','Présélectionner pour entretien'],['REJECTED','Refuser'],['PRIORITY','Priorité pour la prochaine session'],['BLACKLIST','Refuser et suspendre les prochains dépôts']])appendAction(node,label,async()=>{const expected=choice==='BLACKLIST'?'BLACKLISTER':'CONFIRMER';const ok=await confirmAction(`${label}. Le motif sera communiqué au candidat.`,expected);if(ok){await mutate('review.decide',{id:c.id,version:c.version,status:choice,reason:ok.reason,confirmation:ok.confirmation});await review(c.id);}},choice==='ACCEPTED');
      if(['ACCEPTED','INTERVIEW'].includes(c.status))for(const [choice,label]of [['HIRED','Retenir après entretien'],['REJECTED','Ne pas retenir après entretien']])appendAction(node,label,async()=>{const ok=await confirmAction(`${label}. Aucun rôle ne sera attribué automatiquement.`,'CONFIRMER');if(ok){await mutate('review.hire',{id:c.id,version:c.version,status:choice,reason:ok.reason,confirmation:ok.confirmation});await review(c.id);}});
      if(['ACCEPTED','REJECTED','PRIORITY','HIRED'].includes(c.status)&&(c.status!=='ACCEPTED'||!c.interviewChannelId))appendAction(node,'Renvoyer le message privé',async()=>{const ok=await confirmAction('Renvoyer le MP. Pour une présélection, l’ancien code sera invalidé.','CONFIRMER');if(ok){await mutate('notification.retry',{id:c.id,version:c.version,reason:ok.reason,confirmation:ok.confirmation});await review(c.id);}});
      if(c.status==='INTERVIEW'&&!c.interviewChannelId){const box=section('<h3>Vérifier la préparation du salon</h3><p>Après une interruption, vérifie Discord avant toute création. Associe le salon existant ou confirme explicitement son absence.</p><label>Identifiant du salon existant (facultatif)<input data-room maxlength="20"></label>');appendAction(box,'Réconcilier l’entretien',async()=>{const roomId=box.querySelector('[data-room]').value.trim();const ok=await confirmAction(roomId?'Associer le salon privé à ce dossier.':'Je confirme avoir vérifié Discord : aucun salon d’entretien n’existe pour ce dossier.',roomId?'CONFIRMER':'RECREER');if(ok){await mutate('interview.reconcile',{id:c.id,version:c.version,roomId:roomId||undefined,reason:ok.reason,confirmation:ok.confirmation});await review(c.id);}});node.append(box);}
    }
    if(c.jobs?.length)node.append(section('<p class="notice warning">Une livraison Discord nécessite une vérification. Consulte le MP ou le salon concerné avant de relancer.</p>'));
    if(context.access.decide)for(const job of c.jobs||[])if(['log','close-interview'].includes(job.kind))appendAction(node,job.kind==='log'?'Relancer le journal Discord':'Reprendre la fermeture de l’entretien',async()=>{const ok=await confirmAction('Après vérification sur Discord, relancer cette livraison. Un journal déjà reçu pourrait être envoyé à nouveau.','RENVOYER');if(ok){await mutate('delivery.retry',{id:c.id,version:c.version,jobId:job.id,reason:ok.reason,confirmation:ok.confirmation});await review(c.id);}});
    appendAction(node,'Actualiser',()=>review(c.id));appendAction(node,'Retour aux dossiers',reviews);
  }
  async function configure(){
    const data=await read('settings'),config=data.settings;content.replaceChildren();header();
    const node=section(`<h2>Session de recrutement</h2><p>L’ouverture d’une session fermée démarre une nouvelle session. Les brouillons et dossiers déjà actifs sont conservés.</p><label>Phase<select data-phase>${Object.entries(phase).map(([v,label])=>`<option value="${v}" ${config.phase===v?'selected':''}>${E(label)}</option>`).join('')}</select></label><label>Salon privé de suivi<select data-review-channel><option value="">Choisir un salon</option>${data.channels.filter(c=>c.type===0).map(c=>`<option value="${c.id}" ${config.reviewChannelId===c.id?'selected':''}>${E(c.name)}</option>`).join('')}</select></label><label>Catégorie des entretiens<select data-interview-category><option value="">Choisir une catégorie</option>${data.channels.filter(c=>c.type===4).map(c=>`<option value="${c.id}" ${config.interviewCategoryId===c.id?'selected':''}>${E(c.name)}</option>`).join('')}</select></label><label>Rôles de lecture des recruteurs<select data-review-roles multiple>${data.roles.map(r=>`<option value="${r.id}" ${config.reviewerRoleIds.includes(r.id)?'selected':''}>${E(r.name)}</option>`).join('')}</select></label><p class="muted">Sans sélection : Modérateurs Confirmés. Les Admins et Responsables modération conservent les décisions finales.</p>`);
    const questions=section('<h3>Questionnaire</h3><p>Chaque candidat conserve la version des questions avec laquelle il a commencé. Les modifications concernent les nouveaux brouillons.</p>');
    for(const q of config.questions){const row=section(`<label>Question<input data-question-label maxlength="200" value="${E(q.label)}"></label><label>Consigne<textarea data-question-description maxlength="1500" rows="3">${E(q.description)}</textarea></label><div class="recruitment-filters"><label>Minimum<input data-question-min type="number" min="1" max="1500" value="${q.minLength}"></label><label>Maximum<input data-question-max type="number" min="1" max="1500" value="${q.maxLength}"></label></div>`);row.dataset.question=q.id;questions.append(row);}node.append(questions);
    appendAction(node,'Enregistrer la configuration',async()=>{const ok=await confirmAction('Appliquer la phase et les réglages de recrutement.','CONFIRMER',false);if(!ok)return;
      const updated=config.questions.map(q=>{const row=questions.querySelector(`[data-question="${q.id}"]`);return {...q,label:row.querySelector('[data-question-label]').value,description:row.querySelector('[data-question-description]').value,minLength:Number(row.querySelector('[data-question-min]').value),maxLength:Number(row.querySelector('[data-question-max]').value)};});
      await mutate('settings.save',{version:config.version,settings:{phase:node.querySelector('[data-phase]').value,reviewChannelId:node.querySelector('[data-review-channel]').value||null,interviewCategoryId:node.querySelector('[data-interview-category]').value||null,reviewerRoleIds:[...node.querySelector('[data-review-roles]').selectedOptions].map(o=>o.value),questions:updated}});context=await read('context');notice('Configuration enregistrée.','success');await reviews();},true);appendAction(node,'Retour aux dossiers',reviews);content.append(node);
  }
  context=await read('context');
  if(staff){if(params.get('application'))await review(params.get('application'));else await reviews();}else await member();
  // Do not replace an in-progress answer when recruitment settings change.
  const poll=setInterval(async()=>{if(document.hidden||loading||saving)return;loading=true;try{const next=await read('context');if(next.phase!==context.phase){context=next;notice(phase[next.phase]+' · ton brouillon est conservé.','info');}}catch{}finally{loading=false;}},30000);
  window.addEventListener('pagehide',()=>{clearInterval(poll);clearTimeout(timer);},{once:true});
};
