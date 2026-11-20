import { belongs, requiresAttention, operational, stateOf, slaKind, timestamp } from './incidents.ts';
import type { Incident, Group } from './incidents.ts';
export type QueueView='attention'|'all'|'favorites'|'resolved'|'closed';
export type QueueSort='focus'|'deadline'|'newest';
export interface QueueFilters {search:string;group:Group;view:QueueView;team:string;product:string;status:string;priority:string;sla:string;unassigned:boolean;sort:QueueSort;}
export const defaultFilters:QueueFilters={search:'',group:'all',view:'attention',team:'',product:'',status:'',priority:'',sla:'',unassigned:false,sort:'focus'};
export interface SavedView {id:string;name:string;filters:QueueFilters;}
export function selectQueue(items:Incident[],filters:QueueFilters,favorites:ReadonlySet<string>,now:number):Incident[]{
 const query=filters.search.trim().toLocaleLowerCase('ru');
 return items.filter(i=>{
  if(filters.view==='attention'&&!requiresAttention(i))return false;
  if(filters.view==='favorites'&&!favorites.has(i.sysId))return false;
  if(filters.view==='resolved'&&stateOf(i)!=='Resolved')return false;
  if(filters.view==='closed'&&stateOf(i)!=='Closed')return false;
  if(!belongs(i,filters.group))return false;
  if(filters.team&&i.assignedGroupName!==filters.team)return false;
  if(filters.product&&i.productName!==filters.product)return false;
  if(filters.status&&stateOf(i)!==filters.status)return false;
  if(filters.priority&&i.priorityId!==Number(filters.priority))return false;
  if(filters.sla&&slaKind(i,now)!==filters.sla)return false;
  if(filters.unassigned&&i.assignedEmployeeLogin)return false;
  return !query||[i.id,i.header,i.productName,i.service,i.assignedGroupName,i.assignedEmployee].some(v=>v?.toLocaleLowerCase('ru').includes(query));
 }).sort((a,b)=>{
  if(filters.sort==='newest')return Date.parse(b.submitDate)-Date.parse(a.submitDate)||a.id.localeCompare(b.id);
  const active=Number(requiresAttention(b))-Number(requiresAttention(a));if(active)return active;
  const deadline=(timestamp(a.deadline)??Infinity)-(timestamp(b.deadline)??Infinity);
  if(filters.sort==='deadline')return (Number.isNaN(deadline)?0:deadline)||a.id.localeCompare(b.id);
  const score=(i:Incident)=>Number(belongs(i,'critical'))*100+Number(belongs(i,'coordinators'))*40+Number(operational(i)&&slaKind(i,now)==='late')*20+i.priorityId*2;
  return score(b)-score(a)||(Number.isNaN(deadline)?0:deadline)||a.id.localeCompare(b.id);
 });
}
export function restoreFilters(value:unknown):QueueFilters{
 if(!value||typeof value!=='object')return {...defaultFilters};
 const raw=value as Record<string,unknown>,result={...defaultFilters};
 for(const key of ['search','team','product','status','priority','sla'] as const)if(typeof raw[key]==='string')result[key]=raw[key];
 if(['all','critical','coordinators','high','research','resolved','closed'].includes(String(raw.group)))result.group=raw.group as Group;
 if(['attention','all','favorites','resolved','closed'].includes(String(raw.view)))result.view=raw.view as QueueView;
 if(['focus','deadline','newest'].includes(String(raw.sort)))result.sort=raw.sort as QueueSort;
 result.unassigned=raw.unassigned===true;return result;
}
