import type { Incident } from './incidents.ts';
import { headerAlerts } from './operations.ts';

export class AlertSignalTracker {
 private previous:Map<string,string>|null=null;
 update(items:Incident[],now:number,ready=true):boolean {
  if(!ready)return false;
  const next=new Map(headerAlerts(items,now).map(alert=>[alert.item.sysId,JSON.stringify([alert.key,alert.item.assignedGroupName,alert.item.lastAssignmentToTeamDateTime,alert.item.deadline])]));
  const changed=this.previous!==null&&[...next].some(([id,value])=>this.previous!.get(id)!==value);
  this.previous=next;
  return changed;
 }
}

/** Tracks source records, not the currently loaded page or selected filter. */
export class IncidentArrivalTracker {
 private previous:Set<string>|null=null;
 update(items:Incident[],ready=true):string[]{
  if(!ready)return [];
  const next=new Set(items.map(item=>item.sysId));
  const added=this.previous===null?[]:[...next].filter(id=>!this.previous!.has(id));
  this.previous=next;return added;
 }
}
