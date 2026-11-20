import { useEffect,useRef } from 'react';
import type { ReactNode } from 'react';
import type { Incident } from '../domain/incidents';
import { STATES,stateOf,slaKind,timestamp } from '../domain/incidents';
import { Icon } from './Icon';
export const dateTime=(value:string|number|null|undefined)=>value==null?'Не указано':new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
export const timeOnly=(value:string|number)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value));
export const dayOnly=(value:string|number)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short'}).format(new Date(value));
export function Status({item}:{item:Incident}) {return <span className={`status state-${stateOf(item)}`}><i/>{STATES[stateOf(item)]}</span>;}
export function Priority({item}:{item:Incident}) {return <span title={`${item.priorityId} · ${item.priority}`} className={`priority source-priority-${item.priorityId}`}>{item.priorityId===4?'Крит. · 4':item.priorityId===3?'Высокий':item.priorityId===2?'Средний':'Низкий'}</span>;}
export function Team({name,compact=false}:{name:string;compact?:boolean}) {
 const text=name||'Не назначена';
 const initials=text.replace(/^КЦ\s+/,'').split(/\s+/).slice(0,2).map(s=>s[0]).join('');
 const tone=text.includes('Координаторы')?'purple':text.length%3===0?'green':text.length%3===1?'blue':'cyan';
 return <span className={`team-tag ${compact?'compact':''}`} title={text}><span className={`team-avatar tone-${tone}`} aria-hidden="true">{initials}</span><span>{text}</span></span>;
}
export function Sla({item,now}:{item:Incident;now:number}) {
 const kind=slaKind(item,now),deadline=timestamp(item.deadline);
 if(['restored','closed','research','unknown'].includes(kind))return <span className={`sla kind-${kind}`}><strong>{kind==='restored'?'Устранён':kind==='closed'?'Работа окончена':kind==='research'?'Разбор причин':'Без дедлайна'}</strong><small>{kind==='research'?(deadline===null?'Срок не указан':'Срок: '+dateTime(item.deadline)):kind==='unknown'?'Срок не указан':dateTime(item.completionDate)}</small></span>;
 const duration=(deadline??now)-now,minutes=Math.ceil(Math.abs(duration)/60_000);
 const value=minutes>=1440?`${Math.floor(minutes/1440)} д ${Math.floor(minutes%1440/60)} ч`:minutes>=60?`${Math.floor(minutes/60)} ч ${minutes%60} мин`:`${Math.floor(Math.abs(duration)/60_000).toString().padStart(2,'0')}:${(Math.floor(Math.abs(duration)/1000)%60).toString().padStart(2,'0')}`;
 return <span className={`sla sla-${kind}`} title={`Дедлайн: ${dateTime(item.deadline)}`}><strong>{kind==='late'?'−':''}{value}</strong><small>{kind==='late'?'Срок истёк':kind==='soon'?'Скоро истечёт':'До решения'}</small></span>;
}
export function Empty({icon='inbox',title,children}:{icon?:string;title:string;children:ReactNode}) {return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={28}/></span><strong>{title}</strong><p>{children}</p></div>;}
export function Dialog({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current!;dialog.showModal();const listener=(e:Event)=>{e.preventDefault();onClose();};dialog.addEventListener('cancel',listener);return()=>{dialog.removeEventListener('cancel',listener);dialog.close();};},[]);
 return <dialog ref={ref} className={`dialog ${wide?'dialog-wide':''}`} onClick={e=>{if(e.target===ref.current){const box=ref.current.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)onClose();}}}><div className="dialog-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><Icon name="close"/></button></div><div className="dialog-content">{children}</div></dialog>;
}
