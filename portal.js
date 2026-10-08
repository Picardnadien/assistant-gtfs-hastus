'use strict';
// Tokens/passwords are never stored in localStorage, URLs, or the public repo.
function createPortalClient(config,fetcher=fetch){
  if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url)||!config.publishableKey.startsWith('sb_publishable_'))throw Error('Invalid public configuration');
  let session=null;
  const objectPath=(name,download=false)=>'/storage/v1/object/'+(download?'authenticated/':'')+encodeURIComponent(config.bucket)+'/'+encodeURIComponent(name);
  async function request(path,{method='GET',body,auth=false,blob=false,raw=false}={}){
    if(auth&&!session)throw Error('SIGN_IN_REQUIRED');
    const expectedSession=session;
    const headers={apikey:config.publishableKey};
    if(auth)headers.Authorization='Bearer '+session.access_token;
    if(body!==undefined)headers['Content-Type']=raw?'application/octet-stream':'application/json';
    const response=await fetcher(config.url+path,{method,headers,body:body===undefined?undefined:raw?body:JSON.stringify(body),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
    if(auth&&session!==expectedSession)throw Error('SIGN_IN_REQUIRED');
    if(!response.ok){if(auth&&response.status===401)session=null;const error=Error('REQUEST_FAILED');error.status=response.status;throw error;}
    if(blob)return response.blob();
    const text=await response.text();return text?JSON.parse(text):null;
  }
  const rpc=(name,body={})=>request('/rest/v1/rpc/'+name,{method:'POST',body,auth:true});
  return {
    configured:()=>request('/auth/v1/settings'),
    async login(email,password){session=null;const data=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});if(!data?.access_token)throw Error('SIGN_IN_REQUIRED');session={access_token:data.access_token};return data.user;},
    async logout(){try{if(session)await request('/auth/v1/logout?scope=local',{method:'POST',auth:true});}finally{session=null;}},
    clear(){session=null;},
    signup:(email,password,redirect)=>request('/auth/v1/signup?redirect_to='+encodeURIComponent(redirect),{method:'POST',body:{email,password}}),
    recover:email=>request('/auth/v1/recover',{method:'POST',body:{email}}),
    async reset(email,token,password){
      session=null;const data=await request('/auth/v1/verify',{method:'POST',body:{email,token,type:'recovery'}});
      if(!data?.access_token)throw Error('SIGN_IN_REQUIRED');session={access_token:data.access_token};
      try{await request('/auth/v1/user',{method:'PUT',body:{password},auth:true});await request('/auth/v1/logout',{method:'POST',auth:true});}finally{session=null;}
    },
    role:()=>rpc('gtfs_portal_role'),members:()=>rpc('gtfs_portal_members'),
    allow:(email,enabled)=>rpc('gtfs_portal_set_member',{member_email:email,allow_access:enabled}),
    async files(){const rows=[];for(let offset=0;;offset+=100){const page=await request('/storage/v1/object/list/'+encodeURIComponent(config.bucket),{method:'POST',auth:true,body:{prefix:'',limit:100,offset,sortBy:{column:'name',order:'asc'}}});rows.push(...page.filter(row=>row.id));if(page.length<100)return rows;}},
    download:name=>request(objectPath(name,true),{auth:true,blob:true}),
    upload:(name,file)=>request(objectPath(name),{method:'POST',auth:true,body:file,raw:true}),
    remove:name=>request('/storage/v1/object/'+encodeURIComponent(config.bucket),{method:'DELETE',auth:true,body:{prefixes:[name]}})
  };
}
if(typeof module!=='undefined')module.exports={createPortalClient};
if(typeof document!=='undefined'){
  const $=id=>document.getElementById(id),client=createPortalClient(globalThis.GTFS_PORTAL_CONFIG);
  let language='fr',identity=null;
  try{language=localStorage.getItem('gtfs-launch-language')==='en'?'en':'fr';}catch{}
  const tr=(fr,en)=>language==='fr'?fr:en;
  const status=(fr,en)=>{$('status').textContent=tr(fr,en);};
  function translate(){document.documentElement.lang=language;document.querySelectorAll('[data-fr]').forEach(el=>el.textContent=el.dataset[language]);$('language').textContent=language==='fr'?'English':'Français';}
  function lock(){client.clear();identity=null;$('workspace').hidden=true;$('admin-panel').hidden=true;$('auth-panel').hidden=false;$('files').replaceChildren();$('members').replaceChildren();$('identity').textContent='';}
  function errorMessage(error){
    if(error.status===401||error.message==='SIGN_IN_REQUIRED'){lock();status('Connexion invalide ou session expirée. Reconnectez-vous.','Invalid login or expired session. Sign in again.');}
    else if(error.status===403)status('Accès refusé par le serveur. Vérifiez votre autorisation.','Server denied access. Check your authorization.');
    else if(error.status===429)status('Trop de demandes. Réessayez plus tard.','Too many requests. Try again later.');
    else if(error.status===404)status('Configuration serveur incomplète. Le script SQL doit être installé avant utilisation.','Server setup is incomplete. Install the SQL script before use.');
    else status('Opération non effectuée. Vérifiez votre connexion, les champs saisis et la configuration Supabase.','Operation not completed. Check your connection, inputs and Supabase configuration.');
  }
  async function run(button,task){if(button.disabled)return;button.disabled=true;try{await task();}catch(error){errorMessage(error);}finally{button.disabled=false;}}
  function onForm(id,action){$(id).onsubmit=event=>{event.preventDefault();run($(id).querySelector('button'),action);};}
  function button(fr,en,action){const element=document.createElement('button');element.textContent=tr(fr,en);element.onclick=()=>run(element,action);return element;}
  async function load(){
    $('files').replaceChildren();$('members').replaceChildren();$('admin-panel').hidden=true;
    const role=await client.role();
    if(!['admin','viewer'].includes(role)){lock();status('Votre adresse doit être vérifiée et autorisée par l’administrateur. Aucun accès aux fichiers.','Your email must be verified and authorized by the administrator. No file access.');return;}
    $('auth-panel').hidden=true;$('workspace').hidden=false;$('admin-panel').hidden=role!=='admin';$('identity').textContent=identity?.email+' · '+(role==='admin'?tr('Administrateur','Administrator'):tr('Lecteur','Reader'));
    const files=await client.files();
    for(const file of files){
      const row=document.createElement('li'),label=document.createElement('span');label.textContent=file.name;row.append(label);
      row.append(button('Télécharger','Download',async()=>{
        const blob=await client.download(file.name),url=URL.createObjectURL(new Blob([blob],{type:'application/octet-stream'})),a=document.createElement('a');
        a.href=url;a.download=file.name;a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      }));
      if(role==='admin')row.append(button('Supprimer','Delete',async()=>{if(confirm(tr('Supprimer définitivement ce fichier du stockage privé ? ','Permanently delete this file from private storage? ')+file.name)){await client.remove(file.name);await load();}}));
      $('files').append(row);
    }
    if(role==='admin')for(const member of await client.members()){
      const row=document.createElement('li'),label=document.createElement('span');label.textContent=member.email+' · '+member.role+' · '+(member.enabled?tr('Autorisé','Authorized'):tr('Révoqué','Revoked'));row.append(label);
      if(member.role!=='admin')row.append(button(member.enabled?'Révoquer':'Réautoriser',member.enabled?'Revoke':'Reauthorize',async()=>{if(confirm(tr('Modifier l’accès de ','Change access for ')+member.email+' ?')){await client.allow(member.email,!member.enabled);await load();}}));
      $('members').append(row);
    }
    status(files.length+' fichier(s) privé(s). Reconnexion nécessaire après rechargement ou expiration. Les autorisations sont vérifiées à chaque téléchargement.',files.length+' private file(s). Sign in again after reload or expiry. Authorization is checked on every download.');
  }
  $('language').onclick=()=>{language=language==='fr'?'en':'fr';try{localStorage.setItem('gtfs-launch-language',language);}catch{}translate();if(identity)run($('refresh'),load);};
  $('logout').onclick=()=>run($('logout'),async()=>{try{await client.logout();}finally{lock();status('Déconnecté. Les copies déjà téléchargées ne sont pas supprimées.','Signed out. Previously downloaded copies are not removed.');}});
  $('refresh').onclick=()=>run($('refresh'),load);
  onForm('login-form',async()=>{
    lock();const settings=await client.configured();if(settings.mailer_autoconfirm===true){status('Configuration non sûre : activez la confirmation des adresses e-mail dans Supabase.','Unsafe configuration: enable email confirmation in Supabase.');return;}
    const password=$('password').value;$('password').value='';identity=await client.login($('email').value.trim(),password);
    try{await load();}catch(error){lock();throw error;}
  });
  onForm('signup-form',async()=>{const password=$('signup-password').value;$('signup-password').value='';await client.signup($('signup-email').value.trim(),password,location.origin+location.pathname);status('Consultez votre e-mail pour confirmer votre adresse, puis revenez vous connecter. Le compte ne suffit pas à obtenir les accès.','Check your email to confirm your address, then return to sign in. An account alone does not grant access.');});
  onForm('recover-form',async()=>{await client.recover($('recover-email').value.trim());status('Si ce compte existe et si l’envoi est configuré, un code a été envoyé.','If this account exists and email delivery is configured, a code has been sent.');});
  onForm('reset-form',async()=>{const password=$('new-password').value;$('new-password').value='';await client.reset($('recover-email').value.trim(),$('recovery-code').value.trim(),password);$('recovery-code').value='';lock();status('Mot de passe modifié. Connectez-vous avec le nouveau mot de passe.','Password changed. Sign in using your new password.');});
  onForm('member-form',async()=>{await client.allow($('member-email').value.trim(),true);$('member-email').value='';await load();});
  onForm('upload-form',async()=>{
    const file=$('upload-file').files[0];if(!file)return;
    if(file.size>52428800||!/\.(zip|xlsx|csv|txt|html|pdf)$/i.test(file.name)){status('Format non accepté ou fichier supérieur à 50 Mo.','Unsupported format or file exceeds 50 MB.');return;}
    const name=crypto.randomUUID()+'_'+file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]/g,'_').slice(-160);
    await client.upload(name,file);$('upload-file').value='';await load();
  });
  // Verification links may contain tokens. Do not accept/store them: require a
  // deliberate password login, and remove the fragment before other actions.
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  window.addEventListener('pagehide',lock);translate();status('Connectez-vous avec votre compte de cet espace. Aucune donnée client n’est chargée avant autorisation.','Sign in with your workspace account. No client data is loaded before authorization.');
}
