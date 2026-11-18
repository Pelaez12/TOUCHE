import {whatsappPhone,whatsappLink} from './contact.mjs';
import {debounce,store} from './store.mjs';

const $=id=>document.getElementById(id);
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
const fmtDay=d=>new Intl.DateTimeFormat('es-PE',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const clean=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const node=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
const WEEKDAYS=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const ROLE_LABELS={stylist:'Estilista titular',junior_stylist_assistant:'Asistente y colorista junior',manicurist:'Manicurista / Estética',reception:'Recepción'};
const CAP_LABELS={primary:'Titular',junior:'Nivel junior',plan_b:'Apoyo temporal',disabled:'No realiza'};
const CAP_RANK={primary:1,junior:2,plan_b:3};
const CONFIRM_LABELS={unconfirmed:'Sin confirmar',reminded_day_before:'Recordada (día antes)',reminded_same_day:'Recordada (hoy)',confirmed:'Confirmada',rescheduled:'Reprogramada'};

let date=today(),month=date.slice(0,7),appointments=[],clients=[],services=[],preferences=null;
let staff=[],categoryCaps=[],serviceOverrides=[],exceptions=[],dailyShifts=[];
let activeFilter='all',noteDirty=false,loading=false,loadId=0,bootstrapped=false,editingAppointment=null;

async function api(path,options={}){
  const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const body=await r.json();
  if(!r.ok)throw Error(body.error||'No se pudo guardar. Inténtalo de nuevo.');
  return body;
}
function message(value,error=false){$('agenda-status').textContent=value;$('agenda-status').className=error?'notice error-notice':'field-help';}

function resolveCap(staffId,service){
  if(!service)return null;
  const ovr=serviceOverrides.find(o=>o.staffId===staffId&&o.serviceId===service.id);
  if(ovr)return ovr.capabilityLevel==='disabled'?null:ovr.capabilityLevel;
  const cat=categoryCaps.find(c=>c.staffId===staffId&&c.category===service.category);
  return cat?cat.capabilityLevel:null;
}

function staffDayStatus(member,dayStr){
  const wd=new Date(dayStr+'T12:00:00Z').getUTCDay();
  const dayEx=exceptions.filter(e=>e.staffId===member.id&&e.exceptionDate===dayStr);
  const extra=dayEx.find(e=>e.kind==='extra_shift');
  const leave=dayEx.find(e=>e.kind==='urgent_leave'||e.kind==='rest_override');
  const blocks=dayEx.filter(e=>e.kind==='partial_block'&&e.startsTime&&e.endsTime);
  if(leave)return {working:false,reason:leave.kind==='urgent_leave'?(leave.reason||'Permiso urgente'):(leave.reason||'Cambio de descanso'),blocks};
  if(member.restWeekday===wd&&!extra)return {working:false,reason:'Descanso semanal',blocks};
  return {working:true,reason:extra?(extra.reason||'Turno extraordinario'):'',blocks};
}

function calcEndTime(startTime,durationMin){
  if(!/^\d{2}:\d{2}$/.test(startTime)||!Number.isInteger(durationMin)||durationMin<5)return '';
  const total=Number(startTime.slice(0,2))*60+Number(startTime.slice(3))+durationMin;
  if(total>=1440)return 'Día sig.';
  return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}

function reminderDraft(appt,moment){
  const first=String(appt.clientName||'').trim().split(/\s+/)[0]||'hola';
  const name=first===first.toUpperCase()?first.toLocaleLowerCase('es').replace(/^./,x=>x.toLocaleUpperCase('es')):first;
  const when=moment==='same_day'?'hoy':'mañana ('+appt.startsAt.slice(0,10)+')';
  const time=appt.startsAt.slice(11,16);
  const spec=appt.staffId&&appt.staffName?` con ${appt.staffName}`:'';
  return `Hola, ${name}. Te saludamos de Touché Hair Studio para confirmar tu cita de ${appt.serviceName.toLocaleLowerCase('es')} ${when} a las ${time}${spec}. ¿Nos confirmas tu asistencia? Si necesitas reprogramar, avísanos por aquí.`;
}

function calendar(){
  $('agenda-month-label').textContent=new Intl.DateTimeFormat('es-PE',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));
  const grid=$('agenda-calendar');grid.replaceChildren();
  for(const day of ['L','M','M','J','V','S','D'])grid.append(node('span',day,'weekday'));
  const first=new Date(month+'-01T12:00:00Z'),offset=(first.getUTCDay()+6)%7,last=new Date(first);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
  for(let n=0;n<offset;n++)grid.append(node('span',''));
  for(let day=1;day<=last.getUTCDate();day++){
    const d=month+'-'+String(day).padStart(2,'0'),button=node('button',String(day));
    button.type='button';button.className=(d===date?'selected ':'')+(d===today()?'today':'');
    button.setAttribute('aria-label',fmtDay(d));button.setAttribute('aria-pressed',String(d===date));
    const count=appointments.filter(a=>a.startsAt.startsWith(d)&&a.status!=='cancelled'&&a.status!=='no_show').length;
    if(count){button.append(node('i',undefined,'calendar-dot'));button.title=count+' citas';}
    button.addEventListener('click',()=>selectDate(d));grid.append(button);
  }
}

function renderTeamBar(){
  const bar=$('agenda-team-bar');bar.replaceChildren();
  if(!staff.length)return;
  const activeHolders=[],resting=[];
  for(const m of staff.filter(s=>s.active&&s.canHoldAppointments)){
    const st=staffDayStatus(m,date);
    if(st.working)activeHolders.push({...m,dayStatus:st});
    else resting.push({...m,dayStatus:st});
  }
  const seniors=activeHolders.filter(m=>m.seniorityTier==='senior');
  const juniors=activeHolders.filter(m=>m.seniorityTier==='junior');
  const summary=node('div',undefined,'team-capacity-summary'+(seniors.length<=1?' bottleneck':''));
  const capText=seniors.length===0?'Sin estilistas titulares activas':`${seniors.length} estilista${seniors.length===1?'':'s'} titular${seniors.length===1?'':'es'}${juniors.length?` + ${juniors.map(j=>j.shortName).join(', ')} (junior)`:''}`;
  summary.append(node('strong',capText),node('span',resting.length?'Descansan / ausentes: '+resting.map(r=>`${r.shortName} (${r.dayStatus.reason})`).join(' · '):'Equipo completo disponible hoy'));
  bar.append(summary);
  if(seniors.length===1&&resting.length>=2){
    bar.append(node('p','Día de capacidad reducida (1 titular activa): evita agendar más de una cita en el mismo horario salvo turno extra registrado.','team-warning'));
  }
}

function renderShiftsBar(){
  const bar=$('agenda-shifts-bar');bar.replaceChildren();
  const working=staff.filter(s=>s.active&&s.canHoldAppointments&&staffDayStatus(s,date).working);
  if(!working.length)return;
  const head=node('div',undefined,'shifts-head');
  head.append(node('strong','Orden de llegada (9:00 a.m.) · Turnos sin estilista pedida'),node('small','Marca quién llegó 1.º, 2.º y 3.º hoy para repartir los turnos.'));
  bar.append(head);

  const shiftMap=new Map(dailyShifts.map(s=>[s.staffId,s]));
  const ordered=[...working].sort((a,b)=>{
    const sa=shiftMap.get(a.id),sb=shiftMap.get(b.id);
    if(sa&&!sb)return -1;if(!sa&&sb)return 1;
    if(sa&&sb&&sa.turnOrder!==sb.turnOrder)return sa.turnOrder-sb.turnOrder;
    return a.displayName.localeCompare(b.displayName,'es');
  });

  const list=node('div',undefined,'shifts-chips');
  ordered.forEach((m,idx)=>{
    const sh=shiftMap.get(m.id);
    const chip=node('div',undefined,'shift-chip'+(sh?.status==='present'?' present':sh?.status==='absent'?' absent':''));
    const label=sh?.status==='present'?`${sh.turnOrder}.º ${m.shortName}`:sh?.status==='absent'?`${m.shortName} (ausente)`:`${m.shortName} (sin llegada)`;
    chip.append(node('span',label));
    const controls=node('span',undefined,'shift-chip-actions');
    if(!sh||sh.status!=='present'){
      const mark=node('button','Llegó','tiny-btn');mark.type='button';
      mark.addEventListener('click',()=>saveShiftCheckIn(m.id,'present'));controls.append(mark);
    } else {
      if(idx>0){
        const up=node('button','←','tiny-btn');up.type='button';up.title='Subir turno';
        up.addEventListener('click',()=>moveShiftOrder(ordered,idx,-1));controls.append(up);
      }
      if(idx<ordered.length-1&&shiftMap.get(ordered[idx+1].id)?.status==='present'){
        const down=node('button','→','tiny-btn');down.type='button';down.title='Bajar turno';
        down.addEventListener('click',()=>moveShiftOrder(ordered,idx,1));controls.append(down);
      }
      const abs=node('button','×','tiny-btn');abs.type='button';abs.title='Marcar ausente';
      abs.addEventListener('click',()=>saveShiftCheckIn(m.id,'absent'));controls.append(abs);
    }
    chip.append(controls);list.append(chip);
  });
  bar.append(list);
}

async function saveShiftCheckIn(staffId,status){
  const present=dailyShifts.filter(s=>s.status==='present'&&s.staffId!==staffId).sort((a,b)=>a.turnOrder-b.turnOrder);
  const absent=dailyShifts.filter(s=>s.status==='absent'&&s.staffId!==staffId);
  if(status==='present')present.push({staffId,turnOrder:present.length+1,status:'present',checkedInAt:new Date().toISOString()});
  else absent.push({staffId,turnOrder:99,status:'absent',checkedInAt:new Date().toISOString()});
  const payload=[...present.map((s,i)=>({...s,turnOrder:i+1})),...absent.map((s,i)=>({...s,turnOrder:present.length+i+1}))];
  try{
    const res=await api('/api/agenda/shifts',{method:'PUT',body:JSON.stringify({day:date,shifts:payload})});
    dailyShifts=res.shifts;renderShiftsBar();message('Orden de llegada actualizado.');
  }catch(e){message(e.message,true);}
}

async function moveShiftOrder(ordered,idx,delta){
  const present=ordered.filter(m=>dailyShifts.some(s=>s.staffId===m.id&&s.status==='present'));
  const target=idx+delta;if(target<0||target>=present.length)return;
  [present[idx],present[target]]=[present[target],present[idx]];
  const absent=dailyShifts.filter(s=>s.status==='absent');
  const shiftMap=new Map(dailyShifts.map(s=>[s.staffId,s]));
  const payload=[
    ...present.map((m,i)=>({staffId:m.id,turnOrder:i+1,status:'present',checkedInAt:shiftMap.get(m.id)?.checkedInAt||new Date().toISOString()})),
    ...absent.map((s,i)=>({...s,turnOrder:present.length+i+1}))
  ];
  try{
    const res=await api('/api/agenda/shifts',{method:'PUT',body:JSON.stringify({day:date,shifts:payload})});
    dailyShifts=res.shifts;renderShiftsBar();message('Prioridad de turno actualizada.');
  }catch(e){message(e.message,true);}
}

function matchesFilter(a){
  if(activeFilter==='all')return true;
  if(activeFilter==='pending_confirm')return a.status==='scheduled'&&a.confirmationStatus!=='confirmed';
  if(activeFilter==='confirmed')return a.status==='scheduled'&&a.confirmationStatus==='confirmed';
  if(activeFilter==='pool')return a.status==='scheduled'&&(a.assignmentMode==='pool_turn'||!a.staffId);
  if(activeFilter==='closed')return a.status==='cancelled'||a.status==='no_show';
  return true;
}

function buildAppointmentCard(a){
  const card=node('article',undefined,`appt-card ${a.status}`);
  const top=node('div',undefined,'appt-card-top');
  const duration=Math.round((Date.parse(a.endsAt)-Date.parse(a.startsAt))/60000);
  top.append(node('strong',`${a.startsAt.slice(11,16)} – ${a.endsAt.slice(11,16)} (${duration}m)`));
  const statusLabel={scheduled:CONFIRM_LABELS[a.confirmationStatus]||'Programada',completed:'Realizada',cancelled:'Cancelada',no_show:'No asistió'}[a.status];
  top.append(node('span',statusLabel,`appointment-badge ${a.status==='scheduled'?a.confirmationStatus:a.status}`));
  card.append(top);

  const body=node('div',undefined,'appt-card-body');
  body.append(node('h4',a.clientName),node('p',a.serviceName,'appt-service'));

  const tags=node('div',undefined,'appt-tags');
  tags.append(node('span',a.assignmentMode==='pool_turn'?'Por turno':'Solicitada','mini-tag'));
  const svc=services.find(s=>s.id===a.serviceId);
  const cap=a.staffId&&svc?resolveCap(a.staffId,svc):null;
  if(cap==='plan_b')tags.append(node('span','Apoyo temporal','mini-tag warn'));
  if(cap==='junior')tags.append(node('span','Colorista junior','mini-tag soft'));
  if(a.rescheduleCount>0)tags.append(node('span',`Reprogramada ${a.rescheduleCount} ${a.rescheduleCount===1?'vez':'veces'}`,'mini-tag warn'));
  if(a.clientNoShows>0)tags.append(node('span',`${a.clientNoShows} inasistencia${a.clientNoShows===1?'':'s'}`,'mini-tag danger'));
  if(!whatsappPhone(a.clientPhone))tags.append(node('span','Falta celular','mini-tag warn'));
  body.append(tags);
  if(a.notes)body.append(node('p',a.notes,'appointment-note'));
  if(a.cancelReason&&(a.status==='cancelled'||a.status==='no_show'))body.append(node('small','Motivo: '+a.cancelReason));
  card.append(body);

  const actions=node('div',undefined,'appt-card-actions');
  if(a.status==='scheduled'){
    if(!a.staffId){
      const assignBtn=node('button','Asignar por llegada','primary tiny-btn');assignBtn.type='button';
      assignBtn.addEventListener('click',async()=>{
        assignBtn.disabled=true;
        try{const r=await api('/api/agenda/assign-turn',{method:'POST',body:JSON.stringify({appointmentId:a.id})});message(`Asignada a ${r.assigned.shortName}${r.assigned.turnOrder?' (turno '+r.assigned.turnOrder+')':''}.`);await load();}
        catch(e){message(e.message,true);assignBtn.disabled=false;}
      });
      actions.append(assignBtn);
    }
    if(whatsappPhone(a.clientPhone)){
      for(const [moment,label] of [['day_before','Recordar (día antes)'],['same_day','Recordar (hoy)']]){
        const wa=node('button',label,'tiny-btn message-button');wa.type='button';
        wa.addEventListener('click',async()=>{
          try{
            const url=whatsappLink(a.clientPhone,reminderDraft(a,moment));
            window.open(url,'_blank','noopener,noreferrer');
            await api('/api/appointments/'+a.id+'/remind',{method:'POST',body:JSON.stringify({moment})});
            await load();
          }catch(e){message(e.message,true);}
        });
        actions.append(wa);
      }
    }
    if(a.confirmationStatus!=='confirmed'){
      const conf=node('button','Confirmó','tiny-btn');conf.type='button';
      conf.addEventListener('click',async()=>{try{await api('/api/appointments/'+a.id+'/confirm',{method:'POST',body:'{}'});await load();}catch(e){message(e.message,true);}});
      actions.append(conf);
    }
    const edit=node('button','Reprogramar','tiny-btn');edit.type='button';
    edit.addEventListener('click',()=>openEditor(a));actions.append(edit);
    const comp=node('button','Realizada','tiny-btn');comp.type='button';
    if(Date.parse(a.endsAt)>Date.now()){comp.disabled=true;comp.title='Disponible al finalizar la hora de la cita.';}
    comp.addEventListener('click',()=>confirmAction(a,'complete'));actions.append(comp);
    const ns=node('button','No asistió','tiny-btn');ns.type='button';
    ns.addEventListener('click',()=>confirmAction(a,'no-show'));actions.append(ns);
    const cancel=node('button','Cancelar','tiny-btn');cancel.type='button';
    cancel.addEventListener('click',()=>confirmAction(a,'cancel'));actions.append(cancel);
  } else if(a.status!=='completed'){
    const rebook=node('button','Reprogramar','tiny-btn');rebook.type='button';
    rebook.addEventListener('click',()=>openEditor(a));actions.append(rebook);
  }
  card.append(actions);
  return card;
}

function render(){
  calendar();$('agenda-date').value=date;$('agenda-day-title').textContent=fmtDay(date);
  renderTeamBar();renderShiftsBar();
  const dayRows=appointments.filter(a=>a.startsAt.startsWith(date));
  const active=dayRows.filter(a=>a.status==='scheduled');
  const confirmed=active.filter(a=>a.confirmationStatus==='confirmed').length;
  const done=dayRows.filter(a=>a.status==='completed').length;
  const noShows=dayRows.filter(a=>a.status==='no_show').length;
  $('agenda-day-count').textContent=`${active.length} programada${active.length===1?'':'s'} (${confirmed} confirm.) · ${done} realizadas${noShows?` · ${noShows} no asistió`:''}`;

  const rows=dayRows.filter(matchesFilter);
  const poolRows=rows.filter(a=>!a.staffId);
  const poolLane=$('agenda-pool-lane');poolLane.replaceChildren();
  poolLane.hidden=poolRows.length===0;
  if(poolRows.length){
    poolLane.append(node('h3',`Por asignar según orden de llegada física (${poolRows.length})`));
    const wrap=node('div',undefined,'pool-cards');
    for(const a of poolRows)wrap.append(buildAppointmentCard(a));
    poolLane.append(wrap);
  }

  const board=$('agenda-board');board.replaceChildren();
  const workingStaff=staff.filter(s=>s.active&&s.canHoldAppointments&&staffDayStatus(s,date).working);
  const assignedStaffIds=new Set(rows.filter(a=>a.staffId).map(a=>a.staffId));
  const columns=[...workingStaff];
  for(const m of staff){if(assignedStaffIds.has(m.id)&&!columns.some(c=>c.id===m.id))columns.push(m);}

  const hasAny=rows.length>0||columns.length>0;
  $('agenda-empty').hidden=rows.length>0;
  board.hidden=!hasAny;

  for(const col of columns){
    const colEl=node('section',undefined,'staff-column');
    const st=staffDayStatus(col,date);
    const sh=dailyShifts.find(s=>s.staffId===col.id&&s.status==='present');
    const head=node('header',undefined,'staff-column-head');
    head.append(node('h3',`${sh?sh.turnOrder+'.º · ':''}${col.shortName||col.displayName}`),node('small',st.working?(col.seniorityTier==='junior'?'Colorista junior / Asistente':'Estilista titular'):`No labora (${st.reason})`));
    colEl.append(head);
    const colRows=rows.filter(a=>a.staffId===col.id);
    if(!colRows.length){
      colEl.append(node('p','Sin citas en este filtro.','column-empty'));
    } else {
      for(const a of colRows)colEl.append(buildAppointmentCard(a));
    }
    board.append(colEl);
  }
}

async function selectDate(next){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(next))return;
  if(noteDirty&&!window.confirm('Hay notas sin guardar. ¿Cambiar de fecha y descartarlas?')){$('agenda-date').value=date;return;}
  noteDirty=false;$('agenda-note-status').textContent='';date=next;month=next.slice(0,7);await load();
}

async function load(forceBootstrap=false){
  const current=++loadId;loading=true;$('agenda-refresh').disabled=true;$('agenda-new').disabled=true;message('Cargando agenda…');
  try{
    const needBoot=!bootstrapped||forceBootstrap;
    const data=await api('/api/agenda?date='+date+(needBoot?'&bootstrap=1':''));
    if(current!==loadId)return;
    appointments=data.appointments;preferences=data.preferences;
    staff=data.staff||[];categoryCaps=data.categoryCapabilities||[];serviceOverrides=data.serviceOverrides||[];
    exceptions=data.exceptions||[];dailyShifts=data.dailyShifts||[];
    if(needBoot&&data.clients&&data.services){
      clients=data.clients;services=data.services;bootstrapped=true;
      store.setBootstrap({clients,services,currentUser:data.currentUser});
      window.dispatchEvent(new CustomEvent('touche:agenda-bootstrapped',{detail:{activeClients:clients.length}}));
    }
    if(!noteDirty)$('agenda-day-notes').value=data.dayNote.notes;
    $('agenda-open').value=preferences.openTime;$('agenda-close').value=preferences.closeTime;
    for(const box of document.querySelectorAll('[data-agenda-weekday]'))box.checked=preferences.weekdays.includes(Number(box.value));
    const hoursTxt=`Horario del salón: ${preferences.openTime} a ${preferences.closeTime}`;
    $('agenda-hours-label').textContent=hoursTxt;
    if($('agenda-hours-readonly'))$('agenda-hours-readonly').textContent=hoursTxt;
    render();message('Agenda al día.');
  }catch(e){message(e.message,true);}
  finally{loading=false;$('agenda-refresh').disabled=false;$('agenda-new').disabled=!preferences;}
}

function populateClientOptions(query='',selectedId=''){
  const q=clean(query).trim();
  let list=clients;
  if(q)list=clients.filter(c=>clean(c.name).includes(q)||String(c.dni||'').includes(q)||String(c.phone||'').includes(q));
  const capped=list.slice(0,25);
  if(selectedId&&!capped.some(c=>c.id===selectedId)){
    const sel=clients.find(c=>c.id===selectedId);if(sel)capped.unshift(sel);
  }
  const select=$('appointment-client');select.replaceChildren(new Option(list.length?`Selecciona una clienta (${capped.length} de ${list.length})`:'Sin coincidencias',''));
  for(const c of capped)select.append(new Option(c.name+(c.dni?' · DNI ····'+c.dni.slice(-4):' · DNI pendiente'),c.id));
  select.value=selectedId||'';
  renderClientContext(select.value);
}

function renderClientContext(clientId){
  const box=$('appointment-client-context');
  const c=clients.find(x=>x.id===clientId);
  if(!c){box.hidden=true;box.replaceChildren();return;}
  box.replaceChildren();
  const lines=[];
  lines.push(c.lastVisit?`Última visita: ${c.lastVisit} (${c.lastService||'Sin detalle'})`:'Sin atenciones registradas aún.');
  if(c.lastTechNote)lines.push(`Última fórmula/nota técnica: ${c.lastTechNote}`);
  lines.push(whatsappPhone(c.phone)?`WhatsApp listo: ${c.phone}`:'⚠ Falta teléfono válido para recordatorios WhatsApp.');
  if(c.noShowCount>0)lines.push(`⚠ Registra ${c.noShowCount} inasistencia(s) previa(s).`);
  for(const t of lines)box.append(node('p',t));
  box.hidden=false;
}

function updateEndPreview(){
  const end=calcEndTime($('appointment-time').value,Number($('appointment-duration').value));
  $('appointment-end-preview').textContent=end?`→ Fin ${end}`:'';
}

function refreshStaffOptions(preserveId=null){
  const mode=document.querySelector('input[name=assignmentMode]:checked')?.value||'requested';
  const svc=services.find(s=>s.id===$('appointment-service').value);
  const dayStr=$('appointment-date').value||date;
  const startTime=$('appointment-time').value||'09:00';
  const dur=Number($('appointment-duration').value)||30;
  const endTime=calcEndTime(startTime,dur)||'19:00';
  const startsAt=dayStr+'T'+startTime+':00-05:00',endsAt=dayStr+'T'+endTime+':00-05:00';
  const ignoreId=$('appointment-id').value||null;
  const shiftMap=new Map(dailyShifts.filter(s=>s.day===dayStr&&s.status==='present').map(s=>[s.staffId,s.turnOrder]));

  const select=$('appointment-staff');
  const prev=preserveId!==null?preserveId:select.value;
  select.replaceChildren();
  if(mode==='pool_turn'){
    select.append(new Option('Automático según orden de llegada física (por turno)',''));
  } else {
    select.append(new Option('Selecciona especialista',''));
  }

  const candidates=staff.filter(m=>m.active&&m.canHoldAppointments).map(m=>{
    const cap=svc?resolveCap(m.id,svc):'primary';
    const st=staffDayStatus(m,dayStr);
    const conflict=appointments.find(a=>a.status==='scheduled'&&a.id!==ignoreId&&a.staffId===m.id&&a.startsAt<endsAt&&a.endsAt>startsAt);
    const partial=st.blocks.find(b=>b.startsTime<endTime&&b.endsTime>startTime);
    let ok=true,why='';
    if(svc&&!cap){ok=false;why='No habilitada';}
    else if(!st.working){ok=false;why=st.reason;}
    else if(partial){ok=false;why=`Bloqueo ${partial.startsTime}–${partial.endsTime}`;}
    else if(conflict){ok=false;why=`Ocupada ${conflict.startsAt.slice(11,16)}–${conflict.endsAt.slice(11,16)}`;}
    return {m,cap,ok,why,turn:shiftMap.get(m.id)??null};
  }).sort((a,b)=>{
    if(a.ok!==b.ok)return a.ok?-1:1;
    const ra=CAP_RANK[a.cap]||9,rb=CAP_RANK[b.cap]||9;if(ra!==rb)return ra-rb;
    return (a.turn??999)-(b.turn??999);
  });

  for(const c of candidates){
    if(svc&&!c.cap)continue;
    const tag=c.ok?`${c.turn?c.turn+'.º turno · ':''}${CAP_LABELS[c.cap]||'Disponible'}`:c.why;
    const opt=new Option(`${c.m.displayName} (${tag})`,c.m.id);
    if(!c.ok)opt.disabled=true;
    select.append(opt);
  }
  select.required=mode==='requested';
  select.value=prev&&[...select.options].some(o=>o.value===prev&&!o.disabled)?prev:'';
  const availCount=candidates.filter(c=>c.ok).length;
  $('appointment-staff-hint').textContent=svc
    ?(availCount?`${availCount} colaboradora${availCount===1?'':'s'} habilitada${availCount===1?'':'s'} disponible${availCount===1?'':'s'} en este horario.`:'Ninguna colaboradora habilitada libre en este horario.')
    :'Elige primero un servicio para filtrar por especialidad y disponibilidad.';
}

function openEditor(a=null){
  if(!preferences||loading)return;
  editingAppointment=a;
  $('appointment-client-status').textContent='Añade su ficha aquí y continúa con la cita.';
  $('appointment-form').reset();$('appointment-error').hidden=true;
  $('appointment-id').value=a?.id||'';
  $('appointment-title').textContent=a?'Reprogramar / Editar cita':'Agendar clienta';
  $('appointment-reschedule-wrap').hidden=!a;
  $('appointment-reschedule-reason').value='';
  $('appointment-search').value='';
  populateClientOptions('',a?.clientId||'');

  const svcSel=$('appointment-service');
  svcSel.replaceChildren(new Option('Selecciona un servicio',''));
  for(const s of [...services].sort((x,y)=>x.category.localeCompare(y.category,'es')||x.name.localeCompare(y.name,'es'))){
    const durTxt=s.durationMinutes?(s.durationMaxMinutes&&s.durationMaxMinutes!==s.durationMinutes?` (${s.durationMinutes}–${s.durationMaxMinutes}m)`:` (${s.durationMinutes}m)`):'';
    svcSel.append(new Option(`${s.category} · ${s.name}${durTxt}`,s.id));
  }
  svcSel.value=a?.serviceId||'';
  $('appointment-date').value=a?.startsAt.slice(0,10)||date;
  $('appointment-time').value=a?.startsAt.slice(11,16)||preferences.openTime;
  $('appointment-duration').value=a?Math.round((Date.parse(a.endsAt)-Date.parse(a.startsAt))/60000):'';
  $('appointment-notes').value=a?.notes||'';
  const mode=a?.assignmentMode==='pool_turn'?'pool_turn':'requested';
  document.querySelector(`input[name=assignmentMode][value=${mode}]`).checked=true;
  updateServiceHint();updateEndPreview();refreshStaffOptions(a?.staffId||'');
  $('appointment-editor').showModal();$('appointment-search').focus();
}

function updateServiceHint(){
  const s=services.find(x=>x.id===$('appointment-service').value);
  if(!s){$('appointment-service-hint').textContent='';return;}
  const range=s.durationMinutes?(s.durationMaxMinutes&&s.durationMaxMinutes!==s.durationMinutes?`${s.durationMinutes}–${s.durationMaxMinutes} min`:`${s.durationMinutes} min`):'Duración libre (confirmar según largo/densidad)';
  $('appointment-service-hint').textContent=`Referencia confirmada: ${range}.`;
}

$('appointment-search').addEventListener('input',debounce(()=>{populateClientOptions($('appointment-search').value,$('appointment-client').value);},150));
$('appointment-client').addEventListener('change',()=>renderClientContext($('appointment-client').value));
$('appointment-new-client').addEventListener('click',()=>window.dispatchEvent(new Event('touche:create-client')));
window.addEventListener('touche:agenda-client-closed',event=>{
  if(!$('appointment-editor').open)return;
  const client=event.detail?.client;
  if(client){
    clients=clients.filter(c=>c.id!==client.id);clients.push({...client,lastVisit:null,lastService:null,lastTechNote:null,noShowCount:0});
    $('appointment-search').value='';populateClientOptions('',client.id);
    $('appointment-client-status').textContent='Clienta creada y seleccionada. Puedes continuar con su cita.';
  } else $('appointment-client-status').textContent='Puedes continuar con la cita.';
  $('appointment-client').focus();
});

$('appointment-service').addEventListener('change',()=>{
  const s=services.find(x=>x.id===$('appointment-service').value);
  if(s?.durationMinutes&&!editingAppointment)$('appointment-duration').value=s.durationMinutes;
  else if(s?.durationMinutes&&!$('appointment-duration').value)$('appointment-duration').value=s.durationMinutes;
  updateServiceHint();updateEndPreview();refreshStaffOptions();
});
for(const button of document.querySelectorAll('[data-duration]'))button.addEventListener('click',()=>{$('appointment-duration').value=button.dataset.duration;updateEndPreview();refreshStaffOptions();});
$('appointment-add-eval').addEventListener('click',()=>{const cur=Number($('appointment-duration').value)||0;$('appointment-duration').value=Math.min(600,cur+20);updateEndPreview();refreshStaffOptions();});
for(const id of ['appointment-date','appointment-time','appointment-duration'])$(id).addEventListener('change',()=>{updateEndPreview();refreshStaffOptions();});
for(const r of document.querySelectorAll('input[name=assignmentMode]'))r.addEventListener('change',()=>refreshStaffOptions());

$('appointment-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=$('appointment-save');if(b.disabled)return;b.disabled=true;$('appointment-error').hidden=true;
  try{
    const id=$('appointment-id').value;
    const mode=document.querySelector('input[name=assignmentMode]:checked').value;
    const staffId=$('appointment-staff').value||null;
    const res=await api('/api/appointments'+(id?'/'+id:''),{method:id?'PATCH':'POST',body:JSON.stringify({
      clientId:$('appointment-client').value,serviceId:$('appointment-service').value,staffId,assignmentMode:mode,
      date:$('appointment-date').value,time:$('appointment-time').value,duration:Number($('appointment-duration').value),
      notes:$('appointment-notes').value,rescheduleReason:$('appointment-reschedule-reason').value
    })});
    $('appointment-editor').close();await selectDate($('appointment-date').value);
    if(res.assignee)message(`Cita guardada (${res.assignee}).`);
    window.dispatchEvent(new Event('touche:data-changed'));
  }catch(err){$('appointment-error').textContent=err.message;$('appointment-error').hidden=false;}
  finally{b.disabled=false;}
});

let actionPending=null;
function confirmAction(a,action){
  actionPending={a,action};
  const titles={complete:'¿Registrar atención realizada?',cancel:'¿Cancelar esta cita?','no-show':'¿Marcar que no asistió?'};
  const texts={
    complete:`${a.clientName} · ${a.serviceName} · ${a.startsAt.slice(11,16)}. Se añadirá una atención al historial.`,
    cancel:`${a.clientName} · ${a.serviceName} · ${a.startsAt.slice(11,16)}. La cita quedará conservada como cancelada.`,
    'no-show':`${a.clientName} · ${a.serviceName} · ${a.startsAt.slice(11,16)}. Se sumará a su historial de inasistencias (no crea atención).`
  };
  const labels={complete:'Fórmula de color / nota técnica (opcional)',cancel:'Motivo de cancelación (opcional)','no-show':'Observación de inasistencia (opcional)'};
  $('agenda-confirm-title').textContent=titles[action];
  $('agenda-confirm-text').textContent=texts[action];
  $('agenda-confirm-extra').hidden=false;
  $('agenda-confirm-note-label').textContent=labels[action];
  $('agenda-confirm-note').value='';
  $('agenda-confirm-error').hidden=true;
  $('agenda-confirm').showModal();
}

$('agenda-confirm-save').addEventListener('click',async()=>{
  const b=$('agenda-confirm-save');if(!actionPending||b.disabled)return;b.disabled=true;
  try{
    const {a,action}=actionPending,note=$('agenda-confirm-note').value.trim();
    const payload=action==='complete'?{technicalNotes:note}:action==='cancel'?{reason:note}:{note};
    await api(`/api/appointments/${a.id}/${action}`,{method:'POST',body:JSON.stringify(payload)});
    $('agenda-confirm').close();actionPending=null;await load(action==='complete'||action==='no-show');
    window.dispatchEvent(new Event('touche:data-changed'));
  }catch(e){$('agenda-confirm-error').textContent=e.message;$('agenda-confirm-error').hidden=false;}
  finally{b.disabled=false;}
});

/* Team, services per stylist & service durations modal */
let pendingDeleteStaff=null,editingOverrides=[];

function catalogCategories(){
  const cats=[...new Set(services.map(s=>s.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  return cats.length?cats:['ASESORÍA','COLOR','CORTE','DEPILACION','MANOS / PIES','MAQUILLAJE','PEINADO','QUÍMICO','TRATAMIENTO'];
}

function summarizeStaffServices(member){
  if(!member.canHoldAppointments)return 'No atiende citas en agenda';
  const cats=categoryCaps.filter(c=>c.staffId===member.id);
  const ovrs=serviceOverrides.filter(o=>o.staffId===member.id&&o.capabilityLevel!=='disabled');
  const tags=[];
  for(const c of cats){
    tags.push(c.capabilityLevel==='primary'?c.category:`${c.category} (${CAP_LABELS[c.capabilityLevel]||c.capabilityLevel})`);
  }
  if(ovrs.length)tags.push(`+${ovrs.length} servicio${ovrs.length===1?'':'s'} puntual${ovrs.length===1?'':'es'}`);
  return tags.length?tags.join(' · '):'Sin servicios asignados aún';
}

function renderStaffModal(){
  const activeList=$('staff-settings-list');activeList.replaceChildren();
  const inactiveWrap=$('staff-inactive-wrap'),inactiveList=$('staff-inactive-list');
  inactiveList.replaceChildren();
  const actives=staff.filter(m=>m.active);
  const inactives=staff.filter(m=>!m.active);

  for(const m of actives){
    const row=node('div',undefined,'staff-card-row');
    const info=node('div',undefined,'staff-card-info');
    const title=node('strong',`${m.displayName}${m.shortName&&m.shortName!==m.displayName?` (${m.shortName})`:''}`);
    const meta=node('small',`${ROLE_LABELS[m.role]||m.role} · ${m.restWeekday===null||m.restWeekday===undefined?'Sin descanso fijo':'Descansa '+WEEKDAYS[m.restWeekday]}`);
    const svcs=node('small',summarizeStaffServices(m),'staff-services-pill');
    info.append(title,meta,svcs);

    const actions=node('div',undefined,'staff-card-actions');
    const editBtn=node('button','Editar y servicios','tiny-btn');editBtn.type='button';
    editBtn.addEventListener('click',()=>openStaffEditor(m));
    const delBtn=node('button','Retirar','tiny-btn danger-outline');delBtn.type='button';
    delBtn.addEventListener('click',()=>openStaffDelete(m));
    actions.append(editBtn,delBtn);

    row.append(info,actions);
    activeList.append(row);
  }

  inactiveWrap.hidden=inactives.length===0;
  for(const m of inactives){
    const row=node('div',undefined,'staff-card-row inactive');
    const info=node('div',undefined,'staff-card-info');
    info.append(node('strong',m.displayName),node('small',`${ROLE_LABELS[m.role]||m.role} · Retirada del equipo activo`));
    const actions=node('div',undefined,'staff-card-actions');
    const restoreBtn=node('button','Reactivar','tiny-btn');restoreBtn.type='button';
    restoreBtn.addEventListener('click',async()=>{
      restoreBtn.disabled=true;
      try{
        await api('/api/staff/'+m.id,{method:'PATCH',body:JSON.stringify({active:true})});
        $('staff-settings-status').textContent=`${m.displayName} volvió al equipo activo.`;
        await load();renderStaffModal();
      }catch(e){$('staff-settings-status').textContent=e.message;restoreBtn.disabled=false;}
    });
    actions.append(restoreBtn);
    row.append(info,actions);
    inactiveList.append(row);
  }
  renderServiceDurations();
}

function renderStaffOverridesEditor(){
  const list=$('staff-ovr-list');list.replaceChildren();
  if(!editingOverrides.length){
    list.append(node('p','Sin excepciones puntuales.','field-help'));
    return;
  }
  for(const ovr of editingOverrides){
    const svc=services.find(s=>s.id===ovr.serviceId);
    const chip=node('div',undefined,'ovr-chip');
    chip.append(node('span',`${svc?svc.name:ovr.serviceId} · ${CAP_LABELS[ovr.capabilityLevel]||ovr.capabilityLevel}`));
    const rm=node('button','×','tiny-btn');rm.type='button';rm.title='Quitar';
    rm.addEventListener('click',()=>{editingOverrides=editingOverrides.filter(o=>o.serviceId!==ovr.serviceId);renderStaffOverridesEditor();});
    chip.append(rm);
    list.append(chip);
  }
}

function openStaffEditor(member=null){
  $('staff-editor-form').reset();
  $('staff-editor-error').hidden=true;
  $('staff-edit-id').value=member?.id||'';
  $('staff-editor-title').textContent=member?`Editar a ${member.displayName}`:'Agregar colaboradora';
  $('staff-edit-name').value=member?.displayName||'';
  $('staff-edit-short').value=member?.shortName||'';
  $('staff-edit-role').value=member?.role||'stylist';
  $('staff-edit-rest').value=member&&member.restWeekday!==null&&member.restWeekday!==undefined?String(member.restWeekday):'';
  $('staff-edit-holds').checked=member?!!member.canHoldAppointments:true;
  $('staff-edit-summary').value=member?.specialtySummary||'';
  $('staff-capabilities-section').hidden=!$('staff-edit-holds').checked;

  // Build category capabilities dropdowns
  const grid=$('staff-cat-grid');grid.replaceChildren();
  const capMap=new Map(member?categoryCaps.filter(c=>c.staffId===member.id).map(c=>[c.category,c.capabilityLevel]):[]);
  for(const cat of catalogCategories()){
    const item=node('label',undefined,'staff-cat-item');
    item.append(node('span',cat));
    const sel=document.createElement('select');
    sel.dataset.staffCat=cat;
    sel.append(new Option('No realiza',''),new Option('Titular (principal)','primary'),new Option('Nivel junior','junior'),new Option('Apoyo temporal','plan_b'));
    sel.value=capMap.get(cat)||'';
    item.append(sel);
    grid.append(item);
  }

  // Populate service picker & existing overrides
  const ovrSel=$('staff-ovr-service');ovrSel.replaceChildren();
  for(const s of services)ovrSel.append(new Option(`${s.category} · ${s.name}`,s.id));
  editingOverrides=member?serviceOverrides.filter(o=>o.staffId===member.id).map(o=>({serviceId:o.serviceId,capabilityLevel:o.capabilityLevel})):[];
  renderStaffOverridesEditor();

  $('staff-editor-save').disabled=false;
  $('staff-editor-modal').showModal();
  $('staff-edit-name').focus();
}

function openStaffDelete(member){
  pendingDeleteStaff=member;
  $('staff-delete-desc').textContent=`¿Deseas retirar a ${member.displayName} del equipo activo?`;
  $('staff-delete-error').hidden=true;
  $('staff-delete-confirm').disabled=false;
  $('staff-delete-modal').showModal();
}

function renderServiceDurations(){
  const q=clean($('service-duration-search').value).trim();
  const list=$('service-duration-list');list.replaceChildren();
  const filtered=services.filter(s=>!q||clean(s.name).includes(q)||clean(s.category).includes(q)).slice(0,30);
  for(const s of filtered){
    const row=node('div',undefined,'service-dur-row');
    row.append(node('span',`${s.category} · ${s.name}`));
    const minI=document.createElement('input');minI.type='number';minI.min='5';minI.max='600';minI.placeholder='Mín';minI.value=s.durationMinutes??'';
    const maxI=document.createElement('input');maxI.type='number';maxI.min='5';maxI.max='600';maxI.placeholder='Máx';maxI.value=s.durationMaxMinutes??'';
    const btn=node('button','Guardar','tiny-btn');btn.type='button';
    btn.addEventListener('click',async()=>{
      btn.disabled=true;
      try{
        const res=await api('/api/services/'+s.id,{method:'PATCH',body:JSON.stringify({durationMinutes:minI.value===''?null:Number(minI.value),durationMaxMinutes:maxI.value===''?null:Number(maxI.value)})});
        s.durationMinutes=res.durationMinutes;s.durationMaxMinutes=res.durationMaxMinutes;
        $('staff-settings-status').textContent=`Duración actualizada: ${s.name}.`;
      }catch(e){$('staff-settings-status').textContent=e.message;}
      finally{btn.disabled=false;}
    });
    row.append(minI,maxI,btn);list.append(row);
  }
}

$('staff-add-btn').addEventListener('click',()=>openStaffEditor(null));
$('staff-edit-role').addEventListener('change',()=>{
  const isRec=$('staff-edit-role').value==='reception';
  $('staff-edit-holds').checked=!isRec;
  $('staff-capabilities-section').hidden=isRec;
});
$('staff-edit-holds').addEventListener('change',()=>{$('staff-capabilities-section').hidden=!$('staff-edit-holds').checked;});
$('staff-ovr-add').addEventListener('click',()=>{
  const sid=$('staff-ovr-service').value,lvl=$('staff-ovr-level').value;
  if(!sid)return;
  editingOverrides=editingOverrides.filter(o=>o.serviceId!==sid);
  editingOverrides.push({serviceId:sid,capabilityLevel:lvl});
  renderStaffOverridesEditor();
});
for(const id of ['staff-editor-close','staff-editor-cancel'])$(id).addEventListener('click',()=>$('staff-editor-modal').close());
$('staff-delete-cancel').addEventListener('click',()=>$('staff-delete-modal').close());

$('staff-editor-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('staff-editor-save');btn.disabled=true;$('staff-editor-error').hidden=true;
  const id=$('staff-edit-id').value;
  const canHold=$('staff-edit-holds').checked;
  const categories=canHold?[...document.querySelectorAll('[data-staff-cat]')].filter(s=>s.value).map(s=>({category:s.dataset.staffCat,capabilityLevel:s.value})):[];
  const serviceOverridesPayload=canHold?editingOverrides:[];
  const profile={
    displayName:$('staff-edit-name').value.trim(),
    shortName:$('staff-edit-short').value.trim(),
    role:$('staff-edit-role').value,
    restWeekday:$('staff-edit-rest').value===''?null:Number($('staff-edit-rest').value),
    canHoldAppointments:canHold,
    specialtySummary:$('staff-edit-summary').value.trim()
  };
  try{
    let shared=[];
    if(id){
      const r1=await api('/api/staff/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(profile)});
      shared=r1.sharedRestWith||[];
      await api('/api/staff/'+encodeURIComponent(id)+'/capabilities',{method:'PUT',body:JSON.stringify({categories,serviceOverrides:serviceOverridesPayload})});
    } else {
      const r1=await api('/api/staff',{method:'POST',body:JSON.stringify({...profile,categories,serviceOverrides:serviceOverridesPayload})});
      shared=r1.sharedRestWith||[];
    }
    $('staff-editor-modal').close();
    await load();renderStaffModal();
    $('staff-settings-status').textContent=shared.length
      ?`Guardado. Aviso: comparte día de descanso con ${shared.join(', ')}.`
      :(id?'Colaboradora y servicios actualizados.':'Nueva colaboradora agregada al equipo.');
  }catch(err){
    $('staff-editor-error').textContent=err.message;$('staff-editor-error').hidden=false;
  }finally{
    btn.disabled=false;
  }
});

$('staff-delete-confirm').addEventListener('click',async()=>{
  if(!pendingDeleteStaff)return;
  const btn=$('staff-delete-confirm');btn.disabled=true;$('staff-delete-error').hidden=true;
  try{
    const res=await api('/api/staff/'+encodeURIComponent(pendingDeleteStaff.id),{method:'DELETE'});
    $('staff-delete-modal').close();pendingDeleteStaff=null;
    await load();renderStaffModal();
    $('staff-settings-status').textContent=res.message||'Colaboradora retirada del equipo.';
  }catch(err){
    $('staff-delete-error').textContent=err.message;$('staff-delete-error').hidden=false;
    btn.disabled=false;
  }
});

/* Exceptions modal */
function renderExceptionModal(){
  const sel=$('exception-staff');sel.replaceChildren();
  for(const m of staff.filter(s=>s.active&&s.canHoldAppointments))sel.append(new Option(m.displayName,m.id));
  $('exception-date').value=date;$('exception-reason').value='';
  $('exception-feedback').hidden=true;$('exception-error').hidden=true;
  $('exception-time-row').hidden=$('exception-kind').value!=='partial_block';
  const list=$('exception-list');list.replaceChildren();
  if(!exceptions.length){list.append(node('p','No hay imprevistos registrados este mes.','field-help'));return;}
  const kindLabels={urgent_leave:'Permiso urgente',rest_override:'Cambio de descanso',partial_block:'Bloqueo parcial',extra_shift:'Turno extra'};
  for(const ex of exceptions){
    const m=staff.find(x=>x.id===ex.staffId);
    const row=node('div',undefined,'exception-row');
    const txt=`${ex.exceptionDate} · ${m?.shortName||ex.staffId} · ${kindLabels[ex.kind]||ex.kind}${ex.startsTime?` (${ex.startsTime}–${ex.endsTime})`:''}${ex.reason?' · '+ex.reason:''}`;
    const del=node('button','Quitar','tiny-btn');del.type='button';
    del.addEventListener('click',async()=>{await api('/api/staff/exceptions/'+ex.id,{method:'DELETE'});await load();renderExceptionModal();});
    row.append(node('span',txt),del);list.append(row);
  }
}

$('exception-kind').addEventListener('change',()=>{$('exception-time-row').hidden=$('exception-kind').value!=='partial_block';});
$('exception-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=$('exception-save');b.disabled=true;$('exception-error').hidden=true;$('exception-feedback').hidden=true;
  try{
    const res=await api('/api/staff/exceptions',{method:'POST',body:JSON.stringify({
      staffId:$('exception-staff').value,exceptionDate:$('exception-date').value,kind:$('exception-kind').value,
      startsTime:$('exception-start').value||null,endsTime:$('exception-end').value||null,reason:$('exception-reason').value
    })});
    await load();renderExceptionModal();
    $('exception-feedback').hidden=false;
    $('exception-feedback').textContent=res.affectedAppointments?.length
      ?`Registrado. ⚠ Hay ${res.affectedAppointments.length} cita(s) programada(s) afectada(s) ese día: reprograma o reasigna.`
      :'Cambio registrado sin afectar citas programadas.';
  }catch(err){$('exception-error').textContent=err.message;$('exception-error').hidden=false;}
  finally{b.disabled=false;}
});

$('agenda-team-btn').addEventListener('click',()=>{renderStaffModal();$('staff-modal').showModal();});
$('agenda-exception-btn').addEventListener('click',()=>{renderExceptionModal();$('exception-modal').showModal();});
$('service-duration-search').addEventListener('input',debounce(renderServiceDurations,150));
for(const id of ['staff-modal-close','staff-modal-done'])$(id).addEventListener('click',()=>$('staff-modal').close());
for(const id of ['exception-modal-close','exception-cancel'])$(id).addEventListener('click',()=>$('exception-modal').close());
for(const id of ['appointment-close','appointment-cancel'])$(id).addEventListener('click',()=>$('appointment-editor').close());
$('agenda-confirm-close').addEventListener('click',()=>$('agenda-confirm').close());
$('agenda-new').addEventListener('click',()=>openEditor());$('agenda-refresh').addEventListener('click',()=>load(true));
$('agenda-date').value=date;$('agenda-date').addEventListener('change',()=>selectDate($('agenda-date').value));
$('agenda-today').addEventListener('click',()=>selectDate(today()));
for(const [id,delta] of [['agenda-prev',-1],['agenda-next',1]])$(id).addEventListener('click',()=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);selectDate(d.toISOString().slice(0,10));});
for(const btn of document.querySelectorAll('[data-agenda-filter]'))btn.addEventListener('click',()=>{
  activeFilter=btn.dataset.agendaFilter;
  document.querySelectorAll('[data-agenda-filter]').forEach(b=>{b.classList.toggle('selected',b===btn);b.setAttribute('aria-pressed',String(b===btn));});
  render();
});
$('agenda-day-notes').addEventListener('input',()=>{noteDirty=true;$('agenda-note-status').textContent='Cambios sin guardar';});
$('agenda-save-notes').addEventListener('click',async()=>{const b=$('agenda-save-notes'),savedDate=date,notes=$('agenda-day-notes').value;b.disabled=true;try{await api('/api/agenda/notes',{method:'PATCH',body:JSON.stringify({date:savedDate,notes})});if(date===savedDate&&$('agenda-day-notes').value===notes){noteDirty=false;$('agenda-note-status').textContent='Notas guardadas.';}}catch(e){if(date===savedDate)$('agenda-note-status').textContent=e.message;}finally{b.disabled=false;}});
$('agenda-hours-form').addEventListener('submit',async e=>{e.preventDefault();const b=$('agenda-save-hours');b.disabled=true;try{preferences=await api('/api/agenda/preferences',{method:'PATCH',body:JSON.stringify({openTime:$('agenda-open').value,closeTime:$('agenda-close').value,weekdays:[...document.querySelectorAll('[data-agenda-weekday]:checked')].map(x=>Number(x.value))})});message('Horario guardado. Se aplicará a las próximas citas.');const hoursTxt=`Horario del salón: ${preferences.openTime} a ${preferences.closeTime}`;$('agenda-hours-label').textContent=hoursTxt;if($('agenda-hours-readonly'))$('agenda-hours-readonly').textContent=hoursTxt;}catch(e){message(e.message,true);}finally{b.disabled=false;}});
window.addEventListener('beforeunload',e=>{if(noteDirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('hashchange',()=>{if(location.hash==='#agenda')load();});
if(location.hash==='#agenda')load();
