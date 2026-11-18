import {ensureSession,store} from './store.mjs';

const $=id=>document.getElementById(id);
const initials=name=>String(name||'T').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'T';
const signOutButton=$('sign-out');
const changePasswordBtn=$('change-my-password');
const passModal=$('my-password-modal');
const passForm=$('my-password-form');
const passErr=$('my-password-error');

function syncRoleUI(user){
  if(!user)return;
  const isAdmin=user.role==='admin';
  document.body.dataset.role=user.role||'collaborator';
  for(const el of document.querySelectorAll('.admin-only')){
    if(el.classList.contains('page'))continue;
    el.hidden=!isAdmin;
  }
  const ini=initials(user.displayName);
  if($('user-avatar'))$('user-avatar').textContent=ini;
  if($('top-avatar')){$('top-avatar').textContent=ini;$('top-avatar').setAttribute('aria-label',`${user.displayName} (${isAdmin?'Administrador':'Colaborador'})`);}
  if($('user-name'))$('user-name').textContent=user.displayName||user.email;
  if($('user-meta'))$('user-meta').textContent=`${user.email} · ${isAdmin?'Administrador (único)':'Colaborador'}`;
  if(changePasswordBtn)changePasswordBtn.hidden=!!user.localProxy;
  if(!isAdmin&&['#retorno','#panel','#revision','#quality','#cuentas'].includes(location.hash)){
    location.hash='#agenda';
  }
}

if(!['127.0.0.1','localhost'].includes(location.hostname)){
  signOutButton.hidden=false;
  signOutButton.addEventListener('click',async()=>{
    signOutButton.disabled=true;
    try{
      const r=await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      if(r.ok)location.replace('/login');else throw Error();
    }catch{
      signOutButton.disabled=false;
      signOutButton.textContent='Reintentar cerrar sesión';
    }
  });
  window.addEventListener('pageshow',async()=>{
    try{
      const r=await fetch('/api/session');
      if(r.status===401)location.replace('/login');
      else if(r.ok){const b=await r.json();if(b.user)syncRoleUI(store.applyUser(b.user));}
    }catch{}
  });
}

if(changePasswordBtn&&passModal&&passForm){
  changePasswordBtn.addEventListener('click',()=>{
    passForm.reset();passErr.hidden=true;$('my-password-save').disabled=false;
    passModal.showModal();$('my-password-current').focus();
  });
  for(const id of ['my-password-close','my-password-cancel'])$(id)?.addEventListener('click',()=>passModal.close());
  passForm.addEventListener('submit',async e=>{
    e.preventDefault();
    passErr.hidden=true;
    const currentPassword=$('my-password-current').value;
    const newPassword=$('my-password-next').value;
    const confirm=$('my-password-confirm').value;
    if(newPassword.length<8){passErr.textContent='La nueva contraseña debe tener al menos 8 caracteres.';passErr.hidden=false;return;}
    if(newPassword!==confirm){passErr.textContent='Las contraseñas nuevas no coinciden.';passErr.hidden=false;return;}
    const btn=$('my-password-save');btn.disabled=true;btn.textContent='Guardando…';
    try{
      const r=await fetch('/api/accounts/me/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword,newPassword})});
      const body=await r.json();
      if(!r.ok)throw Error(body.error||'No se pudo actualizar la contraseña.');
      passModal.close();
      if($('toast')&&$('toast-text')){$('toast-text').textContent='Tu contraseña se actualizó correctamente.';$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,4500);}
    }catch(err){
      passErr.textContent=err.message;passErr.hidden=false;
    }finally{
      btn.disabled=false;btn.textContent='Guardar contraseña';
    }
  });
}

window.addEventListener('touche:session-ready',e=>syncRoleUI(e.detail?.user));
window.addEventListener('hashchange',()=>{if(store.user)syncRoleUI(store.user);});
ensureSession().then(syncRoleUI);
