import { useEffect,useLayoutEffect,useState,useRef,useMemo } from 'react';
import type { ChangeEvent,Incident } from '../domain/incidents';
import { counts,EVENT_LABELS,describeEvent,COORDINATOR_TEAM } from '../domain/incidents';
import { useIncidents } from '../data/useIncidents';
import { useAlertSignal } from '../data/useAlertSignal';
import { api } from '../data/api';
import { signOut } from '../data/coordinatorSession';
import { Icon } from '../components/Icon';
import { ConnectionNotice } from '../components/ConnectionNotice';
import { detectMassProblems } from '../domain/operations';
import { ProblemClusters } from '../features/ProblemClusters';
import { Team,Dialog,Empty,dateTime } from '../components/ui';
import { Detail } from '../features/Detail';
import { AlertHeader } from '../features/AlertHeader';
import { readRoute,incidentHash,backLabels } from './routes';
import type { Page } from './routes';
import { Analytics } from '../features/Analytics';
import { IncidentDashboard } from '../features/IncidentDashboard';
import { AssignTeam } from '../features/AssignTeam';
const pages:{id:Page;label:string;icon:string}[]=[{id:'incidents',label:'Инциденты',icon:'grid'},{id:'events',label:'События',icon:'pulse'},{id:'teams',label:'Команды',icon:'people'},{id:'analytics',label:'Аналитика',icon:'chart'},{id:'problems',label:'Массовые сбои',icon:'layers'}];
const DEMO=import.meta.env.VITE_DEMO_API==='true';
const readKey='underctrl.events.read.v1';
export function App() {
 const data=useIncidents();const {snapshot,connected,online,loading,refresh}=data;
 const items=snapshot?.items??[];
 const [headerPreview,setHeaderPreview]=useState<Incident[]|null>(null);
 const headerItems=headerPreview??items;
 const [route,setRoute]=useState(()=>readRoute(location.hash));
 const {page,incidentId:detailId}=route;
 const workspaceRef=useRef<HTMLDivElement>(null),returnScroll=useRef(0),originFocus=useRef<HTMLElement|null>(null),previousDetail=useRef<string|null>(null);
 const [demoOpen,setDemoOpen]=useState(false),[busy,setBusy]=useState<string|null>(null),[actionError,setActionError]=useState<string|null>(null);
 const [now,setNow]=useState(Date.now()),[eventSearch,setEventSearch]=useState(''),[teamSearch,setTeamSearch]=useState(''),[eventType,setEventType]=useState('');
 const [lastRead,setLastRead]=useState(()=>{try{return Number(localStorage.getItem(readKey)??0);}catch{return 0;}});
 const uploadRef=useRef<HTMLInputElement>(null);
 const [assignId,setAssignId]=useState<string|null>(null),[teamContext,setTeamContext]=useState<{name:string;token:number}|null>(null);
 const clusters=useMemo(()=>detectMassProblems(items),[items]);
 const assignment=items.find(i=>i.sysId===assignId);
 function openIncident(id:string){
  if(!detailId){
   returnScroll.current=workspaceRef.current?.scrollTop??0;originFocus.current=document.activeElement as HTMLElement;
   history.replaceState({...history.state,underCtrlScroll:returnScroll.current},'',location.href);
  }
  const state={...history.state,underCtrlIncident:true};
  if(detailId)history.replaceState(state,'',incidentHash(id,page));else history.pushState(state,'',incidentHash(id,page));
  setRoute({page,incidentId:id});
 }
 function closeIncident(){
  if(history.state?.underCtrlIncident){history.back();return;}
  history.replaceState(null,'','#'+page);setRoute({page,incidentId:null});
 }
 useEffect(()=>{const read=()=>setRoute(readRoute(location.hash));window.addEventListener('hashchange',read);window.addEventListener('popstate',read);return()=>{window.removeEventListener('hashchange',read);window.removeEventListener('popstate',read);};},[]);
 useLayoutEffect(()=>{
  const workspace=workspaceRef.current;if(!workspace)return;
  if(detailId){workspace.scrollTop=0;document.getElementById('incident-title')?.focus({preventScroll:true});}
  else if(previousDetail.current){workspace.scrollTop=Number(history.state?.underCtrlScroll??returnScroll.current)||0;originFocus.current?.focus({preventScroll:true});}
  previousDetail.current=detailId;
 },[detailId,page]);
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
 const clock=now+data.clockOffset;
 const {sequence:signalSequence,audioStatus}=useAlertSignal(headerItems,clock,Boolean(snapshot));
 const events=snapshot?.events??[],latest=events[0]?.eventId??0,unread=events.filter(e=>e.eventId>lastRead).length;
 useEffect(()=>{
  if(connected&&snapshot&&lastRead>latest){
   setLastRead(0);
   try{localStorage.setItem(readKey,'0');}catch{}
  }
 },[connected,snapshot,latest,lastRead]);
 const selected=items.find(i=>i.sysId===detailId)??headerPreview?.find(i=>i.sysId===detailId);
 const teams=[...new Set(items.map(i=>i.assignedGroupName))].sort();
 function navigate(target:Page){location.hash=target;setRoute({page:target,incidentId:null});setActionError(null);}
 function selectTeam(name:string){setTeamContext({name,token:Date.now()});navigate('incidents');}
 function testHeader(action:'empty'|'critical'|'waiting'|'live'){
  if(action==='live')setHeaderPreview(null);
  else if(action==='empty')setHeaderPreview([]);
  else {
   const base=items[0];if(!base)return;
   const stamp=Date.now(),critical=action==='critical';
   const test:Incident={...base,sysId:`header-test-${stamp}`,id:`TEST-${stamp}`,header:critical?'Тест · Недоступен сервис оплаты':'Тест · Ожидает назначения команды',shortDescription:'Проверка хедера. Эта запись не сохраняется в очередь.',description:'Тестовый инцидент для проверки движения карточек, колокольчика и звука.',priorityId:critical?4:2,priority:critical?'Наивысший':'Средний',stateId:0,stateEnum:'Assigned',state:'Назначен',assignedGroupName:critical?'':COORDINATOR_TEAM,assignedEmployee:'',assignedEmployeeLogin:'',submitDate:new Date(clock).toISOString(),lastAssignmentToTeamDateTime:new Date(clock-(critical?0:9*60_000)).toISOString(),deadline:new Date(clock+12*60_000).toISOString(),completionDate:null,solution:''};
   setHeaderPreview(previous=>[...(previous??[]),test]);
  }
  setDemoOpen(false);navigate('incidents');
 }
 async function simulate(action:string){setBusy(action);setActionError(null);try{data.accept(await api.simulate(action));if(action!=='reset')setDemoOpen(false);}catch(e){setActionError(e instanceof Error?e.message:'Не удалось выполнить сценарий');}finally{setBusy(null);}}
 async function importFile(file:File){setBusy('import');setActionError(null);try{const value=JSON.parse(await file.text());data.accept(await api.import(value));}catch(e){setActionError(e instanceof Error?e.message:'Ошибка импорта');}finally{setBusy(null);if(uploadRef.current)uploadRef.current.value='';}}
 function markRead(){setLastRead(latest);try{localStorage.setItem(readKey,String(latest));}catch{}}
 return <div className={`app page-${page} ${detailId?'page-incident-detail':''}`}><a className="skip-link" href="#main" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus();}}>К содержанию</a><aside className="sidebar"><a className="brand" href="#incidents"><img src="/mark.svg" width="38" height="38" alt=""/><span>Under<span className="brand-accent">Ctrl</span><small>Координация IT</small></span></a><nav aria-label="Основное меню"><p className="nav-caption">РАБОЧАЯ ОБЛАСТЬ</p>{pages.map(link=><a key={link.id} className={`nav-item ${page===link.id?'selected':''}`} aria-current={page===link.id?'page':undefined} href={'#'+link.id}><Icon name={link.icon}/><span>{link.label}</span>{link.id==='events'&&unread>0&&<span className="nav-count">{unread}</span>}{link.id==='problems'&&clusters.length>0&&<span className="nav-count">{clusters.length}</span>}</a>)}</nav><div className="sidebar-bottom"><div className="sidebar-tools">{!DEMO&&<button className="icon-button" aria-label="Выйти из аккаунта" title="Выйти" onClick={()=>signOut()}><Icon name="logout" size={15}/></button>}{DEMO&&<button className="text-button" onClick={()=>setDemoOpen(true)}><Icon name="flask" size={13}/>Симуляция</button>}<button className="icon-button" aria-label="Обновить данные" title={connected?'Соединение активно':'Нет соединения'} onClick={()=>void refresh()}><Icon name="refresh" size={15}/></button><a className="icon-button" href="#settings" aria-label="Настройки"><Icon name="settings" size={15}/></a></div><div className="sidebar-profile"><span className="avatar">КС</span><span><strong>Дежурная смена</strong><small>Координатор</small></span></div></div></aside>
 <div className="workspace" ref={workspaceRef}><header className="topbar"><span className="top-context">Мониторинг<span className="crumb-divider">/</span><strong>{pages.find(p=>p.id===page)?.label??'Настройки'}</strong></span><a className="mobile-brand brand" href="#incidents"><img src="/mark.svg" width="30" height="30" alt=""/>underCtrl</a><div className="top-actions">{DEMO&&<span className="demo-badge">Демо API</span>}<span className={`live-indicator ${connected?'online':'offline'}`}><i/>{connected?'Синхронизировано':'Офлайн'}</span><span className="top-separator"/><button className="icon-button" onClick={()=>void refresh()} disabled={loading} aria-label="Обновить данные" title="Обновить данные"><Icon name="sort"/></button><button className="icon-button notification-button" aria-label={`События: ${unread} непрочитанных`} onClick={()=>navigate('events')}><Icon name="signal"/>{unread>0&&<span>{unread}</span>}</button><span className="avatar top-avatar">КС</span></div></header>
 <main className="main" id="main" tabIndex={-1}>{(!online||!connected)&&<ConnectionNotice online={online} snapshot={snapshot} loading={loading} onRetry={refresh}/>}{snapshot?.source.error&&<div className="notice notice-warning" role="alert"><Icon name="alert"/><div><strong>Источник данных не обновляется</strong><p>{snapshot.source.error}. Предыдущий корректный снимок сохранён.</p></div></div>}{actionError&&<div className="notice notice-warning" role="alert"><Icon name="alert"/><p>{actionError}</p><button className="icon-button" aria-label="Скрыть сообщение" onClick={()=>setActionError(null)}><Icon name="close"/></button></div>}
 {(page==='incidents'||detailId)&&<AlertHeader items={headerItems} now={clock} onOpen={openIncident} onJournal={()=>navigate('events')} unread={unread} signalSequence={signalSequence} audioStatus={audioStatus}/>}
 <div className="screen-content" hidden={Boolean(detailId)}>
 {page==='incidents'&&headerPreview!==null&&<div className="header-preview-notice" role="status"><span>Тест хедера · данные очереди не меняются</span><button className="text-button" onClick={()=>testHeader('live')}>Вернуться к данным сервера</button></div>}
 {page==='incidents'&&<IncidentDashboard snapshot={snapshot} now={clock} connected={connected} loading={loading} onOpen={openIncident} onAssign={setAssignId} teamContext={teamContext}/>}
 {page==='events'&&<><PageHeading eyebrow="ИСТОРИЯ ИЗМЕНЕНИЙ" title="События" text="Всё, что изменилось в текущей очереди" action={<button className="button secondary" onClick={markRead} disabled={!unread}><Icon name="check" size={17}/>Отметить прочитанным</button>}/><section className="surface full-panel"><div className="event-toolbar"><label className="search-field"><Icon name="search"/><input type="search" placeholder="Номер или заголовок инцидента" value={eventSearch} onChange={e=>setEventSearch(e.target.value)}/></label><select aria-label="Тип события" value={eventType} onChange={e=>setEventType(e.target.value)}><option value="">Все события</option>{Object.entries(EVENT_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><span className="small-tag tone-purple">{unread} новых</span></div>{events.filter(e=>(!eventType||e.types.includes(eventType))&&(!eventSearch||[e.incidentId,e.header].join(' ').toLowerCase().includes(eventSearch.toLowerCase()))).map(event=><div key={event.eventId} className={event.eventId>lastRead?'unread-event':''}><EventRow event={event} expanded onClick={()=>openIncident(event.sysId)}/></div>)}{!events.length&&<Empty title="Изменений пока нет" icon="pulse">Журнал хранит события с момента подключения источника. Измените JSON или запустите демонстрационный сценарий.</Empty>}</section></>}
 {page==='teams'&&<><PageHeading eyebrow="СПРАВОЧНИК ИЗ ВЫГРУЗКИ" title="Команды" text="Ответственные подразделения и их текущая нагрузка" action={<span className="small-tag tone-purple">{teams.length} команд</span>}/><label className="search-field team-search"><Icon name="search"/><input type="search" placeholder="Найти команду" value={teamSearch} onChange={e=>setTeamSearch(e.target.value)}/></label><div className="team-grid">{teams.filter(name=>name.toLocaleLowerCase('ru').includes(teamSearch.toLocaleLowerCase('ru'))).map(name=>{const own=items.filter(i=>i.assignedGroupName===name),stats=counts(own,clock);return <button className="surface team-card" key={name} onClick={()=>selectTeam(name)}><Team name={name}/><div className="team-card-stats"><div><strong>{stats.all}</strong><small>Всего</small></div><div><strong>{stats.attention}</strong><small>Во внимании</small></div><div><strong className={stats.overdue?'text-danger':''}>{stats.overdue}</strong><small>Срок истёк</small></div></div><div className="team-card-footer"><span>{new Set(own.map(i=>i.assignedEmployeeLogin).filter(Boolean)).size} исполнителей в выгрузке</span><span>Открыть очередь</span></div></button>;})}</div>{!teams.filter(name=>name.toLowerCase().includes(teamSearch.toLowerCase())).length&&<Empty title="Команда не найдена">Измените поисковый запрос.</Empty>}</>}
 {page==='problems'&&<ProblemClusters clusters={clusters} items={items} onOpen={openIncident}/>}
 {page==='analytics'&&<Analytics items={items} now={clock} onTeam={selectTeam}/>}
 {page==='settings'&&<><PageHeading eyebrow="ПОДКЛЮЧЕНИЕ И ДАННЫЕ" title="Источник и настройки" text="Актуальность снимка и правила рабочего пространства"/><div className="settings-grid"><section className="surface settings-card"><h2><Icon name="layers"/>Источник инцидентов</h2><dl><div><dt>Подключение</dt><dd>{connected?'Активно':'Недоступно'}</dd></div><div><dt>Версия снимка</dt><dd>{snapshot?.revision??'—'}</dd></div><div><dt>Последнее изменение</dt><dd>{snapshot?dateTime(snapshot.updatedAt):'—'}</dd></div><div><dt>Записей в снимке</dt><dd>{items.length}</dd></div><div><dt>Последнее чтение источника</dt><dd>{dateTime(snapshot?.source.readAt)}</dd></div></dl>{DEMO&&<><p className="muted">Измените файл в VS Code. Сервер автоматически передаст изменения на страницу.</p><code className="file-path">{snapshot?.source.path??'data/incidents.json'}</code><button className="button secondary" onClick={()=>uploadRef.current?.click()} disabled={busy==='import'}><Icon name="plus" size={17}/>{busy==='import'?'Загружаем…':'Импортировать JSON'}</button><input type="file" accept=".json,application/json" hidden ref={uploadRef} onChange={e=>{if(e.target.files?.[0])void importFile(e.target.files[0]);}}/><p className="caption">Импорт заменяет тестовый снимок целиком. Дубли идентификаторов и неверный формат отклоняются.</p></>}</section><section className="surface settings-card"><h2><Icon name="circleCheck"/>Статусы без путаницы</h2><div className="status-explainer"><strong>Завершён</strong><p>Проблема устранена. Если она сохраняется или повторяется, инцидент можно вернуть в работу.</p></div><div className="status-explainer"><strong>Закрыт</strong><p>Вся работа с инцидентом закончена.</p></div><div className="status-explainer"><strong>Исследование</strong><p>Идёт разбор причин. Инцидент остаётся в поле внимания, включая назначение координаторам.</p></div><div className="status-explainer solution-note"><strong>Описание решения</strong><p>Текст может быть заполнен заранее или описывать прошлую попытку, которая не помогла. Само поле solution не подтверждает устранение.</p></div></section><section className="surface settings-card"><h2><Icon name="spark"/>Помощник координатора</h2><p>Собирает факты, объясняет срочность по явным правилам и находит команды из похожих завершённых записей.</p><div className="small-tag tone-purple">Анализ по правилам · LLM не подключена</div><p className="muted">Не меняет статус и не переназначает инциденты. При недостатке оснований сообщает об этом.</p></section><section className="surface settings-card"><h2><Icon name="monitor"/>Рабочие переходы</h2><p>Переход в ITSM доступен из карточки после настройки ссылки на стороне API.</p><p className="muted">Часовой пояс: Москва (UTC+3). Критический приоритет: 4. Обновления не сбрасывают выбранные фильтры.</p><button className="button secondary" onClick={()=>void refresh()}><Icon name="sort" size={17}/>Проверить подключение</button></section></div></>}
 </div>
 {detailId&&(selected&&snapshot?<Detail key={selected.sysId} item={selected} snapshot={snapshot} now={clock} onBack={closeIncident} backLabel={backLabels[page]} onAssign={()=>setAssignId(selected.sysId)}/>:<section className="surface incident-unavailable"><button className="button secondary detail-back" onClick={closeIncident}><Icon name="left" size={16}/>{backLabels[page]}</button><Empty title={snapshot?'Инцидент недоступен':'Загружаем инцидент'} icon="inbox">{snapshot?'Запись отсутствует в текущем снимке. Её изменения могут оставаться в журнале событий.':'Ожидаем актуальные данные сервера.'}</Empty></section>)}
 </main></div><nav className="bottom-nav" aria-label="Компактное меню">{pages.map(link=><a className={`nav-item ${page===link.id?'selected':''}`} key={link.id} href={'#'+link.id}><Icon name={link.icon}/><span>{link.label}</span></a>)}{!DEMO&&<button className="logout-mobile" aria-label="Выйти из аккаунта" onClick={()=>signOut()}><Icon name="logout" size={17}/></button>}</nav>
 {demoOpen&&<Dialog title="Проверка живых обновлений" onClose={()=>setDemoOpen(false)}><section className="header-test-controls"><h3>Проверка хедера</h3><p className="muted">Эти кнопки меняют только тестовый хедер. Инциденты и назначения в очереди сохраняются.</p><div className="header-test-actions"><button className="button secondary" onClick={()=>testHeader('empty')}>Очистить хедер</button><button className="button secondary" onClick={()=>testHeader('critical')}>Добавить критическую задачу</button><button className="button secondary" onClick={()=>testHeader('waiting')}>Добавить ожидание больше 8 минут</button><button className="text-button" onClick={()=>testHeader('live')}>Вернуть хедер сервера</button></div></section><p className="muted">Каждый сценарий изменяет тестовый JSON через API. Список, группы и события обновляются на тех же данных.</p><div className="simulation-grid">{[['coordinator-wait','Ожидание у координатора','Без команды решения более 8 минут','clock'],['mass','Массовая проблема','Три связанных инцидента одного сервиса','layers'],['unassigned','Нет ответственной команды','Не распределён более 15 минут','people'],['critical','Критический инцидент','Приоритет 4 и дедлайн через 12 минут','alert'],['assign','Передать координаторам','Инцидент появится в соответствующей группе','people'],['deadline','Изменить дедлайн','Установить срок через 5 минут','clock'],['resolve','Устранить проблему','Статус «Завершён», возможен возврат','circleCheck'],['reopen','Вернуть в работу','Повторное открытие завершённого инцидента','pulse'],['research','Начать исследование','Исследование и назначение координаторам','search'],['close','Полностью закрыть','Вся работа с инцидентом окончена','check']].map(([action,title,description,icon])=><button key={action} className="simulation-choice" disabled={busy!==null} onClick={()=>void simulate(action)}><span className="event-icon tone-purple"><Icon name={icon}/></span><span><strong>{title}</strong><small>{description}</small></span></button>)}</div><button className="button secondary" disabled={busy!==null} onClick={()=>void simulate('reset')}>Восстановить исходные 44 записи</button><p className="caption">Сброс восстановит тестовый файл из seed.json. Прошлые события останутся в журнале.</p></Dialog>}

 {assignment&&snapshot&&<AssignTeam key={assignment.sysId} item={assignment} snapshot={snapshot} onClose={()=>setAssignId(null)} onAccept={data.accept}/>}
 </div>;
}
function PageHeading({eyebrow,title,text,action}:{eyebrow:string;title:string;text:string;action?:React.ReactNode}) {return <header className="page-heading secondary-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p></div>{action}</header>;}
function EventRow({event,onClick,expanded=false}:{event:ChangeEvent;onClick:()=>void;expanded?:boolean}) {
 const tone=event.types.includes('critical')?'danger':event.types.some(t=>['resolved','closed'].includes(t))?'green':'purple';
 return <button className={`event-row ${expanded?'event-expanded':''}`} onClick={onClick}><span className={`event-icon tone-${tone}`}><Icon name={tone==='green'?'circleCheck':tone==='danger'?'alert':'pulse'} size={16}/></span><span className="event-body"><strong>{EVENT_LABELS[event.types[0]]??'Обновление'}</strong><span>{event.incidentId}</span><p>{event.header}</p>{expanded&&<p className="event-diff">{describeEvent(event)}</p>}<small>{dateTime(event.at)}</small></span></button>;
}
