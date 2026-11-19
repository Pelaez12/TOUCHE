const clean=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();

function titleCase(text){
  const raw=String(text||'').trim().replace(/\s+/g,' ');
  if(!raw)return 'Otros servicios';
  return raw.toLocaleLowerCase('es').replace(/(^|[\s/·-])(\p{L})/gu,(_,sep,ch)=>sep+ch.toLocaleUpperCase('es'));
}

export function classifyInterest(serviceName,category=''){
  const svc=clean(serviceName);
  const cat=clean(category);
  const combined=`${svc} ${cat}`;

  if(/SHADES|COLOR\s*GELS/.test(combined))return 'Shades';
  if(/BALAYAGE/.test(combined))return 'Balayage';
  if(/ILUMINACION/.test(combined))return 'Iluminación';
  if(/MECHAS|BABYLIGHT|REFLEJO/.test(combined))return 'Mechas';
  if(/TINTE|RAIZ|RETOQUE|BANO DE COLOR/.test(combined))return 'Tinte';
  if(/ALISADO|KERATIN|PLASTIFICADO/.test(combined))return 'Alisado';
  if(/BOTOX/.test(combined))return 'Botox capilar';
  if(/MANICURE|PEDICURE|UNAS|MANOS\s*\/\s*PIES/.test(combined))return 'Manos y pies';
  if(/CORTE/.test(combined))return 'Corte';
  if(/MAQUILLAJE|PESTANA|CEJA/.test(combined))return 'Maquillaje y cejas';
  if(/CEPILLADO|PEINADO|ONDAS|MONO|PLANCHADO/.test(combined))return 'Peinados y cepillado';
  if(/DEPILACION/.test(combined))return 'Depilación';
  if(/TRATAMIENTO|HIDRATACION|AMPOLLA|ACIDIC|NUTRICION|REPARACION/.test(combined))return 'Tratamientos';
  if(/EVALUACION|ASESORIA|DIAGNOSTICO/.test(combined))return 'Evaluación capilar';
  if(/QUIMICO/.test(cat))return 'Químicos';
  if(/COLOR/.test(cat))return 'Color';

  // Cualquier servicio o categoría nueva en Agenda genera su propia etiqueta de interés automáticamente
  if(svc)return titleCase(serviceName);
  if(cat)return titleCase(category);
  return 'Otros servicios';
}

export function summarizeInterests(records){
  const counts=new Map();
  for(const rec of records||[]){
    const label=classifyInterest(rec.serviceName,rec.category);
    const cur=counts.get(label)||{label,count:0,fromAgenda:false,fromHistory:false};
    cur.count++;
    if(rec.source==='agenda')cur.fromAgenda=true;
    else cur.fromHistory=true;
    counts.set(label,cur);
  }
  const list=[...counts.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'es'));
  return list.map((item,idx)=>({...item,primary:idx===0}));
}
