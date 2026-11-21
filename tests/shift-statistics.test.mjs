import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShiftStatistics,distribution,moscowInput,parseMoscowInput } from '../src/domain/shiftStatistics.ts';
import { COORDINATOR_TEAM } from '../src/domain/incidents.ts';
const start=Date.parse('2026-11-21T06:00:00Z'),end=start+12*3600_000,now=end+3600_000;
const iso=ms=>new Date(ms).toISOString();
const incident=(sysId,patch={})=>({sysId,id:'INC-'+sysId,header:'Ошибка оплаты',description:'Таймаут',productName:'Оплата',service:'Шлюз',stateEnum:'Assigned',stateId:0,state:'Назначен',priorityId:4,priority:'Наивысший',assignedGroupName:'',submitDate:iso(start-3600_000),deadline:iso(end),completionDate:null,...patch});
const change=(eventId,at,previous,current,types=['team'])=>({eventId,revision:eventId,sysId:(current??previous).sysId,incidentId:(current??previous).id,header:'Ошибка оплаты',types,fields:['assignedGroupName'],at:iso(at),previous,current});
test('manual period uses Moscow time and rejects malformed or inverted dates',()=>{
 assert.equal(moscowInput(start),'2026-11-21T09:00');assert.equal(parseMoscowInput('2026-11-21T09:00'),start);
 for(const value of ['2026-02-30T09:00','invalid','2026-11-21','2026-11-21T25:00'])assert.equal(parseMoscowInput(value),null);
 assert.throws(()=>buildShiftStatistics([],[],end,start,now));assert.throws(()=>buildShiftStatistics([],[],now+1,now+2,now));
});
test('coordination counts operations, carry-over waiting, returns, median and P90',()=>{
 const before=incident('A',{assignedGroupName:COORDINATOR_TEAM,lastAssignmentToTeamDateTime:iso(start-10*60_000)});
 const first={...before,assignedGroupName:'Команда решения'};
 const returned={...first,assignedGroupName:COORDINATOR_TEAM,lastAssignmentToTeamDateTime:iso(start+10*60_000)};
 const final={...returned,assignedGroupName:'Другая команда'};
 const events=[change(1,start+2*60_000,before,first),change(2,start+10*60_000,first,returned),change(3,start+16*60_000,returned,final)];
 const s=buildShiftStatistics([final],[...events,events[0]],start,end,now);
 assert.equal(s.coordinator.atStart,1);assert.equal(s.coordinator.atEnd,0);assert.equal(s.coordinator.received,1);assert.equal(s.coordinator.returned,1);
 assert.equal(s.coordination.length,2);assert.deepEqual(s.coordination.map(row=>row.durationMs),[12*60_000,6*60_000]);
 assert.equal(s.coordinationTimes.average,9*60_000);assert.equal(s.coordinationTimes.median,9*60_000);assert.equal(s.coordinationTimes.p90,12*60_000);
 assert.equal(s.coordinationDuringShift.average,4*60_000);assert.equal(s.coordinator.kpiPercent,50);
 assert.equal(s.coordinator.priorities[0].assigned,2);assert.equal(s.hourly.reduce((n,h)=>n+h.assigned,0),2);
});
test('historical end is reconstructed before later assignment and start is exclusive of creations at boundary',()=>{
 const created=incident('B',{submitDate:iso(start),deadline:iso(start+30*60_000)}),final={...created,assignedGroupName:'Команда'};
 const events=[change(1,start,null,created,['created']),change(2,end+1000,created,final)];
 const s=buildShiftStatistics([final],events,start,end,now);
 assert.equal(s.coordinator.atStart,0);assert.equal(s.coordinator.received,1);assert.equal(s.coordinator.atEnd,1);assert.equal(s.coordination.length,0);
 assert.equal(s.coordinator.handover[0].assignedGroupName,'');assert.equal(s.coordinator.overdue,1);
 const exact=buildShiftStatistics([final],[change(1,end,created,final)],start,end,now);assert.equal(exact.coordination.length,0);assert.equal(exact.coordinator.atEnd,1);
});
test('research stays in coordinator handover despite old solution and completion date, completed records leave queue',()=>{
 const research=incident('R',{stateEnum:'Research',stateId:20,solution:'Прошлая попытка',completionDate:iso(start+1000)});
 const resolved=incident('S',{stateEnum:'Resolved',stateId:7,completionDate:iso(start+2000)}),closed=incident('C',{stateEnum:'Closed',stateId:10});
 const assignedToTeam=incident('T',{assignedGroupName:'Команда'});
 const s=buildShiftStatistics([research,resolved,closed,assignedToTeam],[],start,end,now);
 assert.equal(s.coordinator.atEnd,1);assert.equal(s.coordinator.handover[0].sysId,'R');assert.ok(s.coordinator.incidents.every(i=>!['S','C','T'].includes(i.sysId)));assert.equal(s.coordinator.critical,0);
});
test('partial previous fields preserve status when measuring team assignment; missing dates stay unknown',()=>{
 const item=incident('P',{assignedGroupName:'Команда'});
 const event=change(1,start+60_000,{sysId:'P',assignedGroupName:''},item);
 assert.equal(buildShiftStatistics([item],[event],start,end,now).coordination.length,1);
 const bad=incident('D',{submitDate:'invalid',lastAssignmentToTeamDateTime:null}),after={...bad,assignedGroupName:'Команда'};
 const s=buildShiftStatistics([after],[change(2,start+60_000,bad,after)],start,end,now);
 assert.equal(s.coordination.length,1);assert.equal(s.coordinationTimes.count,0);assert.equal(s.coordination[0].durationMs,null);
 assert.deepEqual(distribution([NaN,-1,Infinity]),{count:0,average:null,median:null,p90:null,max:null});
});
test('initial imports infer only still-unassigned registrations, never completed assignments or individual productivity',()=>{
 const unassigned=incident('N',{submitDate:iso(start+1000)}),assigned=incident('T',{submitDate:iso(start+1000),assignedGroupName:'Команда',assignedEmployeeLogin:'engineer'});
 const s=buildShiftStatistics([unassigned,assigned],[],start,end,now);
 assert.equal(s.coordinator.received,1);assert.equal(s.coordinator.inferredEntries,1);assert.equal(s.coordination.length,0);
 assert.equal(s.coordinator.incidents.length,1);assert.equal(s.coordinator.atEnd,1);assert.equal(s.coordinator.kpiPercent,null);
});
test('deleted unassigned incidents are restored for the beginning and do not stay in handover',()=>{
 const item=incident('removed');const s=buildShiftStatistics([],[change(1,start+1000,item,null,['removed'])],start,end,now);
 assert.equal(s.coordinator.atStart,1);assert.equal(s.coordinator.atEnd,0);assert.equal(s.coordinator.handover.length,0);
});
test('5000 incidents are included in coordinator handover without page-size truncation',()=>{
 const items=Array.from({length:5000},(_,i)=>incident(String(i),{priorityId:i%4+1}));
 const s=buildShiftStatistics(items,[],start,end,now);assert.equal(s.coordinator.atStart,5000);assert.equal(s.coordinator.atEnd,5000);assert.equal(s.coordinator.handover.length,5000);assert.equal(s.hourly.at(-1).waiting,5000);
});
test('peak queue includes short spikes between chart boundaries',()=>{
 const a=incident('peak-a',{submitDate:new Date(start+60_000).toISOString()}),b=incident('peak-b',{submitDate:new Date(start+120_000).toISOString()});
 const doneA={...a,assignedGroupName:'Команда'},doneB={...b,assignedGroupName:'Команда'};
 const events=[change(1,start+60_000,null,a,['created']),change(2,start+120_000,null,b,['created']),change(3,start+180_000,a,doneA),change(4,start+240_000,b,doneB)];
 const s=buildShiftStatistics([doneA,doneB],events,start,end,now);assert.equal(s.coordinator.peakQueue,2);assert.equal(s.hourly[0].waiting,0);assert.equal(s.coordinator.atStart,0);assert.equal(s.coordinator.atEnd,0);
});
test('coordinator KPI is strictly under 10 minutes, independent of the 8-minute header warning',()=>{
 const durations=[8*60_000,9*60_000,10*60_000-1,10*60_000,10*60_000+1];
 const originals=durations.map((_,i)=>incident('kpi-'+i,{assignedGroupName:COORDINATOR_TEAM,lastAssignmentToTeamDateTime:iso(start)}));
 const assigned=originals.map(item=>({...item,assignedGroupName:'Команда решения'}));
 const events=originals.map((item,i)=>change(i+1,start+durations[i],item,assigned[i]));
 const s=buildShiftStatistics(assigned,events,start,end,now);
 assert.equal(s.coordinationTimes.count,5);assert.equal(s.coordinator.kpiMet,3);assert.equal(s.coordinator.kpiPercent,60);
});
