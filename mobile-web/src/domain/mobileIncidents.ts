import type {Incident} from './incidents.ts';
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
 submitDate: string | null;
 lastAssignmentToTeamDateTime: string | null;
 deadline: string | null;
 headerKind: 'critical' | 'waiting' | 'deadline' | null;
}
export interface MobileSnapshot {revision:number;serverTime:string;items:MobileIncident[]}
export interface MobileAlert {
 item: Incident;
 kind: NonNullable<MobileIncident['headerKind']>;
}
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
  if (!invalid.length) return item;
  const sanitized = {...item};
  for (const key of invalid) delete sanitized[key];
  return sanitized;
 });
 return {...s, items};
}
export function mobileIncident(i:MobileIncident):Incident{
 return {sysId:i.sysId,id:i.id,header:i.header||'Без названия',description:i.description||'',shortDescription:i.shortDescription||undefined,productName:i.productName||'',service:i.service||'',stateId:null,stateEnum:i.normalizedState,state:i.normalizedState,priorityId:i.priorityId,priority:'',urgencyId:null,urgency:i.urgency||'',impactId:null,impact:i.impact||'',assignedGroupName:i.assignedGroupName||'',submitDate:i.submitDate||'',deadline:i.deadline,completionDate:null,lastAssignmentToTeamDateTime:i.lastAssignmentToTeamDateTime,dashboard:{normalizedState:i.normalizedState}};
}
const alertOrder = {critical: 0, waiting: 1, deadline: 2};

export function currentMobileAlerts(snapshot: MobileSnapshot): MobileAlert[] {
 const alerts: MobileAlert[] = [];
 for (const entry of snapshot.items) {
  if (entry.headerKind !== null) alerts.push({item: mobileIncident(entry), kind: entry.headerKind});
 }
 return alerts.sort((a, b) => alertOrder[a.kind] - alertOrder[b.kind]);
}
