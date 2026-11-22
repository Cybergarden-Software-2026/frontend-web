import type { ChangeEvent } from './incidents.ts';
import { describeEvent, EVENT_LABELS, isStateField, timestamp } from './incidents.ts';

export const JOURNAL_TYPES = [
 {id:'team',label:'Назначение команды',icon:'userPlus',tone:'purple'},
 {id:'team_contacted',label:EVENT_LABELS.team_contacted,icon:'phone',tone:'teal'},
 {id:'created',label:'Новый инцидент',icon:'plus',tone:'blue'},
 {id:'critical',label:'Критический инцидент',icon:'alert',tone:'red'},
 {id:'state',label:'Изменение статуса',icon:'refresh',tone:'blue'},
 {id:'research',label:'Начало исследования',icon:'search',tone:'teal'},
 {id:'resolved',label:'Проблема устранена',icon:'circleCheck',tone:'green'},
 {id:'closed',label:'Инцидент закрыт',icon:'check',tone:'green'},
 {id:'reopened',label:'Возврат в работу',icon:'refresh',tone:'orange'},
 {id:'priority',label:'Изменение приоритета',icon:'bolt',tone:'orange'},
 {id:'deadline',label:'Изменение срока',icon:'clock',tone:'amber'},
 {id:'removed',label:'Удаление инцидента',icon:'archive',tone:'gray'},
 {id:'changed',label:'Обновление данных',icon:'filter',tone:'gray'},
] as const;
export const JOURNAL_PERIODS = [
 {id:'24h',label:'Последние 24 часа',duration:24*3600_000},
 {id:'7d',label:'Последние 7 дней',duration:7*24*3600_000},
 {id:'30d',label:'Последние 30 дней',duration:30*24*3600_000},
 {id:'all',label:'Всё время',duration:Infinity},
] as const;
export function matchesEventType(event:ChangeEvent,type:string):boolean {
 if(!type)return true;
 if(type==='team')return event.types.some(t=>['team','assigned'].includes(t))||event.fields.includes('assignedGroupName');
 if(type==='state')return event.fields.some(isStateField);
 return event.types.includes(type);
}
export function journalEventType(event:ChangeEvent) {
 const order=['created','removed','resolved','closed','reopened','research','team_contacted','team','critical','priority','deadline','state','changed'];
 return JOURNAL_TYPES.find(type=>type.id===order.find(id=>matchesEventType(event,id)))??JOURNAL_TYPES[JOURNAL_TYPES.length-1];
}
export function journalDescription(event:ChangeEvent):string {
 if(event.types.includes('team_contacted'))return describeEvent(event)+'.';
 if(event.types.includes('created'))return `Зарегистрирован инцидент «${event.header || event.incidentId}».`;
 if(event.types.includes('removed'))return `Инцидент «${event.header || event.incidentId}» удалён из текущей выгрузки.`;
 const details:string[]=[];
 if(matchesEventType(event,'team')){
  const before=event.previous?.assignedGroupName,after=event.current?.assignedGroupName;
  details.push(after?before&&before!==after?`Команда: «${before}» → «${after}».`:`Назначена команда «${after}».`:'Назначение команды снято.');
 }
 const remaining=event.fields.filter(f=>f!=='assignedGroupName');
 if(remaining.some(field=>field==='priorityId'||field==='deadline'||isStateField(field)))details.push(describeEvent({...event,fields:remaining})+'.');
 if(!details.length&&event.types.includes('critical'))details.push(`Инцидент «${event.header || event.incidentId}» требует критического внимания.`);
 return details.join(' ')||`Обновлены данные инцидента «${event.header || event.incidentId}».`;
}
export function selectJournal(events:ChangeEvent[],query:{search?:string;type?:string;period?:string;page?:number;pageSize?:number},now:number) {
 const duration=JOURNAL_PERIODS.find(p=>p.id===query.period)?.duration??24*3600_000;
 const search=(query.search??'').trim().toLocaleLowerCase('ru');
 const unique=new Map(events.map(event=>[event.eventId,event]));
 const rows=[...unique.values()].filter(event=>{
  if(!matchesEventType(event,query.type??''))return false;
  const at=timestamp(event.at);
  if(duration!==Infinity&&(at===null||at<now-duration||at>now))return false;
  return !search||[event.incidentId,event.header,journalDescription(event)].some(text=>text.toLocaleLowerCase('ru').includes(search));
 }).sort((a,b)=>(timestamp(b.at)??0)-(timestamp(a.at)??0)||b.eventId-a.eventId);
 const pageSize=Math.max(1,Math.floor(query.pageSize??8)||8),total=rows.length,totalPages=Math.max(1,Math.ceil(total/pageSize));
 const page=Math.max(1,Math.min(totalPages,Math.floor(query.page??1)||1));
 return {items:rows.slice((page-1)*pageSize,page*pageSize),page,total,totalPages,first:total?(page-1)*pageSize+1:0,last:Math.min(page*pageSize,total)};
}
