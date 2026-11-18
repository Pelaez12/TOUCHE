import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const origin='http://127.0.0.1:5188',created={clients:[],appointments:[]};
const save=()=>writeFile(new URL('../data/agenda-test-created.json',import.meta.url),JSON.stringify(created));
async function request(path,method='GET',body){const r=await fetch(origin+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
try{
  const baseline=await request('/api/history');assert.equal(baseline.status,200);
  const before=baseline.body.events.length,serviceId=baseline.body.services[0].id;
  assert.equal((await request('/api/clients','POST',{name:'QA agenda sintética sin DNI'})).status,400);
  const existing=(await request('/api/clients')).body.clients;
  const docs=['00000001','00000002'];assert(!existing.some(c=>docs.includes(c.dni)),'DNI de prueba ya usado; no modificar datos existentes.');
  for(let n=0;n<2;n++){const r=await request('/api/clients','POST',{name:'QA agenda sintética '+n,dni:docs[n]});assert.equal(r.status,201);created.clients.push(r.body.id);await save();}
  assert.equal((await request('/api/clients','POST',{name:'QA DNI repetido',dni:docs[0]})).status,409);
  assert.equal((await request('/api/clients/'+created.clients[1],'PATCH',{name:'QA agenda sintética 1',dni:docs[0]})).status,409);
  assert.equal((await request('/api/clients/'+created.clients[0],'PATCH',{name:'QA agenda sintética 0'})).status,200);
  assert.equal((await request('/api/clients')).body.clients.find(c=>c.id===created.clients[0]).dni,docs[0]);
  const appointment={clientId:created.clients[0],serviceId,date:'2026-10-26',time:'09:00',duration:20,assignee:'QA responsable sintético',notes:'Prueba sintética; retirar después de verificar.'};
  async function create(input){const r=await request('/api/appointments','POST',input);if(r.status===201){created.appointments.push(r.body.id);await save();}return r;}
  let r=await create(appointment);assert.equal(r.status,201);const first=r.body.id;
  assert.equal((await create({...appointment,time:'09:10'})).status,409);
  assert.equal((await create({...appointment,clientId:created.clients[1],time:'09:10'})).status,409);
  assert.equal((await create({...appointment,time:'18:50'})).status,400);
  assert.equal((await create({...appointment,date:'2026-11-01'})).status,400);
  r=await create({...appointment,time:'09:20'});assert.equal(r.status,201);const second=r.body.id;
  assert.equal((await request('/api/appointments/'+second,'PATCH',{...appointment,time:'10:00'})).status,200);
  assert.equal((await request('/api/appointments/'+second+'/cancel','POST',{})).status,200);
  assert.equal((await request('/api/history')).body.events.length,before);
  assert.equal((await request('/api/appointments/'+first+'/complete','POST',{})).status,200);
  assert.equal((await request('/api/appointments/'+first+'/complete','POST',{})).status,409);
  assert.equal((await request('/api/history')).body.events.length,before+1);
  r=await create({...appointment,date:'2030-01-07'});assert.equal(r.status,201);
  assert.equal((await request('/api/appointments/'+r.body.id+'/complete','POST',{})).status,400);
  assert.equal((await request('/api/agenda?date=2026-10-26')).body.appointments.filter(a=>created.appointments.includes(a.id)).length,2);
  await request('/api/clients/'+created.clients[1],'DELETE');assert.equal((await request('/api/clients','POST',{name:'QA DNI eliminado',dni:docs[1]})).status,409);
  console.log(JSON.stringify({verified:true,syntheticClients:2,syntheticAppointments:3,duplicateDni:'409',overlap:'409',cancelDoesNotCreateHistory:true,completionCreatesOnce:true,futureCompletionBlocked:true}));
}finally{await save();}
