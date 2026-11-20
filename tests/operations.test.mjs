import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {headerAlerts,queryIncidents,detectMassProblems} from '../src/domain/operations.ts';
import {analyze,COORDINATOR_TEAM} from '../src/domain/incidents.ts';
const seed=JSON.parse(readFileSync(new URL('../data/seed.json',import.meta.url),'utf8'));
const now=Date.parse('2026-11-20T12:00:00Z');
const base={...seed[0],assignedGroupName:'Команда X',stateEnum:'Assigned',priorityId:2,submitDate:new Date(now-20*60_000).toISOString(),deadline:new Date(now+60*60_000).toISOString()};
test('critical routing alerts require no resolution team and exclude Research and finished states',()=>{
 for(const assignedGroupName of ['',COORDINATOR_TEAM])for(const stateEnum of ['Assigned','WorkInProgress'])assert.equal(headerAlerts([{...base,assignedGroupName,stateEnum,priorityId:4}],now)[0].tone,'critical');
 assert.equal(headerAlerts([{...base,assignedGroupName:'Команда X',priorityId:4}],now).length,0);
 for(const stateEnum of ['Research','Resolved','Closed'])assert.equal(headerAlerts([{...base,assignedGroupName:'',lastAssignmentToTeamDateTime:new Date(now).toISOString(),stateEnum,priorityId:4}],now).length,0);
});
test('routing waits start strictly after 8 minutes, not at the deadline threshold',()=>{
 const waiting={...base,assignedGroupName:COORDINATOR_TEAM,lastAssignmentToTeamDateTime:new Date(now-8*60_000).toISOString()};
 assert.equal(headerAlerts([waiting],now).length,0);
 assert.equal(headerAlerts([waiting],now+1)[0].tone,'warning');
 assert.equal(headerAlerts([{...waiting,assignedGroupName:''}],now+1)[0].tone,'warning');
 assert.equal(headerAlerts([{...waiting,assignedGroupName:'Команда X',deadline:new Date(now-60_000).toISOString()}],now).length,0);
 assert.equal(headerAlerts([{...base,deadline:new Date(now+5*60_000).toISOString()}],now).length,0);
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
