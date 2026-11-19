export function debounce(fn,ms=150){
  let timer;
  return (...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),ms);};
}
export function activePage(){
  const h=location.hash;
  if(h==='#agenda')return 'agenda';
  if(h==='#equipo')return 'team';
  if(h==='#perfil')return 'profile';
  if(h==='#retorno'||h==='#panel')return 'return';
  if(h==='#revision'||h==='#quality')return 'quality';
  if(h==='#cuentas')return 'accounts';
  return 'clients';
}

let sessionPromise=null;

export const store={
  clients:null,
  services:null,
  user:null,
  historyDirty:true,
  clientsDirty:true,
  isAdmin(){return this.user?.role==='admin';},
  accessScope(){
    if(!this.user)return 'admin';
    if(this.user.accessScope)return this.user.accessScope;
    if(this.user.role==='admin')return 'admin';
    return this.user.staffRole==='reception'?'reception':'stylist';
  },
  isStylist(){return this.accessScope()==='stylist';},
  setBootstrap({clients,services,currentUser}){
    if(Array.isArray(clients))this.clients=clients;
    if(Array.isArray(services))this.services=services;
    if(currentUser&&!this.user)this.applyUser(currentUser);
  },
  applyUser(user){
    if(!user)return null;
    this.user=user;
    if(typeof document!=='undefined'){
      document.body.dataset.role=user.role||'collaborator';
      document.body.dataset.scope=this.accessScope();
      window.dispatchEvent(new CustomEvent('touche:session-ready',{detail:{user}}));
    }
    return user;
  }
};

export async function ensureSession(){
  if(store.user)return store.user;
  if(!sessionPromise){
    sessionPromise=(async()=>{
      try{
        const r=await fetch('/api/session');
        if(r.status===401){
          if(!['127.0.0.1','localhost'].includes(location.hostname))location.replace('/login');
          return null;
        }
        if(!r.ok)return null;
        const body=await r.json();
        return store.applyUser(body.user);
      }catch{
        return null;
      }
    })();
  }
  return await sessionPromise;
}
