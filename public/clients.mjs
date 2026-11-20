import {whatsappPhone,contactProblem,inDirectoryGroup} from './contact.mjs';
import {debounce,activePage,ensureSession,store} from './store.mjs';
const $=id=>document.getElementById(id);
const icons={users:'users',chart:'chart-line-up',file:'file-text',sparkle:'sparkle',menu:'list',search:'magnifying-glass',plus:'plus',left:'caret-left',right:'caret-right',shield:'shield-check',download:'download-simple',return:'arrow-u-up-left',clock:'clock',close:'x',trash:'trash',check:'check',edit:'pencil-simple',restore:'arrow-counter-clockwise'};
function paintIcons(root=document){for(const span of root.querySelectorAll('[data-icon]')){if(span.firstChild)continue;const img=document.createElement('img');img.src='/icons/'+icons[span.dataset.icon]+'.svg';img.alt='';img.setAttribute('aria-hidden','true');span.classList.add('icon');span.append(img);}}
function icon(name){const e=document.createElement('span');e.dataset.icon=name;paintIcons({querySelectorAll:()=>[e]});return e;}
const node=(tag,value,cls)=>{const el=document.createElement(tag);if(value!==undefined)el.textContent=value;if(cls)el.className=cls;return el;};
const clean=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
const displayName=value=>value===value.toUpperCase()?value.toLocaleLowerCase('es').replace(/(^|\s)\S/g,c=>c.toLocaleUpperCase('es')):value;
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const dateLabel=value=>value?new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'Sin registro';
const birthdayLabel=value=>value?new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'long',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'Por completar';
let clients=[],directoryStatus='active',page=1,pendingDelete=null,toastTimer;
const pageSize=15;
async function api(path,options={}){
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  let body;try{body=await response.json();}catch{throw Error('No se pudo completar la operación. Inténtalo de nuevo.');}
  if(!response.ok)throw Error(body.error||'No se pudo completar la operación.');return body;
}
function notify(message){clearTimeout(toastTimer);$('toast-text').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function showError(error){$('clients-error').textContent=error.message;$('clients-error').hidden=false;}
function populateInterestFilter(){
  const sel=$('directory-interest');if(!sel)return;
  const prev=sel.value;
  const counts=new Map();
  for(const c of clients){
    if(c.archivedAt)continue;
    for(const item of c.interests||[]){
      counts.set(item.label,(counts.get(item.label)||0)+1);
    }
  }
  sel.replaceChildren(new Option('Todos los intereses',''));
  for(const [label,cnt] of [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'es'))){
    sel.append(new Option(`${label} (${cnt})`,label));
  }
  sel.value=counts.has(prev)?prev:'';
}
async function refreshClients(){
  const result=await api('/api/clients');clients=result.clients;
  $('connection-status').className='connection-status connected';$('connection-status').lastElementChild.textContent='En línea';
  $('footer-source').textContent='Touché Hair Studio · Horario de Perú';$('clients-error').hidden=true;
  const active=clients.filter(c=>!c.archivedAt).length,archived=clients.length-active;
  const contactable=clients.filter(c=>!c.archivedAt&&whatsappPhone(c.phone)).length;
  $('nav-client-count').textContent=active;$('active-count').textContent=contactable;$('missing-count').textContent=active-contactable;$('all-count').textContent=active;$('archived-count').textContent=archived;
  populateInterestFilter();
  renderDirectory();
  for(const id of ['global-search','client-search'])if($(id).value&&document.activeElement===$(id))$(id).dispatchEvent(new Event('input'));
}
function currentClients(){
  const query=clean($('client-search').value).trim();
  const order=$('directory-sort').value;
  const interest=$('directory-interest')?.value||'';
  return clients.filter(c=>inDirectoryGroup(c,directoryStatus)&&(!interest||(c.interests||[]).some(i=>i.label===interest))&&(!query||clean(c.name).includes(query)||clean(c.dni).includes(query)||clean(c.phone).replace(/\s/g,'').includes(query.replace(/\s/g,''))||(c.interests||[]).some(i=>clean(i.label).includes(query))))
    .sort((a,b)=>order==='recent'?(b.lastVisit||'').localeCompare(a.lastVisit||'')||a.name.localeCompare(b.name,'es'):order==='visits'?b.visits-a.visits||a.name.localeCompare(b.name,'es'):a.name.localeCompare(b.name,'es'));
}
let historyClient=null;
async function openClientHistory(client){
  if(!client)return;
  historyClient=client;
  $('client-history-avatar').textContent=initials(client.name);
  $('client-history-title').textContent=displayName(client.name);
  $('client-history-meta').textContent=[client.phone||'Sin teléfono',client.birthday?'Cumpleaños: '+birthdayLabel(client.birthday):null,client.dni?'DNI ····'+client.dni.slice(-4):'DNI pendiente'].filter(Boolean).join(' · ');
  $('client-history-interest-lead').textContent='Calculando categorías de interés…';
  $('client-history-interests').replaceChildren();
  $('client-history-stats').replaceChildren();
  $('client-history-timeline').replaceChildren();
  $('client-history-status').textContent='Cargando historial…';
  $('client-history-edit').hidden=!!client.archivedAt;
  $('client-history-modal').showModal();
  try{
    const data=await api('/api/clients/'+encodeURIComponent(client.id)+'/history');
    $('client-history-status').textContent='';
    const interests=data.interests||[];
    const chips=$('client-history-interests');chips.replaceChildren();
    if(interests.length){
      const primary=interests[0];
      $('client-history-interest-lead').textContent=`Mayor interés detectado: ${primary.label} (${primary.count} ${primary.count===1?'vez':'veces'})`;
      for(const it of interests){
        const chip=node('span',`${it.label} · ${it.count}`,'mini-tag'+(it.primary?' interest-primary':' soft'));
        if(it.fromAgenda&&!it.fromHistory)chip.title='Detectado automáticamente desde Agenda';
        chips.append(chip);
      }
    } else {
      $('client-history-interest-lead').textContent='Aún sin categoría de interés registrada';
      chips.append(node('span','Se generará automáticamente al registrar su primer servicio o cita en Agenda.','field-help'));
    }

    const stats=$('client-history-stats');stats.replaceChildren();
    for(const [lbl,val] of [['Visitas realizadas',data.visitsCount||0],['Servicios totales',data.servicesCount||0],['Citas agendadas',data.scheduledCount||0]]){
      const box=node('div',undefined,'history-stat-mini');
      box.append(node('strong',String(val)),node('small',lbl));
      stats.append(box);
    }

    const list=$('client-history-timeline');list.replaceChildren();
    const items=data.timeline||[];
    if(!items.length){
      list.append(node('p','Todavía no hay servicios ni citas registradas para esta clienta.','field-help'));
      return;
    }
    const statusMap={completed:'Realizada',scheduled:'Agendada',cancelled:'Cancelada',no_show:'No asistió'};
    for(const it of items){
      const row=node('article',undefined,`history-entry ${it.status}`);
      const top=node('div',undefined,'history-entry-top');
      top.append(node('strong',it.serviceName),node('span',statusMap[it.status]||it.status,`appointment-badge ${it.status}`));
      row.append(top);
      const when=node('p',undefined,'history-entry-when');
      const timeTxt=it.startTime?(it.endTime?`${it.startTime} – ${it.endTime}`:it.startTime):'Sin hora registrada (historial previo)';
      when.textContent=`${dateLabel(it.date)} · ${timeTxt}`;
      row.append(when);
      const meta=node('div',undefined,'history-entry-tags');
      meta.append(node('span',`Interés: ${it.interest}`,'mini-tag soft'));
      if(it.staffName)meta.append(node('span',`Atiende: ${it.staffName}`,'mini-tag'));
      if(it.source==='agenda')meta.append(node('span','Registrado en Agenda','mini-tag'));
      row.append(meta);
      if(it.technicalNotes)row.append(node('p',`Fórmula / nota técnica: ${it.technicalNotes}`,'history-entry-note'));
      if(it.notes)row.append(node('p',it.notes,'history-entry-note'));
      if(it.cancelReason)row.append(node('small',`Motivo: ${it.cancelReason}`));
      list.append(row);
    }
  }catch(err){
    $('client-history-status').textContent=err.message;
  }
}
function renderDirectory(){
  const rows=currentClients();page=Math.max(1,Math.min(page,Math.ceil(rows.length/pageSize)||1));
  const interest=$('directory-interest')?.value||'';
  $('directory-count').textContent=`${rows.length} ${rows.length===1?'clienta':'clientas'} ${{active:'con teléfono para contactar',missing:'con teléfono pendiente o por verificar',all:'en total',archived:'eliminadas'}[directoryStatus]}${interest?` · Interés: ${interest}`:''}`;
  $('missing-data-note').hidden=directoryStatus!=='missing';
  const start=(page-1)*pageSize;$('client-pagination-label').textContent=rows.length?`Mostrando ${start+1}–${Math.min(start+pageSize,rows.length)} de ${rows.length} clientas`:'Sin resultados';
  $('client-page-number').textContent=page;$('client-prev').disabled=page===1;$('client-next').disabled=start+pageSize>=rows.length;
  $('clients-empty').hidden=rows.length!==0;$('client-rows').replaceChildren();
  rows.slice(start,start+pageSize).forEach((client,i)=>{
    const tr=document.createElement('tr');
    tr.className='senior-data-row';
    const name=node('div',undefined,'client senior-client-cell');
    name.append(node('span',initials(client.name),'avatar tone-'+i%5+' senior-avatar'));
    const copy=node('div');
    const nameButton=node('button',displayName(client.name),'client-name-button senior-client-name');
    nameButton.type='button';
    nameButton.addEventListener('click',()=>client.archivedAt?restoreClient(client,nameButton):openEditor(client));
    copy.append(nameButton,node('small',client.dni?'DNI ····'+client.dni.slice(-4):'DNI por completar','senior-dni-pill'));
    if(client.interests?.length){
      const intRow=node('div',undefined,'client-row-interests senior-interests-row');
      for(const it of client.interests.slice(0,2)){
        intRow.append(node('span',it.label,'row-interest-pill'+(it.primary?' primary-int':'')));
      }
      copy.append(intRow);
    }
    name.append(copy);
    const actions=node('div',undefined,'row-actions senior-row-actions');
    if(client.archivedAt){
      const restore=node('button','Restaurar','senior-table-btn senior-btn-restore');
      restore.type='button';
      restore.prepend(icon('restore'));
      restore.addEventListener('click',()=>restoreClient(client,restore));
      actions.append(restore);
    } else {
      const edit=node('button',undefined,'senior-table-btn senior-btn-edit');
      edit.type='button';
      edit.title='Editar clienta';
      edit.setAttribute('aria-label','Editar a '+displayName(client.name));
      edit.append(icon('edit'),node('span','Editar'));
      edit.addEventListener('click',()=>openEditor(client));
      actions.append(edit);
      if(store.isAdmin()){
        const remove=node('button',undefined,'delete-action senior-table-btn senior-btn-delete');
        remove.type='button';
        remove.title='Eliminar clienta';
        remove.setAttribute('aria-label','Eliminar a '+displayName(client.name));
        remove.append(icon('trash'));
        remove.addEventListener('click',()=>askDelete(client));
        actions.append(remove);
      }
    }
    const phone=node('div',client.phone||'Sin teléfono',!whatsappPhone(client.phone)?'missing-phone senior-phone-missing':'senior-phone-cell');
    if(!whatsappPhone(client.phone))phone.append(node('small',contactProblem(client.phone),'field-help senior-phone-help'));
    const histBtn=node('button',undefined,'history-sheet-btn senior-history-btn');
    histBtn.type='button';
    histBtn.title='Ver historial de servicios e intereses de '+displayName(client.name);
    histBtn.append(icon('file'),node('span','Ver Historial'),node('strong',String(client.visits||0),'history-count-pill'));
    histBtn.addEventListener('click',()=>openClientHistory(client));
    const values=[name,phone,node('span',birthdayLabel(client.birthday),'date-cell senior-date-cell'),node('span',dateLabel(client.lastVisit),'date-cell senior-date-cell'),histBtn,actions];
    for(const value of values){const cell=document.createElement('td');if(value instanceof Node)cell.append(value);else cell.textContent=value;tr.append(cell);}
    $('client-rows').append(tr);
  });
}
function navigate(){
  let selected=activePage();
  if(store.user&&!store.isAdmin()&&['return','quality','accounts','team'].includes(selected)){
    location.hash='#agenda';selected='agenda';
  }
  if(store.user&&store.isStylist()&&selected==='clients'){
    location.hash='#agenda';selected='agenda';
  }
  for(const name of ['clients','return','quality','agenda','accounts','team','profile'])$(name+'-page').hidden=name!==selected;
  for(const a of document.querySelectorAll('[data-page]')){if(a.dataset.page===selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
  $('breadcrumb-page').textContent={clients:'Clientas',return:'Retorno de clientas',quality:'Revisión del historial',agenda:store.isStylist()?'Mi agenda':'Agenda del día',accounts:'Cuentas y acceso',team:'Colaboradoras',profile:'Mi perfil'}[selected];
  $('sidebar').classList.remove('open');$('menu-toggle').setAttribute('aria-expanded','false');
  window.scrollTo(0,0);
}
function closeSuggestions(){for(const id of ['global-suggestions','client-suggestions'])$(id).hidden=true;for(const id of ['global-search','client-search']){$(id).setAttribute('aria-expanded','false');$(id).removeAttribute('aria-activedescendant');}}
let editorOrigin=null,savedEditorClient=null;
function openEditor(client=null,origin=null){
  editorOrigin=origin;savedEditorClient=null;
  closeSuggestions();$('client-form').reset();$('editor-error').hidden=true;
  $('edit-id').value=client?.id||'';$('edit-name').value=client?.name||'';$('edit-phone').value=client?.phone||'';$('edit-birthday').value=client?.birthday||'';$('edit-notes').value=client?.notes||'';
  $('edit-dni').value=client?.dni||'';$('edit-dni').required=!client||!!client.dni;
  $('dni-help').textContent=client&&!client.dni?'Esta ficha importada tiene el DNI pendiente. Puedes completarlo sin perder su historial.':'El DNI es obligatorio y no puede repetirse en otra ficha, incluso eliminada.';
  $('editor-title').textContent=client?'Editar clienta':'Nueva clienta';$('editor-avatar').textContent=client?initials(client.name):'+';
  $('editor-subtitle').textContent=client?'Actualiza los datos de su ficha.':'Cada historia empieza con una ficha.';
  $('birthday-original').hidden=!client?.birthdayRaw||!!client?.birthday;
  $('birthday-original').textContent=client?.birthdayRaw?`Dato original del Excel: ${client.birthdayRaw}. Confirma la fecha antes de guardarla.`:'';
  $('save-client').textContent=client?'Guardar cambios':'Guardar clienta';$('save-client').disabled=false;
  $('client-editor').showModal();$('edit-name').focus();
}
async function afterMutation(){
  try{await refreshClients();window.dispatchEvent(new Event('touche:data-changed'));}catch(error){showError(Error('El cambio se guardó, pero no se pudo actualizar la lista. Recarga la página.'));}
}
$('client-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('save-client');if(button.disabled)return;button.disabled=true;button.textContent='Guardando…';$('editor-error').hidden=true;
  const id=$('edit-id').value,body={name:$('edit-name').value,dni:$('edit-dni').value,phone:$('edit-phone').value,birthday:$('edit-birthday').value,notes:$('edit-notes').value};
  try{const result=await api(id?'/api/clients/'+encodeURIComponent(id):'/api/clients',{method:id?'PATCH':'POST',body:JSON.stringify(body)});savedEditorClient={...body,id:result.id||id};$('client-editor').close();notify(id?'Cambios guardados.':'Clienta guardada.');await afterMutation();}
  catch(error){$('editor-error').textContent=error.message;$('editor-error').hidden=false;}
  finally{button.disabled=false;button.textContent=id?'Guardar cambios':'Guardar clienta';}
});
function askDelete(client){pendingDelete=client;$('delete-description').textContent=`Vas a eliminar la ficha de ${displayName(client.name)} del directorio activo.`;$('delete-error').hidden=true;$('confirm-delete').disabled=false;$('delete-dialog').showModal();}
$('confirm-delete').addEventListener('click',async()=>{
  if(!pendingDelete)return;const button=$('confirm-delete');button.disabled=true;button.textContent='Eliminando…';
  try{await api('/api/clients/'+encodeURIComponent(pendingDelete.id),{method:'DELETE'});$('delete-dialog').close();notify('Clienta eliminada. Puedes restaurarla desde Eliminadas.');pendingDelete=null;await afterMutation();}
  catch(error){$('delete-error').textContent=error.message;$('delete-error').hidden=false;}
  finally{button.disabled=false;button.textContent='Eliminar clienta';}
});
async function restoreClient(client,button){button.disabled=true;try{await api('/api/clients/'+encodeURIComponent(client.id)+'/restore',{method:'POST',body:'{}'});notify('Clienta restaurada en el directorio.');await afterMutation();}catch(error){showError(error);}finally{button.disabled=false;}}
function autocomplete(inputId,listId){
  const input=$(inputId),list=$(listId);let options=[],active=-1;
  const hide=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
  function highlight(){const buttons=list.querySelectorAll('[role=option]');buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===active)));if(active>=0){input.setAttribute('aria-activedescendant',buttons[active].id);buttons[active].scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
  function show(){
    const q=clean(input.value).trim();active=-1;options=[];list.replaceChildren();
    if(!q){hide();return;}
    options=clients.filter(c=>(inputId==='client-search'?inDirectoryGroup(c,directoryStatus):!c.archivedAt)&&(clean(c.name).includes(q)||clean(c.dni).includes(q)||String(c.phone||'').replace(/\D/g,'').includes(q.replace(/\D/g,'')||'NO_PHONE_QUERY'))).slice(0,7);
    if(!options.length)list.append(node('div','No hay coincidencias. Prueba con otro nombre, DNI o teléfono.','no-suggestions'));
    for(const [i,c]of options.entries()){
      const b=node('button');b.type='button';b.role='option';b.id=listId+'-'+i;b.tabIndex=-1;b.setAttribute('aria-selected','false');b.append(node('span',initials(c.name),'avatar'));
      const description=node('span',undefined,'suggestion-text');description.append(node('strong',displayName(c.name)),node('small',(c.phone||'Teléfono por completar')+(c.dni?' · DNI ····'+c.dni.slice(-4):' · DNI pendiente')));b.append(description);
      b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',()=>choose(c));list.append(b);
    }
    list.hidden=false;input.setAttribute('aria-expanded','true');
  }
  function choose(c){hide();input.value='';if(inputId==='client-search'){page=1;renderDirectory();}location.hash='#clientas';if(c.archivedAt){notify('Esta clienta está en Eliminadas. Restaura su ficha para editarla.');}else openEditor(c);}
  input.addEventListener('input',show);input.addEventListener('focus',()=>input.value&&show());
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();hide();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(list.hidden)show();if(!options.length)return;active=(active+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;highlight();}
    if(e.key==='Enter'&&!list.hidden){e.preventDefault();if(active>=0&&options[active])choose(options[active]);else if(options.length===1)choose(options[0]);}
  });
  input.addEventListener('blur',e=>{if(!list.contains(e.relatedTarget))hide();});
}
paintIcons();navigate();window.addEventListener('hashchange',navigate);
$('new-client').addEventListener('click',()=>openEditor());
window.addEventListener('touche:create-client',()=>openEditor(null,'agenda'));
$('client-editor').addEventListener('close',()=>{if(editorOrigin==='agenda')window.dispatchEvent(new CustomEvent('touche:agenda-client-closed',{detail:{client:savedEditorClient}}));editorOrigin=null;savedEditorClient=null;});
$('client-editor').addEventListener('cancel',event=>{if($('save-client').disabled)event.preventDefault();});
for(const id of ['close-editor','cancel-edit'])$(id).addEventListener('click',()=>{if(!$('save-client').disabled)$('client-editor').close();});
$('cancel-delete').addEventListener('click',()=>$('delete-dialog').close());
$('client-search').addEventListener('input',debounce(()=>{page=1;renderDirectory();},150));
$('directory-sort').addEventListener('change',()=>{page=1;renderDirectory();});
$('directory-interest')?.addEventListener('change',()=>{page=1;renderDirectory();});
for(const id of ['client-history-close','client-history-done'])$(id)?.addEventListener('click',()=>$('client-history-modal').close());
$('client-history-edit')?.addEventListener('click',()=>{if(!historyClient)return;const c=historyClient;$('client-history-modal').close();openEditor(c);});
window.addEventListener('touche:open-client-history',async event=>{
  const id=event.detail?.id;if(!id)return;
  if(!clientsLoaded)await ensureClients(true);
  const client=clients.find(c=>c.id===id);
  if(client)openClientHistory(client);
  else notify('No encontramos el historial de esta clienta.');
});
$('client-prev').addEventListener('click',()=>{page--;renderDirectory();});$('client-next').addEventListener('click',()=>{page++;renderDirectory();});
for(const button of document.querySelectorAll('[data-directory-status]'))button.addEventListener('click',()=>{directoryStatus=button.dataset.directoryStatus;page=1;closeSuggestions();document.querySelectorAll('[data-directory-status]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});renderDirectory();});
$('menu-toggle').addEventListener('click',()=>{const open=$('sidebar').classList.toggle('open');$('menu-toggle').setAttribute('aria-expanded',String(open));});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.autocomplete'))closeSuggestions();if(window.innerWidth<=700&&!event.target.closest('.sidebar')&&!event.target.closest('#menu-toggle')){$('sidebar').classList.remove('open');$('menu-toggle').setAttribute('aria-expanded','false');}});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('global-search').focus();}});
autocomplete('global-search','global-suggestions');autocomplete('client-search','client-suggestions');
$('edit-birthday').max=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
let clientsLoaded=false,clientsDirty=true;
async function ensureClients(force=false){
  if(store.isStylist())return;
  if(!force&&clientsLoaded&&!clientsDirty)return;
  if(!force&&activePage()!=='clients')return;
  try{await refreshClients();clientsLoaded=true;clientsDirty=false;store.clients=clients.filter(c=>!c.archivedAt);}
  catch(error){showError(error);$('connection-status').className='connection-status offline';$('connection-status').lastElementChild.textContent='Sin internet';$('directory-count').textContent='Directorio no disponible';$('client-pagination-label').textContent='Revisa tu conexión y recarga la página.';}
}
$('global-search').addEventListener('focus',()=>{if(!clientsLoaded)ensureClients(true);});
window.addEventListener('hashchange',()=>{if(activePage()==='clients')ensureClients();});
window.addEventListener('touche:edit-client',async event=>{if(!clientsLoaded)await ensureClients(true);const client=clients.find(c=>c.id===event.detail?.id);if(client){location.hash='#clientas';openEditor(client);}else notify('Recarga el directorio para abrir esta ficha.');});
window.addEventListener('touche:data-changed',()=>{clientsDirty=true;if(activePage()==='clients')ensureClients(true);});
window.addEventListener('touche:agenda-bootstrapped',event=>{
  const count=event.detail?.activeClients;
  if(typeof count==='number'){
    $('nav-client-count').textContent=count;
    $('connection-status').className='connection-status connected';
    $('connection-status').lastElementChild.textContent='En línea';
    $('footer-source').textContent='Touché Hair Studio · Horario de Perú';
  }
});
window.addEventListener('touche:session-ready',()=>{navigate();if(clientsLoaded)renderDirectory();});
ensureSession().then(()=>{navigate();ensureClients();});
