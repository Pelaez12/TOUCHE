import {test} from 'node:test';
import assert from 'node:assert/strict';
import {whatsappPhone,inDirectoryGroup,personalizedMessage,whatsappLink,DEFAULT_MESSAGE,suggestedAction} from '../public/contact.mjs';
import {report} from '../public/analytics.mjs';
import {validateMessagePreferences} from '../worker/validation.mjs';
test('Peruvian phone normalization and explicit international numbers',()=>{
  assert.equal(whatsappPhone('987 654 321'),'51987654321');
  assert.equal(whatsappPhone('+51 (987) 654-321'),'51987654321');
  assert.equal(whatsappPhone('+34 612 345 678'),'34612345678');
  assert.equal(whatsappPhone('0034 612 345 678'),'34612345678');
  for(const value of ['',null,'FALTA RELLENAR','1234567','612345678','+519123','abcd987654321'])assert.equal(whatsappPhone(value),null);
});
test('directory partitions active clients without losing archived entries',()=>{
  const clients=[{phone:'987654321'},{phone:''},{phone:'12345'},{phone:'987654321',archivedAt:'2026-10-01'}];
  assert.equal(clients.filter(c=>inDirectoryGroup(c,'active')).length,1);
  assert.equal(clients.filter(c=>inDirectoryGroup(c,'missing')).length,2);
  assert.equal(clients.filter(c=>inDirectoryGroup(c,'all')).length,3);
  assert.equal(clients.filter(c=>inDirectoryGroup(c,'archived')).length,1);
});
test('last known services differ from historical cohort services, preserving multiple services',()=>{
  const d={asOf:'2026-10-27',clients:[{id:'a',name:'ANA'}],issues:[],events:[{clientId:'a',date:'2026-08-05',service:'TINTE',category:'TINTE'},{clientId:'a',date:'2026-10-12',service:'SHADES',category:'SHADES'},{clientId:'a',date:'2026-10-12',service:'BOTOX',category:'QUIMICOS'}]};
  const r=report(d,{start:'2026-08-01',end:'2026-08-31',returnStart:'2026-09-01',returnEnd:'2026-09-30'}).rows[0];
  assert.equal(r.last,'2026-08-05');assert.deepEqual(r.services,['TINTE']);assert.equal(r.latestVisit,'2026-10-12');assert.deepEqual(r.lastServices,['SHADES','BOTOX']);assert.equal(r.returned,false);
  assert.equal(suggestedAction({...r,phone:'987654321'}).key,'care');
});
test('personalized draft has no invented promotion and encodes URL safely',()=>{
  const c={name:'MARÍA DEL PILAR',lastServices:['TINTE','SHADES'],latestVisit:'2026-10-12'};
  const message=personalizedMessage(DEFAULT_MESSAGE,c);
  assert.match(message,/Hola, María/);assert.match(message,/tinte y shades/);assert.ok(!message.includes('{'));assert.ok(!message.includes('%'));
  const url=new URL(whatsappLink('987654321',message+' & más'));
  assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/51987654321');assert.equal(url.searchParams.get('text'),message+' & más');
  assert.throws(()=>whatsappLink('',message),/teléfono/);assert.throws(()=>whatsappLink('987654321',''),/mensaje/);
});
test('action priorities prevent contacting missing phones and flag uncertain returns',()=>{
  assert.equal(suggestedAction({phone:'',uncertain:true}).key,'missing');
  assert.equal(suggestedAction({phone:'987654321',uncertain:true}).key,'review');
  assert.equal(suggestedAction({phone:'987654321',returned:true}).key,'care');
  assert.equal(suggestedAction({phone:'987654321',returned:false}).key,'contact');
});
test('editable shared template validates limits and supported variables',()=>{
  const value={template:DEFAULT_MESSAGE,promotion:'Promoción definida por el administrador'};
  assert.deepEqual(validateMessagePreferences(value),value);
  for(const invalid of [null,{}, {template:'Hola {descuento}',promotion:''},{template:DEFAULT_MESSAGE,promotion:'x'.repeat(501)}])assert.throws(()=>validateMessagePreferences(invalid));
  const message=personalizedMessage(value.template,{name:'ANA',lastServices:['TINTE']},value.promotion);
  assert.ok(message.includes(value.promotion));
});
