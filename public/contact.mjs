export function whatsappPhone(value) {
  const raw=String(value||'').trim();
  if(!raw||!/^[+\d\s().-]+$/.test(raw))return null;
  let digits=raw.replace(/\D/g,'');
  if(/^9\d{8}$/.test(digits))return '51'+digits;
  if(/^519\d{8}$/.test(digits))return digits;
  if(raw.startsWith('00'))digits=digits.slice(2);
  if((raw.startsWith('+')||raw.startsWith('00'))&&/^[1-9]\d{7,14}$/.test(digits)&&!digits.startsWith('51'))return digits;
  return null;
}
export function contactProblem(value){return String(value||'').trim()?'Verificar teléfono y código de país':'Falta teléfono';}
export function inDirectoryGroup(client,group){
  if(group==='archived')return !!client.archivedAt;
  if(client.archivedAt)return false;
  if(group==='active')return !!whatsappPhone(client.phone);
  if(group==='missing')return !whatsappPhone(client.phone);
  return true;
}
export const DEFAULT_MESSAGE='Hola, {nombre}. Te saludamos de Touché Hair Studio. En tu última visita registrada te realizaste {servicio}. Nos encantaría recibirte nuevamente. {promocion}\n¿Te gustaría que coordinemos tu próxima visita?';
export function personalizedMessage(template,client,promotion=''){
  const fullName=String(client.name||'').trim();
  const first=fullName.split(/\s+/)[0]||'hola';
  const name=first===first.toUpperCase()?first.toLocaleLowerCase('es').replace(/^./,x=>x.toLocaleUpperCase('es')):first;
  const values={nombre:name,servicio:(client.lastServices||[]).join(' y ').toLocaleLowerCase('es')||'un servicio en nuestro salón',fecha:client.latestVisit||client.last||'',promocion:promotion.trim()};
  return String(template||DEFAULT_MESSAGE).replace(/\{(nombre|servicio|fecha|promocion)\}/g,(_,key)=>values[key]).replace(/[ \t]+\n/g,'\n').replace(/ {2,}/g,' ').trim();
}
export function whatsappLink(phone,message){
  const normalized=whatsappPhone(phone);if(!normalized)throw Error('Completa o verifica el teléfono antes de abrir WhatsApp.');
  if(!String(message||'').trim())throw Error('Escribe el mensaje antes de abrir WhatsApp.');
  return 'https://wa.me/'+normalized+'?text='+encodeURIComponent(message);
}
export function suggestedAction(row){
  if(!whatsappPhone(row.phone))return {key:'missing',label:'Completar teléfono',description:'Añade o corrige su número antes de contactar.'};
  if(row.uncertain)return {key:'review',label:'Revisar historial',description:'Hay fechas pendientes: confirma la última atención antes de ofrecer un servicio.'};
  if(row.returnedAfterWindow)return {key:'care',label:'Ya registra una visita posterior',description:'Revisar su visita más reciente antes de proponer otra cita.'};
  if(row.returned)return {key:'care',label:'Dar seguimiento',description:'Preguntar cómo le fue y coordinar su próxima visita.'};
  return {key:'contact',label:'Invitar a regresar',description:'Preparar un mensaje con su último servicio registrado.'};
}
