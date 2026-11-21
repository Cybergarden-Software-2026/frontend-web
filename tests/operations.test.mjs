import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {headerAlerts,queryIncidents,detectMassProblems,deadlineRemainingRatio} from '../src/domain/operations.ts';
import {analyze,COORDINATOR_TEAM} from '../src/domain/incidents.ts';
import {queueSlaTimeBucket} from '../src/domain/queueSlaRefresh.ts';
const seed=JSON.parse(readFileSync(new URL('../data/seed.json',import.meta.url),'utf8'));
const now=Date.parse('2026-11-20T12:00:00Z');
const base={...seed[0],assignedGroupName:'Команда X',stateEnum:'Assigned',priorityId:2,submitDate:new Date(now-20*60_000).toISOString(),deadline:new Date(now+60*60_000).toISOString()};
test('critical header cards persist for every team and unresolved state, independently of queue grouping',()=>{
 for(const assignedGroupName of ['',COORDINATOR_TEAM,'Resolution team'])for(const stateEnum of ['Assigned','WorkInProgress','Research']){
  const record={...base,assignedGroupName,stateEnum,priorityId:4,lastAssignmentToTeamDateTime:new Date(now).toISOString()};
  assert.equal(headerAlerts([record],now)[0].kind,'critical');
  assert.equal(headerAlerts([{...record,deadline:null}],now)[0].kind,'critical');
  assert.equal(headerAlerts([{...record,deadline:new Date(now-60_000).toISOString()}],now)[0].kind,'critical');
  assert.equal(queryIncidents([record],{group:'critical'},1,now).total,stateEnum==='Research'?0:1);
 }
 for(const stateEnum of ['Resolved','Closed','Unknown'])assert.equal(headerAlerts([{...base,stateEnum,stateId:null,priorityId:4}],now).length,0);
});
test('routing waits start strictly after 8 minutes; deadline warnings work independently',()=>{
 const waiting={...base,assignedGroupName:COORDINATOR_TEAM,lastAssignmentToTeamDateTime:new Date(now-8*60_000).toISOString()};
 assert.equal(headerAlerts([waiting],now).length,0);
 assert.equal(headerAlerts([waiting],now+1)[0].tone,'warning');
 assert.equal(headerAlerts([{...waiting,assignedGroupName:''}],now+1).length,0);
 assert.equal(headerAlerts([{...waiting,assignedGroupName:'Команда X',deadline:new Date(now-60_000).toISOString()}],now).length,0);
 assert.equal(headerAlerts([{...base,assignedGroupName:'',lastAssignmentToTeamDateTime:new Date(now).toISOString(),deadline:new Date(now+4*60_000).toISOString()}],now)[0].kind,'deadline');
 assert.equal(headerAlerts([{...base,assignedEmployee:''}],now).length,0);
});
test('waiting research stays visible to coordinators; empty assignment date falls back to registration',()=>{
 const value={...base,stateEnum:'Research',assignedGroupName:COORDINATOR_TEAM,lastAssignmentToTeamDateTime:null};
 assert.equal(headerAlerts([value],now)[0].tone,'warning');
 assert.equal(headerAlerts([{...value,assignedGroupName:'Команда X'}],now).length,0);
 assert.equal(headerAlerts([{...value,submitDate:'0001-01-01T00:00:00'}],now).length,0);
});
test('pagination has no overlap, clamps invalid page, and filters before slicing',()=>{
 const first=queryIncidents(seed,{page:1,pageSize:9},5),second=queryIncidents(seed,{page:2,pageSize:9},5);
 assert.equal(first.total,44);assert.equal(first.totalPages,5);assert.equal(first.items.length,9);
 assert.ok(second.items.every(i=>!first.items.some(a=>a.sysId===i.sysId)));
 const critical=queryIncidents(seed,{group:'critical',page:99},1);assert.equal(critical.total,0);assert.equal(critical.page,1);
 assert.equal(queryIncidents(seed,{q:seed[0].id,pageSize:9},1).items[0].sysId,seed[0].sysId);
});
test('mass detection groups active records by service within 24h and excludes solved records',()=>{
 const a={...base,sysId:'a',id:'a',service:'Сервис X'},b={...a,sysId:'b',id:'b'},solved={...a,sysId:'c',id:'c',stateEnum:'Resolved'};
 const result=detectMassProblems([a,b,solved]);assert.equal(result.length,1);assert.deepEqual(result[0].sysIds,['a','b']);
 assert.equal(detectMassProblems([a,{...b,submitDate:new Date(now-3*86400_000).toISOString()}]).length,0);
});
test('product-only and generic symptom matches do not imply a mass problem',()=>{
 const a={...base,sysId:'a',service:'A',header:'Ошибка'},b={...base,sysId:'b',service:'B',header:'Ошибка'};
 assert.equal(detectMassProblems([a,b]).length,0);
 const specific=detectMassProblems([{...a,header:'Таймаут авторизации карт'},{...b,header:'Ошибка авторизации карт'}]);assert.equal(specific.length,1);
});
test('recommendation uses completed comparable records and excludes Research and missing service matches',()=>{
 const known={...base,sysId:'other',id:'OTHER',assignedGroupName:'Команда Y',stateEnum:'Resolved',completionDate:new Date(now).toISOString()};
 assert.equal(analyze(base,[base,known],1,now).candidates[0].team,'Команда Y');
 assert.equal(analyze(base,[base,{...known,stateEnum:'Research'}],1,now).candidates.length,0);
 assert.equal(analyze({...base,service:'',scenarioName:''},[{...known,service:'',scenarioName:''}],1,now).candidates.length,0);
});

test('priority, state, SLA and team filters compose before pagination',()=>{
 const rows=[{...base,sysId:'1',id:'1',priorityId:4,deadline:new Date(now-1000).toISOString(),assignedGroupName:''},{...base,sysId:'2',id:'2',priorityId:4,stateEnum:'Research',assignedGroupName:''},{...base,sysId:'3',id:'3',priorityId:3}];
 const result=queryIncidents(rows,{priority:'4',status:'Assigned',sla:'late',team:'__unassigned__',pageSize:1},1,now);assert.equal(result.total,1);assert.equal(result.items[0].id,'1');
 assert.equal(queryIncidents(rows,{group:'critical'},1,now).total,1);
 assert.equal(detectMassProblems([rows[0],rows[1]]).length,0);
});

test('deadline warning uses strictly less than 20% of registration-to-deadline time',()=>{
 const record={...base,assignedGroupName:'',lastAssignmentToTeamDateTime:new Date(now+60*60_000).toISOString(),submitDate:new Date(now-80*60_000).toISOString(),deadline:new Date(now+20*60_000).toISOString()};
 assert.equal(deadlineRemainingRatio(record,now),0.2);assert.equal(headerAlerts([record],now).length,0);
 assert.equal(headerAlerts([record],now+1)[0].kind,'deadline');
 const [expired]=headerAlerts([record],now+31*60_000);assert.equal(expired.reason,'Срок решения истёк');
 assert.equal(headerAlerts([record],now-60_000).length,0);
});
test('upcoming deadline warnings include assigned research and deduplicate routing alerts',()=>{
 const record={...base,assignedGroupName:'',lastAssignmentToTeamDateTime:new Date(now).toISOString(),submitDate:new Date(now-90*60_000).toISOString(),deadline:new Date(now+10*60_000).toISOString()};
 for(const stateEnum of ['Assigned','WorkInProgress','Research'])assert.equal(headerAlerts([{...record,stateEnum}],now)[0].kind,'deadline');
 assert.equal(headerAlerts([{...record,assignedGroupName:'Команда X'}],now)[0].kind,'deadline');
 for(const stateEnum of ['Resolved','Closed','Unknown'])assert.equal(headerAlerts([{...record,stateEnum,stateId:null}],now).length,0);
 const both={...record,priorityId:4,assignedGroupName:'',lastAssignmentToTeamDateTime:new Date(now-9*60_000).toISOString()};
 assert.equal(headerAlerts([both],now).length,1);assert.equal(headerAlerts([both],now)[0].kind,'critical');
 assert.equal(headerAlerts([{...both,priorityId:2,assignedGroupName:COORDINATOR_TEAM}],now)[0].kind,'waiting');
});
test('deadline percentage ignores missing, invalid and reversed date ranges',()=>{
 for(const patch of [{deadline:null},{deadline:'invalid'},{submitDate:null},{submitDate:'0001-01-01T00:00:00Z'},{deadline:base.submitDate},{deadline:new Date(now-86400_000).toISOString()},{submitDate:new Date(now+30*60_000).toISOString()}]){
  const record={...base,...patch};assert.equal(deadlineRemainingRatio(record,now),null);assert.equal(headerAlerts([record],now).length,0);
 }
});

test('assigning a team removes overdue header warnings but coordinator assignment still needs resolution',()=>{
 const record={...base,assignedGroupName:'',priorityId:2,lastAssignmentToTeamDateTime:new Date(now).toISOString(),deadline:new Date(now-60_000).toISOString()};
 assert.equal(headerAlerts([record],now)[0].kind,'deadline');
 assert.equal(headerAlerts([{...record,assignedGroupName:'Команда X'}],now).length,0);
 assert.equal(headerAlerts([{...record,assignedGroupName:COORDINATOR_TEAM}],now)[0].kind,'deadline');
 const extended={...record,deadline:new Date(now+10*3600_000).toISOString()};
 assert.equal(headerAlerts([extended],now).length,0);
});

test('SLA queue refreshes across the 30-minute and overdue thresholds at the same revision',()=>{
 const revision=7,close=now+30*60_000+15_000,later=now+60*60_000;
 const rows=[
  {...base,sysId:'later',id:'later',deadline:new Date(later).toISOString()},
  {...base,sysId:'close',id:'close',deadline:new Date(close).toISOString()},
 ];
 const result=(sla,at)=>queryIncidents(rows,{sla,sort:'deadline'},revision,at);
 const first=result('normal',now);
 assert.deepEqual(first.items.map(item=>item.id),['close','later']);
 assert.equal(queueSlaTimeBucket('soon',now+1000),queueSlaTimeBucket('soon',now));

 const after30=now+30_000;
 assert.notEqual(queueSlaTimeBucket('soon',after30),queueSlaTimeBucket('soon',now));
 assert.notEqual(queueSlaTimeBucket('normal',after30),queueSlaTimeBucket('normal',now));
 assert.equal(result('soon',now).total,0);
 assert.equal(result('soon',after30).revision,revision);
 assert.deepEqual(result('soon',after30).items.map(item=>item.id),['close']);
 assert.deepEqual(result('normal',after30).items.map(item=>item.id),['later']);

 const afterDeadline=close+15_000;
 assert.notEqual(queueSlaTimeBucket('late',afterDeadline),queueSlaTimeBucket('late',close-16_000));
 assert.equal(result('late',close-16_000).total,0);
 assert.deepEqual(result('late',afterDeadline).items.map(item=>item.id),['close']);
 for(const staticSla of ['','unknown','research','restored','closed']){
  assert.equal(queueSlaTimeBucket(staticSla,now),null);
  assert.equal(queueSlaTimeBucket(staticSla,afterDeadline),null);
 }
});
