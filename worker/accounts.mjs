import {hashPassword,normalizeEmail,validatePassword,verifyPassword} from './crypto.mjs';

const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

function accountAudit(db,actorEmail,entityId,action,fields){
  return db.prepare('INSERT INTO audit_log(id,actor,action,entity_type,entity_id,changes_json) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),actorEmail||'admin@touche.pe',action,'account',entityId,JSON.stringify({fields}));
}

export async function handleAccounts(request,db,readBody,actor,currentSessionHash=null){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!path.startsWith('/api/accounts')&&path!=='/api/profile')return null;

  if(path==='/api/profile'){
    if(!actor?.accountId)return response({error:'Inicia sesión para ver tu perfil.'},401);
    const account=await db.prepare('SELECT id,email,display_name AS displayName,role,staff_id AS staffId,active FROM web_accounts WHERE id=?').bind(actor.accountId).first();
    if(!account||!account.active)return response({error:'Tu cuenta no está activa.'},403);
    const staffMember=account.staffId
      ? await db.prepare('SELECT id,display_name AS displayName,short_name AS shortName,role,seniority_tier AS seniorityTier,can_hold_appointments AS canHoldAppointments,rest_weekday AS restWeekday,specialty_summary AS specialtySummary,active FROM staff WHERE id=?').bind(account.staffId).first()
      : null;

    if(method==='GET'){
      const [catCountRes,svcRes,myCatsRes,myOvrsRes]=await db.batch([
        db.prepare('SELECT category,COUNT(*) AS count FROM services WHERE active=1 GROUP BY category ORDER BY category COLLATE NOCASE'),
        db.prepare('SELECT id,name,category,duration_minutes AS durationMinutes,duration_max_minutes AS durationMaxMinutes FROM services WHERE active=1 ORDER BY category COLLATE NOCASE,name COLLATE NOCASE'),
        staffMember ? db.prepare('SELECT category,capability_level AS capabilityLevel FROM staff_category_capabilities WHERE staff_id=? ORDER BY category COLLATE NOCASE').bind(staffMember.id) : db.prepare('SELECT 1 WHERE 0'),
        staffMember ? db.prepare('SELECT service_id AS serviceId,capability_level AS capabilityLevel FROM staff_service_overrides WHERE staff_id=?').bind(staffMember.id) : db.prepare('SELECT 1 WHERE 0')
      ]);
      return response({
        account:{id:account.id,email:account.email,displayName:account.displayName,role:account.role,staffId:account.staffId},
        staff:staffMember?{...staffMember,active:!!staffMember.active,canHoldAppointments:!!staffMember.canHoldAppointments}:null,
        categories:myCatsRes.results,
        serviceOverrides:myOvrsRes.results,
        catalog:{
          categories:catCountRes.results,
          services:svcRes.results
        }
      });
    }

    if(method==='PATCH'){
      let body;try{body=await readBody(request);}catch(e){return response({error:e.message},400);}
      const displayName=Object.hasOwn(body,'displayName')
        ? String(body.displayName||'').trim().replace(/\s+/g,' ')
        : account.displayName;
      if(displayName.length<2||displayName.length>100)return response({error:'Escribe tu nombre completo (entre 2 y 100 caracteres).'},400);

      const now=new Date().toISOString();
      const stmts=[
        db.prepare('UPDATE web_accounts SET display_name=?,updated_at=? WHERE id=?').bind(displayName,now,account.id)
      ];
      const fields=['displayName'];

      if(staffMember){
        const shortName=Object.hasOwn(body,'shortName')&&String(body.shortName||'').trim()
          ? String(body.shortName).trim().replace(/\s+/g,' ').slice(0,60)
          : (staffMember.shortName||displayName.split(/\s+/)[0]).slice(0,60);
        const specialtySummary=Object.hasOwn(body,'specialtySummary')
          ? String(body.specialtySummary||'').trim().slice(0,400)
          : (staffMember.specialtySummary||'');
        stmts.push(
          db.prepare('UPDATE staff SET display_name=?,short_name=?,specialty_summary=? WHERE id=?')
            .bind(displayName,shortName,specialtySummary,staffMember.id)
        );
        fields.push('shortName','specialtySummary');

        if(staffMember.canHoldAppointments&&(Object.hasOwn(body,'categories')||Object.hasOwn(body,'serviceOverrides'))){
          const isJuniorStaff=staffMember.seniorityTier==='junior'||staffMember.role==='junior_stylist_assistant';
          const VALID_CAT_CAPS=isJuniorStaff?['junior','plan_b']:['primary','junior','plan_b'];
          const VALID_OVR_CAPS=isJuniorStaff?['junior','plan_b','disabled']:['primary','junior','plan_b','disabled'];
          const defaultLvl=isJuniorStaff?'junior':'primary';
          const [validCatRows,validSvcRows]=await db.batch([
            db.prepare('SELECT DISTINCT category FROM services WHERE active=1'),
            db.prepare('SELECT id FROM services WHERE active=1')
          ]);
          const validCats=new Set(validCatRows.results.map(r=>r.category));
          const validSvcs=new Set(validSvcRows.results.map(r=>r.id));

          const catCaps=[];
          if(Array.isArray(body.categories)){
            const seen=new Set();
            for(const item of body.categories){
              const cat=String(item?.category||'').trim();
              const lvl=VALID_CAT_CAPS.includes(item?.capabilityLevel)?item.capabilityLevel:defaultLvl;
              if(!cat||seen.has(cat))continue;
              if(!validCats.has(cat))return response({error:'Solo puedes elegir categorías registradas en el catálogo del salón.'},400);
              seen.add(cat);catCaps.push({category:cat,capabilityLevel:lvl});
            }
          }
          const ovrCaps=[];
          if(Array.isArray(body.serviceOverrides)){
            const seen=new Set();
            for(const item of body.serviceOverrides){
              const sid=String(item?.serviceId||'').trim();
              const lvl=VALID_OVR_CAPS.includes(item?.capabilityLevel)?item.capabilityLevel:defaultLvl;
              if(!sid||seen.has(sid))continue;
              if(!validSvcs.has(sid))return response({error:'Solo puedes elegir servicios registrados en el catálogo del salón.'},400);
              seen.add(sid);ovrCaps.push({serviceId:sid,capabilityLevel:lvl});
            }
          }
          stmts.push(
            db.prepare('DELETE FROM staff_category_capabilities WHERE staff_id=?').bind(staffMember.id),
            db.prepare('DELETE FROM staff_service_overrides WHERE staff_id=?').bind(staffMember.id)
          );
          for(const c of catCaps)stmts.push(db.prepare('INSERT INTO staff_category_capabilities(staff_id,category,capability_level) VALUES (?,?,?)').bind(staffMember.id,c.category,c.capabilityLevel));
          for(const o of ovrCaps)stmts.push(db.prepare('INSERT INTO staff_service_overrides(staff_id,service_id,capability_level) VALUES (?,?,?)').bind(staffMember.id,o.serviceId,o.capabilityLevel));
          fields.push('categories','serviceOverrides');
        }
      }

      stmts.push(accountAudit(db,actor.email,account.id,'update-own-profile',fields));
      await db.batch(stmts);
      return response({saved:true,displayName});
    }
    return response({error:'Método no permitido.'},405);
  }

  if(path==='/api/accounts/me/password'&&method==='POST'){
    if(!actor?.accountId)return response({error:'Inicia sesión con una cuenta interna para cambiar tu contraseña.'},400);
    let body;try{body=await readBody(request);}catch(e){return response({error:e.message},400);}
    const current=String(body?.currentPassword||'');
    let nextPassword;try{nextPassword=validatePassword(body?.newPassword);}catch(e){return response({error:e.message},400);}
    const account=await db.prepare('SELECT id,email,password_hash,salt,active FROM web_accounts WHERE id=?').bind(actor.accountId).first();
    if(!account||!account.active)return response({error:'Tu cuenta no está activa.'},403);
    if(!await verifyPassword(current,account.password_hash,account.salt))return response({error:'Tu contraseña actual no es correcta.'},401);
    const {salt,hash}=await hashPassword(nextPassword);
    const now=new Date().toISOString();
    const stmts=[
      db.prepare('UPDATE web_accounts SET password_hash=?,salt=?,password_updated_at=?,updated_at=? WHERE id=?').bind(hash,salt,now,now,account.id),
      currentSessionHash
        ? db.prepare('DELETE FROM web_sessions WHERE account_id=? AND token_hash<>?').bind(account.id,currentSessionHash)
        : db.prepare('DELETE FROM web_sessions WHERE account_id=?').bind(account.id),
      accountAudit(db,actor.email,account.id,'change-own-password',['password'])
    ];
    await db.batch(stmts);
    return response({saved:true});
  }

  if(actor?.role!=='admin'){
    return response({error:'Solo la cuenta única de Administrador puede gestionar usuarios y accesos.'},403);
  }

  if(path==='/api/accounts'&&method==='GET'){
    const [acctRes,staffRes]=await db.batch([
      db.prepare(`SELECT a.id,a.email,a.display_name AS displayName,a.role,a.staff_id AS staffId,s.short_name AS staffShortName,s.role AS staffRole,a.active,(a.password_hash IS NOT NULL) AS hasPassword,a.password_updated_at AS passwordUpdatedAt,a.last_login_at AS lastLoginAt,a.created_at AS createdAt FROM web_accounts a LEFT JOIN staff s ON s.id=a.staff_id ORDER BY CASE a.role WHEN 'admin' THEN 0 ELSE 1 END,a.display_name COLLATE NOCASE`),
      db.prepare(`SELECT id,display_name AS displayName,short_name AS shortName,role,active FROM staff ORDER BY display_name COLLATE NOCASE`)
    ]);
    return response({
      accounts:acctRes.results.map(a=>({...a,active:!!a.active,hasPassword:!!a.hasPassword})),
      staff:staffRes.results.map(s=>({...s,active:!!s.active})),
      singleAdminEnforced:true
    });
  }

  if(path==='/api/accounts'&&method==='POST'){
    let body;try{body=await readBody(request);}catch(e){return response({error:e.message},400);}
    if(body?.role&&body.role!=='collaborator'){
      return response({error:'Solo puede existir una cuenta de Administrador. Las cuentas nuevas deben ser Colaboradores.'},403);
    }
    let email;try{email=normalizeEmail(body?.email);}catch(e){return response({error:e.message},400);}
    const displayName=String(body?.displayName||'').trim().replace(/\s+/g,' ');
    if(displayName.length<2||displayName.length>100)return response({error:'Ingresa un nombre entre 2 y 100 caracteres.'},400);
    const staffId=typeof body?.staffId==='string'&&body.staffId.trim()?body.staffId.trim():null;
    if(staffId){
      const st=await db.prepare('SELECT id FROM staff WHERE id=?').bind(staffId).first();
      if(!st)return response({error:'La colaboradora vinculada no existe.'},400);
      const taken=await db.prepare('SELECT id FROM web_accounts WHERE staff_id=?').bind(staffId).first();
      if(taken)return response({error:'Esa colaboradora ya tiene una cuenta interna asignada.'},409);
    }
    if(await db.prepare('SELECT id FROM web_accounts WHERE lower(email)=?').bind(email).first()){
      return response({error:'Ya existe una cuenta con ese correo interno.'},409);
    }
    const rawPass=typeof body?.password==='string'?body.password:'';
    let salt=null,hash=null,active=0,passwordUpdatedAt=null;
    if(rawPass){
      try{validatePassword(rawPass);}catch(e){return response({error:e.message},400);}
      ({salt,hash}=await hashPassword(rawPass));
      active=body?.active===false?0:1;
      passwordUpdatedAt=new Date().toISOString();
    } else if(body?.active===true){
      return response({error:'Asigna una contraseña para activar la cuenta o créala pendiente/inactiva.'},400);
    }
    const id='acct-'+crypto.randomUUID(),now=new Date().toISOString();
    await db.batch([
      db.prepare('INSERT INTO web_accounts(id,email,display_name,role,staff_id,password_hash,salt,active,password_updated_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id,email,displayName,'collaborator',staffId,hash,salt,active,passwordUpdatedAt,now,now),
      accountAudit(db,actor.email,id,'create-account',['email','displayName','role','staffId','active'])
    ]);
    return response({id,email,displayName,role:'collaborator',staffId,active:!!active,hasPassword:!!hash,saved:true},201);
  }

  const match=path.match(/^\/api\/accounts\/([a-zA-Z0-9-]+)$/);
  if(match&&method==='PATCH'){
    const id=match[1];
    const existing=await db.prepare('SELECT * FROM web_accounts WHERE id=?').bind(id).first();
    if(!existing)return response({error:'Cuenta no encontrada.'},404);
    let body;try{body=await readBody(request);}catch(e){return response({error:e.message},400);}
    if(Object.hasOwn(body,'role')&&body.role!==existing.role){
      return response({error:'No se permite cambiar el rol ni crear otra cuenta de Administrador.'},403);
    }

    let email=existing.email;
    if(Object.hasOwn(body,'email')){
      try{email=normalizeEmail(body.email);}catch(e){return response({error:e.message},400);}
      const dup=await db.prepare('SELECT id FROM web_accounts WHERE lower(email)=? AND id<>?').bind(email,id).first();
      if(dup)return response({error:'Ya existe otra cuenta con ese correo interno.'},409);
    }

    let displayName=existing.display_name;
    if(Object.hasOwn(body,'displayName')){
      displayName=String(body.displayName||'').trim().replace(/\s+/g,' ');
      if(displayName.length<2||displayName.length>100)return response({error:'Ingresa un nombre entre 2 y 100 caracteres.'},400);
    }

    let staffId=existing.staff_id;
    if(Object.hasOwn(body,'staffId')){
      if(existing.role==='admin'&&body.staffId)return response({error:'La cuenta única de Administrador no se vincula a una ficha de colaboradora.'},400);
      staffId=typeof body.staffId==='string'&&body.staffId.trim()?body.staffId.trim():null;
      if(staffId){
        const st=await db.prepare('SELECT id FROM staff WHERE id=?').bind(staffId).first();
        if(!st)return response({error:'La colaboradora vinculada no existe.'},400);
        const taken=await db.prepare('SELECT id FROM web_accounts WHERE staff_id=? AND id<>?').bind(staffId,id).first();
        if(taken)return response({error:'Esa colaboradora ya está vinculada a otra cuenta.'},409);
      }
    }

    let passwordHash=existing.password_hash,salt=existing.salt,passwordUpdatedAt=existing.password_updated_at,passwordChanged=false;
    if(typeof body?.password==='string'&&body.password.length>0){
      try{validatePassword(body.password);}catch(e){return response({error:e.message},400);}
      const hashed=await hashPassword(body.password);
      passwordHash=hashed.hash;salt=hashed.salt;passwordUpdatedAt=new Date().toISOString();passwordChanged=true;
    }

    let active=existing.active;
    if(Object.hasOwn(body,'active')){
      if(existing.role==='admin'&&body.active===false)return response({error:'La única cuenta de Administrador no puede desactivarse.'},400);
      if(body.active===true&&!passwordHash)return response({error:'Asigna primero una contraseña antes de activar esta cuenta.'},400);
      active=body.active?1:0;
    } else if(passwordChanged&&!existing.password_hash){
      // Al asignar contraseña por primera vez a una cuenta pendiente, se activa automáticamente.
      active=1;
    }

    const now=new Date().toISOString();
    const fields=[];
    if(email!==existing.email)fields.push('email');
    if(displayName!==existing.display_name)fields.push('displayName');
    if(staffId!==existing.staff_id)fields.push('staffId');
    if(passwordChanged)fields.push('password');
    if(active!==existing.active)fields.push('active');

    const stmts=[
      db.prepare('UPDATE web_accounts SET email=?,display_name=?,staff_id=?,password_hash=?,salt=?,active=?,password_updated_at=?,updated_at=? WHERE id=?')
        .bind(email,displayName,staffId,passwordHash,salt,active,passwordUpdatedAt,now,id),
      accountAudit(db,actor.email,id,'update-account',fields)
    ];
    if(!active||passwordChanged||email!==existing.email||body.revokeSessions===true){
      if(existing.role==='admin'&&actor.accountId===id&&currentSessionHash&&active){
        stmts.push(db.prepare('DELETE FROM web_sessions WHERE account_id=? AND token_hash<>?').bind(id,currentSessionHash));
      } else {
        stmts.push(db.prepare('DELETE FROM web_sessions WHERE account_id=?').bind(id));
      }
    }
    await db.batch(stmts);
    return response({saved:true,id,email,displayName,role:existing.role,staffId,active:!!active,hasPassword:!!passwordHash});
  }

  return response({error:'Ruta de cuentas no disponible.'},404);
}
