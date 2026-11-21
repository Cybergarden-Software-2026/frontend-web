import type { Incident,ChangeEvent } from './incidents.ts';
import { COORDINATOR_TEAM,requiresAttention,stateOf,timestamp } from './incidents.ts';

export const COORDINATION_KPI_MS=10*60_000;

export function moscowInput(ms:number){return new Date(ms+3*3600_000).toISOString().slice(0,16);}
export function parseMoscowInput(value:string):number|null {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
 const ms=Date.parse(value+':00+03:00');return Number.isFinite(ms)&&moscowInput(ms)===value?ms:null;
}
export function durationLabel(ms:number|null):string {
 if(ms===null||!Number.isFinite(ms))return 'Нет данных';
 const seconds=Math.max(0,Math.floor(ms/1000));
 return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
}
export function distribution(values:number[]){
 const sorted=values.filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b),n=sorted.length;
 return {count:n,average:n?sorted.reduce((a,b)=>a+b,0)/n:null,median:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.ceil((n-1)/2)])/2:null,p90:n?sorted[Math.ceil(n*.9)-1]:null,max:n?sorted[n-1]:null};
}
const needsTeam=(record:Partial<Incident>|null|undefined)=>Boolean(record&&requiresAttention(record as Incident)&&(!record.assignedGroupName?.trim()||record.assignedGroupName.trim()===COORDINATOR_TEAM));
const realTeam=(record:Partial<Incident>|null|undefined)=>Boolean(record?.assignedGroupName?.trim()&&record.assignedGroupName.trim()!==COORDINATOR_TEAM&&record.assignedGroupName!=='AutoClosedMi');
const waitStart=(record:Partial<Incident>)=>record.assignedGroupName?.trim()===COORDINATOR_TEAM?timestamp(record.lastAssignmentToTeamDateTime)??timestamp(record.submitDate):timestamp(record.submitDate);
const isLate=(record:Incident,at:number)=>requiresAttention(record)&&timestamp(record.deadline)!==null&&timestamp(record.deadline)!<=at;
function reconstruct(items:Incident[],events:ChangeEvent[],at:number){
 const map=new Map(items.map(record=>[record.sysId,record]));
 for(const event of [...events].reverse()){
  const time=timestamp(event.at);if(time===null||time<at)continue;
  if(event.previous)map.set(event.sysId,{...map.get(event.sysId),...event.current,...event.previous} as Incident);else if(event.types.includes('created'))map.delete(event.sysId);
 }
 return [...map.values()].filter(record=>{const created=timestamp(record.submitDate);return created!==null&&created<at;});
}
export function buildShiftStatistics(items:Incident[],history:ChangeEvent[],start:number,selectedEnd:number,now:number){
 const end=Math.min(selectedEnd,now),valid=Number.isFinite(start)&&Number.isFinite(end)&&start<end;
 if(!valid)throw new Error('Начало периода должно быть раньше конца и текущего времени.');
 const events=[...new Map(history.map(event=>[event.eventId,event])).values()].filter(event=>timestamp(event.at)!==null&&timestamp(event.at)!<=now).sort((a,b)=>timestamp(a.at)!-timestamp(b.at)!||a.eventId-b.eventId);
 const inPeriod=(at:number|null):at is number=>at!==null&&at>=start&&at<end;
 const periodEvents=events.filter(event=>inPeriod(timestamp(event.at)));
 const atStart=reconstruct(items,events,start),atEnd=reconstruct(items,events,end);
 const records=new Map<string,Incident>();
 for(const event of events){if(event.previous)records.set(event.sysId,event.previous as Incident);if(event.current)records.set(event.sysId,event.current);}
 for(const item of items)records.set(item.sysId,item);
 const endMap=new Map(atEnd.map(item=>[item.sysId,item]));
 const backlogStart=atStart.filter(requiresAttention),backlogEnd=atEnd.filter(requiresAttention);
 const waits=new Map<string,number>();
 const coordination:{sysId:string;id:string;team:string;priorityId:number;at:number;startedAt:number|null;durationMs:number|null;duringPeriodMs:number|null}[]=[];
 const entries:{sysId:string;at:number;returned:boolean;source:'event'|'date';priorityId:number}[]=[];
 for(const event of events){
  const at=timestamp(event.at)!;if(at>=end)continue;
  const previous=event.previous?{...event.current,...event.previous}:null;
  const before=needsTeam(previous),after=needsTeam(event.current);
  if(inPeriod(at)&&after&&!before)entries.push({sysId:event.sysId,at,returned:realTeam(previous),source:'event',priorityId:event.current!.priorityId});
  if(before&&realTeam(event.current)&&event.current&&requiresAttention(event.current)){
   const knownStart=waits.get(event.sysId)??waitStart(previous!);
   if(inPeriod(at))coordination.push({sysId:event.sysId,id:event.incidentId,team:event.current.assignedGroupName,priorityId:event.current.priorityId,at,startedAt:knownStart,durationMs:knownStart!==null&&knownStart<=at?at-knownStart:null,duringPeriodMs:knownStart!==null&&knownStart<=at?at-Math.max(start,knownStart):null});
  }
  if(after){
   if(!before||event.current?.lastAssignmentToTeamDateTime!==event.previous?.lastAssignmentToTeamDateTime){
    const source=event.current&&waitStart(event.current);waits.set(event.sysId,source!==null&&source!==undefined&&source<=at?source:at);
   }
  }else waits.delete(event.sysId);
 }
 const waiting=backlogEnd.filter(needsTeam),waitingTimes=waiting.map(i=>{const date=waitStart(i);return date!==null&&date<=end?end-date:null;}).filter((n):n is number=>n!==null);
 // The initial import has no events. Only an initially unassigned record still
 // awaiting a team can be safely counted from registration alone.
 const enteredIds=new Set(entries.map(e=>e.sysId));
 for(const item of atEnd){const at=timestamp(item.submitDate);if(inPeriod(at)&&needsTeam(item)&&!enteredIds.has(item.sysId)&&(!item.assignedGroupName?.trim()||timestamp(item.lastAssignmentToTeamDateTime)===at))entries.push({sysId:item.sysId,at,returned:false,source:'date',priorityId:item.priorityId});}
 const coordinatorStart=backlogStart.filter(needsTeam);
 const queueIds=new Set(coordinatorStart.map(i=>i.sysId));let peakQueue=queueIds.size;
 const queueChanges=[...periodEvents.map(e=>({at:timestamp(e.at)!,order:e.eventId,sysId:e.sysId,waiting:needsTeam(e.current)})),...entries.filter(e=>e.source==='date').map(e=>({at:e.at,order:0,sysId:e.sysId,waiting:true}))].sort((a,b)=>a.at-b.at||a.order-b.order);
 for(const change of queueChanges){if(change.waiting)queueIds.add(change.sysId);else queueIds.delete(change.sysId);peakQueue=Math.max(peakQueue,queueIds.size);}
 const coordinatorIds=new Set([...coordinatorStart.map(i=>i.sysId),...entries.map(e=>e.sysId),...coordination.map(e=>e.sysId),...waiting.map(i=>i.sysId)]);
 const coordinatorIncidents=[...coordinatorIds].map(id=>endMap.get(id)??records.get(id)).filter((i):i is Incident=>Boolean(i));
 const coordinatorPriorities=[4,3,2,1].map(priority=>({priority,label:({4:'P1 · Критический',3:'P2 · Высокий',2:'P3 · Средний',1:'P4 · Низкий'} as Record<number,string>)[priority],received:entries.filter(e=>e.priorityId===priority).length,assigned:coordination.filter(e=>e.priorityId===priority).length,waiting:waiting.filter(i=>i.priorityId===priority).length,average:distribution(coordination.filter(e=>e.priorityId===priority).flatMap(e=>e.durationMs===null?[]:[e.durationMs])).average}));
 const hours=(end-start)/3600_000,step=Math.max(1,Math.ceil(hours/24))*3600_000;
 const hourly=Array.from({length:Math.ceil((end-start)/step)},(_,index)=>({from:start+index*step,to:Math.min(end,start+(index+1)*step),assigned:0,received:0,waiting:0}));
 function bucket(at:number,key:'assigned'|'received'){const row=hourly[Math.floor((at-start)/step)];if(row)row[key]++;}
 coordination.forEach(c=>bucket(c.at,'assigned'));
 entries.forEach(e=>bucket(e.at,'received'));for(const row of hourly)row.waiting=reconstruct(items,events,row.to).filter(needsTeam).length;
 const handover=[...waiting].sort((a,b)=>b.priorityId-a.priorityId||(timestamp(a.deadline)??Infinity)-(timestamp(b.deadline)??Infinity));
 const coordinationTimes=distribution(coordination.flatMap(c=>c.durationMs===null?[]:[c.durationMs])),kpiMet=coordination.filter(c=>c.durationMs!==null&&c.durationMs<COORDINATION_KPI_MS).length;
 const coordinator={atStart:coordinatorStart.length,atEnd:waiting.length,peakQueue,received:entries.length,uniqueReceived:new Set(entries.map(e=>e.sysId)).size,returned:entries.filter(e=>e.returned).length,inferredEntries:entries.filter(e=>e.source==='date').length,kpiMet,kpiPercent:coordinationTimes.count?kpiMet/coordinationTimes.count*100:null,overdue:waiting.filter(i=>isLate(i,end)).length,critical:waiting.filter(i=>i.priorityId===4&&['Assigned','WorkInProgress'].includes(stateOf(i))).length,entries,priorities:coordinatorPriorities,incidents:coordinatorIncidents,handover,events:periodEvents.filter(e=>coordinatorIds.has(e.sysId))};
 return {start,end,selectedEnd,generatedAt:now,waiting:waiting.length,waitingOver8:waitingTimes.filter(ms=>ms>8*60_000).length,waitingTimes:distribution(waitingTimes),coordination,coordinationTimes,coordinationDuringShift:distribution(coordination.flatMap(c=>c.duringPeriodMs===null?[]:[c.duringPeriodMs])),hourly,coordinator,coordinationPerHour:coordination.length/hours};
}
export type ShiftStatistics=ReturnType<typeof buildShiftStatistics>;
