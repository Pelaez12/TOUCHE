const CACHE_NAME='touche-shell-v6';
const SHELL_ASSETS=[
  '/brand/fonts.css',
  '/brand/montserrat-0.woff2',
  '/brand/logo.png',
  '/brand/icon-192.png',
  '/brand/icon-512.png',
  '/manifest.webmanifest'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL_ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  // Nunca guardar datos privados ni pantallas autenticadas en caché offline.
  if(url.pathname.startsWith('/api/')||url.pathname==='/'||url.pathname.endsWith('.html')||url.pathname==='/login')return;

  // Código y estilos: siempre intentar versión reciente primero para que cada mejora aplique al instante.
  if(url.pathname.endsWith('.mjs')||url.pathname.endsWith('.css')||url.pathname==='/manifest.webmanifest'){
    event.respondWith(
      fetch(req).then(res=>{
        if(res&&res.status===200&&res.type==='basic'){
          const copy=res.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(req,copy)).catch(()=>{});
        }
        return res;
      }).catch(()=>caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached=>{
      const fresh=fetch(req).then(res=>{
        if(res&&res.status===200&&res.type==='basic'){
          const copy=res.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(req,copy)).catch(()=>{});
        }
        return res;
      }).catch(()=>cached);
      return cached||fresh;
    })
  );
});

self.addEventListener('push',event=>{
  let data={title:'Touché Hair Studio',body:'Tienes una novedad en tu agenda de hoy.',url:'/#agenda'};
  try{if(event.data)data={...data,...event.data.json()};}catch{if(event.data)data.body=event.data.text();}
  event.waitUntil(
    self.registration.showNotification(data.title,{
      body:data.body,
      icon:'/brand/icon-192.png',
      badge:'/brand/icon-192.png',
      tag:data.tag||'touche-agenda',
      data:{url:data.url||'/#agenda'}
    })
  );
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const targetUrl=event.notification.data?.url||'/#agenda';
  event.waitUntil(
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(const client of list){
        if(new URL(client.url).origin===self.location.origin&&'focus' in client){
          client.navigate(targetUrl).catch(()=>{});
          return client.focus();
        }
      }
      if(self.clients.openWindow)return self.clients.openWindow(targetUrl);
    })
  );
});
