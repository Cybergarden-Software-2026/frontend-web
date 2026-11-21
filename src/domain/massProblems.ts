import type { Incident } from './incidents.ts';
import { detectMassProblems } from './operations.ts';
import type { ProblemCluster } from './operations.ts';
import { COORDINATOR_TEAM,requiresAttention } from './incidents.ts';

export interface MassExclusion { sysId:string; incidentId:string; header:string; groupTitle:string; contextKey:string; excludedAt:number; }
export interface ManualMassGroup {id:string;title:string;reason:string;members:{sysId:string;contextKey:string}[];}
export function massGroupRouting(members:Incident[]){
 const active=members.filter(requiresAttention);
 if(active.some(item=>!item.assignedGroupName.trim()||item.assignedGroupName.trim()===COORDINATOR_TEAM))return {label:'Ожидает маршрутизации',tone:'waiting'};
 return new Set(active.map(item=>item.assignedGroupName.trim())).size===1?{label:'Направлена команде',tone:'assigned'}:{label:'Разные команды',tone:'mixed'};
}
export function massContext(item:Incident){return JSON.stringify([item.service.trim(),item.header,item.submitDate]);}
export function exclusionApplies(exclusion:MassExclusion,item:Incident){return exclusion.sysId===item.sysId&&exclusion.contextKey===massContext(item);}
export function excludeMassIncident(previous:MassExclusion[],item:Incident,groupTitle:string,now:number):MassExclusion[]{
 return [{sysId:item.sysId,incidentId:item.id,header:item.header,groupTitle,contextKey:massContext(item),excludedAt:now},...previous.filter(row=>row.sysId!==item.sysId)].slice(0,20_000);
}
export function curateMassGroup(previous:ManualMassGroup[],group:ProblemCluster,members:Incident[]):ManualMassGroup[]{
 const ids=new Set(members.map(item=>item.sysId));
 const id=group.id.startsWith('manual:')?group.id:'manual:'+group.id;
 const curated={id,title:group.title,reason:group.reason,members:[...new Map(members.map(item=>[item.sysId,{sysId:item.sysId,contextKey:massContext(item)}])).values()]};
 return [curated,...previous.filter(row=>row.id!==id).map(row=>({...row,members:row.members.filter(member=>!ids.has(member.sysId))})).filter(row=>row.members.length)];
}
export function visibleMassProblems(items:Incident[],exclusions:MassExclusion[],manualGroups:ManualMassGroup[]=[]){
 const excluded=new Map(exclusions.map(row=>[row.sysId,row]));
 const available=items.filter(item=>{const row=excluded.get(item.sysId);return !row||!exclusionApplies(row,item);});
 const byId=new Map(available.map(item=>[item.sysId,item])),used=new Set<string>(),manual:ProblemCluster[]=[];
 for(const group of manualGroups){
  const members=group.members.flatMap(member=>{const item=byId.get(member.sysId);return item&&requiresAttention(item)&&member.contextKey===massContext(item)&&!used.has(item.sysId)?[item]:[];});
  if(!members.length)continue;
  for(const item of members)used.add(item.sysId);
  manual.push({id:group.id,title:group.title,reason:group.reason,sysIds:members.map(item=>item.sysId),incidentIds:members.map(item=>item.id)});
 }
 return [...manual,...detectMassProblems(available.filter(item=>!used.has(item.sysId)))];
}
