import { useEffect } from 'react';
import type { ChangeEvent } from '../domain/incidents';
import { EVENT_LABELS } from '../domain/incidents';
import { Icon } from './Icon';

function Notice({event,onDismiss,onOpen}:{event:ChangeEvent;onDismiss:(id:number)=>void;onOpen:(id:string)=>void}) {
 useEffect(()=>{
  const timer=window.setTimeout(()=>onDismiss(event.eventId),10_000);
  return()=>window.clearTimeout(timer);
 },[event.eventId,onDismiss]);
 return <div className={`notification-toast ${event.types.includes('critical')?'toast-critical':''}`} role="status">
  <Icon name={event.types.includes('resolved')?'circleCheck':'bell'}/>
  <button className="toast-open" onClick={()=>{onOpen(event.sysId);onDismiss(event.eventId);}}>
   <strong>{EVENT_LABELS[event.types[0]]??'Изменение инцидента'}</strong>
   <span>{event.incidentId} · {event.header}</span>
  </button>
  <button className="icon-button" aria-label="Скрыть уведомление" onClick={()=>onDismiss(event.eventId)}><Icon name="close" size={17}/></button>
 </div>;
}

export function BellNotifications({unread,notices,onDismiss,onOpen,onJournal,signal=false}:{signal?:boolean;unread:number;notices:ChangeEvent[];onDismiss:(id:number)=>void;onOpen:(id:string)=>void;onJournal:()=>void}) {
 return <div className="bell-notifications">
  <button className="icon-button notification-button" onClick={onJournal} aria-label={`Уведомления: ${unread}`}><Icon name={signal?'signal':'bell'}/>{unread>0&&<span>{unread>99?'99+':unread}</span>}</button>
  <div className="bell-notice-stack" aria-live="polite" aria-relevant="additions">
   {notices.map(event=><Notice key={event.eventId} event={event} onDismiss={onDismiss} onOpen={onOpen}/>)}
  </div>
 </div>;
}
