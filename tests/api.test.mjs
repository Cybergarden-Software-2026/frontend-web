import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startApi} from '../tools/demo-api/index.mjs';
const seed=JSON.parse(readFileSync(new URL('../data/seed.json',import.meta.url),'utf8'));
async function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'underctrl-api-'));const sourcePath=join(dir,'incidents.json');writeFileSync(sourcePath,JSON.stringify(seed));const api=await startApi({port:0,sourcePath,dbPath:join(dir,'test.sqlite'),seedPath:sourcePath});try{await fn(api,sourcePath);}finally{await api.close();rmSync(dir,{recursive:true,force:true});}}
test('versioned API exposes the actual snapshot and analysis',async()=>fixture(async(api)=>{const base=`http://127.0.0.1:${api.port}/api/v1`;const response=await fetch(base+'/snapshot');assert.equal(response.status,200);const snapshot=await response.json();assert.equal(snapshot.items.length,44);const analysis=await (await fetch(`${base}/incidents/${seed[0].sysId}/analysis`)).json();assert.equal(analysis.sysId,seed[0].sysId);assert.equal(analysis.provider,'rules');}));
test('changing only deadline creates one event and updates SQLite',async()=>fixture(async(api,path)=>{const rows=structuredClone(seed);rows[0].deadline='2027-01-01T00:00:00Z';writeFileSync(path,JSON.stringify(rows));api.store.readSource();const snapshot=api.store.snapshot();assert.equal(snapshot.revision,2);assert.equal(snapshot.events.length,1);assert.deepEqual(snapshot.events[0].fields,['deadline']);assert.ok(snapshot.events[0].types.includes('deadline'));api.store.readSource();assert.equal(api.store.snapshot().events.length,1);}));
test('partial invalid JSON retains last good data and recovers',async()=>fixture(async(api,path)=>{writeFileSync(path,'[{');api.store.readSource();assert.equal(api.store.snapshot().items.length,44);assert.equal(api.store.snapshot().revision,1);assert.ok(api.store.snapshot().source.error);writeFileSync(path,JSON.stringify(seed));api.store.readSource();assert.equal(api.store.snapshot().source.error,null);assert.equal(api.store.snapshot().revision,1);}));
test('duplicate import is rejected and original source is preserved',async()=>fixture(async(api,path)=>{const response=await fetch(`http://127.0.0.1:${api.port}/api/v1/incidents`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify([seed[0],seed[0]])});assert.equal(response.status,400);assert.equal(JSON.parse(readFileSync(path,'utf8')).length,44);}));
test('file polling sends a real SSE update without browser refresh',async()=>fixture(async(api,path)=>{
 const controller=new AbortController();
 const response=await fetch(`http://127.0.0.1:${api.port}/api/v1/events/stream`,{signal:controller.signal});
 const reader=response.body.getReader(),decoder=new TextDecoder();
 async function readFrame(){let text='';while(!text.includes('\n\n')){const part=await reader.read();if(part.done)throw new Error('SSE stream closed');text+=decoder.decode(part.value,{stream:true});}return text;}
 let timer;
 try{
  const first=await readFrame();assert.ok(first.includes('event: snapshot'));
  const rows=structuredClone(seed);rows[0].priorityId=4;rows[0].priority='Наивысший';writeFileSync(path,JSON.stringify(rows));
  const text=await Promise.race([readFrame(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('SSE update timeout')),4000);})]);
  assert.ok(text.includes('"revision":2'));assert.ok(text.includes('critical'));
 }finally{clearTimeout(timer);controller.abort();await reader.cancel().catch(()=>{});}
}));

test('API pagination returns distinct pages and team directory is authoritative',async()=>fixture(async(api)=>{
 const base=`http://127.0.0.1:${api.port}/api/v1`;
 const first=await (await fetch(base+'/incidents?page=1&pageSize=9')).json(),second=await (await fetch(base+'/incidents?page=2&pageSize=9')).json();
 assert.equal(first.total,44);assert.equal(first.items.length,9);assert.equal(second.page,2);assert.ok(second.items.every(i=>!first.items.some(j=>j.sysId===i.sysId)));
 const teams=await (await fetch(base+'/teams')).json();assert.ok(teams.items.length>0);assert.ok(teams.items.every(t=>t.name&&t.name!=='AutoClosedMi'));
}));
test('assignment persists, clears previous employee, and rejects stale or invalid writes',async()=>fixture(async(api)=>{
 const base=`http://127.0.0.1:${api.port}/api/v1`,item=seed.find(i=>i.stateEnum==='Assigned');
 const teams=await (await fetch(base+'/teams')).json(),team=teams.items.find(t=>t.name!==item.assignedGroupName).name;
 const send=body=>fetch(`${base}/incidents/${item.sysId}/assignment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await send({team:'unknown',expectedRevision:1})).status,400);
 const response=await send({team,expectedRevision:1});assert.equal(response.status,200);const snapshot=await response.json();
 const updated=snapshot.items.find(i=>i.sysId===item.sysId);assert.equal(updated.assignedGroupName,team);assert.equal(updated.assignedEmployee,'');assert.ok(snapshot.events[0].fields.includes('assignedGroupName'));
 assert.equal((await send({team:item.assignedGroupName,expectedRevision:1})).status,409);
 const closed=seed.find(i=>i.stateEnum==='Closed');const rejected=await fetch(`${base}/incidents/${closed.sysId}/assignment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({team,expectedRevision:2})});assert.equal(rejected.status,409);
}));
test('mass simulation provides verifiable clusters through API',async()=>fixture(async(api)=>{
 const base=`http://127.0.0.1:${api.port}/api/v1`;
 const response=await fetch(base+'/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'mass'})});assert.equal(response.status,200);
 const clusters=await (await fetch(base+'/problems/clusters')).json();assert.ok(clusters.items.some(c=>c.incidentIds.filter(id=>id.startsWith('DEMO-MASS-')).length===3));
}));
