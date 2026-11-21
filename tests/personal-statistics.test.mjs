import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPersonalStatistics} from '../src/domain/personalStatistics.ts';
import {DEMO_COORDINATOR,createDemoCoordinatorHistory} from './fixtures/demoPersonalStatistics.mjs';
const now=Date.parse('2026-11-21T12:00:00Z');
test('personal statistics use the requested period for deterministic fixture history',()=>{
 const history=createDemoCoordinatorHistory(now),s=buildPersonalStatistics(DEMO_COORDINATOR,history,now-12*3600_000,now,'demo');
 assert.deepEqual(history,createDemoCoordinatorHistory(now));assert.equal(history.length,84);
 assert.equal(s.source,'demo');assert.equal(s.transferred,12);assert.equal(s.critical,3);assert.equal(s.kpiMet,10);assert.equal(s.kpiPercent,10/12*100);
 assert.ok(s.transfers.every(row=>row.incidentId.startsWith('DEMO-')&&!('sysId' in row)));
 assert.equal(buildPersonalStatistics(DEMO_COORDINATOR,history,now-7*86400_000,now,'demo').transferred,84);
 const empty=buildPersonalStatistics(DEMO_COORDINATOR,history,now-9*86400_000,now-8*86400_000,'demo');
 assert.equal(empty.transferred,0);assert.equal(empty.kpiPercent,null);assert.equal(empty.averageMs,null);
});
test('personal attribution, deduplication, exclusive period end and strict 10-minute KPI are independent',()=>{
 const base={id:'1',coordinatorId:'me',incidentId:'INC-1',title:'Оплата',team:'Решение',priorityId:4,assignedAt:now-1000,waitingStartedAt:now-1000-599999};
 const rows=[base,base,{...base,id:'2',waitingStartedAt:now-1000-600000},{...base,id:'other',coordinatorId:'other'},{...base,id:'end',assignedAt:now},{...base,id:'unknown',waitingStartedAt:now+1000}];
 const s=buildPersonalStatistics({id:'me',name:'Сотрудник'},rows,now-3600_000,now,'api');
 assert.equal(s.transferred,3);assert.equal(s.measured,2);assert.equal(s.kpiMet,1);assert.equal(s.kpiPercent,50);assert.equal(s.averageMs,599999.5);
 assert.equal(s.transfers.find(row=>row.id==='unknown').kpiMet,null);
 assert.throws(()=>buildPersonalStatistics(DEMO_COORDINATOR,[],now,now,'demo'));
});
test('personal charts aggregate the selected period without losing or duplicating transfers',async()=>{
 const {personalChartData}=await import('../src/domain/personalCharts.ts');
 const history=createDemoCoordinatorHistory(now);
 for(const length of [1,12,24,7*24]){
  const s=buildPersonalStatistics(DEMO_COORDINATOR,history,now-length*3600_000,now,'demo'),chart=personalChartData(s);
  assert.ok(chart.buckets.length<=12);assert.equal(chart.buckets.reduce((sum,b)=>sum+b.count,0),s.transferred);
  assert.equal(chart.points.length,s.measured);assert.equal(chart.buckets[0].from,s.start);assert.equal(chart.buckets.at(-1).to,s.end);
  assert.ok(chart.points.every((point,index)=>index===0||point.at>=chart.points[index-1].at));
  assert.equal(chart.points.filter(p=>p.kpiMet).length,s.kpiMet);
 }
});
test('chart hover groups expose the correct full incident records without crossing interval boundaries',async()=>{
 const {personalChartData}=await import('../src/domain/personalCharts.ts');
 const base={id:'a',coordinatorId:'me',incidentId:'INC-A',title:'Ошибка оплаты',team:'Платёжная платформа',priorityId:4,assignedAt:now-2*3600_000,waitingStartedAt:now-2*3600_000-600000};
 const rows=[base,{...base,id:'b',incidentId:'INC-B',title:'Сбой уведомлений',assignedAt:now-3600_000,waitingStartedAt:null}];
 const s=buildPersonalStatistics({id:'me',name:'Сотрудник'},rows,now-2*3600_000,now,'api');
 const chart=personalChartData(s);
 assert.equal(chart.buckets[0].transfers[0].incidentId,'INC-A');assert.equal(chart.buckets[0].transfers[0].title,'Ошибка оплаты');assert.equal(chart.buckets[0].transfers[0].team,'Платёжная платформа');assert.equal(chart.buckets[0].transfers[0].kpiMet,false);
 assert.equal(chart.buckets[1].transfers[0].incidentId,'INC-B');assert.equal(chart.buckets[1].transfers[0].durationMs,null);
 assert.ok(chart.buckets.every(b=>b.count===b.transfers.length));assert.equal(chart.points.length,1);
});
