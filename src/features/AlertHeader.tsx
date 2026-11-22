import { useEffect,useMemo,useRef,useState } from 'react';
import type { CSSProperties } from 'react';
import type { Incident } from '../domain/incidents';
import { headerAlerts } from '../domain/operations';
import { headerCardCapacity } from '../domain/headerLayout';
import { Icon } from '../components/Icon';
import { detailSla } from './detailPresentation';

// Positions follow the light repeating pattern in the supplied header export.
const decorations=[
 ['logo',.6,15,39,-13],['key',6.2,17,65,-16],['logo',14.6,3,28,14],['key',18.4,49,37,21],
 ['key',1.1,130,42,-15],['logo',15.7,117,53,10],['logo',24,0,45,12],['key',25.2,117,61,-14],
 ['logo',33.7,112,41,11],['key',39,12,40,13],['logo',42.3,34,48,-12],['key',49.9,21,51,13],
 ['logo',54.7,124,41,-12],['key',58,105,59,-17],['logo',64.5,9,39,13],['key',70,38,55,-12],
 ['logo',76.6,114,42,15],['key',81,15,49,13],['logo',87.4,7,38,-14],['key',91.5,102,64,-14],
] as const;
function MtsPattern(){return <svg viewBox="0 0 125 125" fill="currentColor"><text x="1" y="52">М</text><text x="79" y="52">Т</text><text x="79" y="116">С</text></svg>;}
function HeaderDeadline({item,now}:{item:Incident;now:number}){
 const {kind,value,label}=detailSla(item,now);
 return <span className={`sla sla-${kind}`} title={label}><strong>{value}</strong><small>{label}</small></span>;
}

export function AlertHeader({items,now,onOpen,onJournal,signalSequence,audioStatus}:{signalSequence:number;audioStatus:string;items:Incident[];now:number;onOpen:(id:string)=>void;onJournal:()=>void}) {
 const alerts=useMemo(()=>headerAlerts(items,now),[items,Math.floor(now/1000)]);
 const deck=useRef<HTMLDivElement>(null);
 const [capacity,setCapacity]=useState(3),[page,setPage]=useState(0),[paused,setPaused]=useState(false);
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const alertIds=alerts.map(a=>a.item.sysId).join('|'),hasAlerts=alerts.length>0;
 useEffect(()=>{const query=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
 useEffect(()=>{const element=deck.current;if(!element)return;const measure=()=>setCapacity(headerCardCapacity(element.clientWidth));const observer=new ResizeObserver(measure);observer.observe(element);measure();return()=>observer.disconnect();},[hasAlerts]);
 const pageCount=Math.max(1,Math.ceil(alerts.length/capacity)),currentPage=Math.min(page,pageCount-1);
 useEffect(()=>setPage(0),[alertIds,capacity]);
 useEffect(()=>{if(pageCount<2||paused||reduced)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')setPage(value=>(value+1)%pageCount);},10000);return()=>clearInterval(timer);},[pageCount,paused,reduced,alertIds,currentPage]);
 const criticalCount=alerts.filter(a=>a.tone==='critical').length;
 const deadlineCount=alerts.filter(a=>a.kind==='deadline').length;
 const tone=criticalCount?'critical':'waiting';
 const visible=alerts.slice(currentPage*capacity,(currentPage+1)*capacity);
 function turn(direction:number){setPage((currentPage+direction+pageCount)%pageCount);}
 return <header className={`incident-hero wave-hero ${alerts.length?`has-routing-alerts spotlight-hero spotlight-${tone}`:''}`} aria-label="Важные инциденты">
  <div className="hero-keycaps" aria-hidden="true">{Array.from({length:3},(_,row)=>Array.from({length:12},(_,col)=>{const index=row*12+col,kind=(row+col)%3===0?"logo":"key",size=[34,46,39,52][index%4];return <span key={`fill-${index}`} className={`hero-pattern-item hero-pattern-${kind}`} style={{"--pattern-x":`${col*8.8+row*2}%`,"--pattern-y":`${row*65-12+(col%2)*17}px`,"--pattern-size":`${size}px`,"--pattern-rotation":`${index%2?-13:12}deg`} as CSSProperties}>{kind==="logo"?<MtsPattern/>:<span>{["+","{ }","Ctrl","↵"][index%4]}</span>}</span>;}))}{decorations.map(([kind,x,y,size,rotation],index)=><span key={index} className={`hero-pattern-item hero-pattern-${kind}`} style={{'--pattern-x':`${x}%`,'--pattern-y':`${y}px`,'--pattern-size':`${size}px`,'--pattern-rotation':`${rotation}deg`} as CSSProperties}>{kind==='logo'?<MtsPattern/>:<span>{['+','{ }','Ctrl','↵'][index%4]}</span>}</span>)}</div>
  {alerts.length>0?<>
   <div className="spotlight-summary">
    <div className="calm-orbit spotlight-orbit" aria-hidden="true"><span className="calm-ring calm-ring-one"/><span className="calm-ring calm-ring-two"/><span className="calm-core"><Icon name={criticalCount?'alert':'clock'} size={26}/></span><svg viewBox="0 0 120 46"><path d="M0 23h30l8-12 10 24 10-17 6 5h56"/></svg></div>
    <div className="spotlight-summary-copy"><span className="spotlight-eyebrow">МТС · ЦЕНТР КООРДИНАЦИИ</span><strong>{criticalCount||deadlineCount?'Нужна ваша реакция':'Подключите команду'}</strong></div>
   </div>
   <div className="spotlight-deck" ref={deck} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocusCapture={()=>setPaused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setPaused(false);}}>
    <div key={`${currentPage}-${alertIds}`} className="spotlight-cards" role="list" aria-label="Важные инциденты">{visible.map((alert,index)=><div key={alert.item.sysId} role="listitem" className="spotlight-card-slot" style={{'--card-delay':`${index*100}ms`} as CSSProperties}>
     <button className={`header-alert spotlight-card spotlight-card-${alert.tone}`} onClick={()=>onOpen(alert.item.sysId)} title={`${alert.item.id}: ${alert.reason}`}>
      <span className="spotlight-card-label"><Icon name={alert.tone==='critical'?'alert':'clock'} size={13}/>{alert.kind==='critical'?'Критический инцидент':alert.kind==='deadline'?alert.reason:'Ожидает команды'}</span>
      <span className="header-alert-title">{alert.item.header}</span>
      <span className="spotlight-card-footer"><HeaderDeadline item={alert.item} now={now}/><span className="spotlight-open">Открыть</span></span>
     </button>
    </div>)}</div>
    <div className="spotlight-pagination"><span>{currentPage*capacity+1}–{Math.min((currentPage+1)*capacity,alerts.length)} из {alerts.length}</span>{pageCount>1&&<div className="spotlight-navigation"><button className="icon-button" aria-label="Предыдущие важные инциденты" onClick={()=>turn(-1)}><Icon name="left" size={17}/></button><button className="icon-button" aria-label="Следующие важные инциденты" onClick={()=>turn(1)}><Icon name="right" size={17}/></button></div>}</div>
   </div>
   {signalSequence>0&&<div className="header-signal wave-signal" data-signal-sequence={signalSequence} data-audio-state={audioStatus}>
    <button key={signalSequence} className={`wave-bell-button ${signalSequence?'wave-bell-ringing':''}`} onClick={onJournal} aria-label={`Важные события: ${alerts.length} инцидентов требуют внимания`} title="Открыть события">
     <span className="wave-bell-icon"><svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M24 12a8 8 0 0 0-16 0c0 8-3 8-3 11h22c0-3-3-3-3-11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M13 27a3 3 0 0 0 6 0M16 10v6m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></span>
    </button>
   </div>}
  </>:<div className="wave-empty"><div className="calm-orbit" aria-hidden="true"><span className="calm-ring calm-ring-one"/><span className="calm-ring calm-ring-two"/><span className="calm-core"><Icon name="check" size={25}/></span><svg viewBox="0 0 120 46"><path d="M0 23h30l8-12 10 24 10-17 6 5h56"/></svg></div><span className="wave-empty-brand">МТС <i/> underCtrl</span><strong>Всё под контролем</strong><span>Нет срочных инцидентов</span></div>}
 </header>;
}
