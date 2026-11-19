import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {timingSafeEqual as nodeTimingSafeEqual} from 'node:crypto';
import worker from '../worker/index.mjs';
import {resolveCapability} from '../worker/agenda.mjs';

// Polyfill Cloudflare Workers' crypto.subtle.timingSafeEqual when running under Node's test runner
if(typeof crypto.subtle.timingSafeEqual!=='function'){
  crypto.subtle.timingSafeEqual=(a,b)=>nodeTimingSafeEqual(new Uint8Array(a),new Uint8Array(b));
}

function makeAccurateD1(sqlite){
  const makeStmt=(sql,params=[])=>({
    _sql:sql,_params:params,
    bind(...args){return makeStmt(sql,args);},
    async first(){return sqlite.prepare(sql).get(...params)??null;},
    async all(){return {results:sqlite.prepare(sql).all(...params),meta:{changes:0}};},
    async run(){const r=sqlite.prepare(sql).run(...params);return {results:[],meta:{changes:Number(r.changes)}};}
  });
  return {
    prepare(sql){return makeStmt(sql);},
    async batch(stmts){
      const out=[];
      for(const st of stmts){
        const trimmed=st._sql.trim().toUpperCase();
        if(trimmed.startsWith('SELECT')||trimmed.includes('RETURNING')){
          out.push(await st.all());
        } else {
          out.push(await st.run());
        }
      }
      return out;
    }
  };
}

function createMigratedDb(){
  const sqlite=new DatabaseSync(':memory:');
  const migs=[
    '0001_initial.sql','0002_client_management.sql','0003_message_preferences.sql',
    '0004_history_date_reconciliation.sql','0005_client_dni.sql','0006_daily_agenda.sql',
    '0007_evaluation_service.sql','0008_web_access.sql'
  ];
  for(const m of migs)sqlite.exec(readFileSync(new URL('../migrations/'+m,import.meta.url),'utf8'));
  const svcSeed=[
    ['catalog-2','ALISADO CORTO','QUÍMICO',30000],
    ['catalog-13','MANICURE CLASICA','MANOS / PIES',2500],
    ['catalog-24','CORTE DAMA','CORTE',8000],
    ['catalog-26','CEPILLADO CABELLO CORTO','PEINADO',3500],
    ['catalog-31','PEINADO CON ONDAS LARGO','PEINADO',8000],
    ['catalog-40','MAQUILLAJE SOCIAL','MAQUILLAJE',12000],
    ['catalog-41','PEGADO PESTAÑAS','MAQUILLAJE',2500],
    ['catalog-48','BALAYAGE MEDIANO','COLOR',40000],
    ['catalog-60','TINTE RAIZ 1','COLOR',12000],
    ['catalog-62','SHADES BAÑO DE COLOR CORTO','COLOR',15000],
    ['catalog-70','AMPOLLA ACIDIC BONDING','TRATAMIENTO',9000],
    ['catalog-74','TRATAMIENTO ACIDIC BONDING MEDIANO','TRATAMIENTO',15000],
    ['catalog-80','DEPILACION AXILA','DEPILACION',2500]
  ];
  for(const [id,name,cat,price] of svcSeed){
    sqlite.prepare('INSERT INTO services(id,name,category,price_cents,active) VALUES (?,?,?,?,1)').run(id,name,cat,price);
  }
  for(let i=1;i<=4;i++){
    sqlite.prepare('INSERT INTO clients(id,full_name,dni,phone,in_directory) VALUES (?,?,?,?,1)').run('client-'+i,'Clienta '+i,'0000000'+i,'98765432'+i);
  }
  // Seed one of the 4 test appointments to verify 0009 deletes ONLY test appointments with treatment_id IS NULL
  sqlite.prepare("INSERT INTO appointments(id,client_id,service_id,starts_at,ends_at,status,assignee) VALUES ('cc5047d3-af16-4bd5-aef7-ecb76677df58','client-1','catalog-60','2026-11-27T09:00:00-05:00','2026-11-27T11:00:00-05:00','scheduled','colaboradora2')").run();
  sqlite.exec(readFileSync(new URL('../migrations/0009_internal_operations.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0010_internal_accounts.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0011_stylist_alerts_and_profile.sql',import.meta.url),'utf8'));
  return {sqlite,db:makeAccurateD1(sqlite)};
}

async function apiReq(db,path,method='GET',body){
  const env={DB:db,ADMIN_TOKEN:'test-secret'};
  const headers={authorization:'Bearer test-secret'};
  if(body!==undefined)headers['content-type']='application/json';
  const res=await worker.fetch(new Request('https://example.invalid'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
  return {status:res.status,headers:res.headers,body:res.status===304?null:await res.json()};
}

test('0009 migration seeds confirmed staff, rest days, durations, capabilities and cleans test appointments without touching clients',async()=>{
  const {sqlite,db}=createMigratedDb();
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM appointments').get().c,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM clients').get().c,4);
  assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  const boot=await apiReq(db,'/api/agenda?date=2026-11-19&bootstrap=1');
  assert.equal(boot.status,200);
  assert.equal(boot.body.staff.length,5);
  assert.equal(boot.body.clients.length,4);
  const byId=Object.fromEntries(boot.body.staff.map(s=>[s.id,s]));
  assert.equal(byId['staff-milagros'].restWeekday,1);
  assert.equal(byId['staff-miriam'].restWeekday,2);
  assert.equal(byId['staff-maritza'].restWeekday,3);
  assert.equal(byId['staff-martha'].restWeekday,2);
  assert.equal(byId['staff-silvia'].canHoldAppointments,false);

  const svcMap=Object.fromEntries(boot.body.services.map(s=>[s.id,s]));
  assert.equal(svcMap['touche-evaluacion-capilar'].durationMinutes,20);
  assert.equal(svcMap['catalog-70'].durationMinutes,15);
  assert.equal(svcMap['catalog-74'].durationMinutes,35);
  assert.equal(svcMap['catalog-74'].durationMaxMinutes,40);
  assert.equal(svcMap['catalog-24'].durationMinutes,40);
  assert.equal(svcMap['catalog-24'].durationMaxMinutes,60);
  assert.equal(svcMap['catalog-31'].durationMinutes,90);
  assert.equal(svcMap['catalog-60'].durationMinutes,120);
  assert.equal(svcMap['catalog-62'].durationMinutes,90);
  assert.equal(svcMap['catalog-62'].durationMaxMinutes,120);
  assert.equal(svcMap['catalog-48'].durationMinutes,180);
  assert.equal(svcMap['catalog-48'].durationMaxMinutes,240);

  // Capabilities: Martha junior does ALL COLOR (including Balayage); Miriam & Maritza are plan_b on Manicure/Depilacion/Pestañas
  assert.equal(resolveCapability('staff-martha',{id:'catalog-48',category:'COLOR'},boot.body.categoryCapabilities,boot.body.serviceOverrides),'junior');
  assert.equal(resolveCapability('staff-miriam',{id:'catalog-13',category:'MANOS / PIES'},boot.body.categoryCapabilities,boot.body.serviceOverrides),'plan_b');
  assert.equal(resolveCapability('staff-maritza',{id:'catalog-41',category:'MAQUILLAJE'},boot.body.categoryCapabilities,boot.body.serviceOverrides),'plan_b');
  assert.equal(resolveCapability('staff-maritza',{id:'catalog-26',category:'PEINADO'},boot.body.categoryCapabilities,boot.body.serviceOverrides),'primary');
  assert.equal(resolveCapability('staff-maritza',{id:'catalog-31',category:'PEINADO'},boot.body.categoryCapabilities,boot.body.serviceOverrides),null);
  assert.equal(resolveCapability('staff-milagros',{id:'catalog-24',category:'CORTE'},boot.body.categoryCapabilities,boot.body.serviceOverrides),'primary');
  assert.equal(resolveCapability('staff-miriam',{id:'catalog-24',category:'CORTE'},boot.body.categoryCapabilities,boot.body.serviceOverrides),null);
});

test('weekly rest days (Mon=Mili, Tue=Miriam+Martha, Wed=Maritza) and Thursday physical check-in pool_turn order',async()=>{
  const {db}=createMigratedDb();
  // Monday 2026-11-23: Milagros rests
  const monMili=await apiReq(db,'/api/appointments','POST',{clientId:'client-1',serviceId:'catalog-24',staffId:'staff-milagros',assignmentMode:'requested',date:'2026-11-23',time:'10:00',duration:40});
  assert.equal(monMili.status,409);assert.match(monMili.body.error,/descanso/i);

  // Tuesday 2026-11-24: Miriam & Martha rest (Milagros + Maritza = 2 senior active, 0 assistant/junior)
  const tuesMiriam=await apiReq(db,'/api/appointments','POST',{clientId:'client-1',serviceId:'catalog-60',staffId:'staff-miriam',assignmentMode:'requested',date:'2026-11-24',time:'10:00',duration:120});
  assert.equal(tuesMiriam.status,409);assert.match(tuesMiriam.body.error,/descanso/i);
  const tuesMartha=await apiReq(db,'/api/appointments','POST',{clientId:'client-1',serviceId:'catalog-60',staffId:'staff-martha',assignmentMode:'requested',date:'2026-11-24',time:'10:00',duration:120});
  assert.equal(tuesMartha.status,409);assert.match(tuesMartha.body.error,/descanso/i);

  // Wednesday 2026-11-25: Maritza rests
  const wedMaritza=await apiReq(db,'/api/appointments','POST',{clientId:'client-1',serviceId:'catalog-60',staffId:'staff-maritza',assignmentMode:'requested',date:'2026-11-25',time:'10:00',duration:120});
  assert.equal(wedMaritza.status,409);assert.match(wedMaritza.body.error,/descanso/i);

  // Thursday 2026-11-19: Milagros, Miriam, Maritza, Martha all active (4 capable for COLOR).
  const sh=await apiReq(db,'/api/agenda/shifts','PUT',{day:'2026-11-19',shifts:[
    {staffId:'staff-maritza',turnOrder:1,status:'present'},
    {staffId:'staff-milagros',turnOrder:2,status:'present'},
    {staffId:'staff-miriam',turnOrder:3,status:'present'},
    {staffId:'staff-martha',turnOrder:4,status:'present'}
  ]});
  assert.equal(sh.status,200);

  // 4 simultaneous COLOR bookings at 11:00 using pool_turn -> exact arrival order (primary before junior)
  const b1=await apiReq(db,'/api/appointments','POST',{clientId:'client-1',serviceId:'catalog-62',assignmentMode:'pool_turn',date:'2026-11-19',time:'11:00',duration:90});
  assert.equal(b1.status,201);assert.equal(b1.body.staffId,'staff-maritza');
  const b2=await apiReq(db,'/api/appointments','POST',{clientId:'client-2',serviceId:'catalog-62',assignmentMode:'pool_turn',date:'2026-11-19',time:'11:00',duration:90});
  assert.equal(b2.status,201);assert.equal(b2.body.staffId,'staff-milagros');
  const b3=await apiReq(db,'/api/appointments','POST',{clientId:'client-3',serviceId:'catalog-62',assignmentMode:'pool_turn',date:'2026-11-19',time:'11:00',duration:90});
  assert.equal(b3.status,201);assert.equal(b3.body.staffId,'staff-miriam');
  const b4=await apiReq(db,'/api/appointments','POST',{clientId:'client-4',serviceId:'catalog-62',assignmentMode:'pool_turn',date:'2026-11-19',time:'11:00',duration:90});
  assert.equal(b4.status,201);assert.equal(b4.body.staffId,'staff-martha');
});

test('future unassigned pool_turn respects Tuesday 2-stylist COLOR capacity and assigns automatically after physical check-in',async()=>{
  const {db}=createMigratedDb();
  // Tuesday 2026-11-24 has NO check-in yet, and 2 capable stylists for COLOR (Milagros + Maritza)
  const p1=await apiReq(db,'/api/appointments','POST',{clientId:'client-1',serviceId:'catalog-62',assignmentMode:'pool_turn',date:'2026-11-24',time:'10:00',duration:90});
  assert.equal(p1.status,201);assert.equal(p1.body.staffId,null);
  const p2=await apiReq(db,'/api/appointments','POST',{clientId:'client-2',serviceId:'catalog-62',assignmentMode:'pool_turn',date:'2026-11-24',time:'10:00',duration:90});
  assert.equal(p2.status,201);assert.equal(p2.body.staffId,null);
  // 3rd simultaneous COLOR booking exceeds Tuesday capacity (2)
  const p3=await apiReq(db,'/api/appointments','POST',{clientId:'client-3',serviceId:'catalog-62',assignmentMode:'pool_turn',date:'2026-11-24',time:'10:00',duration:90});
  assert.equal(p3.status,409);

  // Now log physical check-in on Tuesday: Milagros 1st, Maritza 2nd, and run assign-turn
  assert.equal((await apiReq(db,'/api/agenda/shifts','PUT',{day:'2026-11-24',shifts:[
    {staffId:'staff-milagros',turnOrder:1,status:'present'},
    {staffId:'staff-maritza',turnOrder:2,status:'present'}
  ]})).status,200);
  const a1=await apiReq(db,'/api/agenda/assign-turn','POST',{appointmentId:p1.body.id});
  assert.equal(a1.status,200);assert.equal(a1.body.assigned.staffId,'staff-milagros');
  const a2=await apiReq(db,'/api/agenda/assign-turn','POST',{appointmentId:p2.body.id});
  assert.equal(a2.status,200);assert.equal(a2.body.assigned.staffId,'staff-maritza');
});

test('reminders (day_before & same_day), confirm, reschedule count, no-show, exceptions CRUD, service durations, and complete with technical notes',async()=>{
  const {sqlite,db}=createMigratedDb();
  const created=await apiReq(db,'/api/appointments','POST',{clientId:'client-1',serviceId:'catalog-60',staffId:'staff-maritza',assignmentMode:'requested',date:'2026-11-26',time:'09:00',duration:120});
  assert.equal(created.status,201);const id=created.body.id;

  // Remind day before & same day, then confirm
  assert.equal((await apiReq(db,`/api/appointments/${id}/remind`,'POST',{moment:'day_before'})).status,200);
  assert.equal((await apiReq(db,`/api/appointments/${id}/remind`,'POST',{moment:'same_day'})).status,200);
  assert.equal((await apiReq(db,`/api/appointments/${id}/confirm`,'POST',{})).status,200);

  // Reschedule increments count and logs event
  const moved=await apiReq(db,`/api/appointments/${id}`,'PATCH',{clientId:'client-1',serviceId:'catalog-60',staffId:'staff-maritza',assignmentMode:'requested',date:'2026-11-26',time:'11:00',duration:120,rescheduleReason:'Clienta pidió más tarde'});
  assert.equal(moved.status,200);
  const events=await apiReq(db,`/api/appointments/${id}/events`);
  assert.equal(events.status,200);
  assert.ok(events.body.events.some(e=>e.eventType==='rescheduled'&&e.note.includes('más tarde')));

  // Urgent leave exception reports affected appointment, and deleting it re-enables the stylist
  const ex=await apiReq(db,'/api/staff/exceptions','POST',{staffId:'staff-maritza',exceptionDate:'2026-11-26',kind:'urgent_leave',reason:'Cita médica'});
  assert.equal(ex.status,201);
  assert.equal(ex.body.affectedAppointments.length,1);
  assert.equal(ex.body.affectedAppointments[0].id,id);
  assert.equal((await apiReq(db,`/api/staff/exceptions/${ex.body.id}`,'DELETE')).status,200);

  // Mark no-show does not create treatment
  const ns=await apiReq(db,`/api/appointments/${id}/no-show`,'POST',{note:'No contestó WhatsApp'});
  assert.equal(ns.status,200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM treatments').get().c,0);

  // Shared rest day allowed with informational warning (Miriam & Martha share Tuesday=2)
  const upd=await apiReq(db,'/api/staff/staff-martha','PATCH',{restWeekday:2});
  assert.equal(upd.status,200);
  assert.ok(upd.body.sharedRestWith.includes('Miriam Pecho'));

  // Service duration editing via PATCH /api/services/:id
  const svcUpd=await apiReq(db,'/api/services/catalog-2','PATCH',{durationMinutes:150,durationMaxMinutes:180});
  assert.equal(svcUpd.status,200);
  assert.equal(sqlite.prepare("SELECT duration_minutes FROM services WHERE id='catalog-2'").get().duration_minutes,150);

  // Future appointment cannot be completed (2028-11-23 is Thursday)
  const fut=await apiReq(db,'/api/appointments','POST',{clientId:'client-2',serviceId:'catalog-60',staffId:'staff-milagros',assignmentMode:'requested',date:'2028-11-23',time:'10:00',duration:120});
  assert.equal(fut.status,201);
  assert.equal((await apiReq(db,`/api/appointments/${fut.body.id}/complete`,'POST',{technicalNotes:'Fórmula 7.1'})).status,400);

  // Past appointment completes with technical notes, creates single treatment, blocks duplicate completion, and surfaces lastTechNote
  const past=await apiReq(db,'/api/appointments','POST',{clientId:'client-2',serviceId:'catalog-60',staffId:'staff-milagros',assignmentMode:'requested',date:'2026-01-15',time:'10:00',duration:120});
  assert.equal(past.status,201);
  const comp=await apiReq(db,`/api/appointments/${past.body.id}/complete`,'POST',{technicalNotes:'Raíz 6.0 + 20 vol, 35 min'});
  assert.equal(comp.status,200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM treatments').get().c,1);
  const tr=sqlite.prepare('SELECT staff_id,technical_notes FROM treatments LIMIT 1').get();
  assert.equal(tr.staff_id,'staff-milagros');
  assert.equal(tr.technical_notes,'Raíz 6.0 + 20 vol, 35 min');
  assert.equal((await apiReq(db,`/api/appointments/${past.body.id}/complete`,'POST',{})).status,409);

  const boot=await apiReq(db,'/api/agenda?date=2026-01-15&bootstrap=1');
  const c2=boot.body.clients.find(c=>c.id==='client-2');
  assert.equal(c2.lastTechNote,'Raíz 6.0 + 20 vol, 35 min');
});

test('static assets support ETag and 304 caching while HTML keeps no-store',async()=>{
  const r1=await worker.fetch(new Request('https://example.invalid/style.css'),{});
  assert.equal(r1.status,200);
  const etag=r1.headers.get('etag');
  assert.ok(etag);
  assert.match(r1.headers.get('cache-control')||'',/max-age=/);
  const r2=await worker.fetch(new Request('https://example.invalid/style.css',{headers:{'if-none-match':etag}}),{});
  assert.equal(r2.status,304);
  const r3=await worker.fetch(new Request('https://example.invalid/style.css',{headers:{'if-none-match':'W/'+etag}}),{});
  assert.equal(r3.status,304);

  const login=await worker.fetch(new Request('https://example.invalid/login'),{});
  assert.equal(login.headers.get('cache-control'),'no-store');
});

test('admin can add, edit, update services/capabilities, retire/reactivate and delete staff dynamically',async()=>{
  const {sqlite,db}=createMigratedDb();

  // 1) Maritza initially cannot do CORTE (catalog-24) -> 409
  const beforeCorte=await apiReq(db,'/api/appointments','POST',{clientId:'client-1',serviceId:'catalog-24',staffId:'staff-maritza',assignmentMode:'requested',date:'2026-11-26',time:'10:00',duration:40});
  assert.equal(beforeCorte.status,409);

  // 2) Maritza learns CORTE -> Admin updates her capabilities -> now CORTE books cleanly!
  const addCap=await apiReq(db,'/api/staff/staff-maritza/capabilities','PUT',{
    categories:[
      {category:'COLOR',capabilityLevel:'primary'},
      {category:'CORTE',capabilityLevel:'primary'}
    ],
    serviceOverrides:[{serviceId:'catalog-26',capabilityLevel:'primary'}]
  });
  assert.equal(addCap.status,200);
  const afterCorte=await apiReq(db,'/api/appointments','POST',{clientId:'client-1',serviceId:'catalog-24',staffId:'staff-maritza',assignmentMode:'requested',date:'2026-11-26',time:'10:00',duration:40});
  assert.equal(afterCorte.status,201);

  // 3) Cannot retire/delete Maritza while she has a scheduled appointment -> 409
  const blockedDel=await apiReq(db,'/api/staff/staff-maritza','DELETE');
  assert.equal(blockedDel.status,409);

  // Cancel that appointment -> Maritza has linked account + appointment history -> DELETE retires (active=0) preserving history!
  assert.equal((await apiReq(db,`/api/appointments/${afterCorte.body.id}/cancel`,'POST',{reason:'Prueba'})).status,200);
  const retired=await apiReq(db,'/api/staff/staff-maritza','DELETE');
  assert.equal(retired.status,200);
  assert.equal(retired.body.archived,true);
  assert.equal(sqlite.prepare("SELECT active FROM staff WHERE id='staff-maritza'").get().active,0);

  // Reactivate Maritza cleanly with partial PATCH
  assert.equal((await apiReq(db,'/api/staff/staff-maritza','PATCH',{active:true})).status,200);
  assert.equal(sqlite.prepare("SELECT active FROM staff WHERE id='staff-maritza'").get().active,1);

  // 4) Admin hires a brand-new Manicurist (POST /api/staff) with primary MANOS / PIES -> she outranks plan_b Miriam & Maritza!
  const created=await apiReq(db,'/api/staff','POST',{
    displayName:'Ana Torres',shortName:'Ana',role:'manicurist',restWeekday:1,canHoldAppointments:true,
    specialtySummary:'Manicure y pedicure especialista',
    categories:[{category:'MANOS / PIES',capabilityLevel:'primary'},{category:'DEPILACION',capabilityLevel:'primary'}]
  });
  assert.equal(created.status,201);
  assert.ok(created.body.sharedRestWith.includes('Milagros Núñez'));

  // Log check-in on Thursday: Miriam 1st, Ana 2nd -> for MANOS / PIES, Ana (primary) MUST be assigned ahead of Miriam (plan_b)!
  assert.equal((await apiReq(db,'/api/agenda/shifts','PUT',{day:'2026-11-19',shifts:[
    {staffId:'staff-miriam',turnOrder:1,status:'present'},
    {staffId:created.body.id,turnOrder:2,status:'present'}
  ]})).status,200);
  const mani=await apiReq(db,'/api/appointments','POST',{clientId:'client-2',serviceId:'catalog-13',assignmentMode:'pool_turn',date:'2026-11-19',time:'14:00',duration:45});
  assert.equal(mani.status,201);
  assert.equal(mani.body.staffId,created.body.id);

  // 5) Brand-new unused staff member is hard-deleted cleanly
  const tempStaff=await apiReq(db,'/api/staff','POST',{displayName:'Prueba Temporal',role:'stylist',restWeekday:null});
  assert.equal(tempStaff.status,201);
  const hardDel=await apiReq(db,'/api/staff/'+tempStaff.body.id,'DELETE');
  assert.equal(hardDel.status,200);
  assert.equal(hardDel.body.deleted,true);
  assert.equal(sqlite.prepare('SELECT id FROM staff WHERE id=?').get(tempStaff.body.id),undefined);
});
