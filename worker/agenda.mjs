const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function validDay(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day&&day>='2025-01-01'&&day<='2100-12-31';}
const validTime=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const CAP_RANK={primary:1,junior:2,plan_b:3};

export function validateAgendaPreferences(input){
  if(!input||!validTime(input.openTime)||!validTime(input.closeTime)||input.closeTime<=input.openTime||!Array.isArray(input.weekdays)||!input.weekdays.length||input.weekdays.some(x=>!Number.isInteger(x)||x<0||x>6))throw Error('Revisa la apertura, el cierre y los días de atención.');
  return {openTime:input.openTime,closeTime:input.closeTime,weekdays:[...new Set(input.weekdays)].sort()};
}

export function validateAppointment(input,prefs){
  if(!input||!validDay(input.date)||!validTime(input.time))throw Error('Selecciona una fecha y una hora válidas.');
  if(typeof input.clientId!=='string'||!input.clientId||typeof input.serviceId!=='string'||!input.serviceId)throw Error('Selecciona una clienta y un servicio.');
  if(!Number.isInteger(input.duration)||input.duration<5||input.duration>600)throw Error('La duración debe estar entre 5 y 600 minutos.');
  const minutes=Number(input.time.slice(0,2))*60+Number(input.time.slice(3)),end=minutes+input.duration;
  if(end>=1440)throw Error('La cita debe terminar el mismo día.');
  const endTime=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
  if(!prefs.weekdays.includes(new Date(input.date+'T12:00:00Z').getUTCDay())||input.time<prefs.openTime||endTime>prefs.closeTime)throw Error('La cita queda fuera del horario de atención. Revisa la fecha o ajusta el horario del salón.');
  const assignee=String(input.assignee||'').trim().replace(/\s+/g,' '),notes=String(input.notes||'').trim();
  if(assignee.length>120||notes.length>4000)throw Error('El responsable admite hasta 120 caracteres y las notas hasta 4000.');
  const mode=input.assignmentMode==='pool_turn'?'pool_turn':'requested';
  const staffId=typeof input.staffId==='string'&&input.staffId.trim()?input.staffId.trim():null;
  const rescheduleReason=String(input.rescheduleReason||'').trim();
  if(rescheduleReason.length>500)throw Error('El motivo de reprogramación admite hasta 500 caracteres.');
  return {clientId:input.clientId,serviceId:input.serviceId,staffId,assignmentMode:mode,startsAt:input.date+'T'+input.time+':00-05:00',endsAt:input.date+'T'+endTime+':00-05:00',date:input.date,startTime:input.time,endTime,assignee,notes,rescheduleReason};
}

export function resolveCapability(staffId,service,categoryCaps,serviceOverrides){
  const override=serviceOverrides.find(o=>o.staffId===staffId&&o.serviceId===service.id);
  if(override)return override.capabilityLevel==='disabled'?null:override.capabilityLevel;
  const cat=categoryCaps.find(c=>c.staffId===staffId&&c.category===service.category);
  return cat?cat.capabilityLevel:null;
}

export function getStaffDayStatus(member,day,exceptions){
  const weekday=new Date(day+'T12:00:00Z').getUTCDay();
  const dayEx=exceptions.filter(e=>e.staffId===member.id&&e.exceptionDate===day);
  const extra=dayEx.find(e=>e.kind==='extra_shift');
  const leave=dayEx.find(e=>e.kind==='urgent_leave'||e.kind==='rest_override');
  const blocks=dayEx.filter(e=>e.kind==='partial_block'&&e.startsTime&&e.endsTime);
  if(leave)return {working:false,reason:leave.kind==='urgent_leave'?(leave.reason||'Permiso urgente'):(leave.reason||'Cambio urgente de descanso'),blocks};
  if(member.restWeekday===weekday&&!extra)return {working:false,reason:'Día de descanso semanal',blocks};
  return {working:true,reason:extra?(extra.reason||'Turno extraordinario'):'',blocks};
}

export function rankCandidatesForSlot({staff,service,day,startTime,endTime,categoryCaps,serviceOverrides,exceptions,shifts,dayAppointments,ignoreAppointmentId=null}){
  const startsAt=day+'T'+startTime+':00-05:00',endsAt=day+'T'+endTime+':00-05:00';
  const shiftMap=new Map(shifts.filter(s=>s.day===day&&s.status==='present').map(s=>[s.staffId,s.turnOrder]));
  const absentSet=new Set(shifts.filter(s=>s.day===day&&s.status==='absent').map(s=>s.staffId));
  return staff.filter(m=>m.active&&m.canHoldAppointments).map(m=>{
    const capability=resolveCapability(m.id,service,categoryCaps,serviceOverrides);
    const dayStatus=getStaffDayStatus(m,day,exceptions);
    const partialConflict=dayStatus.blocks.find(b=>b.startsTime<endTime&&b.endsTime>startTime);
    const apptConflict=dayAppointments.find(a=>a.status==='scheduled'&&a.id!==ignoreAppointmentId&&a.staffId===m.id&&a.startsAt<endsAt&&a.endsAt>startsAt);
    const dayLoad=dayAppointments.filter(a=>a.status==='scheduled'&&a.id!==ignoreAppointmentId&&a.staffId===m.id&&a.startsAt.startsWith(day)).length;
    let available=true,unavailableReason='';
    if(!capability){available=false;unavailableReason='No habilitada para este servicio';}
    else if(absentSet.has(m.id)){available=false;unavailableReason='Ausente hoy';}
    else if(!dayStatus.working){available=false;unavailableReason=dayStatus.reason;}
    else if(partialConflict){available=false;unavailableReason='Bloqueo parcial ('+partialConflict.startsTime+'–'+partialConflict.endsTime+')';}
    else if(apptConflict){available=false;unavailableReason='Ocupada ('+apptConflict.startsAt.slice(11,16)+'–'+apptConflict.endsAt.slice(11,16)+')';}
    return {
      staffId:m.id,displayName:m.displayName,shortName:m.shortName||m.displayName,role:m.role,seniorityTier:m.seniorityTier,
      capability,available,unavailableReason,turnOrder:shiftMap.get(m.id)??null,dayLoad
    };
  }).sort((a,b)=>{
    if(a.available!==b.available)return a.available?-1:1;
    const ra=CAP_RANK[a.capability]||9,rb=CAP_RANK[b.capability]||9;
    if(ra!==rb)return ra-rb;
    const ta=a.turnOrder??999,tb=b.turnOrder??999;
    if(ta!==tb)return ta-tb;
    if(a.dayLoad!==b.dayLoad)return a.dayLoad-b.dayLoad;
    return a.displayName.localeCompare(b.displayName,'es');
  });
}

async function loadStaffContext(db,monthStart,monthEnd,day){
  const [staffRes,catRes,ovrRes,exRes,shiftRes]=await db.batch([
    db.prepare(`SELECT id,display_name AS displayName,short_name AS shortName,role,seniority_tier AS seniorityTier,can_hold_appointments AS canHoldAppointments,rest_weekday AS restWeekday,specialty_summary AS specialtySummary,notes,active FROM staff ORDER BY CASE role WHEN 'stylist' THEN 1 WHEN 'junior_stylist_assistant' THEN 2 WHEN 'manicurist' THEN 3 ELSE 4 END,display_name COLLATE NOCASE`),
    db.prepare('SELECT staff_id AS staffId,category,capability_level AS capabilityLevel FROM staff_category_capabilities'),
    db.prepare('SELECT staff_id AS staffId,service_id AS serviceId,capability_level AS capabilityLevel FROM staff_service_overrides'),
    db.prepare('SELECT id,staff_id AS staffId,exception_date AS exceptionDate,kind,starts_time AS startsTime,ends_time AS endsTime,reason,created_at AS createdAt FROM staff_schedule_exceptions WHERE exception_date>=? AND exception_date<? ORDER BY exception_date,starts_time').bind(monthStart,monthEnd),
    db.prepare('SELECT day,staff_id AS staffId,turn_order AS turnOrder,checked_in_at AS checkedInAt,status FROM staff_daily_shifts WHERE day=? ORDER BY turn_order').bind(day)
  ]);
  return {
    staff:staffRes.results.map(s=>({...s,active:!!s.active,canHoldAppointments:!!s.canHoldAppointments})),
    categoryCaps:catRes.results,
    serviceOverrides:ovrRes.results,
    exceptions:exRes.results,
    shifts:shiftRes.results
  };
}

async function preferences(db){const p=await db.prepare("SELECT open_time,close_time,weekdays_json FROM agenda_preferences WHERE id='salon'").first();return {openTime:p.open_time,closeTime:p.close_time,weekdays:JSON.parse(p.weekdays_json)};}
const DEFAULT_ACTOR={accountId:'acct-admin',email:'admin@touche.pe',displayName:'Administración Touché',role:'admin',staffId:null};
function auditAgenda(db,actorEmail,id,action,fields,onlyChanged=false){return db.prepare('INSERT INTO audit_log(id,actor,action,entity_type,entity_id,changes_json) SELECT ?,?,?,?,?,?'+(onlyChanged?' WHERE changes()>0':'')).bind(crypto.randomUUID(),actorEmail||'admin@touche.pe',action,'appointment',id,JSON.stringify({fields}));}
function apptEvent(db,actorEmail,appointmentId,eventType,{prevStarts=null,prevEnds=null,prevStaff=null,nextStarts=null,nextEnds=null,nextStaff=null,note=''}={}){
  return db.prepare('INSERT INTO appointment_events(id,appointment_id,event_type,previous_starts_at,previous_ends_at,previous_staff_id,next_starts_at,next_ends_at,next_staff_id,note,actor) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),appointmentId,eventType,prevStarts,prevEnds,prevStaff,nextStarts,nextEnds,nextStaff,String(note||'').slice(0,500),actorEmail||'admin@touche.pe');
}

export async function handleAgenda(request,db,readBody,actor=DEFAULT_ACTOR){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!path.startsWith('/api/agenda')&&!path.startsWith('/api/appointments')&&!path.startsWith('/api/staff')&&!path.startsWith('/api/services'))return null;
  const actorEmail=actor?.email||'admin@touche.pe';
  const isAdmin=(actor?.role||'admin')==='admin';
  const log=(dbConn,id,action,fields,onlyChanged=false)=>auditAgenda(dbConn,actorEmail,id,action,fields,onlyChanged);

  if(path==='/api/agenda/preferences'){
    if(method==='GET')return response(await preferences(db));
    if(method==='PATCH'){
      if(!isAdmin)return response({error:'Solo Administración puede modificar el horario del salón.'},403);
      let p;try{p=validateAgendaPreferences(await readBody(request));}catch(e){return response({error:e.message},400);}
      await db.batch([db.prepare("UPDATE agenda_preferences SET open_time=?,close_time=?,weekdays_json=? WHERE id='salon'").bind(p.openTime,p.closeTime,JSON.stringify(p.weekdays)),log(db,'salon','update-agenda-hours',['openTime','closeTime','weekdays'])]);return response(p);
    }
  }

  if(path==='/api/agenda/notes'&&method==='PATCH'){
    let p;try{p=await readBody(request);if(!validDay(p.date)||typeof p.notes!=='string'||p.notes.length>6000)throw Error('Fecha inválida o notas mayores a 6000 caracteres.');}catch(e){return response({error:e.message},400);}
    const now=new Date().toISOString();await db.batch([db.prepare('INSERT INTO agenda_day_notes(day,notes,updated_at) VALUES (?,?,?) ON CONFLICT(day) DO UPDATE SET notes=excluded.notes,updated_at=excluded.updated_at').bind(p.date,p.notes.trim(),now),log(db,p.date,'update-day-notes',['notes'])]);return response({saved:true});
  }

  if(path==='/api/agenda'&&method==='GET'){
    const day=url.searchParams.get('date');if(!validDay(day))return response({error:'Fecha no válida.'},400);
    const bootstrap=url.searchParams.get('bootstrap')==='1';
    const start=day.slice(0,7)+'-01',next=new Date(start+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
    const end=next.toISOString().slice(0,10);
    const stmts=[
      db.prepare(`SELECT a.id,a.client_id AS clientId,c.full_name AS clientName,c.phone AS clientPhone,c.dni AS clientDni,
        a.service_id AS serviceId,s.name AS serviceName,s.category AS serviceCategory,
        a.staff_id AS staffId,COALESCE(st.short_name,st.display_name,a.assignee) AS staffName,a.assignee,
        a.assignment_mode AS assignmentMode,a.confirmation_status AS confirmationStatus,
        a.reminded_day_before_at AS remindedDayBeforeAt,a.reminded_same_day_at AS remindedSameDayAt,
        a.confirmed_at AS confirmedAt,a.reschedule_count AS rescheduleCount,a.cancel_reason AS cancelReason,
        a.starts_at AS startsAt,a.ends_at AS endsAt,a.status,a.notes,c.archived_at AS clientArchived,
        (SELECT COUNT(*) FROM appointments x WHERE x.client_id=a.client_id AND x.status='no_show') AS clientNoShows
        FROM appointments a JOIN clients c ON c.id=a.client_id JOIN services s ON s.id=a.service_id LEFT JOIN staff st ON st.id=a.staff_id
        WHERE a.starts_at>=? AND a.starts_at<? ORDER BY a.starts_at,c.full_name`).bind(start,end),
      db.prepare('SELECT notes,updated_at AS updatedAt FROM agenda_day_notes WHERE day=?').bind(day),
      db.prepare("SELECT open_time,close_time,weekdays_json FROM agenda_preferences WHERE id='salon'"),
      db.prepare(`SELECT id,display_name AS displayName,short_name AS shortName,role,seniority_tier AS seniorityTier,can_hold_appointments AS canHoldAppointments,rest_weekday AS restWeekday,specialty_summary AS specialtySummary,notes,active FROM staff ORDER BY CASE role WHEN 'stylist' THEN 1 WHEN 'junior_stylist_assistant' THEN 2 WHEN 'manicurist' THEN 3 ELSE 4 END,display_name COLLATE NOCASE`),
      db.prepare('SELECT staff_id AS staffId,category,capability_level AS capabilityLevel FROM staff_category_capabilities'),
      db.prepare('SELECT staff_id AS staffId,service_id AS serviceId,capability_level AS capabilityLevel FROM staff_service_overrides'),
      db.prepare('SELECT id,staff_id AS staffId,exception_date AS exceptionDate,kind,starts_time AS startsTime,ends_time AS endsTime,reason,created_at AS createdAt FROM staff_schedule_exceptions WHERE exception_date>=? AND exception_date<? ORDER BY exception_date,starts_time').bind(start,end),
      db.prepare('SELECT day,staff_id AS staffId,turn_order AS turnOrder,checked_in_at AS checkedInAt,status FROM staff_daily_shifts WHERE day=? ORDER BY turn_order').bind(day)
    ];
    if(bootstrap){
      stmts.push(
        db.prepare(`SELECT c.id,c.full_name AS name,c.dni,c.phone,
          (SELECT MAX(performed_on) FROM treatments WHERE client_id=c.id) AS lastVisit,
          (SELECT service_name FROM treatments WHERE client_id=c.id ORDER BY performed_on DESC,rowid DESC LIMIT 1) AS lastService,
          (SELECT technical_notes FROM treatments WHERE client_id=c.id AND technical_notes<>'' ORDER BY performed_on DESC,rowid DESC LIMIT 1) AS lastTechNote,
          (SELECT COUNT(*) FROM appointments WHERE client_id=c.id AND status='no_show') AS noShowCount
          FROM clients c WHERE c.archived_at IS NULL ORDER BY c.full_name COLLATE NOCASE`),
        db.prepare('SELECT id,name,category,price_cents AS priceCents,duration_minutes AS durationMinutes,duration_max_minutes AS durationMaxMinutes FROM services WHERE active=1 ORDER BY category,name COLLATE NOCASE')
      );
    }
    const res=await db.batch(stmts);
    const p=res[2].results[0];
    const payload={
      appointments:res[0].results,
      dayNote:res[1].results[0]||{notes:'',updatedAt:null},
      preferences:{openTime:p.open_time,closeTime:p.close_time,weekdays:JSON.parse(p.weekdays_json)},
      staff:res[3].results.map(s=>({...s,active:!!s.active,canHoldAppointments:!!s.canHoldAppointments})),
      categoryCapabilities:res[4].results,
      serviceOverrides:res[5].results,
      exceptions:res[6].results,
      dailyShifts:res[7].results
    };
    if(bootstrap){
      payload.clients=res[8].results;
      payload.services=res[9].results;
      payload.currentUser={id:actor?.accountId||'acct-admin',email:actorEmail,displayName:actor?.displayName||'Administración Touché',role:actor?.role||'admin',staffId:actor?.staffId??null};
    }
    return response(payload);
  }

  if(path==='/api/agenda/shifts'&&method==='PUT'){
    let body;try{body=await readBody(request);}catch(e){return response({error:e.message},400);}
    if(!validDay(body?.day)||!Array.isArray(body?.shifts))return response({error:'Envía una fecha válida y el orden de llegada del equipo.'},400);
    const seen=new Set(),now=new Date().toISOString();
    const clean=[];
    for(let i=0;i<body.shifts.length;i++){
      const s=body.shifts[i];
      if(!s||typeof s.staffId!=='string'||seen.has(s.staffId))return response({error:'Lista de turnos inválida o repetida.'},400);
      seen.add(s.staffId);
      const st=s.status==='absent'?'absent':'present';
      const order=Number.isInteger(s.turnOrder)&&s.turnOrder>=1?s.turnOrder:i+1;
      clean.push({staffId:s.staffId,turnOrder:order,status:st,checkedInAt:typeof s.checkedInAt==='string'&&s.checkedInAt?s.checkedInAt:now});
    }
    const stmts=[db.prepare('DELETE FROM staff_daily_shifts WHERE day=?').bind(body.day)];
    for(const s of clean){
      stmts.push(db.prepare('INSERT INTO staff_daily_shifts(day,staff_id,turn_order,checked_in_at,status,updated_at) VALUES (?,?,?,?,?,?)').bind(body.day,s.staffId,s.turnOrder,s.checkedInAt,s.status,now));
    }
    stmts.push(log(db,body.day,'update-daily-shifts',['shifts']));
    await db.batch(stmts);
    return response({saved:true,day:body.day,shifts:clean});
  }

  if(path==='/api/agenda/assign-turn'&&method==='POST'){
    let body;try{body=await readBody(request);}catch(e){return response({error:e.message},400);}
    const id=body?.appointmentId;
    if(typeof id!=='string'||!id)return response({error:'Indica la cita a asignar.'},400);
    const existing=await db.prepare('SELECT * FROM appointments WHERE id=?').bind(id).first();
    if(!existing||existing.status!=='scheduled')return response({error:'La cita no existe o ya no está programada.'},404);
    const service=await db.prepare('SELECT id,name,category FROM services WHERE id=?').bind(existing.service_id).first();
    const day=existing.starts_at.slice(0,10),startTime=existing.starts_at.slice(11,16),endTime=existing.ends_at.slice(11,16);
    const monthStart=day.slice(0,7)+'-01',nextM=new Date(monthStart+'T12:00:00Z');nextM.setUTCMonth(nextM.getUTCMonth()+1);
    const ctx=await loadStaffContext(db,monthStart,nextM.toISOString().slice(0,10),day);
    const dayAppts=(await db.prepare(`SELECT id,staff_id AS staffId,starts_at AS startsAt,ends_at AS endsAt,status FROM appointments WHERE status='scheduled' AND starts_at>=? AND starts_at<?`).bind(day,day+'T23:59:59-05:00').all()).results;
    const ranked=rankCandidatesForSlot({staff:ctx.staff,service,day,startTime,endTime,categoryCaps:ctx.categoryCaps,serviceOverrides:ctx.serviceOverrides,exceptions:ctx.exceptions,shifts:ctx.shifts,dayAppointments:dayAppts,ignoreAppointmentId:id});
    const best=ranked.find(c=>c.available);
    if(!best)return response({error:'No hay ninguna colaboradora habilitada libre para este horario.'},409);
    const now=new Date().toISOString();
    const guard=`NOT EXISTS(SELECT 1 FROM appointments WHERE status='scheduled' AND id<>? AND starts_at<? AND ends_at>? AND staff_id=?)`;
    const r=await db.batch([
      db.prepare(`UPDATE appointments SET staff_id=?,assignee=?,updated_at=? WHERE id=? AND status='scheduled' AND ${guard}`).bind(best.staffId,best.shortName,now,id,id,existing.ends_at,existing.starts_at,best.staffId),
      apptEvent(db,actorEmail,id,'reassigned',{prevStaff:existing.staff_id,nextStaff:best.staffId,note:'Asignación por orden de llegada física'+(best.turnOrder?' (turno '+best.turnOrder+')':'')}),
      log(db,id,'assign-turn',['staff_id','assignee'],true)
    ]);
    if(!r[0].meta.changes)return response({error:'El horario se ocupó antes de asignar. Recarga la agenda.'},409);
    return response({saved:true,assigned:best});
  }

  if(path==='/api/staff'&&method==='GET'){
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
    const start=today.slice(0,7)+'-01',next=new Date(start+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
    const ctx=await loadStaffContext(db,start,next.toISOString().slice(0,10),today);
    return response(ctx);
  }

  const staffMatch=path.match(/^\/api\/staff\/([a-zA-Z0-9-]+)$/);
  if(staffMatch&&method==='PATCH'){
    if(!isAdmin)return response({error:'Solo Administración puede modificar colaboradoras y descansos.'},403);
    const id=staffMatch[1];
    const existing=await db.prepare('SELECT * FROM staff WHERE id=?').bind(id).first();
    if(!existing)return response({error:'Colaboradora no encontrada.'},404);
    let body;try{body=await readBody(request);}catch(e){return response({error:e.message},400);}
    const restWeekday=body.restWeekday===null||body.restWeekday===''?null:Number(body.restWeekday);
    if(restWeekday!==null&&(!Number.isInteger(restWeekday)||restWeekday<0||restWeekday>6))return response({error:'Día de descanso inválido.'},400);
    const specialty=typeof body.specialtySummary==='string'?body.specialtySummary.trim().slice(0,400):existing.specialty_summary;
    const shortName=typeof body.shortName==='string'&&body.shortName.trim()?body.shortName.trim().slice(0,60):existing.short_name;
    const active=typeof body.active==='boolean'?(body.active?1:0):existing.active;
    await db.batch([
      db.prepare('UPDATE staff SET short_name=?,rest_weekday=?,specialty_summary=?,active=? WHERE id=?').bind(shortName,restWeekday,specialty,active,id),
      log(db,id,'update-staff',['shortName','restWeekday','specialtySummary','active'])
    ]);
    const shared=restWeekday===null?[]:(await db.prepare('SELECT display_name AS displayName FROM staff WHERE active=1 AND id<>? AND rest_weekday=?').bind(id,restWeekday).all()).results.map(x=>x.displayName);
    return response({saved:true,sharedRestWith:shared});
  }

  if(path==='/api/staff/exceptions'&&method==='POST'){
    if(!isAdmin)return response({error:'Solo Administración puede registrar imprevistos o cambios de descanso.'},403);
    let body;try{body=await readBody(request);}catch(e){return response({error:e.message},400);}
    const validKinds=['rest_override','urgent_leave','extra_shift','partial_block'];
    if(!body||typeof body.staffId!=='string'||!validDay(body.exceptionDate)||!validKinds.includes(body.kind))return response({error:'Datos de excepción inválidos.'},400);
    if(body.kind==='partial_block'&&(!validTime(body.startsTime)||!validTime(body.endsTime)||body.endsTime<=body.startsTime))return response({error:'Indica hora de inicio y fin válidas para el bloqueo parcial.'},400);
    const member=await db.prepare('SELECT id,display_name FROM staff WHERE id=?').bind(body.staffId).first();
    if(!member)return response({error:'Colaboradora no encontrada.'},404);
    const id=crypto.randomUUID(),reason=String(body.reason||'').trim().slice(0,400);
    const st=body.kind==='partial_block'?body.startsTime:null,en=body.kind==='partial_block'?body.endsTime:null;
    await db.batch([
      db.prepare('INSERT INTO staff_schedule_exceptions(id,staff_id,exception_date,kind,starts_time,ends_time,reason,created_by) VALUES (?,?,?,?,?,?,?,?)').bind(id,body.staffId,body.exceptionDate,body.kind,st,en,reason,actorEmail),
      log(db,id,'create-staff-exception',['staffId','exceptionDate','kind','reason'])
    ]);
    let affected=[];
    if(body.kind!=='extra_shift'){
      const appts=(await db.prepare(`SELECT a.id,c.full_name AS clientName,s.name AS serviceName,a.starts_at AS startsAt,a.ends_at AS endsAt FROM appointments a JOIN clients c ON c.id=a.client_id JOIN services s ON s.id=a.service_id WHERE a.staff_id=? AND a.status='scheduled' AND a.starts_at LIKE ?`).bind(body.staffId,body.exceptionDate+'%').all()).results;
      affected=body.kind==='partial_block'?appts.filter(a=>a.startsAt.slice(11,16)<en&&a.endsAt.slice(11,16)>st):appts;
    }
    return response({id,saved:true,affectedAppointments:affected},201);
  }

  const exDelMatch=path.match(/^\/api\/staff\/exceptions\/([a-zA-Z0-9-]+)$/);
  if(exDelMatch&&method==='DELETE'){
    if(!isAdmin)return response({error:'Solo Administración puede eliminar excepciones.'},403);
    const id=exDelMatch[1];
    await db.batch([db.prepare('DELETE FROM staff_schedule_exceptions WHERE id=?').bind(id),log(db,id,'delete-staff-exception',[])]);
    return response({deleted:true});
  }

  const svcMatch=path.match(/^\/api\/services\/([a-zA-Z0-9-]+)$/);
  if(svcMatch&&method==='PATCH'){
    if(!isAdmin)return response({error:'Solo Administración puede modificar los tiempos base de servicios.'},403);
    const id=svcMatch[1];
    const existing=await db.prepare('SELECT id FROM services WHERE id=?').bind(id).first();
    if(!existing)return response({error:'Servicio no encontrado.'},404);
    let body;try{body=await readBody(request);}catch(e){return response({error:e.message},400);}
    const dMin=body.durationMinutes===null||body.durationMinutes===''?null:Number(body.durationMinutes);
    const dMax=body.durationMaxMinutes===null||body.durationMaxMinutes===''?dMin:Number(body.durationMaxMinutes);
    if(dMin!==null&&(!Number.isInteger(dMin)||dMin<5||dMin>600))return response({error:'Duración mínima entre 5 y 600 minutos.'},400);
    if(dMax!==null&&(!Number.isInteger(dMax)||dMax<5||dMax>600||(dMin!==null&&dMax<dMin)))return response({error:'Duración máxima inválida.'},400);
    await db.batch([
      db.prepare('UPDATE services SET duration_minutes=?,duration_max_minutes=? WHERE id=?').bind(dMin,dMax,id),
      log(db,id,'update-service-duration',['durationMinutes','durationMaxMinutes'])
    ]);
    return response({saved:true,id,durationMinutes:dMin,durationMaxMinutes:dMax});
  }

  const match=path.match(/^\/api\/appointments\/([a-zA-Z0-9-]+)(\/(cancel|complete|no-show|confirm|remind|events))?$/),id=match?.[1];
  const existing=id?await db.prepare('SELECT * FROM appointments WHERE id=?').bind(id).first():null;
  if(id&&!existing)return response({error:'La cita no existe.'},404);

  if(match?.[3]==='events'&&method==='GET'){
    const events=(await db.prepare(`SELECT e.id,e.event_type AS eventType,e.previous_starts_at AS previousStartsAt,e.previous_ends_at AS previousEndsAt,e.previous_staff_id AS previousStaffId,e.next_starts_at AS nextStartsAt,e.next_ends_at AS nextEndsAt,e.next_staff_id AS nextStaffId,e.note,e.actor,e.created_at AS createdAt FROM appointment_events e WHERE e.appointment_id=? ORDER BY e.created_at DESC`).bind(id).all()).results;
    return response({events});
  }

  if(match?.[3]&&method==='POST'){
    const action=match[3];
    if(existing.status!=='scheduled')return response({error:'Esta cita ya no está programada.'},409);
    const now=new Date().toISOString();
    let body={};try{if(request.headers.get('content-type')?.includes('application/json'))body=await readBody(request);}catch{}

    if(action==='remind'){
      const moment=body?.moment==='same_day'?'same_day':'day_before';
      const statusVal=moment==='same_day'?'reminded_same_day':'reminded_day_before';
      const col=moment==='same_day'?'reminded_same_day_at':'reminded_day_before_at';
      await db.batch([
        db.prepare(`UPDATE appointments SET ${col}=?,confirmation_status=CASE WHEN confirmation_status='confirmed' THEN 'confirmed' ELSE ? END,updated_at=? WHERE id=? AND status='scheduled'`).bind(now,statusVal,now,id),
        apptEvent(db,actorEmail,id,statusVal,{note:moment==='same_day'?'Recordatorio preparado (mismo día)':'Recordatorio preparado (día anterior)'}),
        log(db,id,'remind-appointment',[col,'confirmation_status'],true)
      ]);
      return response({saved:true,moment,at:now});
    }

    if(action==='confirm'){
      await db.batch([
        db.prepare(`UPDATE appointments SET confirmation_status='confirmed',confirmed_at=?,updated_at=? WHERE id=? AND status='scheduled'`).bind(now,now,id),
        apptEvent(db,actorEmail,id,'confirmed',{note:String(body?.note||'Confirmada por clienta').slice(0,300)}),
        log(db,id,'confirm-appointment',['confirmation_status','confirmed_at'],true)
      ]);
      return response({saved:true,confirmedAt:now});
    }

    if(action==='no-show'){
      const note=String(body?.note||'No se presentó a la cita').trim().slice(0,400);
      const results=await db.batch([
        db.prepare("UPDATE appointments SET status='no_show',cancel_reason=?,updated_at=? WHERE id=? AND status='scheduled'").bind(note,now,id),
        apptEvent(db,actorEmail,id,'no_show',{note}),
        log(db,id,'no-show-appointment',['status','cancel_reason'],true)
      ]);
      return results[0].meta.changes?response({saved:true}):response({error:'La cita cambió. Recarga la agenda.'},409);
    }

    if(action==='cancel'){
      const reason=String(body?.reason||'').trim().slice(0,400);
      const results=await db.batch([
        db.prepare("UPDATE appointments SET status='cancelled',cancel_reason=?,updated_at=? WHERE id=? AND status='scheduled'").bind(reason,now,id),
        apptEvent(db,actorEmail,id,'cancelled',{note:reason||'Cita cancelada'}),
        log(db,id,'cancel-appointment',['status','cancel_reason'],true)
      ]);
      return results[0].meta.changes?response({saved:true}):response({error:'La cita cambió. Recarga la agenda.'},409);
    }

    if(action==='complete'){
      if(Date.parse(existing.ends_at)>Date.now())return response({error:'No se puede completar una cita que aún no ha terminado.'},400);
      const techNote=String(body?.technicalNotes||'').trim().slice(0,2000);
      const treatmentId='appointment-'+id;
      const completed=await db.batch([
        db.prepare(`INSERT OR IGNORE INTO treatments(id,client_id,service_id,service_name,category,performed_on,notes,staff_id,technical_notes) SELECT ?,a.client_id,a.service_id,s.name,s.category,substr(a.starts_at,1,10),a.notes,a.staff_id,? FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.id=? AND a.status='scheduled'`).bind(treatmentId,techNote,id),
        db.prepare("UPDATE appointments SET status='completed',treatment_id=?,updated_at=? WHERE id=? AND status='scheduled' AND EXISTS(SELECT 1 FROM treatments WHERE id=?)").bind(treatmentId,now,id,treatmentId),
        apptEvent(db,actorEmail,id,'completed',{note:techNote?'Atención completada con nota técnica':'Atención completada'}),
        log(db,id,'complete-appointment',['status','treatment_id'],true)
      ]);
      return completed[1].meta.changes?response({saved:true}):response({error:'La cita cambió. Recarga la agenda.'},409);
    }
  }

  if((path==='/api/appointments'&&method==='POST')||(match&&!match[3]&&method==='PATCH')){
    if(existing?.status==='completed')return response({error:'Una atención completada conserva su cita y su historial.'},409);
    let p;try{p=validateAppointment(await readBody(request),await preferences(db));}catch(e){return response({error:e.message},400);}
    const client=await db.prepare('SELECT id FROM clients WHERE id=? AND archived_at IS NULL').bind(p.clientId).first();
    if(!client)return response({error:'Selecciona una clienta activa.'},400);
    const service=await db.prepare('SELECT id,name,category FROM services WHERE id=? AND active=1').bind(p.serviceId).first();
    if(!service)return response({error:'Selecciona un servicio activo.'},400);

    const monthStart=p.date.slice(0,7)+'-01',nextM=new Date(monthStart+'T12:00:00Z');nextM.setUTCMonth(nextM.getUTCMonth()+1);
    const ctx=await loadStaffContext(db,monthStart,nextM.toISOString().slice(0,10),p.date);
    const dayAppts=(await db.prepare(`SELECT id,staff_id AS staffId,service_id AS serviceId,assignment_mode AS assignmentMode,starts_at AS startsAt,ends_at AS endsAt,status FROM appointments WHERE status='scheduled' AND starts_at>=? AND starts_at<?`).bind(p.date,p.date+'T23:59:59-05:00').all()).results;
    const ranked=rankCandidatesForSlot({staff:ctx.staff,service,day:p.date,startTime:p.startTime,endTime:p.endTime,categoryCaps:ctx.categoryCaps,serviceOverrides:ctx.serviceOverrides,exceptions:ctx.exceptions,shifts:ctx.shifts,dayAppointments:dayAppts,ignoreAppointmentId:id||null});

    let chosenStaffId=p.staffId,chosenAssignee=p.assignee;
    if(chosenStaffId){
      const cand=ranked.find(c=>c.staffId===chosenStaffId);
      if(!cand)return response({error:'La colaboradora seleccionada no atiende citas en agenda.'},400);
      if(!cand.available)return response({error:`${cand.shortName}: ${cand.unavailableReason}.`},409);
      chosenAssignee=cand.shortName;
    } else if(p.assignmentMode==='pool_turn'){
      const hasCheckIn=ctx.shifts.some(s=>s.day===p.date&&s.status==='present');
      const freeCandidates=ranked.filter(c=>c.available);
      const overlappingPool=dayAppts.filter(a=>a.id!==id&&!a.staffId&&a.startsAt<p.endsAt&&a.endsAt>p.startsAt).length;
      if(freeCandidates.length<=overlappingPool)return response({error:'No hay cupo disponible con colaboradoras habilitadas en ese horario.'},409);
      if(hasCheckIn){
        chosenStaffId=freeCandidates[0].staffId;
        chosenAssignee=freeCandidates[0].shortName;
      } else {
        chosenAssignee='Por turno de llegada';
      }
    }

    const appointmentId=id||crypto.randomUUID(),now=new Date().toISOString();
    const guard=`NOT EXISTS(SELECT 1 FROM appointments WHERE status='scheduled' AND id<>? AND starts_at<? AND ends_at>? AND (client_id=? OR (? IS NOT NULL AND staff_id=?) OR (? IS NULL AND ?<>'' AND ?<>'Por turno de llegada' AND lower(assignee)=lower(?))))`;
    const guardParams=[appointmentId,p.endsAt,p.startsAt,p.clientId,chosenStaffId,chosenStaffId,chosenStaffId,chosenAssignee,chosenAssignee,chosenAssignee];

    const isReschedule=!!(existing&&(existing.starts_at!==p.startsAt||existing.ends_at!==p.endsAt));
    const statement=id
      ? db.prepare(`UPDATE appointments SET client_id=?,service_id=?,staff_id=?,assignment_mode=?,starts_at=?,ends_at=?,assignee=?,notes=?,status='scheduled',reschedule_count=reschedule_count+?,confirmation_status=CASE WHEN ? THEN 'rescheduled' ELSE confirmation_status END,updated_at=? WHERE id=? AND status<>'completed' AND ${guard}`).bind(p.clientId,p.serviceId,chosenStaffId,p.assignmentMode,p.startsAt,p.endsAt,chosenAssignee,p.notes,isReschedule?1:0,isReschedule?1:0,now,id,...guardParams)
      : db.prepare(`INSERT INTO appointments(id,client_id,service_id,staff_id,assignment_mode,starts_at,ends_at,assignee,notes,status,updated_at) SELECT ?,?,?,?,?,?,?,?,?,'scheduled',? WHERE ${guard}`).bind(appointmentId,p.clientId,p.serviceId,chosenStaffId,p.assignmentMode,p.startsAt,p.endsAt,chosenAssignee,p.notes,now,...guardParams);

    const ev=id
      ? apptEvent(db,actorEmail,appointmentId,isReschedule?'rescheduled':'reassigned',{prevStarts:existing.starts_at,prevEnds:existing.ends_at,prevStaff:existing.staff_id,nextStarts:p.startsAt,nextEnds:p.endsAt,nextStaff:chosenStaffId,note:p.rescheduleReason||(isReschedule?'Cita reprogramada':'Cita editada')})
      : apptEvent(db,actorEmail,appointmentId,'created',{nextStarts:p.startsAt,nextEnds:p.endsAt,nextStaff:chosenStaffId,note:p.assignmentMode==='pool_turn'?'Agendada por orden de llegada / turno':'Agendada con especialista solicitada'});

    const result=await db.batch([statement,ev,log(db,appointmentId,id?'edit-appointment':'create-appointment',['client_id','service_id','staff_id','assignment_mode','starts_at','ends_at','assignee','notes'],true)]);
    if(!result[0].meta.changes)return response({error:'La clienta o la colaboradora ya tiene una cita a esa hora. Elige otro horario.'},409);
    return response({id:appointmentId,saved:true,staffId:chosenStaffId,assignee:chosenAssignee,assignmentMode:p.assignmentMode},id?200:201);
  }
  return response({error:'Ruta de agenda no disponible.'},404);
}
