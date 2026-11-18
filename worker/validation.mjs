export function validateClient(input,{requireDni=false}={}) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw Error('Datos de clienta inválidos.');
  const name=String(input.name||'').trim().replace(/\s+/g,' ');
  const phone=String(input.phone||'').trim();
  const birthday=String(input.birthday||'').trim();
  const notes=String(input.notes||'').trim();
  const dni=input.dni==null?'':String(input.dni).trim();
  if(name.length<2||name.length>150)throw Error('El nombre debe tener entre 2 y 150 caracteres.');
  if(requireDni&&!dni)throw Error('El DNI es obligatorio para registrar una clienta.');
  if(dni&&(typeof input.dni!=='string'||!/^\d{8}$/.test(dni)))throw Error('El DNI debe tener exactamente 8 dígitos.');
  if(phone && (!/^[+\d\s().-]+$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15))throw Error('Ingresa un teléfono válido de 7 a 15 dígitos.');
  if(birthday) {
    const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima'}).format(new Date());
    if(!/^\d{4}-\d{2}-\d{2}$/.test(birthday)||Number.isNaN(Date.parse(birthday))||new Date(birthday+'T12:00:00Z').toISOString().slice(0,10)!==birthday||birthday>now||birthday<'1900-01-01')throw Error('La fecha de nacimiento no es válida.');
  }
  if(notes.length>4000)throw Error('Las notas admiten hasta 4000 caracteres.');
  return {name,phone,birthday:birthday||null,notes,dni:dni||null};
}

export function validateMessagePreferences(input){
  if(!input||typeof input!=='object'||typeof input.template!=='string'||input.template.trim().length<10||input.template.length>2500||typeof input.promotion!=='string'||input.promotion.length>500)throw Error('La plantilla admite de 10 a 2500 caracteres y la promoción hasta 500.');
  if(input.template.match(/\{(?!nombre\}|servicio\}|fecha\}|promocion\})[^}]*\}/g))throw Error('Usa solo {nombre}, {servicio}, {fecha} y {promocion}.');
  return {template:input.template.trim(),promotion:input.promotion.trim()};
}
