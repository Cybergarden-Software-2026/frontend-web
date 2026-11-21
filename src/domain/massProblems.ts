import type { Incident } from './incidents.ts';
import { COORDINATOR_TEAM,requiresAttention } from './incidents.ts';

export interface MassExclusion { sysId:string; incidentId:string; header:string; groupTitle:string; contextKey:string; excludedAt:number; }
export function massGroupRouting(members:Incident[]){
 const active=members.filter(requiresAttention);
 if(active.some(item=>!item.assignedGroupName.trim()||item.assignedGroupName.trim()===COORDINATOR_TEAM))return {label:'Ожидает маршрутизации',tone:'waiting'};
 return new Set(active.map(item=>item.assignedGroupName.trim())).size===1?{label:'Направлена команде',tone:'assigned'}:{label:'Разные команды',tone:'mixed'};
}
