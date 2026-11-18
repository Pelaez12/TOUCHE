export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value + 'T12:00:00Z').toISOString().slice(0,10) === value;
}
export function report(data, range, category = '') {
  const {start, end, returnStart, returnEnd} = range;
  if (![start,end,returnStart,returnEnd].every(validDate)) throw Error('Completa las cuatro fechas.');
  if (start > end || returnStart > returnEnd) throw Error('Cada período debe terminar después de comenzar.');
  if (returnStart <= end) throw Error('El período de retorno debe comenzar después del período inicial.');
  if (returnEnd > data.asOf) throw Error('El período de retorno supera la fecha de corte del archivo.');
  const included = data.events.filter(e => !category || e.category === category);
  const cohort = new Set(included.filter(e => e.date >= start && e.date <= end).map(e => e.clientId));
  const byClient = new Map();
  for (const e of data.events) {
    if (e.date > returnEnd) continue;
    if (!byClient.has(e.clientId)) byClient.set(e.clientId, []);
    byClient.get(e.clientId).push(e);
  }
  const rows = data.clients.filter(c => cohort.has(c.id)).map(c => {
    const events = byClient.get(c.id) || [];
    const baseline = events.filter(e => e.date >= start && e.date <= end && (!category || category === e.category));
    // Return means a visit to the salon, even when the service changed.
    const returns = events.filter(e => e.date >= returnStart && e.date <= returnEnd);
    const last = events.map(e => e.date).sort().at(-1);
    const allEvents=data.events.filter(e=>e.clientId===c.id&&e.date<=data.asOf);
    const latestVisit=allEvents.map(e=>e.date).sort().at(-1)||last;
    const lastServices=[...new Set(allEvents.filter(e=>e.date===latestVisit).map(e=>e.service))];
    const uncertain = data.issues.filter(e => e.clientId === c.id && (!e.date || e.date >= returnStart && e.date <= returnEnd));
    return {...c, returned: returns.length > 0, uncertain: returns.length === 0 && uncertain.length > 0,
      last, latestVisit, lastServices, returnedAfterWindow:allEvents.some(e=>e.date>returnEnd), firstReturn: returns.map(e=>e.date).sort()[0] || null,
      visits: new Set(events.map(e=>e.date)).size, services: [...new Set(baseline.map(e=>e.service))],
      days: Math.round((Date.parse(returnEnd+'T12:00:00Z') - Date.parse(last+'T12:00:00Z')) / 86400000),
      events: [...events].sort((a,b)=>b.date.localeCompare(a.date)), uncertainRecords: uncertain};
  }).sort((a,b)=>Number(a.returned)-Number(b.returned) || b.days-a.days || a.name.localeCompare(b.name,'es'));
  const returned = rows.filter(r=>r.returned).length;
  return {rows, total: rows.length, returned, notReturned: rows.length-returned,
    uncertain: rows.filter(r=>r.uncertain).length, rate: rows.length ? returned/rows.length : null};
}
