import {report} from './analytics.mjs';
import {whatsappPhone,suggestedAction,personalizedMessage,whatsappLink,DEFAULT_MESSAGE} from './contact.mjs';
import {debounce,activePage,ensureSession,store} from './store.mjs';
const $ = id => document.getElementById(id);
const fmt = date => date ? new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')) : 'Sin fecha';
let data, current, status='all', limit=30, issueLimit=50;
let messagePreferences={template:DEFAULT_MESSAGE,promotion:''},messageClient=null;
let historyLimit=40,correctionLimit=30;
const text = (tag,value,className) => {const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;};
const td = value => {const cell=document.createElement('td');if(value instanceof Node)cell.append(value);else cell.textContent=value;return cell;};
function range() {return Object.fromEntries(['start','end','returnStart','returnEnd'].map(id=>[id,$(id).value]));}
function compute() {
  try {
    current=report(data,range(),$('category').value);
    $('error').hidden=true;
    $('total').textContent=current.total;
    $('returned').textContent=current.returned;
    $('notReturned').textContent=current.notReturned;
    $('uncertain').textContent=current.uncertain ? `${current.uncertain} con posibles visitas por revisar` : 'Sin otra visita utilizable en el período';
    $('rate').textContent=current.rate===null?'Sin base':new Intl.NumberFormat('es-PE',{style:'percent',maximumFractionDigits:1}).format(current.rate);
    $('meter').style.width=`${(current.rate||0)*100}%`;
    $('export').disabled=current.total===0;
    for(const key of ['contact','missing','review','care'])$('todo-'+key).textContent=current.rows.filter(row=>suggestedAction(row).key===key).length;
    limit=30; renderRows();
  } catch(error) {
    $('error').textContent=error.message; $('error').hidden=false;
    current=null;$('export').disabled=true;
    for(const id of ['total','returned','notReturned','rate'])$(id).textContent='—';
    $('meter').style.width='0%';$('rows').replaceChildren();$('more').hidden=true;
    $('result-count').textContent='Corrige los períodos para calcular el retorno.';
    $('empty').hidden=true;
    for(const key of ['contact','missing','review','care'])$('todo-'+key).textContent='—';
  }
}
function filtered() {
  const query=$('search').value.trim().toLocaleLowerCase('es');
  return (current?.rows||[]).filter(row=>(!query||`${row.name} ${row.phone}`.toLocaleLowerCase('es').includes(query)) &&
    (status==='all'||status==='pending'&&!row.returned||status==='returned'&&row.returned||['review','contact','missing','care'].includes(status)&&suggestedAction(row).key===status));
}
function renderRows() {
  const rows=filtered();$('rows').replaceChildren();
  $('result-count').textContent=`${rows.length} clientas · El regreso puede ser por cualquier servicio.`;
  $('empty').hidden=rows.length>0;
  $('more').hidden=rows.length<=limit;
  $('more').textContent=`Mostrar más (${Math.min(limit,rows.length)} de ${rows.length})`;
  for(const row of rows.slice(0,limit)) {
    const tr=document.createElement('tr');
    const person=text('div','','client');
    person.append(text('span',row.name.split(/\s+/).slice(0,2).map(s=>s[0]).join(''),'avatar'));
    const name=text('div','');name.append(text('strong',row.name),text('small',row.phone||'Teléfono pendiente'));person.append(name);
    const services=text('div','','last-service-cell');row.lastServices.forEach((service,i)=>{if(i)services.append(' ');services.append(text('span',service,'service'));});
    services.append(text('small',fmt(row.latestVisit),'last-service-date'));
    const badge=text('span',row.returned?'Regresó':row.uncertain?'Por revisar':'Sin regreso registrado',`badge ${row.returned?'good':row.uncertain?'review':''}`);
    const view=text('button','Ver ficha','view');view.addEventListener('click',()=>detail(row));
    const action=suggestedAction(row),next=text('div','','next-action');next.append(text('strong',action.label),text('small',action.description));
    const actions=text('div','','return-actions');
    if(!whatsappPhone(row.phone)){
      const edit=text('button','Completar teléfono','outline-button');edit.addEventListener('click',()=>editClient(row));actions.append(edit);
    }else{
      const message=text('button','Preparar WhatsApp','message-button');message.addEventListener('click',()=>composeMessage(row));actions.append(message);
    }
    actions.append(view);
    tr.append(td(person),td(services),td(String(row.days)),td(badge),td(next),td(actions));$('rows').append(tr);
  }
}
function detail(row) {
  $('detail-name').textContent=row.name;$('detail-phone').textContent=row.phone||'Teléfono no registrado';
  const content=$('detail-content');content.replaceChildren();
  content.append(text('p',row.returned?`Primer regreso del período: ${fmt(row.firstReturn)}.`:row.uncertain?'Hay fechas pendientes de revisión. El regreso no está confirmado.':'No hay regreso registrado en el período seleccionado.'));
  content.append(text('p',`${row.visits} visitas únicas registradas hasta ${fmt(range().returnEnd)}. ${row.inDirectory?'Nombre coincidente con el directorio.':'Nombre sin coincidencia exacta en el directorio; identidad por revisar.'}`));
  const next=suggestedAction(row);content.append(text('h3','Siguiente paso'),text('p',next.label+': '+next.description));
  content.append(text('p','Último servicio registrado: '+row.lastServices.join(' / ')+' · '+fmt(row.latestVisit)));
  const action=text('button',whatsappPhone(row.phone)?'Preparar mensaje de WhatsApp':'Completar teléfono','primary');
  action.addEventListener('click',()=>{$('detail').close();whatsappPhone(row.phone)?composeMessage(row):editClient(row);});content.append(action);
  content.append(text('h3','Historial utilizable'));
  for(const e of row.events) {const item=text('div',`${fmt(e.date)} · ${e.service}`,'timeline');item.append(text('small',e.sheet?`${e.sheet} · ${e.originalCell||e.cell}${e.sourcePart>1?' · visita '+e.sourcePart:''}`:'Atención registrada desde Agenda'));if(e.dateResolution)item.append(text('small',e.dateResolution));content.append(item);}
  if(row.uncertainRecords.length) {
    content.append(text('h3','Fechas pendientes de revisión'));
    for(const e of row.uncertainRecords) {const item=text('div',`${e.raw??'Sin fecha'} · ${e.service||''}`,'timeline');item.append(text('small',`${e.sheet} · ${e.cell}: ${e.reasons.join('; ')}`));content.append(item);}
  }
  $('detail').showModal();
}
function renderIssues() {
  $('issues').replaceChildren();
  for(const e of data.issues.slice(0,issueLimit)) {
    const row=document.createElement('tr');row.append(td(`${e.sheet} / ${e.cell}`),td(e.name),td(String(e.raw??'—')),td(e.reasons.join('; ')));$('issues').append(row);
  }
  $('more-issues').hidden=issueLimit>=data.issues.length;
  $('more-issues').textContent=`Mostrar más (${Math.min(issueLimit,data.issues.length)} de ${data.issues.length})`;
}
$('period-form').addEventListener('submit',e=>{e.preventDefault();compute();});
$('category').addEventListener('change',()=>data&&compute());
$('search').addEventListener('input',debounce(()=>{limit=30;renderRows();},150));
function selectStatus(value){status=value;document.querySelectorAll('[data-status]').forEach(b=>{b.classList.toggle('selected',b.dataset.status===value);b.setAttribute('aria-pressed',String(b.dataset.status===value));});limit=30;renderRows();}
for(const button of document.querySelectorAll('[data-next]'))button.addEventListener('click',()=>{selectStatus(button.dataset.next);document.querySelector('.results').scrollIntoView({block:'start'});});
for(const button of document.querySelectorAll('[data-status]'))button.addEventListener('click',()=>{
  selectStatus(button.dataset.status);
});
$('more').addEventListener('click',()=>{limit+=30;renderRows();});
$('more-issues').addEventListener('click',()=>{issueLimit+=50;renderIssues();});
$('close-detail').addEventListener('click',()=>$('detail').close());
$('export').addEventListener('click',()=>{
  if(!current)return;
  const dates=range();
  const csvCell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const rows=[['Clienta','Telefono','Estado','Ultima visita al corte','Dias al corte','Primer regreso','Servicios iniciales','Ultimo servicio registrado','Fecha ultimo servicio','Siguiente paso','Inicio base','Fin base','Inicio retorno','Fin retorno'],
    ...filtered().map(r=>[r.name,r.phone,r.returned?'Regreso registrado':r.uncertain?'Por revisar':'Sin regreso registrado',r.last,r.days,r.firstReturn,r.services.join(' / '),r.lastServices.join(' / '),r.latestVisit,suggestedAction(r).label,dates.start,dates.end,dates.returnStart,dates.returnEnd])];
  const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`touche-retorno-${dates.returnEnd}.csv`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
async function loadHistory(){
try {
  const response=await fetch('/api/history');if(!response.ok)throw Error('No se pudo cargar el historial. Recarga la página e inténtalo de nuevo.');
  data=await response.json();
  const selectedCategory=$('category').value;
  $('category').replaceChildren(new Option('Todos los servicios iniciales',''));
  const categories=[...new Set(data.events.map(e=>e.category))].sort();
  for(const category of categories){const o=document.createElement('option');o.value=category;o.textContent=category;$('category').append(o);}
  $('category').value=categories.includes(selectedCategory)?selectedCategory:'';
  const latest=data.events.map(e=>e.date).sort().at(-1);
  if(!latest)throw Error('Aún no hay fechas registradas para calcular el retorno.');
  const d=new Date(latest+'T12:00:00Z'),year=d.getUTCFullYear(),month=d.getUTCMonth();
  const iso=(y,m,day)=>new Date(Date.UTC(y,m,day,12)).toISOString().slice(0,10);
  // Latest month is a partial observation window; the cutoff is explicit.
  if(!$('start').value){$('start').value=iso(year,month-1,1);$('end').value=iso(year,month,0);
  $('returnStart').value=iso(year,month,1);$('returnEnd').value=latest;}
  for(const id of ['start','end','returnStart','returnEnd'])$(id).max=data.asOf;
  $('cutoff').textContent=`Historial actualizado al ${fmt(data.asOf)} · Última atención registrada: ${fmt(latest)}.`;
  $('quality-count').textContent=`${data.issues.length} casos por revisar`;
  const uniqueVisits=new Set(data.events.map(e=>e.clientId+'|'+e.date)).size;
  $('coverage').textContent=`${data.clients.length} clientas activas · ${data.events.length} atenciones registradas · ${uniqueVisits} visitas.`;
  renderIssues();renderHistory();renderCorrections();compute();
} catch(error) {$('error').hidden=false;$('error').textContent=error.message;$('cutoff').textContent='Historial no disponible.';$('result-count').textContent='Sin datos para calcular.';}
}
let historyLoaded=false,historyDirty=true,prefsLoaded=false;
async function ensureReturnData(){
  const page=activePage();
  if(page!=='return'&&page!=='quality')return;
  const user=await ensureSession();
  if(!user||user.role!=='admin')return;
  if(!historyLoaded||historyDirty){historyDirty=false;await loadHistory();historyLoaded=true;}
  if(page==='return'&&!prefsLoaded){prefsLoaded=true;await loadMessagePreferences();}
}
window.addEventListener('touche:data-changed',()=>{historyDirty=true;ensureReturnData();});
window.addEventListener('hashchange',ensureReturnData);
window.addEventListener('touche:session-ready',ensureReturnData);
ensureReturnData();
function editClient(row){window.dispatchEvent(new CustomEvent('touche:edit-client',{detail:{id:row.id}}));}
function composeMessage(row){
  messageClient=row;$('message-client-name').textContent=row.name;$('message-service').textContent=row.lastServices.join(' / ')||'Sin servicio registrado';$('message-date').textContent=fmt(row.latestVisit);
  $('message-phone').textContent='+'+whatsappPhone(row.phone);$('message-history-warning').hidden=!row.uncertain;
  $('message-body').value=personalizedMessage(messagePreferences.template,row,messagePreferences.promotion);updateMessageLink();$('message-dialog').showModal();
}
function updateMessageLink(){
  try{const link=whatsappLink(messageClient?.phone,$('message-body').value);$('open-whatsapp').href=link;$('open-whatsapp').removeAttribute('aria-disabled');$('message-link-error').hidden=true;}
  catch(error){$('open-whatsapp').removeAttribute('href');$('open-whatsapp').setAttribute('aria-disabled','true');$('message-link-error').textContent=error.message;$('message-link-error').hidden=false;}
}
$('message-body').addEventListener('input',updateMessageLink);
for(const id of ['close-message','cancel-message'])$(id).addEventListener('click',()=>$('message-dialog').close());
$('open-whatsapp').addEventListener('click',event=>{if(!$('open-whatsapp').hasAttribute('href'))event.preventDefault();});
async function loadMessagePreferences(){
  try{const response=await fetch('/api/message-preferences');if(!response.ok)throw Error('No se pudo cargar la plantilla guardada. Puedes preparar mensajes con el texto inicial.');messagePreferences=await response.json();$('message-template').value=messagePreferences.template;$('message-promotion').value=messagePreferences.promotion;$('message-template').disabled=false;$('message-promotion').disabled=false;$('save-message-template').disabled=false;$('message-settings-status').textContent='Plantilla guardada. Los mensajes solo se envían cuando pulsas Enviar en WhatsApp.';}
  catch(error){$('message-settings-status').textContent=error.message;}
}
$('save-message-template').addEventListener('click',async()=>{
  const button=$('save-message-template');button.disabled=true;button.textContent='Guardando…';
  try{const value={template:$('message-template').value,promotion:$('message-promotion').value};const response=await fetch('/api/message-preferences',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo guardar la plantilla.');messagePreferences=value;$('message-settings-status').textContent='Plantilla y promoción guardadas. Se usarán al preparar los próximos mensajes.';}
  catch(error){$('message-settings-status').textContent=error.message;}
  finally{button.disabled=false;button.textContent='Guardar plantilla';}
});
// Message preferences load lazily when #retorno is opened.

function renderHistory(){
  if(!data)return;
  const selected=$('history-year').value,query=$('history-search').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const events=data.events.filter(e=>(!selected||e.date.startsWith(selected))&&(!query||`${e.name} ${e.service}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query))).sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'es'));
  const allDates=data.events.map(e=>e.date).sort();
  $('history-span').textContent=allDates.length?`${fmt(allDates[0])} – ${fmt(allDates.at(-1))}`:'Sin fechas';
  $('history-cutoff').textContent='Corte: '+fmt(data.asOf);
  for(const year of ['2025','2026'])$('history-count-'+year).textContent=data.events.filter(e=>e.date.startsWith(year)).length;
  $('history-record-count').textContent=`${events.length} registros${selected?' de '+selected:''}. Varias atenciones del mismo día pueden pertenecer a una sola visita.`;
  $('history-rows').replaceChildren();
  for(const e of events.slice(0,historyLimit)){
    const tr=document.createElement('tr');const source=text('div',e.sheet?`${e.sheet} · ${e.originalCell||e.cell}`:'Agenda del salón');
    if(e.sourcePart>1)source.append(text('small','Visita '+e.sourcePart+' de la misma celda','history-source-note'));
    const resolution=text('div',e.dateResolution?'Fecha revisada':'Registro original',e.dateResolution?'history-reviewed':'subtle');if(e.dateResolution)resolution.title=e.dateResolution;
    tr.append(td(fmt(e.date)),td(e.name),td(e.service),td(source),td(resolution));$('history-rows').append(tr);
  }
  $('history-empty').hidden=events.length>0;$('history-more').hidden=events.length<=historyLimit;
  $('history-more').textContent=`Mostrar más (${Math.min(events.length,historyLimit)} de ${events.length})`;
}
function renderCorrections(){
  const revisions=data.dateRevisions||[];$('correction-count').textContent=`${revisions.length} celdas revisadas`;$('correction-rows').replaceChildren();
  for(const r of revisions.slice(0,correctionLimit)){
    const tr=document.createElement('tr');tr.append(td(r.sheet+' · '+r.cell),td(r.name),td(r.originalValue||'—'),td(r.dates.map(fmt).join(' / ')),td(r.rule));$('correction-rows').append(tr);
  }
  $('corrections-more').hidden=revisions.length<=correctionLimit;$('corrections-more').textContent=`Mostrar más (${Math.min(revisions.length,correctionLimit)} de ${revisions.length})`;
}
$('history-year').addEventListener('change',()=>{historyLimit=40;renderHistory();});
$('history-search').addEventListener('input',debounce(()=>{historyLimit=40;renderHistory();},150));
$('history-more').addEventListener('click',()=>{historyLimit+=40;renderHistory();});
$('corrections-more').addEventListener('click',()=>{correctionLimit+=30;renderCorrections();});
