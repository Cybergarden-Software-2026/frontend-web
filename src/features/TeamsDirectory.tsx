import { useEffect,useMemo,useRef,useState } from 'react';
import type { Incident } from '../domain/incidents';
import type { TeamFilter } from '../domain/teamDirectory';
import { selectTeams,teamDirectory } from '../domain/teamDirectory';
import { api } from '../data/api';
import { Icon } from '../components/Icon';
import { Empty } from '../components/ui';

const filters:{id:TeamFilter;label:string}[]=[{id:'all',label:'Все команды'},{id:'attention',label:'Требуют внимания'},{id:'late',label:'Есть просроченные'},{id:'soon',label:'Срок истекает'},{id:'idle',label:'Без активных инцидентов'}];
export function TeamsDirectory({items,now,revision,connected,loading,onTeam,onOpen}:{items:Incident[];now:number;revision:number;connected:boolean;loading:boolean;onTeam:(name:string)=>void;onOpen:(id:string)=>void}){
 const [names,setNames]=useState<string[]>([]),[failed,setFailed]=useState(false),[fetching,setFetching]=useState(false),[attempt,setAttempt]=useState(0);
 const [search,setSearch]=useState(''),[filter,setFilter]=useState<TeamFilter>('all'),[open,setOpen]=useState(false),[copyError,setCopyError]=useState(''),[copied,setCopied]=useState('');
 const controls=useRef<HTMLDivElement>(null),filterButton=useRef<HTMLButtonElement>(null),copyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{
  if(!connected){setFetching(false);return;}let alive=true;setFetching(true);setFailed(false);
  api.teams().then(result=>{if(alive)setNames(result.items.map(row=>row.name).filter(name=>typeof name==='string'&&name.trim()));}).catch(()=>{if(alive)setFailed(true);}).finally(()=>{if(alive)setFetching(false);});
  return()=>{alive=false;};
 },[connected,revision,attempt]);
 useEffect(()=>{
  if(!open)return;
  function outside(event:PointerEvent){if(!controls.current?.contains(event.target as Node))setOpen(false);}
  function escape(event:KeyboardEvent){if(event.key==='Escape'){setOpen(false);filterButton.current?.focus();}}
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 useEffect(()=>()=>{if(copyTimer.current)clearTimeout(copyTimer.current);},[]);
 const cards=useMemo(()=>teamDirectory(items,names,now),[items,names,Math.floor(now/1000)]);
 const shown=useMemo(()=>selectTeams(cards,search,filter),[cards,search,filter]);
 const columns=useMemo(()=>{const middle=Math.ceil(shown.length/2);return [shown.slice(0,middle),shown.slice(middle)];},[shown]);
 async function copy(name:string,value:string){
  setCopyError('');try{await navigator.clipboard.writeText(value);setCopied(name);if(copyTimer.current)clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(''),2500);}
  catch{setCopyError('Не удалось скопировать контакт. Выделите текст и скопируйте вручную.');}
 }
 return <section className="teams-directory" aria-labelledby="teams-title">
  <header className="surface teams-toolbar"><h1 id="teams-title">Список команд</h1><div className="teams-controls" ref={controls}><label className="teams-search"><Icon name="search" size={17}/><input type="search" placeholder="Найти команду" aria-label="Найти команду" value={search} onChange={event=>setSearch(event.target.value)}/></label><button ref={filterButton} className={`teams-filter-toggle ${filter!=='all'?'is-active':''}`} aria-label="Фильтр команд" aria-expanded={open} aria-controls="teams-filters" onClick={()=>setOpen(value=>!value)}><Icon name="filter" size={17}/>{filter!=='all'&&<i/>}</button>
   {open&&<div className="teams-filter-menu" id="teams-filters"><fieldset><legend>Показать команды</legend>{filters.map(value=><label key={value.id} className={filter===value.id?'is-selected':''}><input type="radio" name="team-view" checked={filter===value.id} value={value.id} onChange={()=>{setFilter(value.id);setOpen(false);filterButton.current?.focus();}}/><span>{value.label}</span>{filter===value.id&&<Icon name="check" size={15}/>}</label>)}</fieldset></div>}
  </div></header>
  {failed&&<div className="teams-notice" role="status">Справочник временно недоступен. Показаны команды из загруженных инцидентов. <button className="text-button" onClick={()=>setAttempt(value=>value+1)}>Повторить</button></div>}
  {copyError&&<p className="teams-notice" role="status">{copyError}</p>}
  <span className="sr-only" role="status">{copied?'Контакт команды скопирован':''}</span>
  {shown.length?<div className="teams-masonry">{columns.map((column,index)=><div className="teams-column" key={index}>{column.map(card=><article className="teams-reference-card" key={card.name} aria-label={card.name}>
   <div className="teams-card-body"><header className="teams-card-heading"><span className="teams-card-avatar" aria-hidden="true">{card.initials}</span><div><button className="teams-card-title" onClick={()=>onTeam(card.name)} title="Открыть очередь команды">{card.name}</button><p>{card.description}</p></div></header>
    {card.attention.length>0&&<div className="teams-attention"><strong>Требуют внимания</strong><ul>{card.attention.slice(0,6).map(item=><li key={item.sysId}><a href={`#incident/${encodeURIComponent(item.sysId)}?from=teams`} title={`${item.id} · ${item.header}`} onClick={event=>{event.preventDefault();onOpen(item.sysId);}}><b>{item.id}</b><span> · {item.header}</span></a></li>)}</ul>{card.attention.length>6&&<button className="teams-more" onClick={()=>onTeam(card.name)}>Ещё {card.attention.length-6} инцидентов</button>}</div>}
    <footer className="teams-card-contacts"><span>Контактные данные: {card.contacts??'не указаны'}</span><button className="teams-copy" disabled={!card.contacts} aria-label={card.contacts?'Скопировать контакты команды':'Контакты команды не указаны'} title={card.contacts?'Скопировать контакты':'Контакты пока не указаны'} onClick={()=>{if(card.contacts)void copy(card.name,card.contacts);}}><Icon name={copied===card.name?'check':'copy'} size={15}/></button></footer>
   </div>
   <dl className="teams-card-counts">{card.overdue>0&&<div className="is-overdue" title="Срок решения истёк"><dt><Icon name="alert" size={12}/><span>Просрочены</span></dt><dd>{card.overdue}</dd></div>}{card.soon>0&&<div className="is-soon" title="До дедлайна осталось меньше 20% общего срока"><dt><Icon name="clock" size={12}/><span>Истекают</span></dt><dd>{card.soon}</dd></div>}<div className="teams-count-active" title="В работе, включая исследование"><dt><Icon name="pulse" size={12}/><span>Активны</span></dt><dd>{card.active}</dd></div></dl>
  </article>)}</div>)}</div>:<div className="surface teams-empty"><Empty title={!cards.length&&(loading||fetching)?'Загружаем команды':cards.length?'Команды не найдены':'Команд пока нет'} icon={cards.length?'search':'people'}>{cards.length?'Измените поисковый запрос или фильтр.':'Список появится после загрузки данных.'}</Empty>{(search||filter!=='all')&&<button className="text-button" onClick={()=>{setSearch('');setFilter('all');}}>Сбросить фильтры</button>}</div>}
 </section>;
}
