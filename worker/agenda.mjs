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
const DEFAULT_ACTOR={accountId:'acct-admin',email:'admin@touche.pe',displayName:'Administración Touché',role:'admin',staffId:null,staffRole:null,accessScope:'admin'};
function auditAgenda(db,actorEmail,id,action,fields,onlyChanged=false){return db.prepare('INSERT INTO audit_log(id,actor,action,entity_type,entity_id,changes_json) SELECT ?,?,?,?,?,?'+(onlyChanged?' WHERE changes()>0':'')).bind(crypto.randomUUID(),actorEmail||'admin@touche.pe',action,'appointment',id,JSON.stringify({fields}));}
function apptEvent(db,actorEmail,appointmentId,eventType,{prevStarts=null,prevEnds=null,prevStaff=null,nextStarts=null,nextEnds=null,nextStaff=null,note=''}={}){
  return db.prepare('INSERT INTO appointment_events(id,appointment_id,event_type,previous_starts_at,previous_ends_at,previous_staff_id,next_starts_at,next_ends_at,next_staff_id,note,actor) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),appointmentId,eventType,prevStarts,prevEnds,prevStaff,nextStarts,nextEnds,nextStaff,String(note||'').slice(0,500),actorEmail||'admin@touche.pe');
}

export async function handleAgenda(request,db,readBody,actor=DEFAULT_ACTOR){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!path.startsWith('/api/agenda')&&!path.startsWith('/api/appointments')&&!path.startsWith('/api/staff')&&!path.startsWith('/api/services')&&!path.startsWith('/api/alerts'))return null;
  const actorEmail=actor?.email||'admin@touche.pe';
  const isAdmin=(actor?.role||'admin')==='admin';
  const accessScope=actor?.accessScope||(isAdmin?'admin':'stylist');
  const isStylist=accessScope==='stylist';
  const log=(dbConn,id,action,fields,onlyChanged=false)=>auditAgenda(dbConn,actorEmail,id,action,fields,onlyChanged);

  if(path==='/api/alerts'&&method==='GET'){
    if(!isAdmin)return response({error:'Solo Administración puede ver las alertas del salón.'},403);
    const statusFilter=url.searchParams.get('status')||'unread';
    const where=statusFilter==='all'?'':'WHERE al.status=?';
    const stmt=db.prepare(`SELECT al.id,al.appointment_id AS appointmentId,al.client_id AS clientId,al.staff_id AS staffId,
      al.kind,al.title,al.message,al.created_by_email AS createdByEmail,al.created_by_name AS createdByName,
      al.status,al.created_at AS createdAt,al.resolved_at AS resolvedAt,al.resolved_by AS resolvedBy,
      c.full_name AS clientName,c.phone AS clientPhone,s.name AS serviceName,a.starts_at AS startsAt,
      COALESCE(st.short_name,st.display_name,a.assignee) AS staffName
      FROM admin_alerts al
      LEFT JOIN appointments a ON a.id=al.appointment_id
      LEFT JOIN clients c ON c.id=al.client_id
      LEFT JOIN services s ON s.id=a.service_id
      LEFT JOIN staff st ON st.id=al.staff_id
      ${where} ORDER BY al.created_at DESC LIMIT 50`);
    const rows=statusFilter==='all'?(await stmt.all()).results:(await stmt.bind(statusFilter).all()).results;
    return response({alerts:rows,unreadCount:rows.filter(r=>r.status==='unread').length});
  }

  const alertResolveMatch=path.match(/^\/api\/alerts\/([a-zA-Z0-9-]+)\/resolve$/);
  if(alertResolveMatch&&method==='POST'){
    if(!isAdmin)return response({error:'Solo Administración puede marcar alertas como atendidas.'},403);
    const alertId=alertResolveMatch[1],now=new Date().toISOString();
    const res=await db.batch([
      db.prepare("UPDATE admin_alerts SET status='resolved',resolved_at=?,resolved_by=? WHERE id=? AND status='unread'").bind(now,actorEmail,alertId),
      log(db,alertId,'resolve-admin-alert',['status'],true)
    ]);
    return response({saved:true,resolved:res[0].meta.changes>0});
  }

  if(path==='/api/agenda/preferences'){
    if(method==='GET')return response(await preferences(db));
    if(method==='PATCH'){
      if(!isAdmin)return response({error:'Solo Administración puede modificar el horario del salón.'},403);
      let p;try{p=validateAgendaPreferences(await readBody(request));}catch(e){return response({error:e.message},400);}
      await db.batch([db.prepare("UPDATE agenda_preferences SET open_time=?,close_time=?,weekdays_json=? WHERE id='salon'").bind(p.openTime,p.closeTime,JSON.stringify(p.weekdays)),log(db,'salon','update-agenda-hours',['openTime','closeTime','weekdays'])]);return response(p);
    }
  }

  if(path==='/api/agenda/notes'&&method==='PATCH'){
    if(isStylist)return response({error:'Solo Recepción o Administración puede editar las notas del salón.'},403);
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
        a.arrival_status AS arrivalStatus,a.arrived_at AS arrivedAt,
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
        isStylist
          ? db.prepare('SELECT 1 WHERE 0')
          : db.prepare(`SELECT c.id,c.full_name AS name,c.dni,c.phone,
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
    const allStaff=res[3].results.map(s=>({...s,active:!!s.active,canHoldAppointments:!!s.canHoldAppointments}));
    const myStaffId=actor?.staffId||null;
    const payload={
      appointments:isStylist
        ? res[0].results.filter(a=>myStaffId&&a.staffId===myStaffId).map(a=>({...a,clientPhone:null,clientDni:null}))
        : res[0].results,
      dayNote:isStylist?{notes:'',updatedAt:null}:(res[1].results[0]||{notes:'',updatedAt:null}),
      preferences:{openTime:p.open_time,closeTime:p.close_time,weekdays:JSON.parse(p.weekdays_json)},
      staff:isStylist?allStaff.filter(s=>myStaffId&&s.id===myStaffId):allStaff,
      categoryCapabilities:isStylist?res[4].results.filter(c=>myStaffId&&c.staffId===myStaffId):res[4].results,
      serviceOverrides:isStylist?res[5].results.filter(o=>myStaffId&&o.staffId===myStaffId):res[5].results,
      exceptions:isStylist?res[6].results.filter(e=>myStaffId&&e.staffId===myStaffId):res[6].results,
      dailyShifts:isStylist?res[7].results.filter(s=>myStaffId&&s.staffId===myStaffId):res[7].results
    };
    if(bootstrap){
      payload.clients=isStylist?[]:res[8].results;
      payload.services=res[9].results;
      payload.currentUser={id:actor?.accountId||'acct-admin',email:actorEmail,displayName:actor?.displayName||'Administración Touché',role:actor?.role||'admin',staffId:myStaffId,staffRole:actor?.staffRole||null,accessScope};
    }
    return response(payload);
  }

  if(path==='/api/agenda/notifications'&&method==='GET'){
    const todayStr=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
    const endD=new Date(todayStr+'T12:00:00Z');endD.setUTCDate(endD.getUTCDate()+14);
    const endStr=endD.toISOString().slice(0,10);
    const rows=(await db.prepare(`SELECT a.id,c.full_name AS clientName,s.name AS serviceName,
      a.starts_at AS startsAt,a.ends_at AS endsAt,a.staff_id AS staffId,
      COALESCE(st.short_name,st.display_name,NULLIF(a.assignee,''),'Por asignar') AS staffName,
      a.created_at AS createdAt
      FROM appointments a
      JOIN clients c ON c.id=a.client_id
      JOIN services s ON s.id=a.service_id
      LEFT JOIN staff st ON st.id=a.staff_id
      WHERE a.status='scheduled' AND a.starts_at>=? AND a.starts_at<?
      ORDER BY a.starts_at ASC,c.full_name COLLATE NOCASE LIMIT 60`).bind(todayStr,endStr).all()).results;
    const todayCount=rows.filter(r=>r.startsAt.startsWith(todayStr)).length;
    return response({today:todayStr,todayCount,appointments:rows});
  }

  if(path==='/api/agenda/my-arrival'&&method==='POST'){
    if(!actor?.staffId)return response({error:'Tu cuenta no está vinculada a una ficha de estilista.'},400);
    let body={};try{if(request.headers.get('content-type')?.includes('application/json'))body=await readBody(request);}catch{}
    const todayLima=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
    const day=body?.day||todayLima;
    if(!validDay(day))return response({error:'Fecha no válida.'},400);
    if(day!==todayLima&&!isAdmin)return response({error:'Solo puedes marcar tu llegada el día de hoy.'},400);
    const existingShift=await db.prepare('SELECT day,staff_id AS staffId,turn_order AS turnOrder,checked_in_at AS checkedInAt,status FROM staff_daily_shifts WHERE day=? AND staff_id=?').bind(day,actor.staffId).first();
    if(existingShift&&existingShift.status==='present')return response({saved:true,shift:existingShift});
    const [maxRow,member]=await db.batch([
      db.prepare("SELECT COALESCE(MAX(turn_order),0) AS m FROM staff_daily_shifts WHERE day=? AND status='present'").bind(day),
      db.prepare('SELECT id,display_name AS displayName,short_name AS shortName,role FROM staff WHERE id=?').bind(actor.staffId)
    ]);
    const nextOrder=(maxRow.results[0]?.m||0)+1,now=new Date().toISOString();
    const m=member.results[0];
    const staffShort=m?.shortName||m?.displayName?.split(/\s+/)[0]||actor.displayName||'Estilista';
    const staffFull=m?.displayName||actor.displayName||staffShort;
    const rolePrefix=m?.role==='reception'?'Recepción':m?.role==='manicurist'?'la especialista':'la estilista';
    const limaTime=new Intl.DateTimeFormat('es-PE',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'America/Lima'}).format(new Date());
    const alertId='alert-'+crypto.randomUUID();
    const alertTitle=`Llegó ${rolePrefix} ${staffShort}`;
    const alertMsg=`${staffFull} marcó su llegada al salón (${limaTime} · ${nextOrder}.º turno del día).`;
    await db.batch([
      db.prepare(`INSERT INTO staff_daily_shifts(day,staff_id,turn_order,checked_in_at,status,updated_at) VALUES (?,?,?,?,'present',?) ON CONFLICT(day,staff_id) DO UPDATE SET turn_order=excluded.turn_order,checked_in_at=excluded.checked_in_at,status='present',updated_at=excluded.updated_at`).bind(day,actor.staffId,nextOrder,now,now),
      db.prepare(`INSERT INTO admin_alerts(id,appointment_id,client_id,staff_id,kind,title,message,created_by_email,created_by_name,status,created_at) VALUES (?,NULL,NULL,?,'staff_arrived',?,?,?,?,'unread',?)`)
        .bind(alertId,actor.staffId,alertTitle,alertMsg,actorEmail,staffFull,now),
      log(db,day,'my-arrival-checkin',[actor.staffId])
    ]);
    return response({saved:true,alertId,alertTitle,shift:{day,staffId:actor.staffId,turnOrder:nextOrder,checkedInAt:now,status:'present'}});
  }

  if(path==='/api/agenda/shifts'&&method==='PUT'){
    if(isStylist)return response({error:'No puedes ver ni marcar la llegada de otras colaboradoras. Usa «Marcar mi llegada».'},403);
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
    const prevPresent=isAdmin
      ? new Set()
      : new Set((await db.prepare("SELECT staff_id AS staffId FROM staff_daily_shifts WHERE day=? AND status='present'").bind(body.day).all()).results.map(r=>r.staffId));
    const newlyPresent=isAdmin?[]:clean.filter(s=>s.status==='present'&&!prevPresent.has(s.staffId));
    const staffInfoMap=newlyPresent.length
      ? new Map((await db.prepare('SELECT id,display_name AS displayName,short_name AS shortName,role FROM staff').all()).results.map(r=>[r.id,r]))
      : new Map();
    const limaTime=new Intl.DateTimeFormat('es-PE',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'America/Lima'}).format(new Date());

    const stmts=[db.prepare('DELETE FROM staff_daily_shifts WHERE day=?').bind(body.day)];
    for(const s of clean){
      stmts.push(db.prepare('INSERT INTO staff_daily_shifts(day,staff_id,turn_order,checked_in_at,status,updated_at) VALUES (?,?,?,?,?,?)').bind(body.day,s.staffId,s.turnOrder,s.checkedInAt,s.status,now));
    }
    for(const s of newlyPresent){
      const m=staffInfoMap.get(s.staffId);
      if(!m)continue;
      const staffShort=m.shortName||m.displayName.split(/\s+/)[0];
      const rolePrefix=m.role==='reception'?'Recepción':m.role==='manicurist'?'la especialista':'la estilista';
      stmts.push(
        db.prepare(`INSERT INTO admin_alerts(id,appointment_id,client_id,staff_id,kind,title,message,created_by_email,created_by_name,status,created_at) VALUES (?,NULL,NULL,?,'staff_arrived',?,?,?,?,'unread',?)`)
          .bind('alert-'+crypto.randomUUID(),s.staffId,`Llegó ${rolePrefix} ${staffShort}`,`${m.displayName} llegó al salón (${limaTime} · ${s.turnOrder}.º turno del día).`,actorEmail,actor?.displayName||actorEmail,now)
      );
    }
    stmts.push(log(db,body.day,'update-daily-shifts',['shifts']));
    await db.batch(stmts);
    return response({saved:true,day:body.day,shifts:clean});
  }

  if(path==='/api/agenda/assign-turn'&&method==='POST'){
    if(isStylist)return response({error:'Solo Recepción o Administración puede asignar citas por turno.'},403);
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

  const VALID_ROLES=['stylist','junior_stylist_assistant','manicurist','reception'];
  const VALID_TIERS=['senior','junior','support'];
  const VALID_CAT_CAPS=['primary','junior','plan_b'];
  const VALID_OVR_CAPS=['primary','junior','plan_b','disabled'];
  const tierForRole=r=>r==='reception'?'support':r==='junior_stylist_assistant'?'junior':'senior';

  if(path==='/api/staff'&&method==='GET'){
    if(isStylist)return response({error:'Solo Recepción o Administración puede ver los datos del resto del equipo.'},403);
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
    const start=today.slice(0,7)+'-01',next=new Date(start+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
    const ctx=await loadStaffContext(db,start,next.toISOString().slice(0,10),today);
    return response(ctx);
  }

  if(path==='/api/staff'&&method==='POST'){
    if(!isAdmin)return response({error:'Solo Administración puede agregar colaboradoras.'},403);
    let body;try{body=await readBody(request);}catch(e){return response({error:e.message},400);}
    const displayName=String(body?.displayName||'').trim().replace(/\s+/g,' ');
    if(displayName.length<2||displayName.length>100)return response({error:'Escribe un nombre completo de entre 2 y 100 caracteres.'},400);
    const shortName=(String(body?.shortName||'').trim().replace(/\s+/g,' ')||displayName.split(/\s+/)[0]).slice(0,60);
    const role=VALID_ROLES.includes(body?.role)?body.role:'stylist';
    const seniorityTier=VALID_TIERS.includes(body?.seniorityTier)?body.seniorityTier:tierForRole(role);
    const canHold=typeof body?.canHoldAppointments==='boolean'?(body.canHoldAppointments?1:0):(role==='reception'?0:1);
    const restWeekday=body?.restWeekday===null||body?.restWeekday===''||body?.restWeekday===undefined?null:Number(body.restWeekday);
    if(restWeekday!==null&&(!Number.isInteger(restWeekday)||restWeekday<0||restWeekday>6))return response({error:'Día de descanso no válido.'},400);
    const specialty=String(body?.specialtySummary||'').trim().slice(0,400);

    const catCaps=[];
    if(Array.isArray(body?.categories)){
      const seen=new Set();
      for(const item of body.categories){
        const cat=String(item?.category||'').trim();
        const lvl=item?.capabilityLevel;
        if(!cat||!VALID_CAT_CAPS.includes(lvl)||seen.has(cat))continue;
        seen.add(cat);catCaps.push({category:cat,capabilityLevel:lvl});
      }
    }
    const ovrCaps=[];
    if(Array.isArray(body?.serviceOverrides)){
      const seen=new Set();
      for(const item of body.serviceOverrides){
        const sid=String(item?.serviceId||'').trim();
        const lvl=item?.capabilityLevel;
        if(!sid||!VALID_OVR_CAPS.includes(lvl)||seen.has(sid))continue;
        seen.add(sid);ovrCaps.push({serviceId:sid,capabilityLevel:lvl});
      }
    }
    if(ovrCaps.length){
      const existingSvcs=new Set((await db.prepare('SELECT id FROM services WHERE active=1').all()).results.map(r=>r.id));
      if(ovrCaps.some(o=>!existingSvcs.has(o.serviceId)))return response({error:'Alguno de los servicios seleccionados ya no está activo.'},400);
    }

    const id='staff-'+crypto.randomUUID().slice(0,12);
    const stmts=[
      db.prepare('INSERT INTO staff(id,display_name,short_name,role,seniority_tier,can_hold_appointments,rest_weekday,specialty_summary,active) VALUES (?,?,?,?,?,?,?,?,1)')
        .bind(id,displayName,shortName,role,seniorityTier,canHold,restWeekday,specialty)
    ];
    for(const c of catCaps)stmts.push(db.prepare('INSERT OR REPLACE INTO staff_category_capabilities(staff_id,category,capability_level) VALUES (?,?,?)').bind(id,c.category,c.capabilityLevel));
    for(const o of ovrCaps)stmts.push(db.prepare('INSERT OR REPLACE INTO staff_service_overrides(staff_id,service_id,capability_level) VALUES (?,?,?)').bind(id,o.serviceId,o.capabilityLevel));
    stmts.push(log(db,id,'create-staff',['displayName','shortName','role','canHoldAppointments','restWeekday','specialtySummary','capabilities']));
    await db.batch(stmts);
    const shared=restWeekday===null?[]:(await db.prepare('SELECT display_name AS displayName FROM staff WHERE active=1 AND id<>? AND rest_weekday=?').bind(id,restWeekday).all()).results.map(x=>x.displayName);
    return response({id,saved:true,sharedRestWith:shared},201);
  }

  const staffCapMatch=path.match(/^\/api\/staff\/([a-zA-Z0-9-]+)\/capabilities$/);
  if(staffCapMatch&&method==='PUT'){
    if(!isAdmin)return response({error:'Solo Administración puede modificar los servicios que realiza el equipo.'},403);
    const id=staffCapMatch[1];
    const existing=await db.prepare('SELECT id FROM staff WHERE id=?').bind(id).first();
    if(!existing)return response({error:'Colaboradora no encontrada.'},404);
    let body;try{body=await readBody(request);}catch(e){return response({error:e.message},400);}
    const catCaps=[];
    if(Array.isArray(body?.categories)){
      const seen=new Set();
      for(const item of body.categories){
        const cat=String(item?.category||'').trim();
        const lvl=item?.capabilityLevel;
        if(!cat||!VALID_CAT_CAPS.includes(lvl)||seen.has(cat))continue;
        seen.add(cat);catCaps.push({category:cat,capabilityLevel:lvl});
      }
    }
    const ovrCaps=[];
    if(Array.isArray(body?.serviceOverrides)){
      const seen=new Set();
      for(const item of body.serviceOverrides){
        const sid=String(item?.serviceId||'').trim();
        const lvl=item?.capabilityLevel;
        if(!sid||!VALID_OVR_CAPS.includes(lvl)||seen.has(sid))continue;
        seen.add(sid);ovrCaps.push({serviceId:sid,capabilityLevel:lvl});
      }
    }
    if(ovrCaps.length){
      const existingSvcs=new Set((await db.prepare('SELECT id FROM services WHERE active=1').all()).results.map(r=>r.id));
      if(ovrCaps.some(o=>!existingSvcs.has(o.serviceId)))return response({error:'Alguno de los servicios seleccionados no existe.'},400);
    }
    const stmts=[
      db.prepare('DELETE FROM staff_category_capabilities WHERE staff_id=?').bind(id),
      db.prepare('DELETE FROM staff_service_overrides WHERE staff_id=?').bind(id)
    ];
    for(const c of catCaps)stmts.push(db.prepare('INSERT INTO staff_category_capabilities(staff_id,category,capability_level) VALUES (?,?,?)').bind(id,c.category,c.capabilityLevel));
    for(const o of ovrCaps)stmts.push(db.prepare('INSERT INTO staff_service_overrides(staff_id,service_id,capability_level) VALUES (?,?,?)').bind(id,o.serviceId,o.capabilityLevel));
    stmts.push(log(db,id,'update-staff-capabilities',['categories','serviceOverrides']));
    await db.batch(stmts);
    return response({saved:true,staffId:id,categories:catCaps,serviceOverrides:ovrCaps});
  }

  const staffMatch=path.match(/^\/api\/staff\/([a-zA-Z0-9-]+)$/);
  if(staffMatch&&method==='PATCH'){
    if(!isAdmin)return response({error:'Solo Administración puede modificar colaboradoras y descansos.'},403);
    const id=staffMatch[1];
    const existing=await db.prepare('SELECT * FROM staff WHERE id=?').bind(id).first();
    if(!existing)return response({error:'Colaboradora no encontrada.'},404);
    let body;try{body=await readBody(request);}catch(e){return response({error:e.message},400);}
    const displayName=Object.hasOwn(body,'displayName')?String(body.displayName||'').trim().replace(/\s+/g,' '):existing.display_name;
    if(displayName.length<2||displayName.length>100)return response({error:'Escribe un nombre completo de entre 2 y 100 caracteres.'},400);
    const shortName=Object.hasOwn(body,'shortName')&&String(body.shortName||'').trim()?String(body.shortName).trim().replace(/\s+/g,' ').slice(0,60):existing.short_name;
    const role=Object.hasOwn(body,'role')?body.role:existing.role;
    if(!VALID_ROLES.includes(role))return response({error:'Puesto no válido.'},400);
    const seniorityTier=Object.hasOwn(body,'seniorityTier')?body.seniorityTier:(Object.hasOwn(body,'role')?tierForRole(role):existing.seniority_tier);
    if(!VALID_TIERS.includes(seniorityTier))return response({error:'Nivel no válido.'},400);
    const canHold=typeof body.canHoldAppointments==='boolean'?(body.canHoldAppointments?1:0):existing.can_hold_appointments;
    const restWeekday=Object.hasOwn(body,'restWeekday')?(body.restWeekday===null||body.restWeekday===''?null:Number(body.restWeekday)):existing.rest_weekday;
    if(restWeekday!==null&&(!Number.isInteger(restWeekday)||restWeekday<0||restWeekday>6))return response({error:'Día de descanso no válido.'},400);
    const specialty=typeof body.specialtySummary==='string'?body.specialtySummary.trim().slice(0,400):existing.specialty_summary;
    const active=typeof body.active==='boolean'?(body.active?1:0):existing.active;
    await db.batch([
      db.prepare('UPDATE staff SET display_name=?,short_name=?,role=?,seniority_tier=?,can_hold_appointments=?,rest_weekday=?,specialty_summary=?,active=? WHERE id=?')
        .bind(displayName,shortName,role,seniorityTier,canHold,restWeekday,specialty,active,id),
      log(db,id,'update-staff',['displayName','shortName','role','canHoldAppointments','restWeekday','specialtySummary','active'])
    ]);
    const shared=restWeekday===null||!active?[]:(await db.prepare('SELECT display_name AS displayName FROM staff WHERE active=1 AND id<>? AND rest_weekday=?').bind(id,restWeekday).all()).results.map(x=>x.displayName);
    return response({saved:true,sharedRestWith:shared});
  }

  if(staffMatch&&method==='DELETE'){
    if(!isAdmin)return response({error:'Solo Administración puede retirar o eliminar colaboradoras.'},403);
    const id=staffMatch[1];
    const existing=await db.prepare('SELECT id,display_name AS displayName FROM staff WHERE id=?').bind(id).first();
    if(!existing)return response({error:'Colaboradora no encontrada.'},404);
    const [sched,histAppt,histTr,histFollow,linkedAcct,histAlerts]=await db.batch([
      db.prepare("SELECT COUNT(*) AS c FROM appointments WHERE staff_id=? AND status='scheduled'").bind(id),
      db.prepare('SELECT COUNT(*) AS c FROM appointments WHERE staff_id=?').bind(id),
      db.prepare('SELECT COUNT(*) AS c FROM treatments WHERE staff_id=?').bind(id),
      db.prepare('SELECT COUNT(*) AS c FROM client_followups WHERE assigned_to=?').bind(id),
      db.prepare('SELECT COUNT(*) AS c FROM web_accounts WHERE staff_id=?').bind(id),
      db.prepare('SELECT COUNT(*) AS c FROM admin_alerts WHERE staff_id=?').bind(id)
    ]);
    const scheduledCount=sched.results[0]?.c||0;
    if(scheduledCount>0){
      return response({error:`${existing.displayName} tiene ${scheduledCount} cita${scheduledCount===1?'':'s'} programada${scheduledCount===1?'':'s'}. Reasígnala${scheduledCount===1?'':'s'} o cancélala${scheduledCount===1?'':'s'} antes de retirarla.`},409);
    }
    const hasHistory=(histAppt.results[0]?.c||0)+(histTr.results[0]?.c||0)+(histFollow.results[0]?.c||0)+(linkedAcct.results[0]?.c||0)+(histAlerts.results[0]?.c||0)>0;
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
    if(hasHistory){
      await db.batch([
        db.prepare('UPDATE staff SET active=0 WHERE id=?').bind(id),
        db.prepare('DELETE FROM staff_daily_shifts WHERE staff_id=? AND day>=?').bind(id,today),
        log(db,id,'deactivate-staff',['active'])
      ]);
      return response({saved:true,archived:true,deleted:false,message:`${existing.displayName} fue retirada del equipo activo. Su historial de atenciones y cuenta se conservan.`});
    }
    await db.batch([
      db.prepare('DELETE FROM staff_category_capabilities WHERE staff_id=?').bind(id),
      db.prepare('DELETE FROM staff_service_overrides WHERE staff_id=?').bind(id),
      db.prepare('DELETE FROM staff_schedule_exceptions WHERE staff_id=?').bind(id),
      db.prepare('DELETE FROM staff_daily_shifts WHERE staff_id=?').bind(id),
      db.prepare('DELETE FROM staff WHERE id=?').bind(id),
      log(db,id,'delete-staff',[])
    ]);
    return response({saved:true,archived:false,deleted:true,message:`${existing.displayName} fue eliminada del equipo.`});
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

  const match=path.match(/^\/api\/appointments\/([a-zA-Z0-9-]+)(\/(cancel|complete|no-show|confirm|remind|arrival|alert-reminder|events))?$/),id=match?.[1];
  const existing=id?await db.prepare('SELECT * FROM appointments WHERE id=?').bind(id).first():null;
  if(id&&!existing)return response({error:'La cita no existe.'},404);

  if(match?.[3]==='events'&&method==='GET'){
    if(isStylist&&existing.staff_id!==actor?.staffId)return response({error:'Solo puedes consultar tus propias citas.'},403);
    const events=(await db.prepare(`SELECT e.id,e.event_type AS eventType,e.previous_starts_at AS previousStartsAt,e.previous_ends_at AS previousEndsAt,e.previous_staff_id AS previousStaffId,e.next_starts_at AS nextStartsAt,e.next_ends_at AS nextEndsAt,e.next_staff_id AS nextStaffId,e.note,e.actor,e.created_at AS createdAt FROM appointment_events e WHERE e.appointment_id=? ORDER BY e.created_at DESC`).bind(id).all()).results;
    return response({events});
  }

  if(match?.[3]&&method==='POST'){
    const action=match[3];
    if(existing.status!=='scheduled')return response({error:'Esta cita ya no está programada.'},409);
    const now=new Date().toISOString();
    let body={};try{if(request.headers.get('content-type')?.includes('application/json'))body=await readBody(request);}catch{}

    if(action==='arrival'){
      if(isStylist&&existing.staff_id!==actor?.staffId)return response({error:'Solo puedes marcar asistencia en tus propias citas.'},403);
      const arrivalStatus=body?.status==='arrived'?'arrived':body?.status==='not_arrived'?'not_arrived':null;
      if(!arrivalStatus)return response({error:'Indica si la clienta llegó o no llegó.'},400);
      const note=String(body?.note||'').trim().slice(0,300);
      const meta=await db.prepare(`SELECT c.full_name AS clientName,s.name AS serviceName,COALESCE(st.short_name,st.display_name,a.assignee) AS staffName,a.starts_at AS startsAt FROM appointments a JOIN clients c ON c.id=a.client_id JOIN services s ON s.id=a.service_id LEFT JOIN staff st ON st.id=a.staff_id WHERE a.id=?`).bind(id).first();
      if(arrivalStatus==='arrived'){
        await db.batch([
          db.prepare("UPDATE appointments SET arrival_status='arrived',arrived_at=?,updated_at=? WHERE id=? AND status='scheduled'").bind(now,now,id),
          db.prepare("UPDATE admin_alerts SET status='resolved',resolved_at=?,resolved_by=? WHERE appointment_id=? AND kind='client_not_arrived' AND status='unread'").bind(now,actorEmail,id),
          log(db,id,'client-arrived',['arrival_status','arrived_at'],true)
        ]);
        return response({saved:true,arrivalStatus:'arrived',arrivedAt:now});
      }
      const alertId='alert-'+crypto.randomUUID();
      const time=meta?.startsAt?.slice(11,16)||'';
      const title='ALERTA: No llegó el cliente — Recordarle';
      const msg=`${meta?.clientName||'Clienta'} (${meta?.serviceName||'Servicio'}, ${time}) aún no llega con ${meta?.staffName||actor?.displayName||'la estilista'}. Recordarle por WhatsApp o llamar.`+(note?` Nota: ${note}`:'');
      await db.batch([
        db.prepare("UPDATE appointments SET arrival_status='not_arrived',updated_at=? WHERE id=? AND status='scheduled'").bind(now,id),
        db.prepare(`INSERT INTO admin_alerts(id,appointment_id,client_id,staff_id,kind,title,message,created_by_email,created_by_name,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,'unread',?)`)
          .bind(alertId,id,existing.client_id,existing.staff_id,'client_not_arrived',title,msg,actorEmail,actor?.displayName||actorEmail,now),
        log(db,id,'client-not-arrived',['arrival_status'],true)
      ]);
      return response({saved:true,arrivalStatus:'not_arrived',alertId,title});
    }

    if(action==='alert-reminder'){
      if(isStylist&&existing.staff_id!==actor?.staffId)return response({error:'Solo puedes enviar recordatorios sobre tus propias citas.'},403);
      const note=String(body?.note||'').trim().slice(0,300);
      const meta=await db.prepare(`SELECT c.full_name AS clientName,s.name AS serviceName,COALESCE(st.short_name,st.display_name,a.assignee) AS staffName,a.starts_at AS startsAt FROM appointments a JOIN clients c ON c.id=a.client_id JOIN services s ON s.id=a.service_id LEFT JOIN staff st ON st.id=a.staff_id WHERE a.id=?`).bind(id).first();
      const alertId='alert-'+crypto.randomUUID();
      const time=meta?.startsAt?.slice(11,16)||'';
      const title=existing.arrival_status==='not_arrived'
        ?'ALERTA: No llegó el cliente — Recordarle'
        :'ALERTA: Recordar cita al cliente';
      const msg=`${meta?.staffName||actor?.displayName||'Estilista'} solicita recordar la cita de ${meta?.clientName||'clienta'} (${meta?.serviceName||'servicio'}, ${time}).`+(note?` Nota: ${note}`:'');
      await db.batch([
        db.prepare(`INSERT INTO admin_alerts(id,appointment_id,client_id,staff_id,kind,title,message,created_by_email,created_by_name,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,'unread',?)`)
          .bind(alertId,id,existing.client_id,existing.staff_id,'client_reminder_needed',title,msg,actorEmail,actor?.displayName||actorEmail,now),
        log(db,id,'request-client-reminder',['alert'])
      ]);
      return response({saved:true,alertId,title});
    }

    if(action==='remind'){
      if(isStylist)return response({error:'Usa el botón Recordatorio para avisar a Administración.'},403);
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
      if(isStylist)return response({error:'Solo Recepción o Administración puede confirmar citas.'},403);
      await db.batch([
        db.prepare(`UPDATE appointments SET confirmation_status='confirmed',confirmed_at=?,updated_at=? WHERE id=? AND status='scheduled'`).bind(now,now,id),
        apptEvent(db,actorEmail,id,'confirmed',{note:String(body?.note||'Confirmada por clienta').slice(0,300)}),
        log(db,id,'confirm-appointment',['confirmation_status','confirmed_at'],true)
      ]);
      return response({saved:true,confirmedAt:now});
    }

    if(action==='no-show'){
      if(isStylist)return response({error:'Usa No llegó para alertar a Administración.'},403);
      const note=String(body?.note||'No se presentó a la cita').trim().slice(0,400);
      const results=await db.batch([
        db.prepare("UPDATE appointments SET status='no_show',cancel_reason=?,updated_at=? WHERE id=? AND status='scheduled'").bind(note,now,id),
        apptEvent(db,actorEmail,id,'no_show',{note}),
        log(db,id,'no-show-appointment',['status','cancel_reason'],true)
      ]);
      return results[0].meta.changes?response({saved:true}):response({error:'La cita cambió. Recarga la agenda.'},409);
    }

    if(action==='cancel'){
      if(isStylist)return response({error:'Solo Recepción o Administración puede cancelar citas.'},403);
      const reason=String(body?.reason||'').trim().slice(0,400);
      const results=await db.batch([
        db.prepare("UPDATE appointments SET status='cancelled',cancel_reason=?,updated_at=? WHERE id=? AND status='scheduled'").bind(reason,now,id),
        apptEvent(db,actorEmail,id,'cancelled',{note:reason||'Cita cancelada'}),
        log(db,id,'cancel-appointment',['status','cancel_reason'],true)
      ]);
      return results[0].meta.changes?response({saved:true}):response({error:'La cita cambió. Recarga la agenda.'},409);
    }

    if(action==='complete'){
      if(isStylist&&existing.staff_id!==actor?.staffId)return response({error:'Solo puedes finalizar tus propias citas asignadas.'},403);
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
    if(isStylist)return response({error:'Solo Recepción o Administración puede agendar o reprogramar citas.'},403);
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
