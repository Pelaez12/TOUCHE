import {activePage,ensureSession,store} from './store.mjs';

const $=id=>document.getElementById(id);
const node=(tag,value,cls)=>{const el=document.createElement(tag);if(value!==undefined)el.textContent=value;if(cls)el.className=cls;return el;};
const initials=name=>String(name||'').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'U';
const fmtLogin=iso=>iso?new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'}).format(new Date(iso)):'Nunca ingresó';

let accounts=[],staffList=[],loaded=false;

async function api(path,options={}){
  const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const body=await r.json();
  if(!r.ok)throw Error(body.error||'No se pudo completar la operación.');
  return body;
}

function showStatus(msg,isError=false){
  if(isError){$('accounts-error').textContent=msg;$('accounts-error').hidden=false;}
  else{$('accounts-error').hidden=true;$('accounts-status').textContent=msg;}
}

function toast(msg){
  if(!$('toast')||!$('toast-text'))return;
  $('toast-text').textContent=msg;$('toast').hidden=false;
  setTimeout(()=>$('toast').hidden=true,5000);
}

function renderAccounts(){
  const tbody=$('accounts-rows');if(!tbody)return;
  tbody.replaceChildren();
  const activeCount=accounts.filter(a=>a.active).length;
  const pendingCount=accounts.filter(a=>!a.hasPassword).length;
  showStatus(`${accounts.length} cuentas internas (1 Administrador único · ${accounts.length-1} Colaboradores) · ${activeCount} activas${pendingCount?` · ${pendingCount} pendientes de asignar contraseña`:''}`);

  for(const acct of accounts){
    const tr=document.createElement('tr');
    const person=node('div',undefined,'client');
    person.append(node('span',initials(acct.displayName),'avatar'+(acct.role==='admin'?' tone-1':'')));
    const info=node('div');
    info.append(node('strong',acct.displayName),node('small',acct.passwordUpdatedAt?'Clave actualizada':'Sin contraseña aún'));
    person.append(info);

    const roleWrap=node('div',undefined,'acct-role-cell');
    roleWrap.append(node('span',acct.role==='admin'?'Administrador (único)':'Colaborador',`badge ${acct.role==='admin'?'good':''}`));
    if(acct.staffShortName)roleWrap.append(node('small',`Agenda: ${acct.staffShortName}`,'field-help'));

    const statusBadge=acct.active
      ? node('span','Activa','badge good')
      : !acct.hasPassword
        ? node('span','Pendiente de contraseña','badge review')
        : node('span','Desactivada','badge');

    const actions=node('div',undefined,'acct-actions');
    const passBtn=node('button',acct.hasPassword?'Cambiar clave':'Asignar contraseña',acct.hasPassword?'tiny-btn':'primary tiny-btn');
    passBtn.type='button';
    passBtn.addEventListener('click',()=>openPasswordModal(acct));
    actions.append(passBtn);

    const editBtn=node('button','Editar','tiny-btn');editBtn.type='button';
    editBtn.addEventListener('click',()=>openAccountModal(acct));
    actions.append(editBtn);

    if(acct.role==='collaborator'){
      const toggleBtn=node('button',acct.active?'Desactivar':'Activar','tiny-btn');
      toggleBtn.type='button';
      if(!acct.hasPassword){toggleBtn.disabled=true;toggleBtn.title='Asigna primero una contraseña para activar la cuenta.';}
      toggleBtn.addEventListener('click',()=>toggleActive(acct,toggleBtn));
      actions.append(toggleBtn);
    }

    for(const cellVal of [person,acct.email,roleWrap,statusBadge,node('span',fmtLogin(acct.lastLoginAt),'date-cell'),actions]){
      const td=document.createElement('td');
      if(cellVal instanceof Node)td.append(cellVal);else td.textContent=cellVal;
      tr.append(td);
    }
    tbody.append(tr);
  }
}

async function loadAccounts(){
  try{
    showStatus('Cargando cuentas internas…');
    const res=await api('/api/accounts');
    accounts=res.accounts||[];
    staffList=res.staff||[];
    loaded=true;
    renderAccounts();
  }catch(e){
    showStatus(e.message,true);
  }
}

async function toggleActive(acct,btn){
  btn.disabled=true;
  try{
    await api('/api/accounts/'+encodeURIComponent(acct.id),{method:'PATCH',body:JSON.stringify({active:!acct.active})});
    toast(acct.active?`Cuenta ${acct.email} desactivada y sesiones cerradas.`:`Cuenta ${acct.email} activada.`);
    await loadAccounts();
  }catch(e){
    showStatus(e.message,true);
    btn.disabled=false;
  }
}

function populateStaffOptions(currentAccountId,selectedStaffId){
  const sel=$('account-staff');if(!sel)return;
  const taken=new Set(accounts.filter(a=>a.id!==currentAccountId&&a.staffId).map(a=>a.staffId));
  sel.replaceChildren(new Option('Sin vínculo a ficha de agenda',''));
  for(const s of staffList){
    if(!taken.has(s.id)||s.id===selectedStaffId){
      sel.append(new Option(`${s.displayName} (${s.shortName})`,s.id));
    }
  }
  sel.value=selectedStaffId||'';
}

function openAccountModal(acct=null){
  $('account-form').reset();
  $('account-modal-error').hidden=true;
  $('account-id').value=acct?.id||'';
  $('account-name').value=acct?.displayName||'';
  $('account-email').value=acct?.email||'';
  $('account-modal-title').textContent=acct?`Editar cuenta (${acct.role==='admin'?'Administrador único':'Colaborador'})`:'Nueva cuenta de colaborador';
  const isAdminAcct=acct?.role==='admin';
  $('account-staff-wrap').hidden=isAdminAcct;
  $('account-password-wrap').hidden=!!acct;
  if(!isAdminAcct)populateStaffOptions(acct?.id||null,acct?.staffId||'');
  $('account-save').disabled=false;
  $('account-modal').showModal();
  $('account-name').focus();
}

function openPasswordModal(acct){
  $('account-password-form').reset();
  $('account-password-error').hidden=true;
  $('account-password-target-id').value=acct.id;
  $('account-password-target-label').textContent=`${acct.displayName} · ${acct.email}`;
  $('account-password-input').type='password';
  $('account-password-confirm').type='password';
  $('account-password-toggle').textContent='Mostrar';
  $('account-password-activate-wrap').hidden=acct.role==='admin';
  $('account-password-activate').checked=true;
  $('account-password-save').disabled=false;
  $('account-password-modal').showModal();
  $('account-password-input').focus();
}

async function ensureAccounts(){
  if(activePage()!=='accounts')return;
  const user=await ensureSession();
  if(!user||user.role!=='admin')return;
  if(!loaded)await loadAccounts();
}

$('new-account-btn')?.addEventListener('click',()=>openAccountModal(null));
for(const id of ['account-modal-close','account-cancel'])$(id)?.addEventListener('click',()=>$('account-modal').close());
for(const id of ['account-password-close','account-password-cancel'])$(id)?.addEventListener('click',()=>$('account-password-modal').close());

$('account-password-toggle')?.addEventListener('click',()=>{
  const next=$('account-password-input').type==='password'?'text':'password';
  $('account-password-input').type=next;
  $('account-password-confirm').type=next;
  $('account-password-toggle').textContent=next==='text'?'Ocultar':'Mostrar';
});

$('account-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  $('account-modal-error').hidden=true;
  const id=$('account-id').value;
  const payload={displayName:$('account-name').value.trim(),email:$('account-email').value.trim()};
  if(!$('account-staff-wrap').hidden)payload.staffId=$('account-staff').value||null;
  if(!id&&$('account-initial-password').value){
    if($('account-initial-password').value.length<8){
      $('account-modal-error').textContent='La contraseña debe tener al menos 8 caracteres (o déjala vacía para dejarla pendiente).';
      $('account-modal-error').hidden=false;return;
    }
    payload.password=$('account-initial-password').value;
  }
  const btn=$('account-save');btn.disabled=true;btn.textContent='Guardando…';
  try{
    await api(id?'/api/accounts/'+encodeURIComponent(id):'/api/accounts',{method:id?'PATCH':'POST',body:JSON.stringify(payload)});
    $('account-modal').close();
    toast(id?'Cuenta actualizada.':'Cuenta de colaborador creada.');
    await loadAccounts();
    if(store.user&&id===store.user.id){
      store.applyUser({...store.user,displayName:payload.displayName,email:payload.email});
    }
  }catch(err){
    $('account-modal-error').textContent=err.message;$('account-modal-error').hidden=false;
  }finally{
    btn.disabled=false;btn.textContent='Guardar cuenta';
  }
});

$('account-password-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  $('account-password-error').hidden=true;
  const id=$('account-password-target-id').value;
  const password=$('account-password-input').value;
  const confirm=$('account-password-confirm').value;
  if(password.length<8){$('account-password-error').textContent='La contraseña debe tener al menos 8 caracteres.';$('account-password-error').hidden=false;return;}
  if(password!==confirm){$('account-password-error').textContent='Las contraseñas no coinciden.';$('account-password-error').hidden=false;return;}
  const payload={password};
  if(!$('account-password-activate-wrap').hidden&&$('account-password-activate').checked)payload.active=true;
  const btn=$('account-password-save');btn.disabled=true;btn.textContent='Guardando…';
  try{
    await api('/api/accounts/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(payload)});
    $('account-password-modal').close();
    toast('Contraseña guardada. La cuenta ya puede iniciar sesión.');
    await loadAccounts();
  }catch(err){
    $('account-password-error').textContent=err.message;$('account-password-error').hidden=false;
  }finally{
    btn.disabled=false;btn.textContent='Guardar contraseña';
  }
});

window.addEventListener('hashchange',ensureAccounts);
window.addEventListener('touche:session-ready',ensureAccounts);
ensureAccounts();
