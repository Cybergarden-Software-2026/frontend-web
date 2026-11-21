import type { Snapshot } from '../domain/incidents.ts';
import { canAssign } from '../domain/operations.ts';
import { api } from './api.ts';

export interface GroupAssignmentResult { sysId:string;incidentId:string;status:'assigned'|'unchanged'|'skipped'|'failed'|'unknown';message:string; }
export interface AssignmentReview { sysId:string;team:string; }
interface AssignmentApi {assign:(id:string,team:string,revision:number)=>Promise<Snapshot>;}
export async function assignIncidentGroup(options:{reviewed:AssignmentReview[];team:string;snapshot:Snapshot;onSnapshot:(snapshot:Snapshot)=>void;onProgress:(results:GroupAssignmentResult[])=>void;shouldStop?:()=>boolean},client:AssignmentApi=api){
 let current=options.snapshot;const results:GroupAssignmentResult[]=[];
 const targets=[...new Map(options.reviewed.map(row=>[row.sysId,row])).values()];
 for(const reviewed of targets){
  if(options.shouldStop?.())return {snapshot:current,results,interrupted:true,stopped:true};
  const item=current.items.find(row=>row.sysId===reviewed.sysId);
  const id=item?.id??reviewed.sysId;
  if(!item||!canAssign(item))results.push({sysId:reviewed.sysId,incidentId:id,status:'skipped',message:item?'Инцидент уже завершён или закрыт':'Инцидент отсутствует в текущем снимке'});
  else if(item.assignedGroupName===options.team)results.push({sysId:item.sysId,incidentId:id,status:'unchanged',message:'Уже назначен выбранной команде'});
  else if(item.assignedGroupName!==reviewed.team){
   results.push({sysId:item.sysId,incidentId:id,status:'failed',message:'Команда изменилась после проверки. Обновите список и проверьте назначение.'});
   options.onProgress([...results]);return {snapshot:current,results,interrupted:true,stopped:false};
  }else{
   try{
    current=await client.assign(item.sysId,options.team,current.revision);
    const updated=current.items.find(row=>row.sysId===item.sysId);
    options.onSnapshot(current);
    if(updated?.assignedGroupName!==options.team){
     results.push({sysId:item.sysId,incidentId:id,status:'unknown',message:'Назначение не подтверждено снимком. Обновите данные и проверьте результат.'});
     options.onProgress([...results]);return {snapshot:current,results,interrupted:true,stopped:false};
    }
    results.push({sysId:item.sysId,incidentId:id,status:'assigned',message:'Команда назначена'});
   }catch(error){
    const status=error&&typeof error==='object'&&'status' in error?Number(error.status):null;
    const conflict=status===409;
    results.push({sysId:item.sysId,incidentId:id,status:status!==null&&status>=400&&status<500?'failed':'unknown',message:conflict?'Данные изменились. Обновите список и подтвердите оставшиеся назначения.':error instanceof Error?error.message:'Не удалось подтвердить назначение. Проверьте результат после обновления.'});
    options.onProgress([...results]);return {snapshot:current,results,interrupted:true,stopped:false};
   }
  }
  options.onProgress([...results]);
 }
 return {snapshot:current,results,interrupted:false,stopped:false};
}
