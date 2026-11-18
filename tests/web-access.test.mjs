import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
test('published UI redirects anonymous users and private file paths are unavailable',async()=>{
  const root=await worker.fetch(new Request('https://example.invalid/'),{});assert.equal(root.status,303);assert.equal(root.headers.get('location'),'/login');
  for(const path of ['/data/history.json','/.local/admin-token'])assert.equal((await worker.fetch(new Request('https://example.invalid'+path),{})).status,404);
});
test('cross-origin login is rejected before touching D1',async()=>{
  const response=await worker.fetch(new Request('https://example.invalid/api/login',{method:'POST',headers:{origin:'https://outside.invalid','Content-Type':'application/json'},body:'{"key":"not-a-real-key"}'}),{});assert.equal(response.status,403);
});
