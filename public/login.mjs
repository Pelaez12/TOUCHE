if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});}

const form=document.getElementById('login-form');
const button=document.getElementById('login-submit');
const error=document.getElementById('login-error');
const emailInput=document.getElementById('login-email');
const passwordInput=document.getElementById('login-password');
const togglePass=document.getElementById('toggle-pass');

togglePass?.addEventListener('click',()=>{
  const show=passwordInput.type==='password';
  passwordInput.type=show?'text':'password';
  togglePass.textContent=show?'Ocultar':'Mostrar';
});

form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(button.disabled)return;
  button.disabled=true;
  button.textContent='Entrando…';
  error.hidden=true;
  try{
    const r=await fetch('/api/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:emailInput.value.trim(),password:passwordInput.value})
    });
    const body=await r.json();
    if(!r.ok)throw Error(body.error||'No se pudo iniciar sesión.');
    passwordInput.value='';
    location.replace('/#agenda');
  }catch(e){
    error.textContent=e.message;
    error.hidden=false;
  }finally{
    button.disabled=false;
    button.textContent='Entrar al salón';
  }
});
