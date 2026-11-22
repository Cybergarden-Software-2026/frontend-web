import type {Incident} from './incidents.ts';
import {belongs,requiresAttention,timestamp,COORDINATOR_TEAM} from './incidents.ts';
import {deadlineRemainingRatio} from './deadlineDisplay.ts';
export const ROUTING_WAIT_MS=8*60_000;
export const HEADER_DEADLINE_RATIO=0.2;
export interface HeaderAlert {item:Incident;tone:'critical'|'warning';kind:'critical'|'waiting'|'deadline';reason:string;key:string;waitingSince:number|null;}
export function awaitingResolutionTeam(item:Incident):boolean {
 const team=item.assignedGroupName.trim();
 return !team||team===COORDINATOR_TEAM;
}
export function headerAlerts(items:Incident[],now:number):HeaderAlert[] {
 return items.flatMap(item=>{
  if(!requiresAttention(item))return [];
  const waitingSince=timestamp(item.lastAssignmentToTeamDateTime)??timestamp(item.submitDate);
  const critical=item.priorityId===4;
  const waiting=belongs(item,'coordinators')&&waitingSince!==null&&now-waitingSince>ROUTING_WAIT_MS;
  const ratio=deadlineRemainingRatio(item,now);
  const nearDeadline=ratio!==null&&ratio<HEADER_DEADLINE_RATIO&&(ratio>0||awaitingResolutionTeam(item));
  if(!critical&&!waiting&&!nearDeadline)return [];
  const kind:HeaderAlert['kind']=critical?'critical':waiting?'waiting':'deadline';
  const tone:HeaderAlert['tone']=critical?'critical':'warning';
  const reason=critical?'Критический инцидент':waiting?'Ожидает распределения больше 8 минут':(ratio??1)<=0?'Срок решения истёк':'Истекает';
  return [{item,tone,kind,waitingSince,reason,key:`${item.sysId}:${kind}`}];
 }).sort((a,b)=>Number(b.tone==='critical')-Number(a.tone==='critical')||(a.waitingSince??Infinity)-(b.waitingSince??Infinity)||a.item.id.localeCompare(b.item.id));
}

export function countdown(item:Incident,now:number){
 const end=timestamp(item.deadline);
 if(['Resolved','Closed'].includes(stateOf(item)))return '00:00:00';
 if(end===null)return '--:--:--';
 const delta=end-now,sec=Math.floor(Math.abs(delta)/1000);
 return (delta<=0?'−':'')+[Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(n=>String(n).padStart(2,'0')).join(':');
}
import {stateOf} from './incidents.ts';
