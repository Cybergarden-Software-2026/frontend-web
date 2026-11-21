export const INCIDENT_PAGE_SIZES = [9,18,36,50,100] as const;
export const DEFAULT_INCIDENT_PAGE_SIZE = 9;
const KEY = 'underctrl.queue.page-size.v1';
type PreferenceStorage = Pick<Storage,'getItem'|'setItem'>;
function browserStorage():PreferenceStorage|null {
 try{return typeof window==='undefined'?null:window.localStorage;}catch{return null;}
}
export function validIncidentPageSize(value:unknown):number {
 const number=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;
 return INCIDENT_PAGE_SIZES.some(size=>size===number)?number:DEFAULT_INCIDENT_PAGE_SIZE;
}
export function readIncidentPageSize(storage:PreferenceStorage|null=browserStorage()):number {
 try{return validIncidentPageSize(storage?.getItem(KEY));}catch{return DEFAULT_INCIDENT_PAGE_SIZE;}
}
export function saveIncidentPageSize(value:unknown,storage:PreferenceStorage|null=browserStorage()):number {
 const size=validIncidentPageSize(value);
 try{storage?.setItem(KEY,String(size));}catch{}
 return size;
}
