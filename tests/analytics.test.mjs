import {test} from 'node:test';
import assert from 'node:assert/strict';
import {report,validDate} from '../public/analytics.mjs';
const range={start:'2026-08-01',end:'2026-08-31',returnStart:'2026-09-01',returnEnd:'2026-09-30'};
const clients=[{id:'a',name:'Ana'},{id:'b',name:'Bea'},{id:'c',name:'Carla'}];
const event=(clientId,date,category='TINTE')=>({clientId,date,category,service:category});
const data={asOf:'2026-10-27',clients,issues:[],events:[event('a','2026-08-01'),event('a','2026-08-01','SHADES'),event('b','2026-08-31'),event('c','2026-09-01'),event('a','2026-09-30','SHADES'),event('b','2026-10-01')]};
test('unique cohort, inclusive boundaries and a later visit do not inflate returns',()=>{
  const r=report(data,range);assert.equal(r.total,2);assert.equal(r.returned,1);assert.equal(r.rate,.5);
  assert.equal(r.rows.find(c=>c.id==='a').visits,2);assert.equal(r.rows.find(c=>c.id==='b').last,'2026-08-31');
});
test('filter selects initial service and accepts return for another service',()=>{assert.equal(report(data,range,'TINTE').returned,1);});
test('empty cohort has no rate, not a healthy zero',()=>{assert.equal(report({...data,events:[]},range).rate,null);});
test('overlapping windows and future cutoffs fail',()=>{
  assert.throws(()=>report(data,{...range,returnStart:range.end}),/después/);
  assert.throws(()=>report(data,{...range,returnEnd:'2027-01-01'}),/corte/);
  assert.equal(validDate('2026-02-30'),false);
});
test('ambiguous possible returns are visible, not counted as returns',()=>{
  const r=report({...data,issues:[{clientId:'b',date:'2026-09-14'}]},range);
  assert.equal(r.returned,1);assert.equal(r.uncertain,1);assert.equal(r.rows.find(c=>c.id==='b').uncertain,true);
});
