import {store} from './store.mjs';

const $=id=>document.getElementById(id);
let deferredInstallPrompt=null;
let swRegistration=null;
let knownMyApptIds=null;

const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;

function showToast(msg){
  if(!$('toast')||!$('toast-text'))return;
  $('toast-text').textContent=msg;
  $('toast').hidden=false;
  setTimeout(()=>$('toast').hidden=true,5000);
}

async function sendNativeNotification(title,body,tag='touche-agenda'){
  if(typeof Notification==='undefined'||Notification.permission!=='granted')return false;
  const opts={body,icon:'/brand/icon-192.png',badge:'/brand/icon-192.png',tag,data:{url:'/#agenda'}};
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
    const sent=await sendNativeNotification('Touché Hair Studio','Los avisos de agenda están funcionando correctamente en tu dispositivo.','touche-test-'+Date.now());
    showToast(sent?'Aviso de prueba enviado a tu dispositivo.':'Avisos ya están activos.');
    return;
  }
  const perm=await Notification.requestPermission();
  updateNotifButton();
  if(perm==='granted'){
    await sendNativeNotification('Touché Hair Studio','Avisos activados. Te avisaremos antes de tus próximas citas y nuevos turnos.','touche-welcome');
    showToast('Avisos activados en tu dispositivo.');
  }else{
    showToast('No se activaron los avisos. Puedes intentarlo cuando gustes.');
  }
});

function checkUpcomingAndNewAppointments(detail){
  if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
  const appts=detail?.appointments||[];
  const todayStr=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
  const user=store.user;
  const relevant=appts.filter(a=>a.status==='scheduled'&&a.startsAt.startsWith(todayStr)&&(!user?.staffId||a.staffId===user.staffId));
  const currentIds=new Set(relevant.map(a=>a.id));

  if(knownMyApptIds!==null){
    for(const a of relevant){
      if(!knownMyApptIds.has(a.id)){
        const who=a.staffName?` · ${a.staffName}`:'';
        sendNativeNotification('Nueva cita en Touché',`${a.startsAt.slice(11,16)} · ${a.clientName} — ${a.serviceName}${who}`,'touche-new-'+a.id);
      }
    }
  }
  knownMyApptIds=currentIds;

  const nowMs=Date.now();
  for(const a of relevant){
    const diffMin=Math.round((Date.parse(a.startsAt)-nowMs)/60000);
    if(diffMin>=1&&diffMin<=20){
      const key='touche_notified_'+a.id;
      if(!sessionStorage.getItem(key)){
        sessionStorage.setItem(key,'1');
        sendNativeNotification(`Cita en ${diffMin} min · Touché`,`${a.startsAt.slice(11,16)} · ${a.clientName} (${a.serviceName})`,'touche-soon-'+a.id);
      }
    }
  }
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
      sendNativeNotification(al.title||'ALERTA: No llegó el cliente — Recordarle',al.message||'Revisa la agenda de Administración.','touche-alert-'+al.id);
      showToast(`${al.title}: ${al.clientName||'Revisar agenda'}`);
    }
  }
  adminAlertsPrimed=true;
}

window.addEventListener('touche:agenda-updated',e=>checkUpcomingAndNewAppointments(e.detail));
window.addEventListener('touche:admin-alerts',e=>handleAdminAlerts(e.detail));
updateNotifButton();
updateInstallButton();
