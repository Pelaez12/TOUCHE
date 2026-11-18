import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateClient} from '../worker/validation.mjs';
import worker from '../worker/index.mjs';
test('name required while phone and birthday may remain unknown',()=>{
  assert.throws(()=>validateClient({name:' '}),/nombre/);
  assert.deepEqual(validateClient({name:'  María   Peña ',phone:'',birthday:'',notes:''}),{name:'María Peña',phone:'',birthday:null,notes:'',dni:null});
});

test('DNI preserves leading zeros and requires eight string digits for new records',()=>{
  assert.equal(validateClient({name:'Prueba',dni:'00123456'},{requireDni:true}).dni,'00123456');
  assert.throws(()=>validateClient({name:'Prueba'},{requireDni:true}),/obligatorio/);
  for(const dni of ['1234567','123456789','1234567A','12 345678',12345678])assert.throws(()=>validateClient({name:'Prueba',dni}),/8 dígitos/);
  assert.equal(validateClient({name:'Ficha importada'}).dni,null);
});
test('phone and birth date validation',()=>{
  assert.throws(()=>validateClient({name:'Prueba',phone:'abc1234'}),/teléfono/);
  assert.throws(()=>validateClient({name:'Prueba',birthday:'2026-02-30'}),/fecha/);
  assert.throws(()=>validateClient({name:'Prueba',birthday:'2099-01-01'}),/fecha/);
  assert.equal(validateClient({name:'Prueba',birthday:'2000-02-29'}).birthday,'2000-02-29');
});
test('notes are bounded',()=>assert.throws(()=>validateClient({name:'Prueba',notes:'x'.repeat(4001)}),/notas/));
test('backend without configured secret fails closed before touching database',async()=>{
  const r=await worker.fetch(new Request('https://example.invalid/api/clients'),{});
  assert.equal(r.status,401);
});
