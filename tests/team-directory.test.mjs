import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {teamDirectory,selectTeams} from '../src/domain/teamDirectory.ts';
import {COORDINATOR_TEAM} from '../src/domain/incidents.ts';
const now=Date.parse('2026-11-21T12:00:00Z');
const seed=JSON.parse(readFileSync(new URL('../data/seed.json',import.meta.url),'utf8'))[0];
const item=(id,patch={})=>({...seed,sysId:id,id:'INC-'+id,assignedGroupName:'Команда A',priorityId:2,stateEnum:'Assigned',submitDate:new Date(now-70*60_000).toISOString(),deadline:new Date(now+30*60_000).toISOString(),...patch});
test('team cards use active/research records, strict deadline threshold, and exclude completed incidents',()=>{
 const records=[item('normal'),item('late',{deadline:new Date(now-1).toISOString()}),item('soon',{stateEnum:'Research',deadline:new Date(now+15*60_000).toISOString()}),item('critical',{priorityId:4,deadline:null}),item('done',{stateEnum:'Resolved',priorityId:4,deadline:new Date(now-1).toISOString()}),item('closed',{stateEnum:'Closed'}),item('empty',{assignedGroupName:''})];
 const [card]=teamDirectory(records,[],now);
 assert.equal(card.active,4);assert.equal(card.overdue,1);assert.equal(card.soon,1);assert.deepEqual(card.attention.map(i=>i.sysId),['critical','late','soon']);
 assert.equal(card.phone,null);assert.equal(card.description,'Команда решения');
});
test('directory preserves idle teams and coordinator role without invented contacts',()=>{
 const cards=teamDirectory([item('1',{assignedGroupName:COORDINATOR_TEAM})],[{name:'Пустая команда'},{name:COORDINATOR_TEAM}],now);
 assert.equal(cards[0].name,COORDINATOR_TEAM);assert.equal(cards[0].description,'Триаж и координация');
 assert.equal(cards.find(c=>c.name==='Пустая команда').active,0);assert.ok(cards.every(c=>c.phone===null));
 assert.equal(selectTeams(cards,'пустая','idle').length,1);assert.equal(selectTeams(cards,'пустая','attention').length,0);
});
test('directory preserves the server phone and marks synthetic or unverified numbers as test',()=>{
 const cards=teamDirectory([item('1')],[
  {name:'Команда A',phone:'+12025550101',phoneIsTest:false},
  {name:'Команда B',phone:'+78193897280',phoneIsTest:true},
  {name:'Неизвестный источник',phone:'+12025550102'},
  {name:'Некорректный номер',phone:'javascript:alert(1)',phoneIsTest:false},
 ],now);
 const phoneByName=new Map(cards.map(({name,phone,phoneIsTest})=>[name,{phone,phoneIsTest}]));
 assert.deepEqual(phoneByName.get('Команда A'),{phone:'+12025550101',phoneIsTest:false});
 assert.deepEqual(phoneByName.get('Команда B'),{phone:'+78193897280',phoneIsTest:true});
 assert.equal(phoneByName.get('Неизвестный источник').phoneIsTest,true);
 assert.equal(phoneByName.get('Некорректный номер').phone,null);
});
test('team search composes with live late and expiring filters after an SSE replacement',()=>{
 const a=item('A',{deadline:new Date(now-1).toISOString()}),b=item('B',{assignedGroupName:'Команда B',deadline:new Date(now+10*60_000).toISOString()});
 const cards=teamDirectory([a,b],[],now);assert.equal(selectTeams(cards,'команда','late')[0].name,'Команда A');assert.equal(selectTeams(cards,'команда','soon')[0].name,'Команда B');
 assert.equal(selectTeams(teamDirectory([{...a,stateEnum:'Resolved'},b],[],now),'команда','late').length,0);
});
