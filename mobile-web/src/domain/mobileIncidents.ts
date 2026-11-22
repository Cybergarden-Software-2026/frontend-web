import type {Incident} from './incidents.ts';
import {headerAlerts,type HeaderAlert} from './alerts.ts';
export interface MobileIncident {sysId:string;id:string;header:string|null;normalizedState:string;priorityId:number;assignedGroupName:string|null;submitDate:string|null;lastAssignmentToTeamDateTime:string|null;deadline:string|null;headerKind:'critical'|'waiting'|'deadline'|null}
export interface MobileSnapshot {revision:number;serverTime:string;items:MobileIncident[]}
export function parseMobileSnapshot(value:unknown):MobileSnapshot{
 if(!value||typeof value!=='object')throw Error('Некорректный снимок инцидентов');
 const s=value as MobileSnapshot;
 if(!Number.isSafeInteger(s.revision)||!Number.isFinite(Date.parse(s.serverTime))||!Array.isArray(s.items))throw Error('Некорректный снимок инцидентов');
 const ids=new Set<string>();
 for(const i of s.items){if(!i||typeof i.sysId!=='string'||!i.sysId||typeof i.id!=='string'||!i.id||ids.has(i.sysId)||!['critical','waiting','deadline',null].includes(i.headerKind)||typeof i.normalizedState!=='string'||typeof i.priorityId!=='number')throw Error('Некорректная запись мобильного снимка');for(const key of ['header','assignedGroupName','submitDate','lastAssignmentToTeamDateTime','deadline'] as const){if(i[key]!==null&&typeof i[key]!=='string')throw Error('Некорректное поле '+key)}ids.add(i.sysId)}
 return s;
}
export function mobileIncident(i:MobileIncident):Incident{
 return {sysId:i.sysId,id:i.id,header:i.header||'Без названия',description:'',productName:'',service:'',stateId:null,stateEnum:i.normalizedState,state:i.normalizedState,priorityId:i.priorityId,priority:'',urgencyId:null,urgency:'',impactId:null,impact:'',assignedGroupName:i.assignedGroupName||'',submitDate:i.submitDate||'',deadline:i.deadline,completionDate:null,lastAssignmentToTeamDateTime:i.lastAssignmentToTeamDateTime,dashboard:{normalizedState:i.normalizedState}};
}
export function currentMobileAlerts(snapshot:MobileSnapshot,now:number):HeaderAlert[]{
 // At the received serverTime use the server classification. Between responses,
 // recalculate the same three rules so 8-minute/20-percent boundaries are live.
 const computed=headerAlerts(snapshot.items.map(mobileIncident),now);
 if(now!==Date.parse(snapshot.serverTime))return computed;
 const byId=new Map(computed.map(a=>[a.item.sysId,a]));
 return snapshot.items.filter(i=>i.headerKind!==null).map(i=>byId.get(i.sysId)??{item:mobileIncident(i),kind:i.headerKind!,tone:i.headerKind==='critical'?'critical':'warning',waitingSince:null,reason:i.headerKind==='critical'?'Критический инцидент':i.headerKind==='waiting'?'Ожидает распределения больше 8 минут':'Истекает'} as HeaderAlert).sort((a,b)=>['critical','waiting','deadline'].indexOf(a.kind)-['critical','waiting','deadline'].indexOf(b.kind));
}
