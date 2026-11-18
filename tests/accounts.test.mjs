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
  sqlite.prepare("INSERT INTO clients(id,full_name,dni,phone,in_directory) VALUES ('c-active','Clienta Activa','12345678','987654321',1)").run();
  sqlite.prepare("INSERT INTO clients(id,full_name,dni,phone,in_directory,archived_at) VALUES ('c-arch','Clienta Archivada','87654321','987654322',1,'2026-10-01T00:00:00Z')").run();
  sqlite.exec(readFileSync(new URL('../migrations/0009_internal_operations.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0010_internal_accounts.sql',import.meta.url),'utf8'));
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
