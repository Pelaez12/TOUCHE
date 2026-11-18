import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.txt':'text/plain'};
const port=Number(process.env.TOUCHE_PORT||5188);
const apiConfig=JSON.parse(await readFile(new URL('.local/api.json',root),'utf8'));
const token=(await readFile(new URL('.local/admin-token',root),'utf8')).trim();
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Referrer-Policy':'no-referrer'};
async function limitedBody(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16000)throw Error('body-limit');chunks.push(chunk);}return Buffer.concat(chunks);}
createServer(async(req,res)=>{
  const send=(status,body,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,...headers});res.end(req.method==='HEAD'?undefined:body);};
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){send(403,JSON.stringify({error:'Host no permitido.'}));return;}
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  if(url.pathname.startsWith('/api/')){
    if(!['/api/session','/api/accounts','/api/accounts/me/password','/api/history','/api/clients','/api/message-preferences','/api/agenda','/api/agenda/preferences','/api/agenda/notes','/api/agenda/shifts','/api/agenda/assign-turn','/api/appointments','/api/staff','/api/staff/exceptions'].includes(url.pathname)&&!/^\/api\/accounts\/[a-zA-Z0-9-]+$/.test(url.pathname)&&!/^\/api\/clients\/[a-zA-Z0-9-]+(\/restore)?$/.test(url.pathname)&&!/^\/api\/appointments\/[a-zA-Z0-9-]+(\/(cancel|complete|no-show|confirm|remind|events))?$/.test(url.pathname)&&!/^\/api\/staff\/[a-zA-Z0-9-]+(\/capabilities)?$/.test(url.pathname)&&!/^\/api\/staff\/exceptions\/[a-zA-Z0-9-]+$/.test(url.pathname)&&!/^\/api\/services\/[a-zA-Z0-9-]+$/.test(url.pathname)){send(404,JSON.stringify({error:'Ruta no disponible.'}));return;}
    if(!['GET','POST','PATCH','PUT','DELETE'].includes(req.method)){send(405,'{}');return;}
    const origin=req.headers.origin;
    if(origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(origin)){send(403,JSON.stringify({error:'Origen no permitido.'}));return;}
    if(req.headers['sec-fetch-site']==='cross-site'){send(403,JSON.stringify({error:'Origen no permitido.'}));return;}
    if(!['GET','DELETE'].includes(req.method)&&!req.headers['content-type']?.includes('application/json')){send(415,JSON.stringify({error:'Se requiere JSON.'}));return;}
    try {
      const body=['POST','PATCH','PUT'].includes(req.method)?await limitedBody(req):undefined;
      const upstream=await fetch(apiConfig.origin+url.pathname+url.search,{method:req.method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body,signal:AbortSignal.timeout(15000)});
      send(upstream.status,await upstream.text());return;
    } catch(error){send(error.message==='body-limit'?413:503,JSON.stringify({error:error.message==='body-limit'?'Los datos son demasiado grandes.':'No se pudo conectar con Cloudflare. Inténtalo nuevamente.'}));return;}
  }
  if(!['GET','HEAD'].includes(req.method)){send(405,'');return;}
  let path=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!/^(index\.html|style\.css|store\.mjs|app\.mjs|clients\.mjs|analytics\.mjs|contact\.mjs|agenda\.mjs|accounts\.mjs|session\.mjs|login\.mjs|login\.css|login\.html|brand\/[a-zA-Z0-9._-]+|icons\/[a-zA-Z0-9._-]+)$/.test(path)){send(404,'No encontrado','text/plain');return;}
  const extension='.'+path.split('.').at(-1);
  try {send(200,await readFile(new URL('public/'+path,root)),types[extension]||'application/octet-stream');}
  catch {send(404,'No encontrado','text/plain');}
}).listen(port,'127.0.0.1',()=>console.log('Touché: http://127.0.0.1:'+port));
