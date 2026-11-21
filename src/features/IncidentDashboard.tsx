import { useEffect,useMemo,useRef,useState } from 'react';
import type { Incident,Snapshot,Group } from '../domain/incidents';
import { belongs,STATES } from '../domain/incidents';
import { QUEUE_GROUPS,queryIncidents,canAssign } from '../domain/operations';
import type { QueuePage,QueueQuery } from '../domain/operations';
import { api } from '../data/api';
import { Icon } from '../components/Icon';
import { Status,Team,Empty } from '../components/ui';
import { IncidentArrivalTracker } from '../domain/alertSignals';
import { timestamp } from '../domain/incidents';
import { displaySlaKind } from '../domain/deadlineDisplay';

export function QueueSla({item,now}:{item:Incident;now:number}) {
 const kind=displaySlaKind(item,now),deadline=timestamp(item.deadline);
 if(kind==='restored'||kind==='closed')return <span className="queue-sla stopped"><strong>00:00:00</strong><small>{kind==='restored'?'Устранён':'Остановлен'}</small></span>;
 if(deadline===null)return <span className="queue-sla"><strong>--:--:--</strong><small>Срок не указан</small></span>;
 const delta=deadline-now,seconds=Math.floor(Math.abs(delta)/1000),hours=Math.floor(seconds/3600);
 const value=[hours,Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
 return <span className={`queue-sla ${kind}`}><strong>{delta<=0?'− ':''}{value}</strong><small>{kind==='late'?'Просрочен':kind==='soon'?'Осталось <30%':'Осталось'}</small></span>;
}

export function IncidentDashboard({snapshot,now,connected,loading,onOpen,onAssign,teamContext}:{snapshot:Snapshot|null;now:number;connected:boolean;loading:boolean;onOpen:(id:string)=>void;onAssign:(id:string)=>void;teamContext:{name:string;token:number}|null}) {
 const items=snapshot?.items??[];
 const [group,setGroup]=useState<Group>('all'),[search,setSearch]=useState(''),[debounced,setDebounced]=useState(''),[team,setTeam]=useState(''),[sort,setSort]=useState('priority'),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(9);
 const [response,setResponse]=useState<{key:string;data:QueuePage}|null>(null),[failure,setFailure]=useState(false),[fetching,setFetching]=useState(false);
 const [filtersOpen,setFiltersOpen]=useState(false),[priority,setPriority]=useState(''),[status,setStatus]=useState(''),[sla,setSla]=useState('');
 const filtersAnchor=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!filtersOpen)return;const outside=(e:PointerEvent)=>{if(!filtersAnchor.current?.contains(e.target as Node))setFiltersOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setFiltersOpen(false);};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[filtersOpen]);
 const arrivalTracker=useRef(new IncidentArrivalTracker());
 const [arrivals,setArrivals]=useState<Record<string,number>>({});
 const [flashes,setFlashes]=useState<Record<string,number>>({});
 const seen=useRef<number|null>(null);
 useEffect(()=>{const timer=setTimeout(()=>{setDebounced(search);setPage(1);},220);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{if(teamContext){setGroup('all');setTeam(teamContext.name);setPage(1);}},[teamContext]);
 const query:QueueQuery={group,q:debounced,team,sort,page,pageSize,priority,status,sla},key=JSON.stringify(query),revision=snapshot?.revision??0;
 useEffect(()=>{
  if(!connected){setFetching(false);return;}
  let alive=true;setFetching(true);setFailure(false);
  api.incidents(query).then(data=>{if(alive){if(data.revision<revision)throw new Error('Устаревшая страница');setResponse({key,data});}}).catch(()=>{if(alive)setFailure(true);}).finally(()=>{if(alive)setFetching(false);});
  return()=>{alive=false;};
 },[key,revision,connected]);
 useEffect(()=>{
  if(!snapshot)return;
  const added=arrivalTracker.current.update(snapshot.items);
  if(added.length)setArrivals(old=>({...old,...Object.fromEntries(added.map(id=>[id,Date.now()+6000]))}));
  const latest=Math.max(0,...snapshot.events.map(e=>e.eventId));
  if(seen.current!==null){const fresh=snapshot.events.filter(e=>e.eventId>seen.current!);if(fresh.length)setFlashes(old=>{const next={...old};for(const event of fresh)for(const field of event.fields)next[`${event.sysId}.${field}`]=Date.now()+6000;return next;});}
  seen.current=latest;
 },[snapshot?.revision]);
 useEffect(()=>{if(!Object.keys(flashes).length)return;const timer=setTimeout(()=>setFlashes(old=>Object.fromEntries(Object.entries(old).filter(([,expiry])=>expiry>Date.now()))),6100);return()=>clearTimeout(timer);},[flashes]);
 useEffect(()=>{if(!Object.keys(arrivals).length)return;const timer=setTimeout(()=>setArrivals(old=>Object.fromEntries(Object.entries(old).filter(([,expiry])=>expiry>Date.now()))),6100);return()=>clearTimeout(timer);},[arrivals]);
 const cached=useMemo(()=>queryIncidents(items,query,revision,now),[items,key,revision,Math.floor(now/60_000)]);
 // SSE replaces the full snapshot immediately. A cached HTTP page from an older
 // revision must never hide a status change while the next page request is in flight.
 const result=connected&&!failure&&response?.key===key&&response.data.revision===revision?response.data:cached;
 const waiting=connected&&!failure&&response?.key!==key;
 const flash=(item:Incident,...fields:string[])=>Math.max(0,...fields.map(f=>flashes[`${item.sysId}.${f}`]??0));
 const filterCount=[priority,status,sla,team].filter(Boolean).length;
 const teamNames=[...new Set(items.map(i=>i.assignedGroupName).filter(Boolean))].sort();
 function resetFilters(){setPriority('');setStatus('');setSla('');setTeam('');setPage(1);}
 const cell=(item:Incident,fields:string[],content:React.ReactNode)=>{const stamp=flash(item,...fields);return <div key={stamp} className={`live-field ${stamp>Date.now()?'field-changed':''}`}>{content}</div>;};
 const rows=result.items;
 return <>
 <section className="incident-queue surface" aria-busy={fetching}>
  <header className="incident-queue-heading"><h2>Очередь инцидентов</h2></header>
  <div className="incident-queue-toolbar"><div className="incident-tabs" role="group" aria-label="Группы инцидентов">{QUEUE_GROUPS.map(tab=><button key={tab.id} aria-pressed={group===tab.id} onClick={()=>{setGroup(tab.id);setPage(1);}}><span>{tab.title}</span><b>{items.filter(i=>belongs(i,tab.id)).length}</b></button>)}</div><div className="queue-search-controls"><label className="search-field incident-search"><Icon name="search" size={16}/><input aria-label="Найти инцидент" placeholder="Найти инцидент" value={search} onChange={e=>setSearch(e.target.value)} type="search"/></label><div className="queue-filter-anchor" ref={filtersAnchor}><button className={`queue-filter-button ${filterCount?'active':''}`} aria-label={`Фильтры${filterCount?': '+filterCount:''}`} aria-expanded={filtersOpen} aria-controls="queue-filter-panel" onClick={()=>setFiltersOpen(v=>!v)}><Icon name="filter" size={18}/>{filterCount>0&&<b>{filterCount}</b>}</button>{filtersOpen&&<div className="queue-filter-panel" id="queue-filter-panel" role="region" aria-label="Фильтры очереди"><header><strong>Фильтры</strong><button className="text-button" onClick={resetFilters}>Сбросить</button></header><label className="field"><span>Приоритет</span><select aria-label="Фильтр по приоритету" value={priority} onChange={e=>{setPriority(e.target.value);setPage(1);}}><option value="">Все приоритеты</option><option value="4">P1 · Критический</option><option value="3">P2 · Высокий</option><option value="2">P3 · Средний</option><option value="1">P4 · Низкий</option></select></label><label className="field"><span>Статус</span><select aria-label="Фильтр по статусу" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">Все статусы</option>{Object.entries(STATES).map(([id,title])=><option value={id} key={id}>{title}</option>)}</select></label><label className="field"><span>SLA</span><select aria-label="Фильтр по SLA" value={sla} onChange={e=>{setSla(e.target.value);setPage(1);}}><option value="">Любой срок</option><option value="late">Просрочен</option><option value="soon">Истекает · до 30 минут</option><option value="normal">В пределах срока</option><option value="unknown">Срок не указан</option><option value="research">Исследование</option><option value="restored">Устранён</option><option value="closed">Закрыт</option></select></label><label className="field"><span>Команда</span><select aria-label="Фильтр по команде" value={team} onChange={e=>{setTeam(e.target.value);setPage(1);}}><option value="">Все команды</option><option value="__unassigned__">Без команды</option>{teamNames.map(name=><option key={name}>{name}</option>)}</select></label><button className="button primary" onClick={()=>setFiltersOpen(false)}>Готово</button></div>}</div></div></div>
  {filterCount>0&&<div className="queue-active-filters"><span>Применено фильтров: {filterCount}</span>{priority&&<span>P{5-Number(priority)}</span>}{status&&<span>{STATES[status as keyof typeof STATES]}</span>}{sla&&<span>SLA: {({late:'просрочен',soon:'истекает',normal:'в срок',unknown:'не указан',research:'исследование',restored:'устранён',closed:'закрыт'} as Record<string,string>)[sla]}</span>}{team&&<span>{team==='__unassigned__'?'Без команды':team}</span>}<button className="text-button" onClick={resetFilters}>Сбросить</button></div>}
  {failure&&connected&&<p className="queue-cache-note" role="status">Не удалось загрузить страницу. Показаны последние сохранённые данные.</p>}
  <div className="incident-table-wrap"><table className="incident-table" aria-label="Очередь инцидентов"><colgroup><col style={{width:'36%'}}/><col style={{width:'12%'}}/><col style={{width:'19%'}}/><col style={{width:'16%'}}/><col style={{width:'17%'}}/></colgroup><thead><tr><th>Инцидент</th><th>Приоритет</th><th>Статус</th><th><button className="table-sort" onClick={()=>{setSort(sort==='deadline'?'priority':'deadline');setPage(1);}}>SLA<Icon name="sort" size={13}/></button></th><th>Команда</th></tr></thead><tbody>
  {(waiting||loading&&!snapshot)?Array.from({length:pageSize},(_,n)=><tr className="queue-skeleton" key={n}><td colSpan={5}><span/></td></tr>):rows.map(item=><tr key={item.sysId} className={`${belongs(item,'critical')?'row-critical':''} ${(arrivals[item.sysId]??0)>Date.now()?'incident-arrival':''}`} data-new-incident={(arrivals[item.sysId]??0)>Date.now()?'true':undefined} tabIndex={0} aria-label={`Открыть инцидент ${item.id}`} onClick={()=>onOpen(item.sysId)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onOpen(item.sysId);}}}>
   <td>{cell(item,['header','description','shortDescription'],<div className="queue-incident-copy"><span className="incident-id">{item.id}</span><strong>{item.header}</strong><small title={item.description}>{item.shortDescription||item.description||item.productName}</small></div>)}</td>
   <td>{cell(item,['priorityId','priority'],<span className={`queue-priority level-${item.priorityId}`} title={`${item.priority} · приоритет источника ${item.priorityId}`}>P{5-item.priorityId}</span>)}</td><td>{cell(item,['stateEnum','stateId','state'],<Status item={item}/>)}</td><td>{cell(item,['deadline'],<QueueSla item={item} now={now}/>)}</td>
   <td>{cell(item,['assignedGroupName'],<div className="queue-team-cell">{item.assignedGroupName.trim()&&<Team name={item.assignedGroupName}/>} {canAssign(item)&&<button className={`assign-team-button ${item.assignedGroupName.trim()?'has-team':''}`} onClick={e=>{e.stopPropagation();onAssign(item.sysId);}} aria-label={`Назначить команду для ${item.id}`}><Icon name="userPlus" size={14}/>{item.assignedGroupName.trim()?'Сменить':'Назначить'}</button>}{!item.assignedGroupName.trim()&&!canAssign(item)&&<span className="muted">Не назначена</span>}</div>)}</td>
  </tr>)}
  </tbody></table></div>
  {!waiting&&!rows.length&&<Empty icon="search" title="Инциденты не найдены">Попробуйте другую группу или поисковый запрос.</Empty>}
  <footer className="incident-pagination"><span>{result.total?`${(result.page-1)*result.pageSize+1}–${Math.min(result.page*result.pageSize,result.total)} из ${result.total}`:'0 инцидентов'}</span><label>На странице <select aria-label="Инцидентов на странице" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}><option value={9}>9</option><option value={18}>18</option><option value={36}>36</option></select></label><div className="pagination"><button className="icon-button" aria-label="Предыдущая страница" disabled={result.page<=1||waiting} onClick={()=>setPage(result.page-1)}><Icon name="left" size={17}/></button><span>{result.page} / {result.totalPages}</span><button className="icon-button" aria-label="Следующая страница" disabled={result.page>=result.totalPages||waiting} onClick={()=>setPage(result.page+1)}><Icon name="right" size={17}/></button></div></footer>
 </section>

 </>;
}
