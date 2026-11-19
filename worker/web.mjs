import assets from './assets.generated.mjs';
import {hashText,normalizeEmail,verifyPassword} from './crypto.mjs';

const cookieName='__Host-touche_session';
const securityBase={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Strict-Transport-Security':'max-age=15552000','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
const security={'Cache-Control':'no-store',...securityBase};
const staticCache='public, max-age=3600, stale-while-revalidate=86400';
const codeCache='public, max-age=0, must-revalidate';
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{...security,'Content-Type':'application/json; charset=utf-8',...extra}});
export {hashText};
export function sameOrigin(request){return request.headers.get('origin')===new URL(request.url).origin&&request.headers.get('sec-fetch-site')!=='cross-site';}
function rawSession(request){const value=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);return value&&/^[0-9a-f]{64}$/.test(value)?value:null;}

function accessScopeOf(role,staffRole){
  if(role==='admin')return 'admin';
  if(staffRole==='reception')return 'reception';
  return 'stylist';
}

async function session(request,db){
  const token=rawSession(request);
  if(!token||!db)return null;
  const hash=await hashText(token);
  const row=await db.prepare(`SELECT s.token_hash,a.id AS accountId,a.email,a.display_name AS displayName,a.role,a.staff_id AS staffId,st.role AS staffRole FROM web_sessions s JOIN web_accounts a ON a.id=s.account_id LEFT JOIN staff st ON st.id=a.staff_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1 AND a.password_hash IS NOT NULL`).bind(hash,Math.floor(Date.now()/1000)).first();
  if(!row)return null;
  return {...row,accessScope:accessScopeOf(row.role,row.staffRole)};
}

function etagMatches(header,etag){
  if(!header||!etag)return false;
  const target=etag.replace(/^W\//,'');
  return header.split(',').some(tag=>{const t=tag.trim();return t==='*'||t.replace(/^W\//,'')===target;});
}

function asset(path,request,status=200){
  const a=assets[path];if(!a)return new Response('No encontrado',{status:404,headers:security});
  const isHtml=path.endsWith('.html');
  const isSw=path==='/sw.js';
  const isCode=path.endsWith('.mjs')||path.endsWith('.css')||path.endsWith('.webmanifest');
  const headers=isHtml
    ? {...security,'Content-Type':a.type}
    : isSw
      ? {...securityBase,'Cache-Control':'no-cache','Service-Worker-Allowed':'/','Content-Type':a.type,...(a.etag?{ETag:a.etag}:{})}
      : {...securityBase,'Cache-Control':isCode?codeCache:staticCache,'Content-Type':a.type,...(a.etag?{ETag:a.etag}:{})};
  if(!isHtml&&a.etag&&etagMatches(request?.headers?.get('if-none-match'),a.etag))return new Response(null,{status:304,headers});
  const bytes=Uint8Array.from(atob(a.data),c=>c.charCodeAt(0));
  return new Response(bytes,{status,headers});
}

export async function handleWeb(request,env,readBody,bearerAuthorized=null){
  const url=new URL(request.url),path=url.pathname,now=Math.floor(Date.now()/1000);
  if(path==='/api/login'&&request.method==='POST'){
    if(!sameOrigin(request))return {response:json({error:'Origen no permitido.'},403)};
    let email,rawPass;
    try{
      const input=await readBody(request);
      email=normalizeEmail(input?.email);
      rawPass=typeof input?.password==='string'?input.password:(typeof input?.key==='string'?input.key:'');
      if(!rawPass||rawPass.length>128)throw Error('Ingresa tu contraseña.');
    }catch(e){
      return {response:json({error:e?.message||'Introduce tu correo interno y tu contraseña.'},400)};
    }
    if(!env.ADMIN_TOKEN)return {response:json({error:'El acceso aún no está configurado.'},503)};
    const principal=await hashText((request.headers.get('cf-connecting-ip')||'unknown')+'|'+email+'|'+(env.ADMIN_TOKEN||''));
    const limit=await env.DB.prepare('INSERT INTO web_login_limits(principal_hash,window_start,attempts) VALUES (?,?,1) ON CONFLICT(principal_hash) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END RETURNING attempts').bind(principal,now,now-900,now-900).first();
    if(limit.attempts>10)return {response:json({error:'Demasiados intentos. Vuelve a intentarlo en 15 minutos.'},429,{'Retry-After':'900'})};

    const account=await env.DB.prepare('SELECT a.id,a.email,a.display_name AS displayName,a.role,a.staff_id AS staffId,a.password_hash AS passwordHash,a.salt,a.active,st.role AS staffRole FROM web_accounts a LEFT JOIN staff st ON st.id=a.staff_id WHERE lower(a.email)=?').bind(email).first();
    const ok=account?.passwordHash&&await verifyPassword(rawPass,account.passwordHash,account.salt);
    if(!ok)return {response:json({error:'Correo interno o contraseña incorrectos, o cuenta pendiente de activación.'},401)};
    if(!account.active)return {response:json({error:'Esta cuenta está desactivada por Administración.'},403)};

    const random=crypto.getRandomValues(new Uint8Array(32)),token=[...random].map(b=>b.toString(16).padStart(2,'0')).join(''),hash=await hashText(token),nowIso=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM web_sessions WHERE expires_at<=?').bind(now),
      env.DB.prepare('DELETE FROM web_login_limits WHERE window_start<? OR principal_hash=?').bind(now-900,principal),
      env.DB.prepare('INSERT INTO web_sessions(token_hash,account_id,expires_at,created_at) VALUES (?,?,?,?)').bind(hash,account.id,now+86400,now),
      env.DB.prepare('UPDATE web_accounts SET last_login_at=?,updated_at=? WHERE id=?').bind(nowIso,nowIso,account.id),
      env.DB.prepare('INSERT INTO audit_log(id,actor,action,entity_type,entity_id,changes_json) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),account.email,'login','account',account.id,JSON.stringify({role:account.role}))
    ]);
    const user={id:account.id,email:account.email,displayName:account.displayName,role:account.role,staffId:account.staffId,staffRole:account.staffRole||null,accessScope:accessScopeOf(account.role,account.staffRole)};
    return {response:json({signedIn:true,user},200,{'Set-Cookie':cookieName+'='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400'})};
  }

  const current=await session(request,env.DB);
  if(path==='/api/logout'&&request.method==='POST'){
    if(!sameOrigin(request))return {response:json({error:'Origen no permitido.'},403)};
    if(current){
      await env.DB.batch([
        env.DB.prepare('DELETE FROM web_sessions WHERE token_hash=?').bind(current.token_hash),
        env.DB.prepare('INSERT INTO audit_log(id,actor,action,entity_type,entity_id,changes_json) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),current.email,'logout','account',current.accountId,'{}')
      ]);
    }
    return {response:json({signedOut:true},200,{'Set-Cookie':cookieName+'=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'})};
  }

  if(path==='/api/session'){
    if(current){
      return {response:json({authenticated:true,user:{id:current.accountId,email:current.email,displayName:current.displayName,role:current.role,staffId:current.staffId,staffRole:current.staffRole||null,accessScope:current.accessScope}})};
    }
    if(bearerAuthorized&&await bearerAuthorized()){
      return {response:json({authenticated:true,user:{id:'acct-admin',email:'admin@touche.pe',displayName:'Administración Touché',role:'admin',staffId:null,staffRole:null,accessScope:'admin',localProxy:true}})};
    }
    return {response:json({authenticated:false},401)};
  }

  if(path.startsWith('/api/')){
    return {
      authenticated:!!current,
      sessionHash:current?.token_hash||null,
      actor:current?{accountId:current.accountId,email:current.email,displayName:current.displayName,role:current.role,staffId:current.staffId,staffRole:current.staffRole||null,accessScope:current.accessScope}:null
    };
  }
  if(request.method!=='GET'&&request.method!=='HEAD')return {response:new Response('Método no permitido',{status:405,headers:security})};
  if(path==='/login'||path==='/login.html')return {response:asset('/login.html',request)};
  if(path==='/'||path==='/index.html')return {response:current?asset('/index.html',request):new Response(null,{status:303,headers:{...security,Location:'/login'}})};
  return {response:asset(path,request)};
}
