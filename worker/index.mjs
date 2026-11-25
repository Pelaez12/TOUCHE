import {validateClient,validateMessagePreferences} from './validation.mjs';
import {handleAgenda} from './agenda.mjs';
import {handleWeb,sameOrigin} from './web.mjs';
import {handleAccounts} from './accounts.mjs';
import {constantTimeEqual} from './crypto.mjs';
import {classifyInterest,summarizeInterests} from './interests.mjs';

const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':'application/json; charset=utf-8'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const BEARER_ADMIN_ACTOR={accountId:'acct-admin',email:'admin@touche.pe',displayName:'Administración Touché',role:'admin',staffId:null,staffRole:null,accessScope:'admin'};

async function authorized(request,env) {
  if(!env.ADMIN_TOKEN)return false;
  const supplied=request.headers.get('authorization')||'';
  const encoder=new TextEncoder();
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(supplied)),crypto.subtle.digest('SHA-256',encoder.encode('Bearer '+env.ADMIN_TOKEN))]);
  return constantTimeEqual(a,b);
}
async function readBody(request) {
  if(!request.headers.get('content-type')?.includes('application/json'))throw Error('Se requiere JSON.');
  const reader=request.body?.getReader();if(!reader)throw Error('Faltan los datos.');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16000){await reader.cancel();throw Error('Los datos superan el tamaño permitido.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
function audit(db,actorEmail,id,action,changes) {
  return db.prepare('INSERT INTO audit_log(id,actor,action,entity_type,entity_id,changes_json) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),actorEmail||'admin@touche.pe',action,'client',id,JSON.stringify(changes));
}

export default {
  async fetch(request,env) {
    let web;
    try{web=await handleWeb(request,env,readBody,()=>authorized(request,env));if(web.response)return web.response;}
    catch{return json({error:'No se pudo cargar el acceso. Inténtalo de nuevo.'},503);}
    const bearerOk=!web.authenticated&&await authorized(request,env);
    if(!web.authenticated&&!bearerOk)return json({error:'Acceso no autorizado. Inicia sesión para continuar.'},401);
    if(web.authenticated&&!['GET','HEAD'].includes(request.method)&&!sameOrigin(request))return json({error:'Origen no permitido.'},403);
    const actor=web.actor||BEARER_ADMIN_ACTOR;
    const isAdmin=actor.role==='admin';
    const accessScope=actor.accessScope||(isAdmin?'admin':'stylist');
    const isStylist=accessScope==='stylist';
    const url=new URL(request.url), path=url.pathname;
    try {
      const accountsResponse=await handleAccounts(request,env.DB,readBody,actor,web.sessionHash);
      if(accountsResponse)return accountsResponse;
      const agendaResponse=await handleAgenda(request,env.DB,readBody,actor);
      if(agendaResponse)return agendaResponse;

      if(path==='/api/message-preferences') {
        if(!isAdmin)return json({error:'Solo Administración puede consultar o editar plantillas de mensajes.'},403);
        if(request.method==='GET') {
          const preference=await env.DB.prepare("SELECT template,promotion FROM message_preferences WHERE id='return'").first();
          return json(preference);
        }
        if(request.method==='PATCH') {
          let body;try{body=validateMessagePreferences(await readBody(request));}catch(error){return json({error:error.message},400);}
          await env.DB.batch([env.DB.prepare("UPDATE message_preferences SET template=?,promotion=?,updated_at=? WHERE id='return'").bind(body.template.trim(),body.promotion.trim(),new Date().toISOString()),audit(env.DB,actor.email,'message-preferences','update-template',{fields:['template','promotion']})]);
          return json({saved:true});
        }
      }
      if(request.method==='GET'&&path==='/api/clients') {
        if(isStylist)return json({error:'Las estilistas solo tienen acceso a su agenda y a su perfil.'},403);
        const filter=isAdmin?'':' WHERE c.archived_at IS NULL';
        const [r,trRes,apRes,svcRes]=await env.DB.batch([
          env.DB.prepare(`SELECT c.id,c.full_name AS name,c.dni,c.phone,c.birthday,c.birthday_raw AS birthdayRaw,c.notes,
            c.identity_status AS identityStatus,c.archived_at AS archivedAt,c.updated_at AS updatedAt,c.in_directory AS inDirectory,
            (SELECT MAX(performed_on) FROM treatments WHERE client_id=c.id) AS lastVisit,
            (SELECT COUNT(DISTINCT performed_on) FROM treatments WHERE client_id=c.id) AS visits,
            (SELECT COUNT(*) FROM appointments WHERE client_id=c.id AND status='scheduled' AND treatment_id IS NULL) AS scheduledCount
            FROM clients c${filter} ORDER BY c.full_name COLLATE NOCASE`),
          env.DB.prepare('SELECT client_id AS clientId,service_name AS serviceName,category FROM treatments'),
          env.DB.prepare("SELECT a.client_id AS clientId,s.name AS serviceName,s.category FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.status IN ('scheduled','completed') AND a.treatment_id IS NULL"),
          env.DB.prepare('SELECT id,name,category FROM services WHERE active=1 ORDER BY category COLLATE NOCASE, name COLLATE NOCASE')
        ]);
        const recsByClient=new Map();
        const pushRec=(cid,rec)=>{let arr=recsByClient.get(cid);if(!arr){arr=[];recsByClient.set(cid,arr);}arr.push(rec);};
        for(const t of trRes.results)pushRec(t.clientId,{serviceName:t.serviceName,category:t.category,source:'history'});
        for(const a of apRes.results)pushRec(a.clientId,{serviceName:a.serviceName,category:a.category,source:'agenda'});
        const clients=r.results.map(c=>({...c,interests:summarizeInterests(recsByClient.get(c.id))}));
        return json({clients,services:svcRes.results,storage:'cloudflare-d1'});
      }
      if(request.method==='GET'&&path==='/api/history') {
        if(!isAdmin)return json({error:'Solo Administración puede consultar el reporte de retorno e historial completo.'},403);
        const [batch,clients,events,issues,services,revisions]=await env.DB.batch([
          env.DB.prepare('SELECT source_name,as_of,source_sha256 FROM import_batches ORDER BY created_at DESC LIMIT 1'),
          env.DB.prepare('SELECT id,full_name AS name,phone,birthday,notes,in_directory AS inDirectory FROM clients WHERE archived_at IS NULL'),
          env.DB.prepare(`SELECT t.id,t.client_id AS clientId,c.full_name AS name,t.service_name AS service,t.category,t.performed_on AS date,t.source_sheet AS sheet,t.source_cell AS cell,COALESCE(t.source_cell_original,t.source_cell) AS originalCell,t.source_part AS sourcePart,t.source_value AS originalValue,t.date_resolution AS dateResolution FROM treatments t JOIN clients c ON c.id=t.client_id WHERE c.archived_at IS NULL`),
          env.DB.prepare("SELECT source_json FROM import_issues WHERE status='pending'"),
          env.DB.prepare('SELECT id,name,category,price_cents AS priceCents,duration_minutes AS durationMinutes,duration_max_minutes AS durationMaxMinutes FROM services WHERE active=1'),
          env.DB.prepare('SELECT source_sheet AS sheet,source_cell AS cell,original_value AS originalValue,original_header AS originalHeader,dates_json AS datesJson,rule,review_date AS reviewDate FROM history_date_revisions ORDER BY source_sheet,source_cell')]);
        const archived=new Set(clients.results.map(c=>c.id));
        const sourceNames=new Map(events.results.map(e=>[e.sheet+'|'+e.originalCell,e.name]));
        const todayLima=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
        const maxEventDate=events.results.reduce((m,e)=>e.date&&e.date>m?e.date:m,'');
        const asOf=[batch.results[0]?.as_of,todayLima,maxEventDate].filter(Boolean).sort().at(-1);
        return json({source:batch.results[0]?.source_name,asOf,clients:clients.results,events:events.results,
          issues:issues.results.map(x=>JSON.parse(x.source_json)).filter(x=>!x.clientId||archived.has(x.clientId)),services:services.results,
          dateRevisions:revisions.results.map(r=>({...r,name:sourceNames.get(r.sheet+'|'+r.cell)||'Ficha no activa',dates:JSON.parse(r.datesJson)})),storage:'cloudflare-d1'});
      }
      if(request.method==='POST'&&path==='/api/clients') {
        if(isStylist)return json({error:'Las estilistas solo tienen acceso a su agenda y a su perfil.'},403);
        let body;try{body=validateClient(await readBody(request),{requireDni:true});}catch(error){return json({error:error.message},400);}
        if(await env.DB.prepare('SELECT id FROM clients WHERE dni=?').bind(body.dni).first())return json({error:'Este DNI ya tiene una ficha. Búscala en Clientas o en Eliminadas para editarla o restaurarla.'},409);
        const id=crypto.randomUUID(),now=new Date().toISOString();
        await env.DB.batch([env.DB.prepare(`INSERT INTO clients(id,full_name,dni,phone,birthday,notes,in_directory,identity_status,updated_at) VALUES (?,?,?,?,?,?,1,'confirmed',?)`).bind(id,body.name,body.dni,body.phone,body.birthday,body.notes,now),audit(env.DB,actor.email,id,'create',{fields:Object.keys(body)})]);
        return json({id,storage:'cloudflare-d1'},201);
      }
      const match=path.match(/^\/api\/clients\/([a-zA-Z0-9-]+)(\/(restore|history))?$/);
      if(match) {
        if(isStylist)return json({error:'Las estilistas solo tienen acceso a su agenda y a su perfil.'},403);
        const id=match[1],sub=match[3]||null,existing=await env.DB.prepare('SELECT id,full_name AS name,dni,phone,birthday,notes,archived_at FROM clients WHERE id=?').bind(id).first();
        if(!existing)return json({error:'La clienta no existe.'},404);
        if(request.method==='GET'&&sub==='history') {
          if(existing.archived_at&&!isAdmin)return json({error:'La clienta no está activa.'},404);
          const [trRes,apRes]=await env.DB.batch([
            env.DB.prepare(`SELECT t.id,t.service_name AS serviceName,t.category,t.performed_on AS date,t.notes,t.technical_notes AS technicalNotes,
              a.id AS appointmentId,a.starts_at AS startsAt,a.ends_at AS endsAt,
              COALESCE(st.short_name,st.display_name,a.assignee,'') AS staffName
              FROM treatments t
              LEFT JOIN appointments a ON a.treatment_id=t.id
              LEFT JOIN staff st ON st.id=COALESCE(t.staff_id,a.staff_id)
              WHERE t.client_id=?
              ORDER BY t.performed_on DESC,COALESCE(a.starts_at,'') DESC,t.rowid DESC`).bind(id),
            env.DB.prepare(`SELECT a.id,s.name AS serviceName,s.category,a.starts_at AS startsAt,a.ends_at AS endsAt,
              a.status,a.arrival_status AS arrivalStatus,a.notes,a.cancel_reason AS cancelReason,
              COALESCE(st.short_name,st.display_name,a.assignee,'') AS staffName
              FROM appointments a
              JOIN services s ON s.id=a.service_id
              LEFT JOIN staff st ON st.id=a.staff_id
              WHERE a.client_id=? AND a.treatment_id IS NULL
              ORDER BY a.starts_at DESC`).bind(id)
          ]);
          const timeline=[];
          const interestRecords=[];
          for(const t of trRes.results){
            const interest=classifyInterest(t.serviceName,t.category);
            interestRecords.push({serviceName:t.serviceName,category:t.category,source:t.appointmentId?'agenda':'history'});
            timeline.push({
              id:t.id,
              kind:'treatment',
              status:'completed',
              date:t.date,
              startTime:t.startsAt?t.startsAt.slice(11,16):null,
              endTime:t.endsAt?t.endsAt.slice(11,16):null,
              serviceName:t.serviceName,
              category:t.category||'',
              interest,
              staffName:t.staffName||'',
              notes:t.notes||'',
              technicalNotes:t.technicalNotes||'',
              source:t.appointmentId?'agenda':'history'
            });
          }
          for(const a of apRes.results){
            const interest=classifyInterest(a.serviceName,a.category);
            if(a.status==='scheduled'||a.status==='completed'){
              interestRecords.push({serviceName:a.serviceName,category:a.category,source:'agenda'});
            }
            timeline.push({
              id:a.id,
              kind:'appointment',
              status:a.status,
              arrivalStatus:a.arrivalStatus||'pending',
              date:a.startsAt.slice(0,10),
              startTime:a.startsAt.slice(11,16),
              endTime:a.endsAt.slice(11,16),
              serviceName:a.serviceName,
              category:a.category||'',
              interest,
              staffName:a.staffName||'',
              notes:a.notes||'',
              cancelReason:a.cancelReason||'',
              source:'agenda'
            });
          }
          timeline.sort((x,y)=>y.date.localeCompare(x.date)||String(y.startTime||'').localeCompare(String(x.startTime||'')));
          const interests=summarizeInterests(interestRecords);
          const distinctDates=new Set(trRes.results.map(t=>t.date)).size;
          return json({
            client:{id:existing.id,name:existing.name,dni:existing.dni,phone:existing.phone,birthday:existing.birthday,notes:existing.notes},
            visitsCount:distinctDates,
            servicesCount:trRes.results.length,
            scheduledCount:apRes.results.filter(a=>a.status==='scheduled').length,
            interests,
            timeline
          });
        }
        const now=new Date().toISOString();
        if(request.method==='POST'&&sub==='restore') {
          if(!isAdmin)return json({error:'Solo Administración puede restaurar clientas eliminadas.'},403);
          await env.DB.batch([env.DB.prepare('UPDATE clients SET archived_at=NULL,updated_at=? WHERE id=?').bind(now,id),audit(env.DB,actor.email,id,'restore',{})]);
          return json({id});
        }
        if(request.method==='DELETE'&&!sub) {
          if(!isAdmin)return json({error:'Solo Administración puede eliminar fichas de clientas.'},403);
          await env.DB.batch([env.DB.prepare('UPDATE clients SET archived_at=?,updated_at=? WHERE id=?').bind(now,now,id),audit(env.DB,actor.email,id,'archive',{})]);
          return json({id,archived:true});
        }
        if(request.method==='PATCH'&&!sub) {
          if(existing.archived_at)return json({error:'Restaura la clienta antes de editarla.'},409);
          let body;try{const input=await readBody(request);body=validateClient({...input,dni:Object.hasOwn(input,'dni')?input.dni:existing.dni},{requireDni:!!existing.dni});}catch(error){return json({error:error.message},400);}
          if(body.dni&&await env.DB.prepare('SELECT id FROM clients WHERE dni=? AND id<>?').bind(body.dni,id).first())return json({error:'Este DNI ya pertenece a otra ficha. Busca la ficha existente para editarla o restaurarla.'},409);
          await env.DB.batch([env.DB.prepare(`UPDATE clients SET full_name=?,dni=?,phone=?,birthday=?,notes=?,updated_at=? WHERE id=? AND archived_at IS NULL`).bind(body.name,body.dni,body.phone,body.birthday,body.notes,now,id),audit(env.DB,actor.email,id,'update',{fields:Object.keys(body)})]);
          return json({id});
        }
      }
      return json({error:'Ruta no disponible.'},404);
    } catch(error) {if(/UNIQUE constraint failed: clients.dni/.test(String(error?.message)))return json({error:'Este DNI ya tiene una ficha. Busca la ficha existente en Clientas o Eliminadas.'},409);console.error(JSON.stringify({event:'client-api-failed',method:request.method}));return json({error:'No se pudo completar la operación. Inténtalo de nuevo.'},500);}
  }
};
