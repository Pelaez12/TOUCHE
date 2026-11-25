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
let staff=[],categoryCaps=[],serviceOverrides=[],exceptions=[],dailyShifts=[],adminAlerts=[];
let activeFilter='all',agendaScope='all',scopeInitialized=false,noteDirty=false,loading=false,loadId=0,bootstrapped=false,editingAppointment=null,pendingOpenNewAppointment=false;

function getMyStaff(){
  const sid=store.user?.staffId;
  return sid?staff.find(m=>m.id===sid)||null:null;
}

function initScopeIfNeeded(){
  if(scopeInitialized||!store.user||!staff.length)return;
  const me=getMyStaff();
  agendaScope=store.isStylist()?'mine':(!store.isAdmin()&&me&&me.canHoldAppointments?'mine':'all');
  scopeInitialized=true;
  syncScopeUI();
}

function syncScopeUI(){
  for(const b of document.querySelectorAll('[data-agenda-scope]')){
    const sel=b.dataset.agendaScope===agendaScope;
    b.classList.toggle('selected',sel);
    b.setAttribute('aria-pressed',String(sel));
  }
}

async function saveMyOwnArrival(){
  try{
    const res=await api('/api/agenda/my-arrival',{method:'POST',body:JSON.stringify({day:date})});
    if(res.shift){
      dailyShifts=dailyShifts.filter(s=>s.staffId!==res.shift.staffId);
      dailyShifts.push(res.shift);
    }
    renderMyBanner();
    message('Tu llegada quedó registrada.');
  }catch(e){message(e.message,true);}
}

function renderAdminAlerts(){
  const btn=$('admin-alerts-btn'),cnt=$('admin-alerts-count'),panel=$('admin-alerts-panel');
  if(!store.isAdmin()){
    if(btn)btn.hidden=true;
    if(panel){panel.hidden=true;panel.replaceChildren();}
    return;
  }
  const unread=adminAlerts.filter(a=>a.status==='unread');
  if(btn&&cnt){
    btn.hidden=unread.length===0;
    cnt.textContent=String(unread.length);
  }
  if(!panel)return;
  panel.replaceChildren();
  panel.hidden=unread.length===0;
  if(!unread.length)return;

  const head=node('div',undefined,'admin-alerts-head');
  head.append(node('strong',`Alertas pendientes de atención (${unread.length})`),node('small','Solo visibles para Administración'));
  panel.append(head);

  for(const al of unread){
    const isArrival=al.kind==='staff_arrived';
    const item=node('article',undefined,'admin-alert-card'+(isArrival?' is-arrival':''));
    const info=node('div',undefined,'admin-alert-info');
    info.append(node('strong',al.title),node('p',al.message));
    const when=al.createdAt?new Intl.DateTimeFormat('es-PE',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short',timeZone:'America/Lima'}).format(new Date(al.createdAt)):'';
    info.append(node('small',`${isArrival?'Registrado por':'Reportado por'} ${al.createdByName||al.createdByEmail}${when?' · '+when:''}`));
    const acts=node('div',undefined,'admin-alert-actions');
    const advisoryMatch=!isArrival&&!al.appointmentId?String(al.message||'').match(/Cel\.\s*([+\d\s-]{7,15})/):null;
    const extractedPhone=advisoryMatch?advisoryMatch[1].trim():'';
    if(!isArrival&&whatsappPhone(al.clientPhone)){
      const wa=node('button','Recordar por WhatsApp','tiny-btn message-button');wa.type='button';
      wa.addEventListener('click',()=>{
        const first=String(al.clientName||'').trim().split(/\s+/)[0]||'hola';
        const name=first===first.toUpperCase()?first.toLocaleLowerCase('es').replace(/^./,x=>x.toLocaleUpperCase('es')):first;
        const time=al.startsAt?al.startsAt.slice(11,16):'';
        const msg=`Hola, ${name}. Te saludamos de Touché Hair Studio. Te recordamos tu cita de ${(al.serviceName||'tu servicio').toLocaleLowerCase('es')}${time?' a las '+time:''}${al.staffName?' con '+al.staffName:''}. ¿Vienes en camino o necesitas reprogramarla?`;
        window.open(whatsappLink(al.clientPhone,msg),'_blank','noopener,noreferrer');
      });
      acts.append(wa);
    } else if(advisoryMatch&&whatsappPhone(extractedPhone)){
      const wa=node('button','Contactar por WhatsApp','tiny-btn message-button');wa.type='button';
      wa.addEventListener('click',()=>{
        const msg='Hola 💕 Te saludamos de Touché Hair Studio. Recibimos tu solicitud de asesoría desde nuestra web y te escribimos para ayudarte.';
        window.open(whatsappLink(extractedPhone,msg),'_blank','noopener,noreferrer');
      });
      acts.append(wa);
    }
    const done=node('button',isArrival?'Marcar vista':'Marcar atendida','tiny-btn primary');done.type='button';
    done.addEventListener('click',async()=>{
      done.disabled=true;
      try{
        await api('/api/alerts/'+encodeURIComponent(al.id)+'/resolve',{method:'POST',body:'{}'});
        adminAlerts=adminAlerts.filter(x=>x.id!==al.id);
        renderAdminAlerts();
      }catch(e){message(e.message,true);done.disabled=false;}
    });
    acts.append(done);
    item.append(info,acts);
    panel.append(item);
  }
}

async function loadAdminAlerts(){
  if(!store.isAdmin())return;
  try{
    const data=await api('/api/alerts?status=unread');
    adminAlerts=data.alerts||[];
    renderAdminAlerts();
    window.dispatchEvent(new CustomEvent('touche:admin-alerts',{detail:{alerts:adminAlerts}}));
  }catch{}
}

function shiftIsoDate(ymd,deltaDays){
  const d=new Date(ymd+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+deltaDays);
  return d.toISOString().slice(0,10);
}

function syncQuickDayButtons(){
  const t=today(),tmrw=shiftIsoDate(t,1);
  $('agenda-day-today')?.classList.toggle('is-active',date===t);
  $('agenda-day-tomorrow')?.classList.toggle('is-active',date===tmrw);
}

function renderMyBanner(){
  const banner=$('agenda-my-banner');
  const sw=$('agenda-view-switch');
  if(!banner||!sw)return;
  const isStylist=store.isStylist();
  if($('agenda-title'))$('agenda-title').textContent=isStylist?'Mi agenda del día':'Agenda del salón';
  if($('agenda-subtitle'))$('agenda-subtitle').textContent=isStylist
    ?'Tu panel paso a paso: marca tu llegada, revisa tus clientas y confirma cada atención con un toque.'
    :'Panel visual del salón: horarios del equipo, orden de llegada y confirmaciones por WhatsApp.';
  if($('agenda-empty-text'))$('agenda-empty-text').textContent=isStylist
    ?'No tienes citas programadas para este día. Puedes revisar «Mañana» arriba o actualizar tu perfil.'
    :'Agenda una clienta con el botón «+ Agendar clienta» para organizar servicios, tiempos y especialista.';

  const me=getMyStaff();
  if(!me){banner.hidden=true;sw.hidden=true;return;}
  banner.replaceChildren();
  const dayAll=appointments.filter(a=>a.startsAt.startsWith(date));
  if(me.canHoldAppointments){
    sw.hidden=isStylist;
    if(isStylist)agendaScope='mine';
    syncScopeUI();
    const st=staffDayStatus(me,date);
    const sh=dailyShifts.find(s=>s.staffId===me.id);
    const myDay=dayAll.filter(a=>a.staffId===me.id);
    const myPending=myDay.filter(a=>a.status==='scheduled').length;
    const myDone=myDay.filter(a=>a.status==='completed').length;
    const myTotal=myPending+myDone;

    const head=node('div',undefined,'my-banner-top');
    const left=node('div',undefined,'my-banner-intro');
    left.append(
      node('span',ROLE_LABELS[me.role]||me.role,'my-role-pill'),
      node('strong',`Hola, ${me.shortName||me.displayName} 👋`),
      node('p',st.working
        ?(myPending?`Tienes ${myPending} cita${myPending===1?'':'s'} pendiente${myPending===1?'':'s'} hoy. Sigue los botones grandes en cada tarjeta.`:'Aún no tienes citas pendientes para este día.')
        :`Este día figura como ${st.reason.toLowerCase()}.`)
    );
    const right=node('div',undefined,'my-banner-actions');
    if(st.working){
      if(sh?.status==='present'){
        right.append(node('span',isStylist?'✅ Llegada registrada hoy':`✅ Tu turno hoy: ${sh.turnOrder}.º lugar`,'arrival-confirmed-pill'));
      }else{
        const btn=node('button','✅ Marcar mi llegada hoy','primary senior-arrival-btn');btn.type='button';
        btn.addEventListener('click',()=>isStylist?saveMyOwnArrival():saveShiftCheckIn(me.id,'present'));
        right.append(btn);
      }
    }
    const profLink=node('a','🎨 Mis servicios y perfil','outline-button senior-banner-link');
    profLink.href='#perfil';
    right.append(profLink);
    head.append(left,right);
    banner.append(head);

    // 3 visual KPI tiles for quick glanceability
    const kpis=node('div',undefined,'collab-kpi-row');
    for(const [ico,lbl,val,cls] of [
      ['📅','Citas del día',myTotal,''],
      ['⏳','Por atender',myPending,'kpi-amber'],
      ['✅','Realizadas',myDone,'kpi-green']
    ]){
      const tile=node('div',undefined,'collab-kpi-tile '+cls);
      tile.append(node('span',ico+' '+lbl,'collab-kpi-lbl'),node('strong',String(val),'collab-kpi-val'));
      kpis.append(tile);
    }
    banner.append(kpis);
    banner.append(node('small',`✨ Tus servicios habilitados: ${summarizeStaffServices(me)}`,'my-banner-services'));
    banner.hidden=false;
  } else {
    sw.hidden=true;agendaScope='all';
    const salonPending=dayAll.filter(a=>a.status==='scheduled').length;
    const salonConfirmed=dayAll.filter(a=>a.status==='scheduled'&&a.confirmationStatus==='confirmed').length;
    const salonDone=dayAll.filter(a=>a.status==='completed').length;

    const head=node('div',undefined,'my-banner-top');
    const left=node('div',undefined,'my-banner-intro');
    left.append(
      node('span','Recepción · Panel del salón','my-role-pill'),
      node('strong',`Hola, ${me.shortName||me.displayName} 👋`),
      node('p','Puedes ver toda la agenda del salón, marcar llegadas del equipo, confirmar citas por WhatsApp y agendar clientas.')
    );
    head.append(left);
    banner.append(head);

    const kpis=node('div',undefined,'collab-kpi-row');
    for(const [ico,lbl,val,cls] of [
      ['📅','Programadas',salonPending,''],
      ['✅','Confirmadas',salonConfirmed,'kpi-green'],
      ['🎉','Realizadas',salonDone,'kpi-amber']
    ]){
      const tile=node('div',undefined,'collab-kpi-tile '+cls);
      tile.append(node('span',ico+' '+lbl,'collab-kpi-lbl'),node('strong',String(val),'collab-kpi-val'));
      kpis.append(tile);
    }
    banner.append(kpis);
    banner.hidden=false;
  }
}

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
  if(store.isStylist()||!staff.length){bar.hidden=true;return;}
  bar.hidden=false;
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
  if(store.isStylist()){bar.hidden=true;return;}
  const working=staff.filter(s=>s.active&&s.canHoldAppointments&&staffDayStatus(s,date).working);
  bar.hidden=!working.length;
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
    dailyShifts=res.shifts;renderShiftsBar();renderMyBanner();message('Orden de llegada actualizado.');
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
    dailyShifts=res.shifts;renderShiftsBar();renderMyBanner();message('Prioridad de turno actualizada.');
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
  const isStylist=store.isStylist();
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
  if(a.status==='scheduled'&&a.arrivalStatus==='arrived')tags.append(node('span','Clienta llegó','mini-tag arrival-arrived'));
  else if(a.status==='scheduled'&&a.arrivalStatus==='not_arrived')tags.append(node('span','No llegó · Alerta enviada','mini-tag danger'));
  if(!isStylist){
    tags.append(node('span',a.assignmentMode==='pool_turn'?'Por turno':'Solicitada','mini-tag'));
    const svc=services.find(s=>s.id===a.serviceId);
    const cap=a.staffId&&svc?resolveCap(a.staffId,svc):null;
    if(cap==='plan_b')tags.append(node('span','Apoyo temporal','mini-tag warn'));
    if(cap==='junior')tags.append(node('span','Colorista junior','mini-tag soft'));
    if(a.rescheduleCount>0)tags.append(node('span',`Reprogramada ${a.rescheduleCount} ${a.rescheduleCount===1?'vez':'veces'}`,'mini-tag warn'));
    if(a.clientNoShows>0)tags.append(node('span',`${a.clientNoShows} inasistencia${a.clientNoShows===1?'':'s'}`,'mini-tag danger'));
    if(!whatsappPhone(a.clientPhone))tags.append(node('span','Falta celular','mini-tag warn'));
  }
  if(tags.childNodes.length)body.append(tags);
  if(a.notes)body.append(node('p',a.notes,'appointment-note'));
  if(a.cancelReason&&(a.status==='cancelled'||a.status==='no_show'))body.append(node('small','Motivo: '+a.cancelReason));
  card.append(body);

  const actions=node('div',undefined,'appt-card-actions senior-appt-actions');
  if(a.status==='scheduled'){
    if(isStylist){
      const arrivedBtn=node('button',a.arrivalStatus==='arrived'?'✓ Clienta llegó':'✅ Clienta llegó','senior-appt-btn arrival-arrived-btn'+(a.arrivalStatus==='arrived'?' is-active':''));
      arrivedBtn.type='button';
      arrivedBtn.disabled=a.arrivalStatus==='arrived';
      arrivedBtn.addEventListener('click',async()=>{
        arrivedBtn.disabled=true;
        try{
          await api('/api/appointments/'+a.id+'/arrival',{method:'POST',body:JSON.stringify({status:'arrived'})});
          message(`Asistencia registrada: ${a.clientName} llegó.`);
          await load();
        }catch(e){message(e.message,true);arrivedBtn.disabled=false;}
      });

      const missedBtn=node('button','⚠️ No llegó','senior-appt-btn arrival-missed-btn');
      missedBtn.type='button';
      missedBtn.addEventListener('click',async()=>{
        missedBtn.disabled=true;
        try{
          await api('/api/appointments/'+a.id+'/arrival',{method:'POST',body:JSON.stringify({status:'not_arrived'})});
          message('Alerta enviada a Administración: la clienta no llegó.');
          await load();
        }catch(e){message(e.message,true);missedBtn.disabled=false;}
      });

      const remBtn=node('button','🔔 Pedir recordatorio','senior-appt-btn message-button');
      remBtn.type='button';
      remBtn.addEventListener('click',async()=>{
        remBtn.disabled=true;
        try{
          await api('/api/appointments/'+a.id+'/alert-reminder',{method:'POST',body:'{}'});
          message('Solicitud de recordatorio enviada a Administración.');
        }catch(e){message(e.message,true);}
        finally{remBtn.disabled=false;}
      });

      const comp=node('button','🎉 Marcar realizada','senior-appt-btn');comp.type='button';
      if(Date.parse(a.endsAt)>Date.now()){comp.disabled=true;comp.title='Disponible al finalizar la hora de la cita.';}
      comp.addEventListener('click',()=>confirmAction(a,'complete'));
      actions.append(arrivedBtn,missedBtn,remBtn,comp);
    } else {
      if(!a.staffId){
        const assignBtn=node('button','⚡ Asignar por llegada','primary senior-appt-btn');assignBtn.type='button';
        assignBtn.addEventListener('click',async()=>{
          assignBtn.disabled=true;
          try{const r=await api('/api/agenda/assign-turn',{method:'POST',body:JSON.stringify({appointmentId:a.id})});message(`Asignada a ${r.assigned.shortName}${r.assigned.turnOrder?' (turno '+r.assigned.turnOrder+')':''}.`);await load();}
          catch(e){message(e.message,true);assignBtn.disabled=false;}
        });
        actions.append(assignBtn);
      }
      if(whatsappPhone(a.clientPhone)){
        for(const [moment,label] of [['day_before','📅 Recordar (día antes)'],['same_day','💬 Recordar (hoy)']]){
          const wa=node('button',label,'senior-appt-btn message-button');wa.type='button';
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
        const conf=node('button','✅ Confirmó','senior-appt-btn');conf.type='button';
        conf.addEventListener('click',async()=>{try{await api('/api/appointments/'+a.id+'/confirm',{method:'POST',body:'{}'});await load();}catch(e){message(e.message,true);}});
        actions.append(conf);
      }
      const edit=node('button','🔄 Reprogramar','senior-appt-btn');edit.type='button';
      edit.addEventListener('click',()=>openEditor(a));actions.append(edit);
      const comp=node('button','🎉 Realizada','senior-appt-btn');comp.type='button';
      if(Date.parse(a.endsAt)>Date.now()){comp.disabled=true;comp.title='Disponible al finalizar la hora de la cita.';}
      comp.addEventListener('click',()=>confirmAction(a,'complete'));actions.append(comp);
      const ns=node('button','No asistió','senior-appt-btn');ns.type='button';
      ns.addEventListener('click',()=>confirmAction(a,'no-show'));actions.append(ns);
      const cancel=node('button','Cancelar','senior-appt-btn danger-outline');cancel.type='button';
      cancel.addEventListener('click',()=>confirmAction(a,'cancel'));actions.append(cancel);
    }
  } else if(a.status!=='completed'&&!isStylist){
    const rebook=node('button','🔄 Reprogramar','senior-appt-btn');rebook.type='button';
    rebook.addEventListener('click',()=>openEditor(a));actions.append(rebook);
  }
  if(actions.childNodes.length)card.append(actions);
  return card;
}

function render(){
  initScopeIfNeeded();
  syncQuickDayButtons();
  calendar();$('agenda-date').value=date;$('agenda-day-title').textContent=fmtDay(date);
  renderMyBanner();renderTeamBar();renderShiftsBar();
  const isStylist=store.isStylist();
  const me=getMyStaff();
  const onlyMine=isStylist||(agendaScope==='mine'&&me&&me.canHoldAppointments);
  const dayRows=appointments.filter(a=>a.startsAt.startsWith(date));
  const active=dayRows.filter(a=>a.status==='scheduled');
  const confirmed=active.filter(a=>a.confirmationStatus==='confirmed').length;
  const done=dayRows.filter(a=>a.status==='completed').length;
  const noShows=dayRows.filter(a=>a.status==='no_show').length;
  if(onlyMine&&me){
    const myActive=active.filter(a=>a.staffId===me.id);
    const myDone=dayRows.filter(a=>a.staffId===me.id&&a.status==='completed').length;
    $('agenda-day-count').textContent=isStylist
      ?`Tus citas: ${myActive.length} programada${myActive.length===1?'':'s'} · ${myDone} realizada${myDone===1?'':'s'}`
      :`Tus citas: ${myActive.length} programada${myActive.length===1?'':'s'} · ${myDone} realizada${myDone===1?'':'s'} · Salón total: ${active.length}`;
  } else {
    $('agenda-day-count').textContent=`${active.length} programada${active.length===1?'':'s'} (${confirmed} confirm.) · ${done} realizadas${noShows?` · ${noShows} no asistió`:''}`;
  }

  const rows=dayRows.filter(matchesFilter);
  const allPool=isStylist?[]:rows.filter(a=>!a.staffId);
  const poolRows=onlyMine&&me?allPool.filter(a=>{const svc=services.find(s=>s.id===a.serviceId);return !svc||!!resolveCap(me.id,svc);}):allPool;
  const poolLane=$('agenda-pool-lane');poolLane.replaceChildren();
  poolLane.hidden=isStylist||poolRows.length===0;
  if(!isStylist&&poolRows.length){
    poolLane.append(node('h3',onlyMine?`Citas por turno que puedes atender (${poolRows.length})`:`Por asignar según orden de llegada (${poolRows.length})`));
    const wrap=node('div',undefined,'pool-cards');
    for(const a of poolRows)wrap.append(buildAppointmentCard(a));
    poolLane.append(wrap);
  }

  const board=$('agenda-board');board.replaceChildren();
  let columns=[];
  if(onlyMine){
    columns=me?[me]:[];
  } else {
    const workingStaff=staff.filter(s=>s.active&&s.canHoldAppointments&&staffDayStatus(s,date).working);
    const assignedStaffIds=new Set(rows.filter(a=>a.staffId).map(a=>a.staffId));
    columns=[...workingStaff];
    for(const m of staff){if(assignedStaffIds.has(m.id)&&!columns.some(c=>c.id===m.id))columns.push(m);}
  }

  const visibleRows=onlyMine&&me?rows.filter(a=>a.staffId===me.id||poolRows.includes(a)):rows;
  const hasAny=visibleRows.length>0||columns.length>0;
  $('agenda-empty').hidden=visibleRows.length>0;
  board.hidden=!hasAny;

  for(const col of columns){
    const colEl=node('section',undefined,'staff-column'+(me&&col.id===me.id?' my-column':''));
    const st=staffDayStatus(col,date);
    const sh=dailyShifts.find(s=>s.staffId===col.id&&s.status==='present');
    const head=node('header',undefined,'staff-column-head');
    const prefix=!isStylist&&sh?sh.turnOrder+'.º · ':'';
    head.append(node('h3',`${prefix}${col.shortName||col.displayName}${me&&col.id===me.id?' (Tú)':''}`),node('small',st.working?(ROLE_LABELS[col.role]||'Estilista'):`No labora (${st.reason})`));
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
    render();
    if(location.hash==='#equipo')renderTeamPage();
    message('Agenda al día.');
    window.dispatchEvent(new CustomEvent('touche:agenda-updated',{detail:{appointments,date}}));
    if(pendingOpenNewAppointment&&preferences){
      pendingOpenNewAppointment=false;
      openEditor();
    }
  }catch(e){if(current===loadId)message(e.message,true);}
  finally{
    if(current===loadId){
      loading=false;
      $('agenda-refresh').disabled=false;
      $('agenda-new').disabled=!preferences;
    }
  }
}

let apptClientMatches=[],apptClientActiveIdx=-1;

function advanceToStep(stepId,focusId=null){
  const stepEl=$(stepId);
  if(!stepEl)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  stepEl.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});
  stepEl.classList.remove('step-highlight');
  void stepEl.offsetWidth;
  stepEl.classList.add('step-highlight');
  setTimeout(()=>stepEl.classList.remove('step-highlight'),1200);
  if(focusId){
    const target=$(focusId);
    if(target&&!target.disabled&&!target.hidden){
      setTimeout(()=>{try{target.focus({preventScroll:true});}catch{target.focus();}},reduced?0:180);
    }
  }
}

function hideClientSuggestions(){
  const list=$('appointment-client-suggestions');
  if(list)list.hidden=true;
  $('appointment-search')?.setAttribute('aria-expanded','false');
  apptClientActiveIdx=-1;
}

function selectAppointmentClient(client,{advance=false}={}){
  if(!client){
    $('appointment-client').value='';
    $('appointment-search').value='';
    $('appointment-search').classList.remove('is-selected');
    $('appointment-client-clear').hidden=true;
    renderClientContext('');
    return;
  }
  $('appointment-client').value=client.id;
  $('appointment-search').value=client.name;
  $('appointment-search').classList.add('is-selected');
  $('appointment-client-clear').hidden=false;
  hideClientSuggestions();
  renderClientContext(client.id);
  if(advance)advanceToStep('appt-step-service','appointment-service');
}

function highlightClientSuggestion(){
  const list=$('appointment-client-suggestions');
  if(!list)return;
  const btns=list.querySelectorAll('[role=option]');
  btns.forEach((b,i)=>b.setAttribute('aria-selected',String(i===apptClientActiveIdx)));
  if(apptClientActiveIdx>=0&&btns[apptClientActiveIdx])btns[apptClientActiveIdx].scrollIntoView({block:'nearest'});
}

function showClientSuggestions(query=''){
  const list=$('appointment-client-suggestions');
  if(!list)return;
  const q=clean(query).trim();
  const digits=q.replace(/\D/g,'');
  let matches=clients;
  if(q){
    matches=clients.filter(c=>clean(c.name).includes(q)||String(c.dni||'').includes(q)||(digits&&String(c.phone||'').replace(/\D/g,'').includes(digits)));
  }
  apptClientMatches=matches.slice(0,12);
  apptClientActiveIdx=-1;
  list.replaceChildren();

  if(!apptClientMatches.length){
    list.append(node('div','No encontramos esa clienta. Puedes crear su ficha abajo.','no-suggestions'));
  } else {
    apptClientMatches.forEach((c,i)=>{
      const b=node('button');b.type='button';b.role='option';b.id='appt-client-opt-'+i;b.tabIndex=-1;b.setAttribute('aria-selected','false');
      const ini=String(c.name||'C').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'C';
      b.append(node('span',ini,'avatar'));
      const desc=node('span',undefined,'suggestion-text');
      desc.append(
        node('strong',c.name),
        node('small',(c.phone||'Sin teléfono')+(c.dni?' · DNI ····'+c.dni.slice(-4):' · DNI pendiente'))
      );
      b.append(desc);
      b.addEventListener('pointerdown',e=>e.preventDefault());
      b.addEventListener('click',()=>selectAppointmentClient(c,{advance:true}));
      list.append(b);
    });
    if(matches.length>apptClientMatches.length){
      list.append(node('div',`Mostrando ${apptClientMatches.length} de ${matches.length} · Escribe más letras para filtrar`,'no-suggestions'));
    }
  }

  const addNew=node('button','+ Crear nueva clienta','suggestion-add-btn');
  addNew.type='button';
  addNew.addEventListener('pointerdown',e=>e.preventDefault());
  addNew.addEventListener('click',()=>{hideClientSuggestions();window.dispatchEvent(new Event('touche:create-client'));});
  list.append(addNew);

  list.hidden=false;
  $('appointment-search')?.setAttribute('aria-expanded','true');
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
  const eligible=svc?candidates.filter(c=>c.cap):candidates;
  const available=eligible.filter(c=>c.ok);
  const excluded=svc?candidates.filter(c=>!c.cap):[];
  const recBox=$('appointment-recommendation');
  if(recBox){
    recBox.replaceChildren();
    if(!svc){
      recBox.hidden=true;
    } else {
      recBox.hidden=false;
      recBox.className='appt-recommendation'+(available.length?'':' warn');
      if(available.length){
        const best=available[0];
        recBox.append(node('strong',`Recomendada por especialidad: ${best.m.displayName} (${CAP_LABELS[best.cap]||'Disponible'}${best.turn?` · ${best.turn}.º turno`:''})`));
        const whoText=`Disponibles para ${svc.name}: ${available.map(c=>c.m.shortName||c.m.displayName).join(', ')}.`+(excluded.length?` No realizan este servicio: ${excluded.map(c=>c.m.shortName||c.m.displayName).join(', ')}.`:'');
        recBox.append(node('small',whoText));
        const actions=node('div',undefined,'appt-rec-actions');
        const pickBest=node('button','Elegir recomendada','primary tiny-btn');pickBest.type='button';pickBest.id='appointment-pick-best';
        pickBest.addEventListener('click',()=>{
          const reqRadio=document.querySelector('input[name=assignmentMode][value=requested]');
          if(reqRadio)reqRadio.checked=true;
          select.required=true;select.value=best.m.id;
          $('appointment-staff-hint').textContent=`Seleccionada: ${best.m.displayName} (recomendada para ${svc.name}).`;
          advanceToStep('appt-step-notes','appointment-save');
        });
        const pickRand=node('button','Elegir al azar entre disponibles','tiny-btn');pickRand.type='button';pickRand.id='appointment-pick-random';
        pickRand.addEventListener('click',()=>{
          const reqRadio=document.querySelector('input[name=assignmentMode][value=requested]');
          if(reqRadio)reqRadio.checked=true;
          const pool=available.length>1?available.filter(c=>c.m.id!==select.value):available;
          const chosen=pool[Math.floor(Math.random()*pool.length)]||available[0];
          select.required=true;select.value=chosen.m.id;
          $('appointment-staff-hint').textContent=available.length===1
            ?`Solo ${chosen.m.displayName} está disponible y habilitada para ${svc.name} en este horario.`
            :`Elegida al azar entre especialistas de ${svc.name}: ${chosen.m.displayName} (${CAP_LABELS[chosen.cap]||'Disponible'}).`;
        });
        actions.append(pickBest,pickRand);
        recBox.append(actions);
      } else if(eligible.length){
        recBox.append(
          node('strong',`Sin especialistas libres para ${svc.name} en este horario`),
          node('small',`Quienes realizan este servicio: ${eligible.map(c=>`${c.m.shortName||c.m.displayName} (${c.why})`).join(' · ')}. Prueba otra hora o día.`)
        );
      } else {
        recBox.append(
          node('strong',`Nadie tiene habilitado ${svc.name} todavía`),
          node('small','Puedes asignar esta especialidad en la sección Colaboradoras.')
        );
      }
    }
  }
  const availCount=available.length;
  $('appointment-staff-hint').textContent=svc
    ?(availCount?`${availCount} colaboradora${availCount===1?'':'s'} habilitada${availCount===1?'':'s'} disponible${availCount===1?'':'s'} en este horario.`:'Ninguna colaboradora habilitada libre en este horario.')
    :'Elige primero un servicio para filtrar por especialidad y disponibilidad.';
}

function openEditor(a=null){
  if(!preferences||loading)return;
  if(Array.isArray(store.clients)&&store.clients.length){
    const byId=new Map(clients.map(c=>[c.id,c]));
    for(const sc of store.clients){
      if(!byId.has(sc.id))clients.push({id:sc.id,name:sc.name,dni:sc.dni||'',phone:sc.phone||'',lastVisit:sc.lastVisit||null,lastService:null,lastTechNote:null,noShowCount:0});
      else{const cur=byId.get(sc.id);cur.name=sc.name;cur.dni=sc.dni||cur.dni;cur.phone=sc.phone||cur.phone;}
    }
  }
  editingAppointment=a;
  $('appointment-client-status').textContent='Si aún no tiene ficha, créala aquí y sigue con la cita.';
  $('appointment-form').reset();$('appointment-error').hidden=true;
  $('appointment-id').value=a?.id||'';
  $('appointment-title').textContent=a?'Reprogramar / Editar cita':'Agendar clienta';
  $('appointment-reschedule-wrap').hidden=!a;
  $('appointment-reschedule-reason').value='';
  hideClientSuggestions();
  const initialClient=a?.clientId?clients.find(c=>c.id===a.clientId)||null:null;
  selectAppointmentClient(initialClient,{advance:false});

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
  $('appointment-editor').showModal();
  const bodyEl=$('appointment-editor').querySelector('.editor-body');
  if(bodyEl)bodyEl.scrollTop=0;
  if(!initialClient){$('appointment-search').focus();}
  else {$('appointment-service').focus();}
}

function updateServiceHint(){
  const s=services.find(x=>x.id===$('appointment-service').value);
  if(!s){$('appointment-service-hint').textContent='';return;}
  const range=s.durationMinutes?(s.durationMaxMinutes&&s.durationMaxMinutes!==s.durationMinutes?`${s.durationMinutes}–${s.durationMaxMinutes} min`:`${s.durationMinutes} min`):'Duración libre (confirmar según largo/densidad)';
  $('appointment-service-hint').textContent=`Referencia confirmada: ${range}.`;
}

$('appointment-search').addEventListener('focus',()=>{
  if(!$('appointment-client').value)showClientSuggestions($('appointment-search').value);
});
$('appointment-search').addEventListener('input',debounce(()=>{
  const curId=$('appointment-client').value;
  const curClient=curId?clients.find(c=>c.id===curId):null;
  if(!curClient||$('appointment-search').value.trim()!==curClient.name){
    $('appointment-client').value='';
    $('appointment-search').classList.remove('is-selected');
    $('appointment-client-clear').hidden=true;
    renderClientContext('');
  }
  showClientSuggestions($('appointment-search').value);
},120));
$('appointment-search').addEventListener('keydown',e=>{
  const list=$('appointment-client-suggestions');
  if(e.key==='Escape'){if(!list.hidden){e.preventDefault();hideClientSuggestions();}return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    if(list.hidden)showClientSuggestions($('appointment-search').value);
    if(!apptClientMatches.length)return;
    apptClientActiveIdx=(apptClientActiveIdx+(e.key==='ArrowDown'?1:-1)+apptClientMatches.length)%apptClientMatches.length;
    highlightClientSuggestion();
    return;
  }
  if(e.key==='Enter'&&!list.hidden){
    e.preventDefault();
    const chosen=apptClientActiveIdx>=0?apptClientMatches[apptClientActiveIdx]:(apptClientMatches.length===1?apptClientMatches[0]:null);
    if(chosen)selectAppointmentClient(chosen,{advance:true});
  }
});
$('appointment-search').addEventListener('blur',e=>{
  if(!$('appointment-client-suggestions').contains(e.relatedTarget))hideClientSuggestions();
});
$('appointment-client-clear').addEventListener('click',()=>{
  selectAppointmentClient(null,{advance:false});
  $('appointment-search').focus();
  showClientSuggestions('');
});
$('appointment-new-client').addEventListener('click',()=>window.dispatchEvent(new Event('touche:create-client')));
window.addEventListener('touche:agenda-client-closed',event=>{
  if(!$('appointment-editor').open)return;
  const client=event.detail?.client;
  if(client){
    clients=clients.filter(c=>c.id!==client.id);
    const added={...client,lastVisit:null,lastService:null,lastTechNote:null,noShowCount:0};
    clients.push(added);
    selectAppointmentClient(added,{advance:true});
    $('appointment-client-status').textContent='Clienta creada y seleccionada. Continúa eligiendo el servicio.';
  } else {
    $('appointment-client-status').textContent='Puedes continuar con la cita.';
    $('appointment-search').focus();
  }
});

$('appointment-service').addEventListener('change',()=>{
  const s=services.find(x=>x.id===$('appointment-service').value);
  if(s?.durationMinutes&&!editingAppointment)$('appointment-duration').value=s.durationMinutes;
  else if(s?.durationMinutes&&!$('appointment-duration').value)$('appointment-duration').value=s.durationMinutes;
  updateServiceHint();updateEndPreview();refreshStaffOptions();
  if(s)advanceToStep('appt-step-when','appointment-time');
});
for(const button of document.querySelectorAll('[data-duration]'))button.addEventListener('click',()=>{
  $('appointment-duration').value=button.dataset.duration;
  updateEndPreview();refreshStaffOptions();
  advanceToStep('appt-step-staff',$('appointment-pick-best')?'appointment-pick-best':'appointment-staff');
});
$('appointment-add-eval').addEventListener('click',()=>{const cur=Number($('appointment-duration').value)||0;$('appointment-duration').value=Math.min(600,cur+20);updateEndPreview();refreshStaffOptions();});
$('appointment-date').addEventListener('change',()=>{updateEndPreview();refreshStaffOptions();advanceToStep('appt-step-when','appointment-time');});
$('appointment-time').addEventListener('change',()=>{
  updateEndPreview();refreshStaffOptions();
  if(/^\d{2}:\d{2}$/.test($('appointment-time').value)){
    if(!$('appointment-duration').value)advanceToStep('appt-step-duration','appointment-duration');
    else advanceToStep('appt-step-staff',$('appointment-pick-best')?'appointment-pick-best':'appointment-staff');
  }
});
$('appointment-duration').addEventListener('change',()=>{
  updateEndPreview();refreshStaffOptions();
  if(Number($('appointment-duration').value)>=5)advanceToStep('appt-step-staff',$('appointment-pick-best')?'appointment-pick-best':'appointment-staff');
});
$('appointment-staff').addEventListener('change',()=>{
  if($('appointment-staff').value)advanceToStep('appt-step-notes','appointment-save');
});
for(const r of document.querySelectorAll('input[name=assignmentMode]'))r.addEventListener('change',()=>{
  refreshStaffOptions();
  if(r.value==='pool_turn'&&r.checked)advanceToStep('appt-step-notes','appointment-save');
});

$('appointment-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=$('appointment-save');if(b.disabled)return;$('appointment-error').hidden=true;
  if(!$('appointment-client').value){
    $('appointment-error').textContent='Busca y elige una clienta de la lista (o crea una nueva).';
    $('appointment-error').hidden=false;
    advanceToStep('appt-step-client','appointment-search');
    showClientSuggestions($('appointment-search').value);
    return;
  }
  b.disabled=true;
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
let pendingDeleteStaff=null,editingStaffMember=null;
let staffCatMap=new Map(),staffOvrMap=new Map(),staffSelectedCat='';

function staffInitials(name){
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
  return parts.length?parts.slice(0,2).map(x=>x[0]).join('').toUpperCase():'+';
}

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

function syncStaffRolePills(role){
  $('staff-edit-role').value=role;
  for(const b of document.querySelectorAll('[data-staff-role]')){
    const sel=b.dataset.staffRole===role;
    b.classList.toggle('selected',sel);
    b.setAttribute('aria-pressed',String(sel));
  }
  const isRec=role==='reception';
  $('staff-edit-holds').checked=!isRec;
  $('staff-capabilities-section').hidden=isRec;
}

function syncStaffRestPills(restVal){
  const str=restVal===null||restVal===undefined?'':String(restVal);
  $('staff-edit-rest').value=str;
  for(const b of document.querySelectorAll('[data-staff-rest]')){
    const sel=b.dataset.staffRest===str;
    b.classList.toggle('selected',sel);
    b.setAttribute('aria-pressed',String(sel));
  }
}

function defaultStaffCapLevel(){
  return $('staff-edit-role').value==='junior_stylist_assistant'?'junior':'primary';
}

function renderStaffActiveChips(){
  const box=$('staff-active-chips');if(!box)return;
  box.replaceChildren();
  const svcById=new Map(services.map(s=>[s.id,s]));
  let count=0;
  for(const [cat,lvl] of [...staffCatMap.entries()].sort((a,b)=>a[0].localeCompare(b[0],'es'))){
    count++;
    const chip=node('span',undefined,'profile-tag-chip'+(lvl==='plan_b'?' warn':lvl==='junior'?' soft':''));
    chip.append(node('span',lvl==='primary'?cat:`${cat} · ${CAP_LABELS[lvl]||lvl}`));
    const rm=node('button','×','chip-rm');rm.type='button';rm.title=`Quitar ${cat}`;
    rm.addEventListener('click',()=>{staffCatMap.delete(cat);renderStaffCapEditor();});
    chip.append(rm);box.append(chip);
  }
  for(const [sid,lvl] of staffOvrMap.entries()){
    const svc=svcById.get(sid);if(!svc)continue;
    count++;
    const isOff=lvl==='disabled';
    const chip=node('span',undefined,'profile-tag-chip'+(isOff?' danger':' soft'));
    chip.append(node('span',isOff?`No realiza: ${svc.name}`:`${svc.name}${lvl!=='primary'?` (${CAP_LABELS[lvl]||lvl})`:''}`));
    const rm=node('button','×','chip-rm');rm.type='button';rm.title=`Quitar ${svc.name}`;
    rm.addEventListener('click',()=>{staffOvrMap.delete(sid);renderStaffCapEditor();});
    chip.append(rm);box.append(chip);
  }
  if(!count)box.append(node('span','Sin servicios seleccionados. Usa una plantilla rápida o toca una categoría abajo.','field-help'));
}

function renderStaffCatPanel(){
  const q=clean($('staff-svc-filter')?.value||'').trim();
  const allCatSvcs=services.filter(s=>s.category===staffSelectedCat);
  const shown=q?allCatSvcs.filter(s=>clean(s.name).includes(q)):allCatSvcs;
  const catLvl=staffCatMap.get(staffSelectedCat)||'';
  $('staff-cat-title').textContent=`${staffSelectedCat} (${allCatSvcs.length})`;
  for(const b of document.querySelectorAll('[data-cat-lvl]')){
    const sel=b.dataset.catLvl===catLvl;
    b.classList.toggle('selected',sel);
    b.setAttribute('aria-pressed',String(sel));
  }
  $('staff-cat-hint').textContent=catLvl
    ?`Realiza toda la categoría ${staffSelectedCat}. Toca un servicio abajo si deseas excluirlo.`
    :`Toca los servicios puntuales de ${staffSelectedCat} que realiza, o elige arriba «Titular / Junior / Apoyo temporal».`;
  const wrap=$('staff-cat-services');wrap.replaceChildren();
  if(!shown.length){wrap.append(node('span','Sin coincidencias en esta categoría.','field-help'));return;}
  for(const s of shown){
    const ovr=staffOvrMap.get(s.id);
    const active=ovr?ovr!=='disabled':!!catLvl;
    const btn=node('button',undefined,'service-tag-btn'+(active?' active':'')+(ovr==='disabled'?' excluded':''));
    btn.type='button';btn.setAttribute('aria-pressed',String(active));
    const suffix=ovr==='disabled'?' (excluido)':(ovr&&ovr!=='primary'?` · ${CAP_LABELS[ovr]}`:'');
    btn.textContent=(active?'✓ ':'+ ')+s.name+suffix;
    btn.addEventListener('click',()=>{
      if(catLvl){
        if(ovr==='disabled')staffOvrMap.delete(s.id);
        else staffOvrMap.set(s.id,'disabled');
      } else {
        if(ovr&&ovr!=='disabled')staffOvrMap.delete(s.id);
        else staffOvrMap.set(s.id,defaultStaffCapLevel());
      }
      renderStaffCapEditor();
    });
    wrap.append(btn);
  }
}

function renderStaffCapEditor(){
  renderStaffActiveChips();
  const bar=$('staff-cat-menubar');if(!bar)return;
  bar.replaceChildren();
  const cats=catalogCategories();
  if(!staffSelectedCat||!cats.includes(staffSelectedCat))staffSelectedCat=cats[0];
  for(const cat of cats){
    const catSvcs=services.filter(s=>s.category===cat);
    const hasCat=staffCatMap.has(cat);
    const activeCount=hasCat?catSvcs.length:catSvcs.filter(s=>staffOvrMap.has(s.id)&&staffOvrMap.get(s.id)!=='disabled').length;
    const btn=node('button',undefined,'cat-menu-btn'+(cat===staffSelectedCat?' current':'')+(activeCount>0?' has-tags':''));
    btn.type='button';btn.setAttribute('aria-pressed',String(cat===staffSelectedCat));
    btn.append(node('span',cat));
    if(activeCount>0)btn.append(node('small',String(activeCount),'cat-menu-badge'));
    btn.addEventListener('click',()=>{staffSelectedCat=cat;if($('staff-svc-filter'))$('staff-svc-filter').value='';renderStaffCapEditor();});
    bar.append(btn);
  }
  renderStaffCatPanel();
}

function openStaffEditor(member=null){
  editingStaffMember=member;
  $('staff-editor-form').reset();
  $('staff-editor-error').hidden=true;
  $('staff-edit-id').value=member?.id||'';
  $('staff-editor-top-label').textContent=member?'Editar ficha de colaboradora':'Nueva colaboradora';
  $('staff-editor-title').textContent=member?member.displayName:'Agregar colaboradora';
  $('staff-editor-avatar').textContent=member?staffInitials(member.displayName):'+';
  $('staff-edit-name').value=member?.displayName||'';
  $('staff-edit-short').value=member?.shortName||'';
  $('staff-edit-summary').value=member?.specialtySummary||'';
  syncStaffRolePills(member?.role||'stylist');
  syncStaffRestPills(member?member.restWeekday:'');
  $('staff-edit-holds').checked=member?!!member.canHoldAppointments:$('staff-edit-role').value!=='reception';
  $('staff-capabilities-section').hidden=!$('staff-edit-holds').checked;
  if($('staff-svc-filter'))$('staff-svc-filter').value='';
  if($('staff-editor-retire'))$('staff-editor-retire').hidden=!member;

  staffCatMap=new Map(member?categoryCaps.filter(c=>c.staffId===member.id).map(c=>[c.category,c.capabilityLevel]):[]);
  staffOvrMap=new Map(member?serviceOverrides.filter(o=>o.staffId===member.id).map(o=>[o.serviceId,o.capabilityLevel]):[]);
  const cats=catalogCategories();
  staffSelectedCat=cats.find(c=>staffCatMap.has(c))||cats[0]||'';
  renderStaffCapEditor();

  $('staff-editor-save').textContent=member?'Guardar cambios':'Agregar colaboradora';
  $('staff-editor-save').disabled=false;
  $('staff-editor-modal').showModal();
  const bodyEl=$('staff-editor-modal').querySelector('.editor-body');
  if(bodyEl)bodyEl.scrollTop=0;
  $('staff-edit-name').focus();
}

function openStaffDelete(member){
  pendingDeleteStaff=member;
  $('staff-delete-desc').textContent=`¿Deseas retirar a ${member.displayName} del equipo activo?`;
  $('staff-delete-error').hidden=true;
  $('staff-delete-confirm').disabled=false;
  $('staff-delete-modal').showModal();
}

function setTeamStatus(msg){
  if($('team-page-status'))$('team-page-status').textContent=msg;
}

function renderDurationsInto(listEl,rawQuery,statusEl){
  if(!listEl)return;
  const q=clean(rawQuery||'').trim();
  listEl.replaceChildren();
  const filtered=services.filter(s=>!q||clean(s.name).includes(q)||clean(s.category).includes(q)).slice(0,30);
  if(!filtered.length){
    listEl.append(node('p','No encontramos servicios con ese nombre.','field-help'));
    return;
  }
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
        if(statusEl)statusEl.textContent=`Duración actualizada: ${s.name}.`;
        setTeamStatus(`Duración actualizada: ${s.name}.`);
      }catch(e){if(statusEl)statusEl.textContent=e.message;}
      finally{btn.disabled=false;}
    });
    row.append(minI,maxI,btn);listEl.append(row);
  }
}

function renderTeamPage(){
  const grid=$('team-page-grid');
  if(!grid)return;
  grid.replaceChildren();
  const inWrap=$('team-inactive-wrap'),inGrid=$('team-inactive-grid');
  if(inGrid)inGrid.replaceChildren();
  const q=clean($('team-search')?.value||'').trim();
  const matchesMember=m=>{
    if(!q)return true;
    const rest=m.restWeekday===null||m.restWeekday===undefined?'':WEEKDAYS[m.restWeekday];
    const hay=`${m.displayName} ${m.shortName} ${ROLE_LABELS[m.role]||m.role} ${rest} ${m.specialtySummary||''} ${summarizeStaffServices(m)}`;
    return clean(hay).includes(q);
  };
  const actives=staff.filter(m=>m.active&&matchesMember(m));
  const inactives=staff.filter(m=>!m.active&&matchesMember(m));
  const ini=name=>String(name||'T').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'T';

  if(!actives.length){
    grid.append(node('p',q?'No encontramos colaboradoras con ese filtro.':'Aún no hay colaboradoras activas.','field-help'));
  }

  actives.forEach((m,i)=>{
    const card=node('article',undefined,'team-member-card');
    const head=node('div',undefined,'team-card-head');
    head.append(node('span',ini(m.displayName),'avatar tone-'+(i%5)));
    const titleBox=node('div');
    titleBox.append(
      node('strong',`${m.displayName}${m.shortName&&m.shortName!==m.displayName?` (${m.shortName})`:''}`),
      node('small',`${ROLE_LABELS[m.role]||m.role} · ${m.restWeekday===null||m.restWeekday===undefined?'Sin descanso fijo':'Descansa '+WEEKDAYS[m.restWeekday]}`)
    );
    head.append(titleBox);
    card.append(head);

    if(m.specialtySummary)card.append(node('p',m.specialtySummary,'team-card-summary'));

    const chips=node('div',undefined,'team-cap-chips');
    if(!m.canHoldAppointments){
      chips.append(node('span','No atiende citas en agenda','mini-tag soft'));
    } else {
      const cats=categoryCaps.filter(c=>c.staffId===m.id);
      const ovrs=serviceOverrides.filter(o=>o.staffId===m.id);
      for(const c of cats){
        const cls=c.capabilityLevel==='plan_b'?'mini-tag warn':c.capabilityLevel==='junior'?'mini-tag soft':'mini-tag';
        const lbl=c.capabilityLevel==='primary'?c.category:`${c.category} (${CAP_LABELS[c.capabilityLevel]||c.capabilityLevel})`;
        chips.append(node('span',lbl,cls));
      }
      for(const o of ovrs){
        const svc=services.find(s=>s.id===o.serviceId);
        const sName=svc?svc.name:o.serviceId;
        if(o.capabilityLevel==='disabled')chips.append(node('span',`Sin ${sName}`,'mini-tag danger'));
        else chips.append(node('span',`+ ${sName}${o.capabilityLevel!=='primary'?` (${CAP_LABELS[o.capabilityLevel]||o.capabilityLevel})`:''}`,'mini-tag soft'));
      }
      if(!cats.length&&!ovrs.length)chips.append(node('span','Sin servicios asignados aún','mini-tag warn'));
    }
    card.append(chips);

    const actions=node('div',undefined,'team-card-actions');
    const editBtn=node('button','✏️ Editar y servicios','outline-button senior-team-btn');editBtn.type='button';
    editBtn.addEventListener('click',()=>openStaffEditor(m));
    const delBtn=node('button','Retirar','senior-team-btn danger-outline');delBtn.type='button';
    delBtn.addEventListener('click',()=>openStaffDelete(m));
    actions.append(editBtn,delBtn);
    card.append(actions);
    grid.append(card);
  });

  if(inWrap&&inGrid){
    inWrap.hidden=inactives.length===0;
    for(const m of inactives){
      const card=node('article',undefined,'team-member-card inactive');
      const head=node('div',undefined,'team-card-head');
      head.append(node('span',ini(m.displayName),'avatar'));
      const titleBox=node('div');
      titleBox.append(node('strong',m.displayName),node('small',`${ROLE_LABELS[m.role]||m.role} · Retirada del equipo activo`));
      head.append(titleBox);
      card.append(head);
      const actions=node('div',undefined,'team-card-actions');
      const restoreBtn=node('button','Reactivar en el equipo','outline-button tiny-btn');restoreBtn.type='button';
      restoreBtn.addEventListener('click',async()=>{
        restoreBtn.disabled=true;
        try{
          await api('/api/staff/'+encodeURIComponent(m.id),{method:'PATCH',body:JSON.stringify({active:true})});
          await load();renderTeamPage();
          setTeamStatus(`${m.displayName} volvió al equipo activo.`);
        }catch(e){setTeamStatus(e.message);restoreBtn.disabled=false;}
      });
      actions.append(restoreBtn);
      card.append(actions);
      inGrid.append(card);
    }
  }
  renderDurationsInto($('team-duration-list'),$('team-duration-search')?.value||'',$('team-page-status'));
}

$('team-add-btn')?.addEventListener('click',()=>openStaffEditor(null));
$('team-search')?.addEventListener('input',debounce(renderTeamPage,120));
$('team-duration-search')?.addEventListener('input',debounce(()=>renderDurationsInto($('team-duration-list'),$('team-duration-search').value,$('team-page-status')),150));
$('staff-edit-name')?.addEventListener('input',()=>{
  const val=$('staff-edit-name').value.trim();
  $('staff-editor-avatar').textContent=staffInitials(val);
  if(!editingStaffMember)$('staff-editor-title').textContent=val||'Agregar colaboradora';
});
for(const b of document.querySelectorAll('[data-staff-role]'))b.addEventListener('click',()=>syncStaffRolePills(b.dataset.staffRole));
for(const b of document.querySelectorAll('[data-staff-rest]'))b.addEventListener('click',()=>syncStaffRestPills(b.dataset.staffRest));
$('staff-edit-holds').addEventListener('change',()=>{$('staff-capabilities-section').hidden=!$('staff-edit-holds').checked;});
for(const b of document.querySelectorAll('[data-cat-lvl]'))b.addEventListener('click',()=>{
  if(!staffSelectedCat)return;
  const val=b.dataset.catLvl;
  if(val)staffCatMap.set(staffSelectedCat,val);
  else staffCatMap.delete(staffSelectedCat);
  for(const s of services.filter(x=>x.category===staffSelectedCat)){
    if(val&&staffOvrMap.get(s.id)!=='disabled')staffOvrMap.delete(s.id);
    if(!val&&staffOvrMap.get(s.id)==='disabled')staffOvrMap.delete(s.id);
  }
  renderStaffCapEditor();
});
$('staff-svc-filter')?.addEventListener('input',debounce(renderStaffCatPanel,120));
for(const b of document.querySelectorAll('[data-staff-preset]'))b.addEventListener('click',()=>{
  const p=b.dataset.staffPreset,lvl=defaultStaffCapLevel(),cats=new Set(catalogCategories());
  staffOvrMap.clear();
  if(p==='clear'){staffCatMap.clear();}
  else if(p==='color_treat'){
    staffCatMap.clear();
    for(const c of ['COLOR','TRATAMIENTO','ASESORÍA'])if(cats.has(c))staffCatMap.set(c,lvl);
  } else if(p==='full_stylist'){
    staffCatMap.clear();
    for(const c of ['COLOR','CORTE','QUÍMICO','PEINADO','TRATAMIENTO','ASESORÍA'])if(cats.has(c))staffCatMap.set(c,lvl);
  } else if(p==='nails_depil'){
    staffCatMap.clear();
    for(const c of ['MANOS / PIES','DEPILACION'])if(cats.has(c))staffCatMap.set(c,'primary');
  }
  renderStaffCapEditor();
});
$('staff-editor-retire')?.addEventListener('click',()=>{
  if(!editingStaffMember)return;
  const m=editingStaffMember;
  $('staff-editor-modal').close();
  openStaffDelete(m);
});
for(const id of ['staff-editor-close','staff-editor-cancel'])$(id).addEventListener('click',()=>$('staff-editor-modal').close());
$('staff-delete-cancel').addEventListener('click',()=>$('staff-delete-modal').close());

$('staff-editor-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('staff-editor-save');btn.disabled=true;$('staff-editor-error').hidden=true;
  const id=$('staff-edit-id').value;
  const canHold=$('staff-edit-holds').checked;
  const categories=canHold?[...staffCatMap.entries()].map(([category,capabilityLevel])=>({category,capabilityLevel})):[];
  const serviceOverridesPayload=canHold?[...staffOvrMap.entries()].map(([serviceId,capabilityLevel])=>({serviceId,capabilityLevel})):[];
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
    await load();renderTeamPage();
    setTeamStatus(shared.length
      ?`Guardado. Aviso: comparte día de descanso con ${shared.join(', ')}.`
      :(id?'Colaboradora y servicios actualizados.':'Nueva colaboradora agregada al equipo.'));
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
    await load();renderTeamPage();
    setTeamStatus(res.message||'Colaboradora retirada del equipo.');
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

$('agenda-team-btn').addEventListener('click',()=>{location.hash='#equipo';});
$('agenda-exception-btn').addEventListener('click',()=>{renderExceptionModal();$('exception-modal').showModal();});
for(const id of ['exception-modal-close','exception-cancel'])$(id).addEventListener('click',()=>$('exception-modal').close());
for(const id of ['appointment-close','appointment-cancel'])$(id).addEventListener('click',()=>$('appointment-editor').close());
$('agenda-confirm-close').addEventListener('click',()=>$('agenda-confirm').close());
$('agenda-new').addEventListener('click',()=>openEditor());$('agenda-refresh').addEventListener('click',()=>load(true));
$('agenda-date').value=date;$('agenda-date').addEventListener('change',()=>selectDate($('agenda-date').value));
$('agenda-today').addEventListener('click',()=>selectDate(today()));
$('agenda-day-today')?.addEventListener('click',()=>selectDate(today()));
$('agenda-day-tomorrow')?.addEventListener('click',()=>selectDate(shiftIsoDate(today(),1)));
$('agenda-day-prev')?.addEventListener('click',()=>selectDate(shiftIsoDate(date,-1)));
$('agenda-day-next')?.addEventListener('click',()=>selectDate(shiftIsoDate(date,1)));
for(const [id,delta] of [['agenda-prev',-1],['agenda-next',1]])$(id).addEventListener('click',()=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);selectDate(d.toISOString().slice(0,10));});
for(const btn of document.querySelectorAll('[data-agenda-filter]'))btn.addEventListener('click',()=>{
  activeFilter=btn.dataset.agendaFilter;
  document.querySelectorAll('[data-agenda-filter]').forEach(b=>{b.classList.toggle('selected',b===btn);b.setAttribute('aria-pressed',String(b===btn));});
  render();
});
for(const btn of document.querySelectorAll('[data-agenda-scope]'))btn.addEventListener('click',()=>{
  agendaScope=btn.dataset.agendaScope;
  scopeInitialized=true;
  syncScopeUI();
  render();
});
$('agenda-day-notes').addEventListener('input',()=>{noteDirty=true;$('agenda-note-status').textContent='Cambios sin guardar';});
$('agenda-save-notes').addEventListener('click',async()=>{const b=$('agenda-save-notes'),savedDate=date,notes=$('agenda-day-notes').value;b.disabled=true;try{await api('/api/agenda/notes',{method:'PATCH',body:JSON.stringify({date:savedDate,notes})});if(date===savedDate&&$('agenda-day-notes').value===notes){noteDirty=false;$('agenda-note-status').textContent='Notas guardadas.';}}catch(e){if(date===savedDate)$('agenda-note-status').textContent=e.message;}finally{b.disabled=false;}});
$('agenda-hours-form').addEventListener('submit',async e=>{e.preventDefault();const b=$('agenda-save-hours');b.disabled=true;try{preferences=await api('/api/agenda/preferences',{method:'PATCH',body:JSON.stringify({openTime:$('agenda-open').value,closeTime:$('agenda-close').value,weekdays:[...document.querySelectorAll('[data-agenda-weekday]:checked')].map(x=>Number(x.value))})});message('Horario guardado. Se aplicará a las próximas citas.');const hoursTxt=`Horario del salón: ${preferences.openTime} a ${preferences.closeTime}`;$('agenda-hours-label').textContent=hoursTxt;if($('agenda-hours-readonly'))$('agenda-hours-readonly').textContent=hoursTxt;}catch(e){message(e.message,true);}finally{b.disabled=false;}});
$('admin-alerts-btn')?.addEventListener('click',()=>{
  if(location.hash!=='#agenda')location.hash='#agenda';
  setTimeout(()=>$('admin-alerts-panel')?.scrollIntoView({behavior:'smooth',block:'nearest'}),120);
});
window.addEventListener('beforeunload',e=>{if(noteDirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('touche:open-new-appointment',()=>{
  if(store.isStylist())return;
  if(preferences&&!loading){openEditor();}
  else{pendingOpenNewAppointment=true;if(!loading)load();}
});
window.addEventListener('touche:data-changed',()=>{bootstrapped=false;});
window.addEventListener('touche:profile-updated',()=>{bootstrapped=false;if(location.hash==='#agenda'||location.hash==='#equipo')load(true);});
window.addEventListener('touche:session-ready',()=>{
  if(store.isAdmin())loadAdminAlerts();
  else renderAdminAlerts();
  if(staff.length){scopeInitialized=false;render();if(location.hash==='#equipo')renderTeamPage();}
});
window.addEventListener('hashchange',()=>{
  if(location.hash==='#agenda'){load();if(store.isAdmin())loadAdminAlerts();}
  else if(location.hash==='#equipo'){if(bootstrapped)renderTeamPage();load();}
});
if(location.hash==='#agenda')load();
else if(location.hash==='#equipo')load();
if(store.isAdmin())loadAdminAlerts();
setInterval(()=>{
  if(!document.hidden&&!loading&&location.hash==='#agenda'&&!$('appointment-editor')?.open&&!$('staff-editor-modal')?.open&&!$('exception-modal')?.open){
    load(false);
  }
},60000);
setInterval(()=>{
  if(!document.hidden&&store.isAdmin())loadAdminAlerts();
},20000);
