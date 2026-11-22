import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceId,saveSession,loadSession,clearSession} from '../src/data/vault.ts';
function raw(key){return new Promise((resolve,reject)=>{const q=indexedDB.open('underctrl-mobile-device-v1',1);q.onsuccess=()=>{const db=q.result;const r=db.transaction('secure').objectStore('secure').get(key);r.onsuccess=()=>{db.close();resolve(r.result)};r.onerror=()=>reject(r.error)};q.onerror=()=>reject(q.error)})}
test('installation UUID survives sign out; token is encrypted using a non-extractable key',async()=>{
 const id=await deviceId();assert.match(id,/^[a-f0-9-]{36}$/);assert.equal(await deviceId(),id);assert.deepEqual(await Promise.all(Array.from({length:6},()=>deviceId())),Array(6).fill(id));
 const value={token:'private-test-bearer',tokenType:'Bearer',deviceId:id,user:{login:'shift-a',displayName:'Анна'}};
 await saveSession(value);assert.deepEqual(await loadSession(),value);
 const sealed=await raw('session');assert.ok(sealed.sealed instanceof ArrayBuffer);assert.ok(!JSON.stringify(sealed).includes(value.token));assert.equal((await raw('key')).extractable,false);
 await clearSession();assert.equal(await loadSession(),null);assert.equal(await deviceId(),id);
 await saveSession({...value,token:'next-user-session',user:{login:'shift-b',displayName:'Борис'}});assert.equal((await loadSession()).user.login,'shift-b');await clearSession();
});
