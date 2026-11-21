import { COORDINATION_KPI_MS,distribution } from './shiftStatistics.ts';

export interface CoordinatorProfile { id:string; name:string; }
export interface CoordinatorTransfer {
 id:string; coordinatorId:string; incidentId:string; title:string; team:string;
 priorityId:number; waitingStartedAt:number|null; assignedAt:number;
}
export interface PersonalStatistics {
 source:'demo'|'api'; coordinator:CoordinatorProfile; start:number; end:number;
 transferred:number; critical:number; averageMs:number|null;
 measured:number; kpiMet:number; kpiPercent:number|null;
 transfers:(CoordinatorTransfer&{durationMs:number|null;kpiMet:boolean|null})[];
}
export function buildPersonalStatistics(profile:CoordinatorProfile,history:CoordinatorTransfer[],start:number,end:number,source:PersonalStatistics['source']):PersonalStatistics {
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)throw new Error('Некорректный период личной статистики.');
 const transfers=[...new Map(history.filter(row=>row.coordinatorId===profile.id).map(row=>[row.id,row])).values()]
  .filter(row=>Number.isFinite(row.assignedAt)&&row.assignedAt>=start&&row.assignedAt<end)
  .sort((a,b)=>b.assignedAt-a.assignedAt||a.id.localeCompare(b.id))
  .map(row=>{
   const durationMs=row.waitingStartedAt!==null&&Number.isFinite(row.waitingStartedAt)&&row.waitingStartedAt<=row.assignedAt?row.assignedAt-row.waitingStartedAt:null;
   return {...row,durationMs,kpiMet:durationMs===null?null:durationMs<COORDINATION_KPI_MS};
  });
 const durations=distribution(transfers.flatMap(row=>row.durationMs===null?[]:[row.durationMs]));
 const kpiMet=transfers.filter(row=>row.kpiMet===true).length;
 return {source,coordinator:profile,start,end,transferred:transfers.length,critical:transfers.filter(row=>row.priorityId===4).length,averageMs:durations.average,measured:durations.count,kpiMet,kpiPercent:durations.count?kpiMet/durations.count*100:null,transfers};
}
