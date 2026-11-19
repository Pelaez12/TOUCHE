import {activePage,ensureSession,store} from './store.mjs';

const $=id=>document.getElementById(id);
const node=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
const WEEKDAYS=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const ROLE_LABELS={stylist:'Estilista titular',junior_stylist_assistant:'Asistente y colorista junior',manicurist:'Manicurista / Estética',reception:'Recepción'};
const CAP_LABELS={primary:'Titular',junior:'Nivel junior',plan_b:'Apoyo temporal',disabled:'No realizo'};

let profileData=null;
let selectedCat='';
let catMap=new Map(); // category -> capabilityLevel ('primary'|'junior'|'plan_b')
let ovrMap=new Map(); // serviceId -> capabilityLevel ('primary'|'junior'|'plan_b'|'disabled')

async function api(path,options={}){
  const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const body=await r.json();
  if(!r.ok)throw Error(body.error||'No se pudo completar la operación.');
  return body;
}

function defaultLevel(){
  return profileData?.staff?.seniorityTier==='junior'?'junior':'primary';
}

function showToast(msg){
  if(!$('toast')||!$('toast-text'))return;
  $('toast-text').textContent=msg;
  $('toast').hidden=false;
  setTimeout(()=>$('toast').hidden=true,4500);
}

function renderActiveTags(){
  const box=$('profile-active-tags');if(!box)return;
  box.replaceChildren();
  const svcs=profileData?.catalog?.services||[];
  const svcById=new Map(svcs.map(s=>[s.id,s]));
  let count=0;

  for(const [cat,lvl] of [...catMap.entries()].sort((a,b)=>a[0].localeCompare(b[0],'es'))){
    count++;
    const chip=node('span',undefined,'profile-tag-chip'+(lvl==='plan_b'?' warn':lvl==='junior'?' soft':''));
    chip.append(node('span',lvl==='primary'?cat:`${cat} · ${CAP_LABELS[lvl]||lvl}`));
    const rm=node('button','×','chip-rm');rm.type='button';rm.title=`Quitar ${cat}`;
    rm.addEventListener('click',()=>{catMap.delete(cat);renderTagMenu();});
    chip.append(rm);
    box.append(chip);
  }
  for(const [sid,lvl] of ovrMap.entries()){
    const svc=svcById.get(sid);if(!svc)continue;
    count++;
    const isOff=lvl==='disabled';
    const chip=node('span',undefined,'profile-tag-chip'+(isOff?' danger':' soft'));
    chip.append(node('span',isOff?`No hago: ${svc.name}`:`${svc.name}${lvl!=='primary'?` (${CAP_LABELS[lvl]||lvl})`:''}`));
    const rm=node('button','×','chip-rm');rm.type='button';rm.title=`Quitar ${svc.name}`;
    rm.addEventListener('click',()=>{ovrMap.delete(sid);renderTagMenu();});
    chip.append(rm);
    box.append(chip);
  }
  if(!count){
    box.append(node('span','Aún no has seleccionado etiquetas. Elige una categoría en la barra de menú de abajo.','field-help'));
  }
}

function renderCategoryPanel(){
  const svcs=(profileData?.catalog?.services||[]).filter(s=>s.category===selectedCat);
  const catLvl=catMap.get(selectedCat)||'';
  $('profile-cat-title').textContent=selectedCat?`${selectedCat} (${svcs.length} servicio${svcs.length===1?'':'s'} en catálogo)`:'Selecciona una categoría';
  $('profile-cat-level').value=catLvl;
  $('profile-cat-hint').textContent=catLvl
    ?`Tienes marcada toda la categoría ${selectedCat}. Toca cualquier servicio puntual abajo si deseas excluirlo o marcarlo diferente.`
    :`Toca los servicios puntuales de ${selectedCat} que realizas, o activa arriba toda la categoría.`;

  const wrap=$('profile-cat-services');wrap.replaceChildren();
  for(const s of svcs){
    const ovr=ovrMap.get(s.id);
    const active=ovr?ovr!=='disabled':!!catLvl;
    const btn=node('button',undefined,'service-tag-btn'+(active?' active':'')+(ovr==='disabled'?' excluded':''));
    btn.type='button';
    btn.setAttribute('aria-pressed',String(active));
    const suffix=ovr==='disabled'?' (excluido)':(ovr&&ovr!=='primary'?` · ${CAP_LABELS[ovr]}`:'');
    btn.textContent=(active?'✓ ':'+ ')+s.name+suffix;
    btn.addEventListener('click',()=>{
      if(catLvl){
        // Whole category active -> clicking toggles disabled override vs inherited
        if(ovr==='disabled')ovrMap.delete(s.id);
        else ovrMap.set(s.id,'disabled');
      } else {
        // Category not active -> clicking toggles individual service inclusion
        if(ovr&&ovr!=='disabled')ovrMap.delete(s.id);
        else ovrMap.set(s.id,defaultLevel());
      }
      renderTagMenu();
    });
    wrap.append(btn);
  }
}

function renderTagMenu(){
  renderActiveTags();
  const bar=$('profile-cat-menubar');if(!bar)return;
  bar.replaceChildren();
  const cats=profileData?.catalog?.categories||[];
  const svcs=profileData?.catalog?.services||[];
  if(!selectedCat&&cats.length)selectedCat=cats[0].category;

  for(const item of cats){
    const hasCat=catMap.has(item.category);
    const svcCount=svcs.filter(s=>s.category===item.category&&ovrMap.has(s.id)&&ovrMap.get(s.id)!=='disabled').length;
    const activeCount=hasCat?item.count:svcCount;
    const btn=node('button',undefined,'cat-menu-btn'+(item.category===selectedCat?' current':'')+(activeCount>0?' has-tags':''));
    btn.type='button';
    btn.dataset.profileCat=item.category;
    btn.setAttribute('aria-pressed',String(item.category===selectedCat));
    btn.append(node('span',item.category));
    if(activeCount>0)btn.append(node('small',String(activeCount),'cat-menu-badge'));
    btn.addEventListener('click',()=>{selectedCat=item.category;renderTagMenu();});
    bar.append(btn);
  }
  renderCategoryPanel();
}

async function loadProfile(){
  const status=$('profile-status'),err=$('profile-error');
  if(!status)return;
  err.hidden=true;status.textContent='Cargando tu perfil…';
  try{
    const user=await ensureSession();
    if(!user)return;
    profileData=await api('/api/profile');
    const acct=profileData.account,st=profileData.staff;
    $('profile-name').value=st?.displayName||acct.displayName||'';
    const hasStaff=!!st;
    $('profile-short-wrap').hidden=!hasStaff;
    $('profile-summary-wrap').hidden=!hasStaff;
    if(hasStaff){
      $('profile-short').value=st.shortName||'';
      $('profile-summary').value=st.specialtySummary||'';
      const restTxt=st.restWeekday===null||st.restWeekday===undefined?'Sin descanso fijo':`Descanso semanal: ${WEEKDAYS[st.restWeekday]}`;
      $('profile-role-meta').textContent=`${acct.email} · ${ROLE_LABELS[st.role]||st.role} · ${restTxt}`;
    } else {
      $('profile-role-meta').textContent=`${acct.email} · Administrador (único)`;
    }

    const canEditTags=!!(st&&st.canHoldAppointments);
    $('profile-tags-card').hidden=!canEditTags;
    $('profile-save-btn').textContent=canEditTags?'Guardar mi perfil y etiquetas':'Guardar mi perfil';
    if(canEditTags){
      catMap=new Map((profileData.categories||[]).map(c=>[c.category,c.capabilityLevel]));
      ovrMap=new Map((profileData.serviceOverrides||[]).map(o=>[o.serviceId,o.capabilityLevel]));
      if(!selectedCat&&profileData.catalog?.categories?.length)selectedCat=profileData.catalog.categories[0].category;
      renderTagMenu();
    }
    $('profile-password-card').hidden=!!user.localProxy;
    status.textContent='';
  }catch(e){
    status.textContent='';
    err.textContent=e.message;err.hidden=false;
  }
}

$('profile-cat-level')?.addEventListener('change',()=>{
  if(!selectedCat)return;
  const val=$('profile-cat-level').value;
  if(val)catMap.set(selectedCat,val);
  else catMap.delete(selectedCat);
  // Clean up redundant same-category overrides when toggling whole category
  const svcs=(profileData?.catalog?.services||[]).filter(s=>s.category===selectedCat);
  for(const s of svcs){
    if(val&&ovrMap.get(s.id)!=='disabled')ovrMap.delete(s.id);
    if(!val&&ovrMap.get(s.id)==='disabled')ovrMap.delete(s.id);
  }
  renderTagMenu();
});

$('profile-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('profile-save-btn'),err=$('profile-error'),status=$('profile-status');
  btn.disabled=true;err.hidden=true;status.textContent='Guardando cambios…';
  try{
    const payload={displayName:$('profile-name').value.trim()};
    if(profileData?.staff){
      payload.shortName=$('profile-short').value.trim();
      payload.specialtySummary=$('profile-summary').value.trim();
      if(profileData.staff.canHoldAppointments){
        payload.categories=[...catMap.entries()].map(([category,capabilityLevel])=>({category,capabilityLevel}));
        payload.serviceOverrides=[...ovrMap.entries()].map(([serviceId,capabilityLevel])=>({serviceId,capabilityLevel}));
      }
    }
    const res=await api('/api/profile',{method:'PATCH',body:JSON.stringify(payload)});
    if(store.user){
      store.applyUser({...store.user,displayName:res.displayName});
    }
    status.textContent='Tu perfil y etiquetas se guardaron correctamente.';
    showToast('Perfil actualizado.');
    window.dispatchEvent(new Event('touche:profile-updated'));
  }catch(error){
    status.textContent='';
    err.textContent=error.message;err.hidden=false;
  }finally{
    btn.disabled=false;
  }
});

$('profile-password-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const err=$('profile-pass-error'),status=$('profile-pass-status'),btn=$('profile-pass-save');
  err.hidden=true;status.textContent='';
  const currentPassword=$('profile-pass-current').value;
  const newPassword=$('profile-pass-next').value;
  const confirm=$('profile-pass-confirm').value;
  if(newPassword.length<8){err.textContent='La nueva contraseña debe tener al menos 8 caracteres.';err.hidden=false;return;}
  if(newPassword!==confirm){err.textContent='Las contraseñas nuevas no coinciden.';err.hidden=false;return;}
  btn.disabled=true;btn.textContent='Guardando…';
  try{
    await api('/api/accounts/me/password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});
    $('profile-password-form').reset();
    status.textContent='Tu contraseña se actualizó correctamente.';
    showToast('Contraseña actualizada.');
  }catch(error){
    err.textContent=error.message;err.hidden=false;
  }finally{
    btn.disabled=false;btn.textContent='Actualizar contraseña';
  }
});

window.addEventListener('hashchange',()=>{if(activePage()==='profile')loadProfile();});
window.addEventListener('touche:session-ready',()=>{if(activePage()==='profile')loadProfile();});
if(activePage()==='profile')loadProfile();
