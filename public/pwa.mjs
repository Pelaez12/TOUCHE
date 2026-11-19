import {store} from './store.mjs';

const $=id=>document.getElementById(id);
const node=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
let deferredInstallPrompt=null;
let swRegistration=null;
let knownSalonApptIds=null;
let latestSalonNotifs={today:'',todayCount:0,appointments:[]};

const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;

function showToast(msg){
  if(!$('toast')||!$('toast-text'))return;
  $('toast-text').textContent=msg;
  $('toast').hidden=false;
  setTimeout(()=>$('toast').hidden=true,5000);
}

let audioCtx=null;
function ensureAudio(){
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return null;
    if(!audioCtx)audioCtx=new Ctx();
    if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
    return audioCtx;
  }catch{return null;}
}
for(const ev of ['pointerdown','keydown'])window.addEventListener(ev,()=>{ensureAudio();},{passive:true,once:true});

function playSalonChime(kind='appointment'){
  try{
    if(navigator.vibrate){
      navigator.vibrate(kind==='alert'?[150,80,150]:kind==='arrival'?[90,50,90]:[80]);
    }
  }catch{}
  const ctx=ensureAudio();
  if(!ctx)return;
  try{
    const now=ctx.currentTime+0.02;
    const patterns={
      // Campana cálida de bienvenida (llegó estilista)
      arrival:[
        {f:523.25,t:0,d:0.24,g:0.13},
        {f:659.25,t:0.11,d:0.26,g:0.14},
        {f:783.99,t:0.22,d:0.32,g:0.15},
        {f:1046.5,t:0.34,d:0.55,g:0.13}
      ],
      // Aviso claro de atención (clienta no llegó / recordatorio)
      alert:[
        {f:880,t:0,d:0.20,g:0.15},
        {f:698.46,t:0.16,d:0.20,g:0.14},
        {f:880,t:0.34,d:0.36,g:0.16}
      ],
      // Campana suave de nueva cita en el salón
      appointment:[
        {f:783.99,t:0,d:0.22,g:0.12},
        {f:1046.5,t:0.14,d:0.42,g:0.13}
      ]
    };
    const notes=patterns[kind]||patterns.appointment;
    for(const n of notes){
      const osc=ctx.createOscillator(),overtone=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(n.f,now+n.t);
      overtone.type='triangle';overtone.frequency.setValueAtTime(n.f*2,now+n.t);
      const ovGain=ctx.createGain();ovGain.gain.setValueAtTime(0.18,now+n.t);
      gain.gain.setValueAtTime(0.0001,now+n.t);
      gain.gain.exponentialRampToValueAtTime(n.g,now+n.t+0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+n.t+n.d);
      osc.connect(gain);overtone.connect(ovGain);ovGain.connect(gain);gain.connect(ctx.destination);
      osc.start(now+n.t);overtone.start(now+n.t);
      osc.stop(now+n.t+n.d+0.02);overtone.stop(now+n.t+n.d+0.02);
    }
  }catch{}
}

async function sendNativeNotification(title,body,tag='touche-agenda',chimeKind=null){
  if(chimeKind)playSalonChime(chimeKind);
  if(typeof Notification==='undefined'||Notification.permission!=='granted')return false;
  const vibrate=chimeKind==='alert'?[150,80,150]:chimeKind==='arrival'?[90,50,90]:[80];
  const opts={body,icon:'/brand/icon-192.png',badge:'/brand/icon-192.png',tag,silent:false,vibrate,data:{url:'/#agenda'}};
  try{
    const reg=swRegistration||(navigator.serviceWorker?await navigator.serviceWorker.ready.catch(()=>null):null);
    if(reg&&typeof reg.showNotification==='function'){
      await reg.showNotification(title,opts);
      return true;
    }
    new Notification(title,opts);
    return true;
  }catch{
    return false;
  }
}

function updateNotifButton(){
  const btn=$('notif-btn');if(!btn)return;
  if(typeof Notification==='undefined'){btn.hidden=true;return;}
  btn.hidden=false;
  if(Notification.permission==='granted'){
    btn.textContent='Avisos activos';
    btn.classList.add('notif-active');
    btn.title='Pulsa para enviar un aviso de prueba a tu celular o navegador';
  }else if(Notification.permission==='denied'){
    btn.textContent='Avisos bloqueados';
    btn.classList.remove('notif-active');
    btn.title='Habilita las notificaciones en la configuración de tu navegador';
  }else{
    btn.textContent='Activar avisos';
    btn.classList.remove('notif-active');
    btn.title='Recibe avisos de citas próximas y turnos asignados';
  }
}

function updateInstallButton(){
  const btn=$('install-app-btn');if(!btn)return;
  if(isStandalone()){btn.hidden=true;return;}
  if(deferredInstallPrompt){
    btn.hidden=false;
    btn.textContent='Instalar app';
  }else if(isIOS()){
    btn.hidden=false;
    btn.textContent='Instalar en iPhone';
  }else{
    btn.hidden=true;
  }
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(reg=>{swRegistration=reg;}).catch(()=>{});
  });
}

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  updateInstallButton();
});

window.addEventListener('appinstalled',()=>{
  deferredInstallPrompt=null;
  updateInstallButton();
  showToast('Touché ya quedó instalada en tu dispositivo.');
});

$('install-app-btn')?.addEventListener('click',async()=>{
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    const choice=await deferredInstallPrompt.userChoice.catch(()=>null);
    if(choice?.outcome==='accepted')showToast('Instalando Touché en tu pantalla de inicio…');
    deferredInstallPrompt=null;
    updateInstallButton();
  }else if(isIOS()){
    $('ios-install-modal')?.showModal();
  }
});

for(const id of ['ios-install-close','ios-install-ok'])$(id)?.addEventListener('click',()=>$('ios-install-modal')?.close());

$('notif-btn')?.addEventListener('click',async()=>{
  if(typeof Notification==='undefined')return;
  if(Notification.permission==='denied'){
    showToast('Los avisos están bloqueados en este navegador. Actívalos desde el candado de la barra de direcciones.');
    return;
  }
  if(Notification.permission==='granted'){
    const sent=await sendNativeNotification('Touché Hair Studio','Avisos y sonido especial funcionando correctamente en tu dispositivo.','touche-test-'+Date.now(),'arrival');
    showToast(sent?'Aviso y sonido de prueba enviados a tu dispositivo.':'Sonido de prueba reproducido.');
    return;
  }
  const perm=await Notification.requestPermission();
  updateNotifButton();
  if(perm==='granted'){
    await sendNativeNotification('Touché Hair Studio','Avisos y sonido especial activados para citas y llegadas del salón.','touche-welcome','arrival');
    showToast('Avisos y sonido activados en tu dispositivo.');
  }else{
    showToast('No se activaron los avisos. Puedes intentarlo cuando gustes.');
  }
});

function formatApptDay(dayStr,todayStr){
  if(dayStr===todayStr)return 'Hoy';
  return new Intl.DateTimeFormat('es-PE',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(dayStr+'T12:00:00Z'));
}

function renderSalonNotifsModal(){
  const list=$('salon-notifs-list'),status=$('salon-notifs-status');
  if(!list)return;
  list.replaceChildren();
  const appts=latestSalonNotifs.appointments||[];
  const todayStr=latestSalonNotifs.today||new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
  if(status){
    status.textContent=appts.length
      ?`${latestSalonNotifs.todayCount} cita${latestSalonNotifs.todayCount===1?'':'s'} hoy · ${appts.length} en los próximos 14 días.`
      :'No hay citas próximas agendadas en este momento.';
  }
  if(!appts.length){
    list.append(node('p','Cuando se agende una nueva cita en el salón, todas recibirán el aviso aquí y en su dispositivo.','field-help'));
    return;
  }
  for(const a of appts){
    const dayStr=a.startsAt.slice(0,10);
    const timeRange=`${a.startsAt.slice(11,16)} – ${a.endsAt.slice(11,16)}`;
    const card=node('article',undefined,'salon-notif-card'+(dayStr===todayStr?' is-today':''));
    const top=node('div',undefined,'salon-notif-top');
    top.append(
      node('strong',`${formatApptDay(dayStr,todayStr)} · ${timeRange}`),
      node('span',`Atiende: ${a.staffName||'Por asignar'}`,'mini-tag')
    );
    card.append(top,node('h4',a.clientName),node('p',a.serviceName,'salon-notif-svc'));
    list.append(card);
  }
}

function processSalonNotifications(data){
  latestSalonNotifs=data||{today:'',todayCount:0,appointments:[]};
  const appts=latestSalonNotifs.appointments||[];
  const todayStr=latestSalonNotifs.today||new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
  const cntEl=$('salon-notifs-count');
  if(cntEl)cntEl.textContent=String(appts.length);
  if($('salon-notifs-modal')?.open)renderSalonNotifsModal();

  // Notificar a TODAS las integrantes del equipo sobre TODAS las citas agendadas del salón
  const currentIds=new Set(appts.map(a=>a.id));
  if(knownSalonApptIds!==null){
    for(const a of appts){
      if(!knownSalonApptIds.has(a.id)){
        const dayLbl=formatApptDay(a.startsAt.slice(0,10),todayStr);
        const time=a.startsAt.slice(11,16);
        const who=a.staffName?` · Atiende: ${a.staffName}`:'';
        const title=`Nueva cita: ${a.clientName} · ${a.serviceName}`;
        const body=`${dayLbl} a las ${time}${who}`;
        sendNativeNotification(title,body,'touche-salon-new-'+a.id,'appointment');
        showToast(`${title} (${dayLbl} ${time}${who})`);
      }
    }
  }
  knownSalonApptIds=currentIds;

  // Recordatorio de llegada próxima (1 a 20 min) para todo el salón
  const nowMs=Date.now();
  for(const a of appts){
    if(!a.startsAt.startsWith(todayStr))continue;
    const diffMin=Math.round((Date.parse(a.startsAt)-nowMs)/60000);
    if(diffMin>=1&&diffMin<=20){
      const key='touche_salon_soon_'+a.id;
      if(!sessionStorage.getItem(key)){
        sessionStorage.setItem(key,'1');
        const who=a.staffName?` · Atiende: ${a.staffName}`:'';
        const title=`En ${diffMin} min: ${a.clientName} · ${a.serviceName}`;
        const body=`Hoy a las ${a.startsAt.slice(11,16)}${who}`;
        sendNativeNotification(title,body,'touche-salon-soon-'+a.id,'appointment');
        showToast(`${title} (${a.startsAt.slice(11,16)}${who})`);
      }
    }
  }
}

async function fetchSalonNotifications(){
  if(!store.user)return;
  try{
    const r=await fetch('/api/agenda/notifications');
    if(!r.ok)return;
    const data=await r.json();
    processSalonNotifications(data);
  }catch{}
}

const seenAdminAlertIds=new Set();
let adminAlertsPrimed=false;

function handleAdminAlerts(detail){
  if(!store.isAdmin())return;
  const alerts=(detail?.alerts||[]).filter(a=>a.status==='unread');
  for(const al of alerts){
    if(seenAdminAlertIds.has(al.id))continue;
    seenAdminAlertIds.add(al.id);
    if(adminAlertsPrimed||!sessionStorage.getItem('touche_alert_notified_'+al.id)){
      sessionStorage.setItem('touche_alert_notified_'+al.id,'1');
      const isArrival=al.kind==='staff_arrived';
      const whoSvc=[al.clientName,al.serviceName].filter(Boolean).join(' · ');
      const chime=isArrival?'arrival':'alert';
      sendNativeNotification(al.title||'ALERTA: No llegó el cliente — Recordarle',al.message||whoSvc||'Revisa la agenda de Administración.','touche-alert-'+al.id,chime);
      showToast(isArrival?`${al.title}`:`${al.title}${whoSvc?`: ${whoSvc}`:''}`);
    }
  }
  adminAlertsPrimed=true;
}

$('salon-notifs-btn')?.addEventListener('click',async()=>{
  renderSalonNotifsModal();
  $('salon-notifs-modal')?.showModal();
  await fetchSalonNotifications();
});
$('salon-notifs-refresh')?.addEventListener('click',()=>fetchSalonNotifications());
for(const id of ['salon-notifs-close','salon-notifs-done'])$(id)?.addEventListener('click',()=>$('salon-notifs-modal')?.close());

window.addEventListener('touche:session-ready',()=>fetchSalonNotifications());
window.addEventListener('touche:agenda-updated',()=>fetchSalonNotifications());
window.addEventListener('touche:admin-alerts',e=>handleAdminAlerts(e.detail));
setInterval(()=>{if(!document.hidden&&store.user)fetchSalonNotifications();},30000);
updateNotifButton();
updateInstallButton();
if(store.user)fetchSalonNotifications();
