import { useEffect,useMemo,useState } from 'react';
import type { ChangeEvent } from '../domain/incidents';
import { timestamp } from '../domain/incidents';
import { JOURNAL_TYPES,JOURNAL_PERIODS,journalEventType,journalDescription,selectJournal } from '../domain/eventJournal';
import { Icon } from '../components/Icon';
import { useEventHistory } from '../data/useEventHistory';

const timeFormat=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const dayFormat=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long'});
export function EventsJournal({events,now,loading,connected,onOpen}:{events:ChangeEvent[];now:number;loading:boolean;connected:boolean;onOpen:(sysId:string)=>void}) {
 const [search,setSearch]=useState(''),[type,setType]=useState(''),[period,setPeriod]=useState('24h'),[page,setPage]=useState(1);
 const history=useEventHistory(period,connected,now);
 const allEvents=useMemo(()=>[...history.archive,...events],[history.archive,events]);
 const result=useMemo(()=>selectJournal(allEvents,{search,type,period,page},now),[allEvents,search,type,period,page,Math.floor(now/1000)]);
 useEffect(()=>{if(page!==result.page)setPage(result.page);},[page,result.page]);
 const filtered=Boolean(search||type||period!=='24h');
 function reset(){setSearch('');setType('');setPeriod('24h');setPage(1);}
 function turn(next:number){setPage(next);document.getElementById('journal-title')?.focus({preventScroll:true});}
 return <section className="surface events-journal" aria-labelledby="journal-title" aria-busy={history.loading||loading&&!allEvents.length}>
  <header className="journal-heading"><h1 id="journal-title" tabIndex={-1}>Журнал событий</h1></header>
  <div className="journal-filters">
   <label className="journal-search"><Icon name="search" size={16}/><input type="search" aria-label="Найти инцидент в журнале" placeholder="Найти инцидент" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label>
   <label className="journal-select"><select aria-label="Тип события" value={type} onChange={e=>{setType(e.target.value);setPage(1);}}><option value="">Тип события / Все типы</option>{JOURNAL_TYPES.map(option=><option key={option.id} value={option.id}>Тип события / {option.label}</option>)}</select><Icon name="down" size={16}/></label>
   <label className="journal-select"><select aria-label="Период событий" value={period} onChange={e=>{setPeriod(e.target.value);setPage(1);}}>{JOURNAL_PERIODS.map(option=><option key={option.id} value={option.id}>Период / {option.label}</option>)}</select><Icon name="down" size={16}/></label>
  </div>
  {history.failed&&<div className="journal-load-error" role="status"><span>Не удалось загрузить историю полностью. Доступные события сохранены.</span><button className="text-button" onClick={history.retry}>Повторить</button></div>}
  <div className="journal-table-zone"><table className="journal-table" aria-label="Журнал событий"><colgroup><col className="journal-icon-col"/><col className="journal-id-col"/><col className="journal-type-col"/><col className="journal-time-col"/><col/></colgroup>
   <thead><tr><th scope="col"><span className="sr-only">Значок события</span></th><th scope="col">Инцидент</th><th scope="col">Тип события</th><th scope="col">Время</th><th scope="col">Что изменилось</th></tr></thead>
   <tbody>{result.items.map(event=>{
    const presentation=journalEventType(event),at=timestamp(event.at);
    return <tr key={event.eventId} tabIndex={0} aria-label={`Открыть инцидент ${event.incidentId}, ${presentation.label}`} onClick={()=>onOpen(event.sysId)} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen(event.sysId);}}}>
     <td className="journal-event-icon"><span className={`journal-symbol journal-symbol-${presentation.id}`}><Icon name={presentation.icon} size={20}/></span></td>
     <td><a className="journal-incident-id" href={`#incident/${encodeURIComponent(event.sysId)}?from=events`} onClick={e=>{e.preventDefault();e.stopPropagation();onOpen(event.sysId);}}>{event.incidentId}</a></td>
     <td><span className="journal-type-tag" title={event.types.map(id=>JOURNAL_TYPES.find(t=>t.id===id)?.label??(id==='assigned'?'Назначение команды':'Обновление данных')).join(' · ')}>{presentation.label}</span></td>
     <td><time className="journal-time" dateTime={at===null?undefined:new Date(at).toISOString()}><strong>{at===null?'--:--:--':timeFormat.format(at)}</strong><span>{at===null?'Дата не указана':dayFormat.format(at)}</span></time></td>
     <td className="journal-change">{journalDescription(event)}</td>
    </tr>;
   })}</tbody>
  </table>{!result.total&&<div className="journal-empty" role="status"><span className="journal-empty-icon"><Icon name={(loading||history.loading)&&!allEvents.length?'refresh':filtered?'search':'pulse'} size={30}/></span><strong>{(loading||history.loading)&&!allEvents.length?'Загружаем события':allEvents.length?'События не найдены':'Событий пока нет'}</strong><p>{(loading||history.loading)&&!allEvents.length?'Ожидаем данные сервера.':allEvents.length?'Выберите другой период, тип события или измените запрос.':'Изменения инцидентов появятся здесь автоматически.'}</p>{filtered&&<button className="text-button" onClick={reset}>Сбросить фильтры</button>}</div>}</div>
  <footer className="journal-footer"><span aria-live="polite">{result.first}–{result.last} из {result.total}</span><nav className="journal-pagination" aria-label="Страницы журнала"><button className="icon-button" aria-label="Предыдущая страница событий" disabled={result.page===1} onClick={()=>turn(result.page-1)}><Icon name="left" size={15}/></button><span>{result.page} / {result.totalPages}</span><button className="icon-button" aria-label="Следующая страница событий" disabled={result.page===result.totalPages} onClick={()=>turn(result.page+1)}><Icon name="right" size={15}/></button></nav></footer>
 </section>;
}
