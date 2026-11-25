import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.mjs';

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

const ORIGIN='https://example.invalid';
const LEGACY_ADMIN_KEY='test-initial-admin-key-123';

function createDbWithAccounts(){
  const sqlite=new DatabaseSync(':memory:');
  const migs=[
    '0001_initial.sql','0002_client_management.sql','0003_message_preferences.sql',
    '0004_history_date_reconciliation.sql','0005_client_dni.sql','0006_daily_agenda.sql',
    '0007_evaluation_service.sql','0008_web_access.sql'
  ];
  for(const m of migs)sqlite.exec(readFileSync(new URL('../migrations/'+m,import.meta.url),'utf8'));
  // Seed legacy 0008 admin hash just like production D1 before 0009 + 0010
  const salt=randomBytes(16).toString('hex');
  const hash=createHash('sha256').update(salt+'\0'+LEGACY_ADMIN_KEY).digest('hex');
  sqlite.prepare("INSERT INTO web_access_settings(id,key_hash,salt) VALUES ('admin',?,?)").run(hash,salt);
  sqlite.prepare("INSERT INTO services(id,name,category,price_cents,active) VALUES ('catalog-60','TINTE RAIZ 1','COLOR',12000,1)").run();
  sqlite.prepare("INSERT INTO services(id,name,category,price_cents,active) VALUES ('catalog-13','MANICURE CLASICA','MANOS / PIES',2500,1)").run();
  sqlite.prepare("INSERT INTO clients(id,full_name,dni,phone,in_directory) VALUES ('c-active','Clienta Activa','12345678','987654321',1)").run();
  sqlite.prepare("INSERT INTO clients(id,full_name,dni,phone,in_directory,archived_at) VALUES ('c-arch','Clienta Archivada','87654321','987654322',1,'2026-10-01T00:00:00Z')").run();
  sqlite.exec(readFileSync(new URL('../migrations/0009_internal_operations.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0010_internal_accounts.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0011_stylist_alerts_and_profile.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0012_staff_arrival_alerts.sql',import.meta.url),'utf8'));
  return {sqlite,db:makeAccurateD1(sqlite)};
}

async function req(db,path,{method='GET',body,cookie,bearer}={}){
  const env={DB:db,ADMIN_TOKEN:'secret-bearer-token'};
  const headers={origin:ORIGIN};
  if(cookie)headers.cookie=cookie;
  if(bearer)headers.authorization='Bearer '+bearer;
  if(body!==undefined)headers['content-type']='application/json';
  const res=await worker.fetch(new Request(ORIGIN+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
  const setCookie=res.headers.get('set-cookie')?.split(';')[0]||null;
  return {status:res.status,cookie:setCookie,headers:res.headers,body:await res.json()};
}

test('0010 seeds 1 active admin (inheriting 0008 key) + 5 empty/inactive collaborators and enforces single-admin in SQL',()=>{
  const {sqlite}=createDbWithAccounts();
  assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  const rows=sqlite.prepare('SELECT id,email,role,staff_id,active,password_hash FROM web_accounts ORDER BY id').all();
  assert.equal(rows.length,6);
  const admin=rows.find(r=>r.role==='admin');
  assert.equal(admin.email,'admin@touche.pe');
  assert.equal(admin.active,1);
  assert.ok(admin.password_hash);
  const collabs=rows.filter(r=>r.role==='collaborator');
  assert.equal(collabs.length,5);
  for(const c of collabs){
    assert.equal(c.active,0);
    assert.equal(c.password_hash,null);
    assert.match(c.email,/@touche\.pe$/);
  }
  assert.throws(()=>sqlite.prepare("INSERT INTO web_accounts(id,email,display_name,role,active) VALUES ('admin2','admin2@touche.pe','Otro Admin','admin',1)").run(),/UNIQUE constraint failed/);
});

test('admin assigns passwords to empty collaborators, enforces single admin, and revokes sessions cleanly',async()=>{
  const {sqlite,db}=createDbWithAccounts();

  // Pending collaborator cannot sign in
  const pending=await req(db,'/api/login',{method:'POST',body:{email:'silvia@touche.pe',password:'Cualquier123'}});
  assert.equal(pending.status,401);

  // Admin signs in with inherited 0008 key (no Gmail required)
  const adminLogin=await req(db,'/api/login',{method:'POST',body:{email:'admin@touche.pe',password:LEGACY_ADMIN_KEY}});
  assert.equal(adminLogin.status,200);
  assert.equal(adminLogin.body.user.role,'admin');
  assert.ok(adminLogin.cookie);
  const adminCookie=adminLogin.cookie;

  // Admin cannot create a second Admin account or promote a collaborator
  const secondAdmin=await req(db,'/api/accounts',{method:'POST',cookie:adminCookie,body:{email:'otro@touche.pe',displayName:'Otro Admin',role:'admin',password:'ClaveSegura99'}});
  assert.equal(secondAdmin.status,403);
  const promote=await req(db,'/api/accounts/acct-silvia',{method:'PATCH',cookie:adminCookie,body:{role:'admin'}});
  assert.equal(promote.status,403);
  const deactivateAdmin=await req(db,'/api/accounts/acct-admin',{method:'PATCH',cookie:adminCookie,body:{active:false}});
  assert.equal(deactivateAdmin.status,400);

  // Admin cannot activate empty collaborator without password
  assert.equal((await req(db,'/api/accounts/acct-silvia',{method:'PATCH',cookie:adminCookie,body:{active:true}})).status,400);

  // Admin assigns initial password to Silvia -> auto-activates & hashes with PBKDF2-SHA256
  const setSilvia=await req(db,'/api/accounts/acct-silvia',{method:'PATCH',cookie:adminCookie,body:{password:'Silvia2026!'}});
  assert.equal(setSilvia.status,200);
  assert.equal(setSilvia.body.active,true);
  assert.equal(setSilvia.body.hasPassword,true);
  const stored=sqlite.prepare("SELECT password_hash FROM web_accounts WHERE id='acct-silvia'").get();
  assert.match(stored.password_hash,/^pbkdf2_sha256\$100000\$/);

  // GET /api/accounts never exposes password_hash or salt
  const list=await req(db,'/api/accounts',{cookie:adminCookie});
  assert.equal(list.status,200);
  assert.equal(JSON.stringify(list.body).includes('pbkdf2_sha256'),false);
  assert.equal(JSON.stringify(list.body).includes(stored.password_hash),false);

  // Silvia logs in
  const silviaLogin=await req(db,'/api/login',{method:'POST',body:{email:'silvia@touche.pe',password:'Silvia2026!'}});
  assert.equal(silviaLogin.status,200);
  assert.equal(silviaLogin.body.user.role,'collaborator');
  const silviaCookie=silviaLogin.cookie;

  // Silvia can perform daily salon operations & gets logged as actor
  const clientRes=await req(db,'/api/clients',{cookie:silviaCookie});
  assert.equal(clientRes.status,200);
  assert.equal(clientRes.body.clients.length,1); // Archived client hidden from collaborator

  const appt=await req(db,'/api/appointments',{method:'POST',cookie:silviaCookie,body:{clientId:'c-active',serviceId:'catalog-60',staffId:'staff-miriam',assignmentMode:'requested',date:'2026-11-26',time:'10:00',duration:120}});
  assert.equal(appt.status,201);
  const ev=await req(db,`/api/appointments/${appt.body.id}/events`,{cookie:silviaCookie});
  assert.equal(ev.body.events[0].actor,'silvia@touche.pe');

  // Silvia is blocked (403) from admin-only actions
  assert.equal((await req(db,'/api/accounts',{cookie:silviaCookie})).status,403);
  assert.equal((await req(db,'/api/history',{cookie:silviaCookie})).status,403);
  assert.equal((await req(db,'/api/message-preferences',{cookie:silviaCookie})).status,403);
  assert.equal((await req(db,'/api/clients/c-active',{method:'DELETE',cookie:silviaCookie})).status,403);
  assert.equal((await req(db,'/api/clients/c-arch/restore',{method:'POST',cookie:silviaCookie,body:{}})).status,403);
  assert.equal((await req(db,'/api/staff/staff-martha',{method:'PATCH',cookie:silviaCookie,body:{restWeekday:4}})).status,403);
  assert.equal((await req(db,'/api/staff/exceptions',{method:'POST',cookie:silviaCookie,body:{staffId:'staff-miriam',exceptionDate:'2026-11-26',kind:'urgent_leave'}})).status,403);
  assert.equal((await req(db,'/api/services/catalog-60',{method:'PATCH',cookie:silviaCookie,body:{durationMinutes:90}})).status,403);
  assert.equal((await req(db,'/api/agenda/preferences',{method:'PATCH',cookie:silviaCookie,body:{openTime:'09:00',closeTime:'19:00',weekdays:[1,2,3,4,5,6]}})).status,403);

  // Silvia changes her own password
  assert.equal((await req(db,'/api/accounts/me/password',{method:'POST',cookie:silviaCookie,body:{currentPassword:'wrong',newPassword:'NuevaSilvia99'}})).status,401);
  assert.equal((await req(db,'/api/accounts/me/password',{method:'POST',cookie:silviaCookie,body:{currentPassword:'Silvia2026!',newPassword:'NuevaSilvia99'}})).status,200);

  // Admin deactivates Silvia -> cookie immediately stops working & login rejects with 403
  assert.equal((await req(db,'/api/accounts/acct-silvia',{method:'PATCH',cookie:adminCookie,body:{active:false}})).status,200);
  assert.equal((await req(db,'/api/session',{cookie:silviaCookie})).status,401);
  assert.equal((await req(db,'/api/clients',{cookie:silviaCookie})).status,401);
  assert.equal((await req(db,'/api/login',{method:'POST',body:{email:'silvia@touche.pe',password:'NuevaSilvia99'}})).status,403);
});

test('PWA manifest, service worker, icons, and security headers are served cleanly', async ()=>{
  const {db}=createDbWithAccounts();
  const env={DB:db,ADMIN_TOKEN:'secret-bearer-token'};

  const manifestRes=await worker.fetch(new Request(ORIGIN+'/manifest.webmanifest'),env);
  assert.equal(manifestRes.status,200);
  assert.match(manifestRes.headers.get('content-type')||'',/manifest\+json/);
  const manifest=await manifestRes.json();
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/#agenda');
  assert.equal(manifest.scope,'/');
  assert.ok(manifest.icons.some(i=>i.sizes==='192x192'));
  assert.ok(manifest.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'));

  const swRes=await worker.fetch(new Request(ORIGIN+'/sw.js'),env);
  assert.equal(swRes.status,200);
  assert.equal(swRes.headers.get('service-worker-allowed'),'/');
  assert.match(swRes.headers.get('cache-control')||'',/no-cache/);
  const swText=await swRes.text();
  assert.match(swText,/\/api\//);
  assert.match(swText,/notificationclick/);

  const iconRes=await worker.fetch(new Request(ORIGIN+'/brand/icon-192.png'),env);
  assert.equal(iconRes.status,200);
  assert.equal(iconRes.headers.get('content-type'),'image/png');

  const appleRes=await worker.fetch(new Request(ORIGIN+'/brand/apple-touch-icon.png'),env);
  assert.equal(appleRes.status,200);
  assert.equal(appleRes.headers.get('content-type'),'image/png');

  const loginRes=await worker.fetch(new Request(ORIGIN+'/login'),env);
  assert.equal(loginRes.status,200);
  const csp=loginRes.headers.get('content-security-policy')||'';
  assert.match(csp,/worker-src 'self'/);
  assert.match(csp,/manifest-src 'self'/);
});

test('stylist isolation, arrival alerts (admin-only), and DB-validated self profile', async ()=>{
  const {db}=createDbWithAccounts();
  const adminLogin=await req(db,'/api/login',{method:'POST',body:{email:'admin@touche.pe',password:LEGACY_ADMIN_KEY}});
  const adminCookie=adminLogin.cookie;
  assert.equal(adminLogin.body.user.accessScope,'admin');

  // Activate Miriam (stylist) & Silvia (reception)
  assert.equal((await req(db,'/api/accounts/acct-miriam',{method:'PATCH',cookie:adminCookie,body:{password:'123456789',active:true}})).status,200);
  assert.equal((await req(db,'/api/accounts/acct-silvia',{method:'PATCH',cookie:adminCookie,body:{password:'123456789',active:true}})).status,200);

  // Admin books one appointment for Miriam and one for Maritza on Thursday 2026-11-26
  const apptMiriam=await req(db,'/api/appointments',{method:'POST',cookie:adminCookie,body:{clientId:'c-active',serviceId:'catalog-60',staffId:'staff-miriam',assignmentMode:'requested',date:'2026-11-26',time:'10:00',duration:90}});
  assert.equal(apptMiriam.status,201);
  const apptMaritza=await req(db,'/api/appointments',{method:'POST',cookie:adminCookie,body:{clientId:'c-active',serviceId:'catalog-60',staffId:'staff-maritza',assignmentMode:'requested',date:'2026-11-26',time:'12:00',duration:90}});
  assert.equal(apptMaritza.status,201);
  // Admin checks in Maritza first so we verify Miriam cannot see Maritza's arrival
  assert.equal((await req(db,'/api/agenda/shifts',{method:'PUT',cookie:adminCookie,body:{day:'2026-11-26',shifts:[{staffId:'staff-maritza',turnOrder:1,status:'present'}]}})).status,200);

  // Miriam logs in -> accessScope === 'stylist'
  const miriamLogin=await req(db,'/api/login',{method:'POST',body:{email:'miriam@touche.pe',password:'123456789'}});
  assert.equal(miriamLogin.status,200);
  assert.equal(miriamLogin.body.user.accessScope,'stylist');
  const miriamCookie=miriamLogin.cookie;

  // Strict stylist restrictions: cannot see clients, staff, shifts, alerts, or create appointments
  assert.equal((await req(db,'/api/clients',{cookie:miriamCookie})).status,403);
  assert.equal((await req(db,'/api/clients',{method:'POST',cookie:miriamCookie,body:{name:'Test',dni:'11112222'}})).status,403);
  assert.equal((await req(db,'/api/staff',{cookie:miriamCookie})).status,403);
  assert.equal((await req(db,'/api/agenda/shifts',{method:'PUT',cookie:miriamCookie,body:{day:'2026-11-26',shifts:[]}})).status,403);
  assert.equal((await req(db,'/api/alerts',{cookie:miriamCookie})).status,403);
  assert.equal((await req(db,'/api/appointments',{method:'POST',cookie:miriamCookie,body:{clientId:'c-active',serviceId:'catalog-60',staffId:'staff-miriam',assignmentMode:'requested',date:'2026-11-26',time:'14:00',duration:60}})).status,403);

  // Miriam's /api/agenda returns ONLY her own staff, own appointment (without phone), no other shifts, and 0 clients
  const myAgenda=await req(db,'/api/agenda?date=2026-11-26&bootstrap=1',{cookie:miriamCookie});
  assert.equal(myAgenda.status,200);
  assert.equal(myAgenda.body.clients.length,0);
  assert.equal(myAgenda.body.staff.length,1);
  assert.equal(myAgenda.body.staff[0].id,'staff-miriam');
  assert.equal(myAgenda.body.dailyShifts.length,0); // Maritza's arrival is hidden!
  assert.equal(myAgenda.body.appointments.length,1);
  assert.equal(myAgenda.body.appointments[0].id,apptMiriam.body.id);
  assert.equal(myAgenda.body.appointments[0].clientPhone,null);

  // Salon-wide appointment notifications reach ALL team members (Miriam sees both hers and Maritza's incoming clients, without phone/DNI!)
  const salonNotifs=await req(db,'/api/agenda/notifications',{cookie:miriamCookie});
  assert.equal(salonNotifs.status,200);
  assert.equal(salonNotifs.body.appointments.length,2);
  assert.ok(salonNotifs.body.appointments.some(a=>a.staffId==='staff-miriam'));
  assert.ok(salonNotifs.body.appointments.some(a=>a.staffId==='staff-maritza'));
  assert.equal('clientPhone' in salonNotifs.body.appointments[0],false);
  assert.equal('clientDni' in salonNotifs.body.appointments[0],false);

  // Miriam marks ONLY her own arrival -> generates Admin-only alert "Llegó la estilista Miriam"
  // Stylists can only check in for today (Lima); other days are rejected
  assert.equal((await req(db,'/api/agenda/my-arrival',{method:'POST',cookie:miriamCookie,body:{day:'2099-01-01'}})).status,400);
  const todayLima=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
  const myArr=await req(db,'/api/agenda/my-arrival',{method:'POST',cookie:miriamCookie,body:{day:todayLima}});
  assert.equal(myArr.status,200);
  assert.equal(myArr.body.shift.staffId,'staff-miriam');
  assert.equal(myArr.body.alertTitle,'Llegó la estilista Miriam');

  // Miriam CANNOT mark arrival on Maritza's appointment (403)
  assert.equal((await req(db,`/api/appointments/${apptMaritza.body.id}/arrival`,{method:'POST',cookie:miriamCookie,body:{status:'not_arrived'}})).status,403);

  // Miriam clicks "No llegó" & "Recordatorio" on her own appointment -> creates Admin-only alerts
  const missed=await req(db,`/api/appointments/${apptMiriam.body.id}/arrival`,{method:'POST',cookie:miriamCookie,body:{status:'not_arrived'}});
  assert.equal(missed.status,200);
  assert.equal(missed.body.title,'ALERTA: No llegó el cliente — Recordarle');
  const remAlert=await req(db,`/api/appointments/${apptMiriam.body.id}/alert-reminder`,{method:'POST',cookie:miriamCookie,body:{}});
  assert.equal(remAlert.status,200);

  // Silvia (reception) CANNOT see Admin alerts (403)
  const silviaLogin=await req(db,'/api/login',{method:'POST',body:{email:'silvia@touche.pe',password:'123456789'}});
  assert.equal(silviaLogin.body.user.accessScope,'reception');
  assert.equal((await req(db,'/api/alerts',{cookie:silviaLogin.cookie})).status,403);

  // ONLY Admin sees all 3 alerts (staff_arrived + client_not_arrived + client_reminder_needed)
  const adminAlerts=await req(db,'/api/alerts?status=unread',{cookie:adminCookie});
  assert.equal(adminAlerts.status,200);
  assert.equal(adminAlerts.body.unreadCount,3);
  assert.ok(adminAlerts.body.alerts.some(a=>a.kind==='staff_arrived'&&a.title==='Llegó la estilista Miriam'));
  assert.ok(adminAlerts.body.alerts.some(a=>a.title==='ALERTA: No llegó el cliente — Recordarle'&&a.clientPhone==='987654321'));

  // Miriam marks "Llegó" -> auto-resolves client_not_arrived alert; Admin resolves the remaining 2
  const arrived=await req(db,`/api/appointments/${apptMiriam.body.id}/arrival`,{method:'POST',cookie:miriamCookie,body:{status:'arrived'}});
  assert.equal(arrived.status,200);
  assert.equal(arrived.body.arrivalStatus,'arrived');
  const afterArrived=await req(db,'/api/alerts?status=unread',{cookie:adminCookie});
  assert.equal(afterArrived.body.unreadCount,2);
  for(const al of afterArrived.body.alerts){
    assert.equal((await req(db,`/api/alerts/${al.id}/resolve`,{method:'POST',cookie:adminCookie,body:{}})).status,200);
  }
  assert.equal((await req(db,'/api/alerts?status=unread',{cookie:adminCookie})).body.unreadCount,0);

  // Self-service Profile (#perfil): loads real DB catalog, rejects invented tags, accepts real DB tags
  const prof=await req(db,'/api/profile',{cookie:miriamCookie});
  assert.equal(prof.status,200);
  assert.ok(prof.body.catalog.categories.some(c=>c.category==='COLOR'));
  assert.ok(prof.body.catalog.services.some(s=>s.id==='catalog-13'));

  // Reject invented category & invented service
  assert.equal((await req(db,'/api/profile',{method:'PATCH',cookie:miriamCookie,body:{displayName:'Miriam Pecho',categories:[{category:'INVENTADO',capabilityLevel:'primary'}]}})).status,400);
  assert.equal((await req(db,'/api/profile',{method:'PATCH',cookie:miriamCookie,body:{displayName:'Miriam Pecho',serviceOverrides:[{serviceId:'no-existe',capabilityLevel:'primary'}]}})).status,400);

  // Accept real DB category + updated full name + description
  const upd=await req(db,'/api/profile',{method:'PATCH',cookie:miriamCookie,body:{
    displayName:'Miriam Pecho Ramos',
    shortName:'Miriam',
    specialtySummary:'Especialista en color y manicure',
    categories:[{category:'COLOR',capabilityLevel:'primary'},{category:'MANOS / PIES',capabilityLevel:'primary'}],
    serviceOverrides:[]
  }});
  assert.equal(upd.status,200);
  const profAfter=await req(db,'/api/profile',{cookie:miriamCookie});
  assert.equal(profAfter.body.account.displayName,'Miriam Pecho Ramos');
  assert.equal(profAfter.body.staff.displayName,'Miriam Pecho Ramos');
  assert.equal(profAfter.body.categories.length,2);

  // Client history + automatic interest categorization (treatments + new agenda service)
  const {sqlite:sq}=createDbWithAccounts();
  assert.ok(sq);
});

test('client history endpoint returns exact service, date, time, and automatic interests from history + new agenda services', async ()=>{
  const {sqlite,db}=createDbWithAccounts();
  const adminLogin=await req(db,'/api/login',{method:'POST',body:{email:'admin@touche.pe',password:LEGACY_ADMIN_KEY}});
  const adminCookie=adminLogin.cookie;
  assert.equal((await req(db,'/api/accounts/acct-miriam',{method:'PATCH',cookie:adminCookie,body:{password:'123456789',active:true}})).status,200);
  const miriamCookie=(await req(db,'/api/login',{method:'POST',body:{email:'miriam@touche.pe',password:'123456789'}})).cookie;

  // Historical treatments (2x SHADES -> primary interest "Shades", 1x TRATAMIENTO)
  sqlite.prepare("INSERT INTO treatments(id,client_id,service_name,category,performed_on) VALUES ('tr-1','c-active','SHADES','SHADES','2026-08-10')").run();
  sqlite.prepare("INSERT INTO treatments(id,client_id,service_name,category,performed_on) VALUES ('tr-2','c-active','SHADES','SHADES','2026-09-15')").run();
  sqlite.prepare("INSERT INTO treatments(id,client_id,service_name,category,performed_on) VALUES ('tr-3','c-active','TRATAMIENTO','TRATAMIENTO','2026-10-01')").run();

  // New brand-new service in Agenda (not in predefined labels -> auto-creates its own interest!)
  sqlite.prepare("INSERT INTO services(id,name,category,price_cents,active) VALUES ('svc-new-spa','SPA CAPILAR DETOX','SPA',9500,1)").run();
  sqlite.prepare("INSERT INTO staff_category_capabilities(staff_id,category,capability_level) VALUES ('staff-miriam','SPA','primary')").run();
  const appt=await req(db,'/api/appointments',{method:'POST',cookie:adminCookie,body:{clientId:'c-active',serviceId:'svc-new-spa',staffId:'staff-miriam',assignmentMode:'requested',date:'2026-11-26',time:'14:30',duration:45}});
  assert.equal(appt.status,201);

  // Stylist cannot access client history (403)
  assert.equal((await req(db,'/api/clients/c-active/history',{cookie:miriamCookie})).status,403);

  // GET /api/clients includes automatic interests and full active salon service catalog for preference tags
  const list=await req(db,'/api/clients',{cookie:adminCookie});
  const active=list.body.clients.find(c=>c.id==='c-active');
  assert.equal(active.interests[0].label,'Shades');
  assert.equal(active.interests[0].primary,true);
  assert.ok(active.interests.some(i=>i.label==='Spa Capilar Detox'));
  assert.ok(Array.isArray(list.body.services)&&list.body.services.length>=1);
  assert.ok(list.body.services.some(s=>s.name==='SPA CAPILAR DETOX'&&s.category==='SPA'));

  // GET /api/clients/:id/history returns exact date, clock time for agenda, and automatic interests
  const hist=await req(db,'/api/clients/c-active/history',{cookie:adminCookie});
  assert.equal(hist.status,200);
  assert.equal(hist.body.visitsCount,3);
  assert.equal(hist.body.scheduledCount,1);
  assert.equal(hist.body.interests[0].label,'Shades');
  assert.equal(hist.body.interests[0].count,2);
  assert.ok(hist.body.interests.some(i=>i.label==='Spa Capilar Detox'&&i.fromAgenda===true));
  const agendaItem=hist.body.timeline.find(t=>t.serviceName==='SPA CAPILAR DETOX');
  assert.equal(agendaItem.date,'2026-11-26');
  assert.equal(agendaItem.startTime,'14:30');
  assert.equal(agendaItem.endTime,'15:15');
  assert.equal(agendaItem.staffName,'Miriam');
});
