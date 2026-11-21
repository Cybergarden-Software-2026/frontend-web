import { deadlineRemainingRatio } from './deadlineDisplay.ts';
export { deadlineRemainingRatio } from './deadlineDisplay.ts';
import type { Incident, Group } from './incidents.ts';
import { belongs, requiresAttention, operational, timestamp, stateOf, slaKind, COORDINATOR_TEAM } from './incidents.ts';

export const QUEUE_GROUPS = [
 {id:'all',title:'Все'}, {id:'critical',title:'Критические'},
 {id:'coordinators',title:'На координаторах'}, {id:'research',title:'На исследовании'},
 {id:'high',title:'Высокий приоритет'},
] as const;
export interface QueueQuery {group?:Group;q?:string;team?:string;page?:number;pageSize?:number;sort?:string;priority?:string;status?:string;sla?:string;}
export interface QueuePage {items:Incident[];total:number;page:number;pageSize:number;totalPages:number;revision:number;}
export function queryIncidents(items:Incident[],query:QueueQuery,revision:number,now=Date.now()):QueuePage {
 const text=(query.q??'').trim().toLocaleLowerCase('ru');
 const pageSize=Math.max(1,Math.min(100,Math.floor(query.pageSize??9)||9));
 const rows=items.filter(i=>belongs(i,query.group??'all')&&(!query.team||query.team==='__unassigned__'||i.assignedGroupName===query.team)&&(query.team!=='__unassigned__'||!i.assignedGroupName.trim())&&(!query.priority||i.priorityId===Number(query.priority))&&(!query.status||stateOf(i)===query.status)&&(!query.sla||slaKind(i,now)===query.sla)&&(!text||[i.id,i.header,i.description,i.productName,i.service,i.assignedGroupName].some(v=>v?.toLocaleLowerCase('ru').includes(text))));
 rows.sort((a,b)=>query.sort==='newest'?(timestamp(b.submitDate)??0)-(timestamp(a.submitDate)??0):Number(requiresAttention(b))-Number(requiresAttention(a))||(query.sort==='deadline'?0:b.priorityId-a.priorityId)||(timestamp(a.deadline)??Infinity)-(timestamp(b.deadline)??Infinity)||a.id.localeCompare(b.id));
 const totalPages=Math.max(1,Math.ceil(rows.length/pageSize));
 const page=Math.max(1,Math.min(totalPages,Math.floor(query.page??1)||1));
 return {items:rows.slice((page-1)*pageSize,page*pageSize),total:rows.length,page,pageSize,totalPages,revision};
}
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
export interface ProblemCluster {id:string;title:string;reason:string;incidentIds:string[];sysIds:string[];}
const stop=new Set('ошибка ошибки проблема проблемы неисправность отказ сбой аномалия на с в и при для не ситуация'.split(' '));
function tokens(value:string){return new Set(value.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu,' ').split(' ').filter(t=>t.length>2&&!stop.has(t)));}
function related(a:Incident,b:Incident):string|null {
 const ta=timestamp(a.submitDate),tb=timestamp(b.submitDate);
 if(ta===null||tb===null||Math.abs(ta-tb)>24*3600_000)return null;
 if(a.service.trim()&&a.service.trim()===b.service.trim())return 'Один затронутый сервис; регистрации в пределах 24 часов';
 const x=tokens(a.header),y=tokens(b.header),common=[...x].filter(t=>y.has(t)).length;
 return common>=2&&common/(x.size+y.size-common)>=0.6?'Похожие симптомы в заголовках; регистрации в пределах 24 часов':null;
}
export function detectMassProblems(items:Incident[]):ProblemCluster[] {
 const rows=items.filter(operational),buckets:{rows:Incident[];reason:string}[]=[];
 // Complete-link membership avoids joining a chain of unrelated incidents.
 for(const row of [...rows].sort((a,b)=>a.sysId.localeCompare(b.sysId))){
  const bucket=buckets.find(b=>b.rows.every(other=>related(row,other)));
  if(bucket)bucket.rows.push(row);else buckets.push({rows:[row],reason:''});
 }
 return buckets.filter(b=>b.rows.length>1).map(({rows})=>({id:rows.map(i=>i.sysId).sort().join('-'),title:rows.every(i=>i.service===rows[0].service)?rows[0].service:'Похожие симптомы',reason:related(rows[0],rows[1])!,incidentIds:rows.map(i=>i.id),sysIds:rows.map(i=>i.sysId)})).sort((a,b)=>b.sysIds.length-a.sysIds.length||a.id.localeCompare(b.id));
}
export function canAssign(item:Incident){return !['Resolved','Closed'].includes(stateOf(item));}
