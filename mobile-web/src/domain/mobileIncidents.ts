import type {Incident} from './incidents.ts';
import {headerAlerts,type HeaderAlert} from './alerts.ts';
const optionalIncidentFields = [
 'teamPhone', 'shortDescription', 'description', 'solution', 'productName', 'service',
 'scenarioName', 'serviceType', 'impact', 'urgency', 'assignedEmployee', 'assignedEmployeeLogin',
] as const;

export interface MobileIncident extends Partial<Record<typeof optionalIncidentFields[number], string | null>> {
 sysId: string;
 id: string;
 header: string | null;
 normalizedState: string;
 priorityId: number;
 assignedGroupName: string | null;
 teamPhoneIsTest?: boolean;
 submitDate: string | null;
 lastAssignmentToTeamDateTime: string | null;
 deadline: string | null;
 headerKind: 'critical' | 'waiting' | 'deadline' | null;
}
export interface MobileSnapshot {revision:number;serverTime:string;items:MobileIncident[]}
export function parseMobileSnapshot(value:unknown):MobileSnapshot{
 if(!value||typeof value!=='object')throw Error('Некорректный снимок инцидентов');
 const s=value as MobileSnapshot;
 if(!Number.isSafeInteger(s.revision)||!Number.isFinite(Date.parse(s.serverTime))||!Array.isArray(s.items))throw Error('Некорректный снимок инцидентов');
 const ids=new Set<string>();
 const items = s.items.map(item => {
  if (!item || typeof item.sysId !== 'string' || !item.sysId || typeof item.id !== 'string' || !item.id || ids.has(item.sysId) || !['critical','waiting','deadline',null].includes(item.headerKind) || typeof item.normalizedState !== 'string' || typeof item.priorityId !== 'number') {
   throw Error('Некорректная запись мобильного снимка');
  }
  for (const key of ['header','assignedGroupName','submitDate','lastAssignmentToTeamDateTime','deadline'] as const) {
   if (item[key] !== null && typeof item[key] !== 'string') throw Error('Некорректное поле ' + key);
  }
  ids.add(item.sysId);
  const invalid = optionalIncidentFields.filter(key => item[key] != null && typeof item[key] !== 'string');
  const invalidPhoneFlag = item.teamPhoneIsTest !== undefined && typeof item.teamPhoneIsTest !== 'boolean';
  if (!invalid.length && !invalidPhoneFlag) return item;
  const sanitized = {...item};
  for (const key of invalid) delete sanitized[key];
  if (invalidPhoneFlag) delete sanitized.teamPhoneIsTest;
  return sanitized;
 });
 return {...s, items};
}
export function mobileIncident(i:MobileIncident):Incident{
 return {sysId:i.sysId,id:i.id,header:i.header||'Без названия',description:i.description||'',shortDescription:i.shortDescription||undefined,productName:i.productName||'',service:i.service||'',stateId:null,stateEnum:i.normalizedState,state:i.normalizedState,priorityId:i.priorityId,priority:'',urgencyId:null,urgency:i.urgency||'',impactId:null,impact:i.impact||'',assignedGroupName:i.assignedGroupName||'',submitDate:i.submitDate||'',deadline:i.deadline,completionDate:null,lastAssignmentToTeamDateTime:i.lastAssignmentToTeamDateTime,dashboard:{normalizedState:i.normalizedState}};
}
export function currentMobileAlerts(snapshot:MobileSnapshot,now:number):HeaderAlert[]{
 // At the received serverTime use the server classification. Between responses,
 // recalculate the same three rules so 8-minute/20-percent boundaries are live.
 const computed=headerAlerts(snapshot.items.map(mobileIncident),now);
 if(now!==Date.parse(snapshot.serverTime))return computed;
 const byId=new Map(computed.map(a=>[a.item.sysId,a]));
 return snapshot.items.filter(i=>i.headerKind!==null).map(i=>byId.get(i.sysId)??{item:mobileIncident(i),kind:i.headerKind!,tone:i.headerKind==='critical'?'critical':'warning',waitingSince:null,reason:i.headerKind==='critical'?'Критический инцидент':i.headerKind==='waiting'?'Ожидает распределения больше 8 минут':'Истекает'} as HeaderAlert).sort((a,b)=>['critical','waiting','deadline'].indexOf(a.kind)-['critical','waiting','deadline'].indexOf(b.kind));
}
