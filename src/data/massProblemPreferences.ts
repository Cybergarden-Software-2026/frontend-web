import type { MassExclusion,ManualMassGroup } from '../domain/massProblems.ts';

interface Storage { getItem(key:string):string|null;setItem(key:string,value:string):void; }
const scope=(import.meta.env?.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'');
export const MASS_EXCLUSIONS_KEY='underctrl.mass.exclusions.v1:'+scope;
export const MASS_GROUPS_KEY='underctrl.mass.groups.v1:'+scope;
function storage():Storage|null {try{return typeof window==='undefined'?null:window.localStorage;}catch{return null;}}
export function readMassExclusions(store:Storage|null=storage()):MassExclusion[]{
 try{
  const data=JSON.parse(store?.getItem(MASS_EXCLUSIONS_KEY)||'[]');
  if(!Array.isArray(data))return [];
  const rows=data.filter((row):row is MassExclusion=>Boolean(row)&&typeof row.sysId==='string'&&Boolean(row.sysId.trim())&&['incidentId','header','groupTitle','contextKey'].every(key=>typeof row[key]==='string')&&Number.isFinite(row.excludedAt));
  return [...new Map(rows.map(row=>[row.sysId,row])).values()].slice(0,20_000);
 }catch{return [];}
}
export function saveMassExclusions(rows:MassExclusion[],store:Storage|null=storage()):boolean {
 try{if(!store)return false;store.setItem(MASS_EXCLUSIONS_KEY,JSON.stringify(rows));return true;}catch{return false;}
}
export function readManualMassGroups(store:Storage|null=storage()):ManualMassGroup[]{
 try{
  const rows=JSON.parse(store?.getItem(MASS_GROUPS_KEY)||'[]');
  if(!Array.isArray(rows))return [];
  return [...new Map(rows.filter(row=>row&&typeof row.id==='string'&&row.id.startsWith('manual:')&&typeof row.title==='string'&&typeof row.reason==='string'&&Array.isArray(row.members)).slice(0,5000).map(row=>{
   const members=[...new Map(row.members.filter((member:ManualMassGroup['members'][number])=>member&&typeof member.sysId==='string'&&Boolean(member.sysId.trim())&&typeof member.contextKey==='string').slice(0,20_000).map((member:ManualMassGroup['members'][number])=>[member.sysId,{sysId:member.sysId,contextKey:member.contextKey}])).values()];
   return [row.id,{id:row.id,title:row.title,reason:row.reason,members} as ManualMassGroup] as const;
  })).values()];
 }catch{return [];}
}
export function saveManualMassGroups(rows:ManualMassGroup[],store:Storage|null=storage()):boolean{
 try{if(!store)return false;store.setItem(MASS_GROUPS_KEY,JSON.stringify(rows));return true;}catch{return false;}
}
