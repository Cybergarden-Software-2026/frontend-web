import type { Incident } from './incidents.ts';
import { COORDINATOR_TEAM,belongs,requiresAttention,timestamp } from './incidents.ts';
import { displaySlaKind } from './deadlineDisplay.ts';

export type TeamFilter='all'|'attention'|'late'|'soon'|'idle';
export function teamDirectory(items:Incident[],names:string[],now:number){
 const groups=new Map<string,Incident[]>();
 for(const name of names)if(name.trim())groups.set(name,[]);
 for(const item of items){if(!item.assignedGroupName?.trim())continue;const group=groups.get(item.assignedGroupName)??[];group.push(item);groups.set(item.assignedGroupName,group);}
 return [...groups].map(([name,records])=>{
  const active=records.filter(requiresAttention);
  const overdue=active.filter(i=>displaySlaKind(i,now)==='late').length;
  const soon=active.filter(i=>displaySlaKind(i,now)==='soon').length;
  const attention=active.filter(i=>belongs(i,'critical')||['late','soon'].includes(displaySlaKind(i,now))).sort((a,b)=>Number(belongs(b,'critical'))-Number(belongs(a,'critical'))||(timestamp(a.deadline)??Infinity)-(timestamp(b.deadline)??Infinity)||a.id.localeCompare(b.id));
  const initials=name.replace(/^КЦ\s+/,'').split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  return {name,initials,description:name===COORDINATOR_TEAM?'Триаж и координация':name==='AutoClosedMi'?'Автоматическое закрытие':'Команда решения',contacts:null as string|null,active:active.length,overdue,soon,attention};
 }).sort((a,b)=>Number(b.name===COORDINATOR_TEAM)-Number(a.name===COORDINATOR_TEAM)||a.name.localeCompare(b.name,'ru'));
}
export function selectTeams(cards:ReturnType<typeof teamDirectory>,search:string,filter:TeamFilter){
 const query=search.trim().toLocaleLowerCase('ru');
 return cards.filter(card=>(!query||card.name.toLocaleLowerCase('ru').includes(query))&&(filter==='all'||filter==='attention'&&card.attention.length>0||filter==='late'&&card.overdue>0||filter==='soon'&&card.soon>0||filter==='idle'&&card.active===0));
}
