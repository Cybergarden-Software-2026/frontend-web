import test from 'node:test';
import assert from 'node:assert/strict';
import {headerCardCapacity} from '../src/domain/headerLayout.ts';

test('header uses one to three cards on compact widths and more cards on wide displays',()=>{
 for(const [width,count] of [[280,1],[400,1],[412,2],[623,2],[624,3],[820,3],[836,4],[1048,5],[1260,6],[1684,8]])assert.equal(headerCardCapacity(width),count);
 for(const width of [0,-1,NaN,Infinity])assert.equal(headerCardCapacity(width),1);
});
test('responsive header pagination reaches every alert without overlap on all viewport sizes',()=>{
 const alerts=Array.from({length:23},(_,index)=>index);
 for(const width of [280,624,836,1260,2100]){
  const capacity=headerCardCapacity(width),pages=Math.ceil(alerts.length/capacity),seen=[];
  for(let page=0;page<pages;page++){
   const rows=alerts.slice(page*capacity,(page+1)*capacity);
   assert.ok(rows.length<=capacity);seen.push(...rows);
   if(width>=624)assert.ok((width-12*(capacity-1))/capacity>=200);
  }
  assert.deepEqual(seen,alerts);assert.equal(new Set(seen).size,23);
 }
});
