import test from 'node:test';
import assert from 'node:assert/strict';
import { selectJournal,journalEventType,journalDescription,matchesEventType } from '../src/domain/eventJournal.ts';
const now=Date.parse('2026-11-21T09:00:00Z');
const event=(eventId,patch={})=>({eventId,revision:eventId,sysId:'record-'+eventId,incidentId:'INC-'+eventId,header:'Оплата картой',types:['team'],fields:['assignedGroupName'],at:new Date(now-eventId*60_000).toISOString(),previous:{assignedGroupName:''},current:{assignedGroupName:'Платёжная платформа'},...patch});
test('journal pagination has no overlap, deduplicates IDs and orders newest first',()=>{
 const rows=Array.from({length:24},(_,i)=>event(i+1));
 const first=selectJournal([...rows,rows[0]],{},now),second=selectJournal(rows,{page:2},now);
 assert.equal(first.total,24);assert.equal(first.totalPages,3);assert.equal(first.first,1);assert.equal(first.last,8);
 assert.deepEqual(first.items.map(e=>e.eventId),[1,2,3,4,5,6,7,8]);assert.equal(second.first,9);
 assert.ok(second.items.every(e=>!first.items.some(a=>a.eventId===e.eventId)));
 assert.equal(selectJournal(rows,{page:99},now).page,3);
});
test('search, type and period compose before pagination and include exact 24-hour boundary',()=>{
 const rows=[event(1),event(2,{types:['created'],fields:[]}),event(3,{at:new Date(now-24*3600_000).toISOString()}),event(4,{at:new Date(now-24*3600_000-1).toISOString()}),event(5,{at:new Date(now+1).toISOString()})];
 assert.equal(selectJournal(rows,{search:'платёжная',type:'team',period:'24h'},now).total,2);
 assert.equal(selectJournal(rows,{search:'inc-2',type:'created'},now).total,1);
 assert.equal(selectJournal(rows,{period:'7d'},now).total,4);
 assert.equal(selectJournal(rows,{period:'all'},now).total,5);
 assert.equal(selectJournal(rows,{search:'unknown',page:4},now).page,1);
 assert.equal(selectJournal(rows,{search:'unknown'},now).first,0);
});
test('assignment and coordinator assignment share a filter and meaningful descriptions',()=>{
 const assigned=event(1,{types:['assigned'],fields:[]});
 assert.equal(matchesEventType(assigned,'team'),true);assert.equal(journalEventType(assigned).id,'team');
 assert.equal(journalDescription(assigned),'Назначена команда «Платёжная платформа».');
 assert.match(journalDescription(event(2,{previous:{assignedGroupName:'Команда A'}})),/Команда A.*Платёжная платформа/);
 assert.equal(journalDescription(event(3,{current:{assignedGroupName:''}})),'Назначение команды снято.');
});
test('new and removed records, state changes and event icons preserve source facts',()=>{
 assert.match(journalDescription(event(1,{types:['created']})),/^Зарегистрирован инцидент «Оплата картой»/);
 assert.equal(journalEventType(event(2,{types:['created','critical']})).id,'created');
 assert.match(journalDescription(event(3,{types:['removed']})),/удалён из текущей выгрузки/);
 const status=event(4,{types:['changed'],fields:['stateId'],previous:{state:'Назначен'},current:{state:'Выполняется'}});
 assert.equal(journalEventType(status).id,'state');assert.equal(journalDescription(status),'Статус: Назначен → Выполняется.');
 const research=event(5,{types:['research'],fields:['stateEnum']});assert.equal(journalEventType(research).icon,'search');
 assert.equal(journalEventType(event(6,{types:['resolved'],fields:[]})).icon,'circleCheck');
});
test('SSE insertions and deletions recalculate pagination without forcing another filter or page',()=>{
 const rows=Array.from({length:9},(_,i)=>event(i+1));
 assert.equal(selectJournal(rows,{type:'team',page:2},now).items.length,1);
 const incoming=event(100,{at:new Date(now).toISOString()});
 const next=selectJournal([incoming,...rows],{type:'team',page:2},now);
 assert.equal(next.page,2);assert.equal(next.total,10);assert.equal(next.items.length,2);
 const clamped=selectJournal(rows.slice(0,7),{type:'team',page:2},now);assert.equal(clamped.page,1);
});
test('invalid dates never crash filters or all-time history',()=>{
 const rows=[event(1,{at:'invalid'}),event(2,{at:'0001-01-01T00:00:00Z'})];
 assert.equal(selectJournal(rows,{},now).total,0);assert.equal(selectJournal(rows,{period:'all'},now).total,2);
});
test('history API keeps the cursor opaque and normalizes archived records like SSE',async t=>{
 const { api }=await import('../src/data/api.ts');
 const cursor='987654321098765432',controller=new AbortController();let requested;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  requested={url,signal:init.signal,authorization:init.headers.get('Authorization')};
  return Response.json({items:[{...event(1),header:null,current:{sysId:'179413934903718013',id:'INC-1',assignedGroupName:null,header:null,priorityId:2,stateId:20,stateEnum:'Research'}}],nextCursor:cursor});
 });
 const result=await api.events(cursor,controller.signal);
 const params=new URL(requested.url,'https://local.test').searchParams;
 assert.equal(params.get('beforeId'),cursor);assert.equal(params.get('limit'),'200');assert.equal(requested.signal,controller.signal);assert.equal(requested.authorization,null);
 assert.equal(result.nextCursor,cursor);assert.equal(result.items[0].header,'');assert.equal(result.items[0].current.sysId,'179413934903718013');assert.equal(result.items[0].current.assignedGroupName,'');
});
