import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INCIDENT_PAGE_SIZES,readIncidentPageSize,saveIncidentPageSize,validIncidentPageSize } from '../src/data/queuePreferences.ts';
import { queryIncidents } from '../src/domain/operations.ts';
function storage(){const entries=new Map();return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};}
test('selected page size survives a new read, including existing and larger options',()=>{
 const local=storage();assert.equal(readIncidentPageSize(local),9);
 for(const size of INCIDENT_PAGE_SIZES){assert.equal(saveIncidentPageSize(String(size),local),size);assert.equal(readIncidentPageSize(local),size);}
 assert.equal(saveIncidentPageSize(50,local),50);assert.equal(readIncidentPageSize(local),50);
});
test('invalid or unavailable storage never sends an unsupported page size',()=>{
 for(const value of [null,undefined,{},'',NaN,Infinity,-1,0,5000,'corrupt','100.1',true])assert.equal(validIncidentPageSize(value),9);
 const broken={getItem(){throw new Error('unavailable');},setItem(){throw new Error('unavailable');}};
 assert.equal(readIncidentPageSize(broken),9);assert.equal(saveIncidentPageSize(100,broken),100);assert.equal(readIncidentPageSize(null),9);
});
test('5000 incidents remain reachable across 50 pages of 100 without overlap or truncation',()=>{
 const seed=JSON.parse(readFileSync(new URL('../data/seed.json',import.meta.url),'utf8'))[0];
 const items=Array.from({length:5000},(_,index)=>({...seed,sysId:'record-'+index,id:'INC-'+String(index).padStart(5,'0')}));
 const seen=new Set();
 for(let page=1;page<=50;page++){
  const result=queryIncidents(items,{group:'all',page,pageSize:100},10);
  assert.equal(result.total,5000);assert.equal(result.totalPages,50);assert.equal(result.items.length,100);
  for(const item of result.items){assert.ok(!seen.has(item.sysId));seen.add(item.sysId);}
 }
 assert.equal(seen.size,5000);
 const clamped=queryIncidents(items,{page:100,pageSize:100},10);assert.equal(clamped.page,50);
 const filtered=queryIncidents(items,{q:'INC-04999',pageSize:100},11);assert.equal(filtered.total,1);assert.equal(filtered.items[0].sysId,'record-4999');
 assert.equal(queryIncidents(items.slice(0,4975),{page:50,pageSize:100},12).items.length,75);
});
