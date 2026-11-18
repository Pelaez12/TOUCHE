import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validDay,validateAppointment,validateAgendaPreferences} from '../worker/agenda.mjs';
const prefs={openTime:'09:00',closeTime:'19:00',weekdays:[1,2,3,4,5,6]};
const base={clientId:'synthetic-client',serviceId:'synthetic-service',date:'2026-10-27',time:'09:00',duration:20};
test('agenda uses Lima offset, duration, opening and exact closing boundaries',()=>{
  const a=validateAppointment(base,prefs);assert.equal(a.startsAt,'2026-10-27T09:00:00-05:00');assert.equal(a.endsAt,'2026-10-27T09:20:00-05:00');
  assert.equal(validateAppointment({...base,time:'18:40'},prefs).endsAt,'2026-10-27T19:00:00-05:00');
  assert.throws(()=>validateAppointment({...base,time:'18:41'},prefs),/fuera/);
  assert.throws(()=>validateAppointment({...base,time:'08:59'},prefs),/fuera/);
  assert.throws(()=>validateAppointment({...base,date:'2026-11-01'},prefs),/fuera/);
});
test('agenda rejects impossible dates, invalid times, durations and identities',()=>{
  assert.equal(validDay('2026-02-30'),false);assert.equal(validDay('2028-02-29'),true);
  for(const input of [{date:'2026-02-30'},{time:'25:00'},{duration:0},{duration:20.5},{duration:601},{clientId:''},{notes:'x'.repeat(4001)}])assert.throws(()=>validateAppointment({...base,...input},prefs));
});
test('administrator can configure Sunday and hours without inventing capacity',()=>{
  const p=validateAgendaPreferences({openTime:'10:00',closeTime:'17:00',weekdays:[0,0,6]});assert.deepEqual(p.weekdays,[0,6]);
  assert.equal(validateAppointment({...base,date:'2026-11-01',time:'10:00'},p).startsAt,'2026-11-01T10:00:00-05:00');
  for(const input of [{...prefs,weekdays:[]},{...prefs,openTime:'19:00'},{...prefs,weekdays:[7]}])assert.throws(()=>validateAgendaPreferences(input));
});
