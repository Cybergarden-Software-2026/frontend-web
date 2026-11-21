import { useEffect,useLayoutEffect,useState,useRef,useMemo } from 'react';
import type { Incident } from '../domain/incidents';
import { useIncidents } from '../data/useIncidents';
import { useAlertSignal } from '../data/useAlertSignal';
import { api } from '../data/api';
import { signOut } from '../data/coordinatorSession';
import { Icon } from '../components/Icon';
import { ConnectionNotice } from '../components/ConnectionNotice';
import { curateMassGroup,excludeMassIncident,visibleMassProblems } from '../domain/massProblems';
import { MASS_EXCLUSIONS_KEY,MASS_GROUPS_KEY,readMassExclusions,saveMassExclusions,readManualMassGroups,saveManualMassGroups } from '../data/massProblemPreferences';
import type { ProblemCluster } from '../domain/operations';
import { ProblemClusters } from '../features/ProblemClusters';
import { Dialog,Empty,dateTime } from '../components/ui';
import { Detail } from '../features/Detail';
import { AlertHeader } from '../features/AlertHeader';
import { EventsJournal } from '../features/EventsJournal';
import { readRoute,incidentHash,backLabels } from './routes';
import type { Page } from './routes';
import { TeamsDirectory } from '../features/TeamsDirectory';
import { Analytics } from '../features/Analytics';
import { IncidentDashboard } from '../features/IncidentDashboard';
import { AssignTeam } from '../features/AssignTeam';
import { HeaderSimulator } from '../features/HeaderSimulator';
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
 const [now,setNow]=useState(Date.now());
 const [lastRead,setLastRead]=useState(()=>{try{return Number(localStorage.getItem(readKey)??0);}catch{return 0;}});
 const uploadRef=useRef<HTMLInputElement>(null);
 const [assignId,setAssignId]=useState<string|null>(null),[teamContext,setTeamContext]=useState<{name:string;token:number}|null>(null);
 const [massExclusions,setMassExclusions]=useState(readMassExclusions),[exclusionsSaved,setExclusionsSaved]=useState(true);
 const [manualMassGroups,setManualMassGroups]=useState(readManualMassGroups),[groupsSaved,setGroupsSaved]=useState(true);
 const massExclusionsRef=useRef(massExclusions),manualMassGroupsRef=useRef(manualMassGroups);
 useEffect(()=>{const reload=(event:StorageEvent)=>{if(event.key===MASS_EXCLUSIONS_KEY||event.key===null){const value=readMassExclusions();massExclusionsRef.current=value;setMassExclusions(value);setExclusionsSaved(true);}if(event.key===MASS_GROUPS_KEY||event.key===null){const value=readManualMassGroups();manualMassGroupsRef.current=value;setManualMassGroups(value);setGroupsSaved(true);}};window.addEventListener('storage',reload);return()=>window.removeEventListener('storage',reload);},[]);
 function saveExclusions(value:typeof massExclusions){massExclusionsRef.current=value;setMassExclusions(value);setExclusionsSaved(saveMassExclusions(value));}
 function excludeMass(item:Incident,title:string){saveExclusions(excludeMassIncident(massExclusionsRef.current,item,title,Date.now()));}
 function restoreMass(sysId:string){saveExclusions(massExclusionsRef.current.filter(row=>row.sysId!==sysId));}
 function addMass(group:ProblemCluster,added:Incident[]){
  const current=group.sysIds.flatMap(id=>{const item=items.find(row=>row.sysId===id);return item?[item]:[];});
  const value=curateMassGroup(manualMassGroupsRef.current,group,[...current,...added]);manualMassGroupsRef.current=value;setManualMassGroups(value);setGroupsSaved(saveManualMassGroups(value));
  const addedIds=new Set(added.map(item=>item.sysId));saveExclusions(massExclusionsRef.current.filter(row=>!addedIds.has(row.sysId)));
 }
 const clusters=useMemo(()=>visibleMassProblems(items,massExclusions,manualMassGroups),[items,massExclusions,manualMassGroups]);
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
 function navigate(target:Page){location.hash=target;setRoute({page:target,incidentId:null});setActionError(null);}
 function selectTeam(name:string){setTeamContext({name,token:Date.now()});navigate('incidents');}
 async function simulate(action:string){setBusy(action);setActionError(null);try{data.accept(await api.simulate(action));if(action!=='reset')setDemoOpen(false);}catch(e){setActionError(e instanceof Error?e.message:'Не удалось выполнить сценарий');}finally{setBusy(null);}}
 async function importFile(file:File){setBusy('import');setActionError(null);try{const value=JSON.parse(await file.text());data.accept(await api.import(value));}catch(e){setActionError(e instanceof Error?e.message:'Ошибка импорта');}finally{setBusy(null);if(uploadRef.current)uploadRef.current.value='';}}
 return <div className={`app page-${page} ${detailId?'page-incident-detail':''}`}><a className="skip-link" href="#main" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus();}}>К содержанию</a><aside className="sidebar"><a className="brand" href="#incidents"><img src="/mark.svg" width="38" height="38" alt=""/><span>Under<span className="brand-accent">Ctrl</span><small>Координация IT</small></span></a><nav aria-label="Основное меню"><p className="nav-caption">РАБОЧАЯ ОБЛАСТЬ</p>{pages.map(link=><a key={link.id} className={`nav-item ${page===link.id?'selected':''}`} aria-current={page===link.id?'page':undefined} href={'#'+link.id}><Icon name={link.icon}/><span>{link.label}</span>{link.id==='events'&&unread>0&&<span className="nav-count">{unread}</span>}{link.id==='problems'&&clusters.length>0&&<span className="nav-count">{clusters.length}</span>}</a>)}</nav><div className="sidebar-bottom"><div className="sidebar-tools">{!DEMO&&<button className="icon-button" aria-label="Выйти из аккаунта" title="Выйти" onClick={()=>signOut()}><Icon name="logout" size={15}/></button>}<button className="text-button" onClick={()=>setDemoOpen(true)}><Icon name="flask" size={13}/>Симуляция</button><button className="icon-button" aria-label="Обновить данные" title={connected?'Соединение активно':'Нет соединения'} onClick={()=>void refresh()}><Icon name="refresh" size={15}/></button><a className="icon-button" href="#settings" aria-label="Настройки"><Icon name="settings" size={15}/></a></div><div className="sidebar-profile"><span className="avatar">КС</span><span><strong>Дежурная смена</strong><small>Координатор</small></span></div></div></aside>
 <div className="workspace" ref={workspaceRef}>
 <main className="main" id="main" tabIndex={-1}>{(!online||!connected)&&<ConnectionNotice online={online} snapshot={snapshot} loading={loading} onRetry={refresh}/>}{snapshot?.source.error&&<div className="notice notice-warning" role="alert"><Icon name="alert"/><div><strong>Источник данных не обновляется</strong><p>{snapshot.source.error}. Предыдущий корректный снимок сохранён.</p></div></div>}{actionError&&<div className="notice notice-warning" role="alert"><Icon name="alert"/><p>{actionError}</p><button className="icon-button" aria-label="Скрыть сообщение" onClick={()=>setActionError(null)}><Icon name="close"/></button></div>}
 <AlertHeader items={headerItems} now={clock} onOpen={openIncident} onJournal={()=>navigate('events')} unread={unread} signalSequence={signalSequence} audioStatus={audioStatus}/>
 <div className="screen-content" hidden={Boolean(detailId)}>
 {page==='incidents'&&<IncidentDashboard snapshot={snapshot} now={clock} connected={connected} loading={loading} onOpen={openIncident} onAssign={setAssignId} teamContext={teamContext}/>}
 {page==='events'&&<EventsJournal events={events} now={clock} loading={loading} connected={connected} onOpen={openIncident}/>}
 {page==='teams'&&<TeamsDirectory items={items} now={clock} revision={snapshot?.revision??0} connected={connected} loading={loading} onTeam={selectTeam} onOpen={openIncident}/>}
 {page==='problems'&&<ProblemClusters clusters={clusters} snapshot={snapshot} now={clock} connected={connected} loading={loading} exclusions={massExclusions} exclusionsSaved={exclusionsSaved&&groupsSaved} onAdd={addMass} onExclude={excludeMass} onRestore={restoreMass} onOpen={openIncident} onAccept={data.accept}/>}
 {page==='analytics'&&<Analytics snapshot={snapshot} now={clock} connected={connected} loading={loading}/>}
 {page==='settings'&&<><PageHeading eyebrow="ПОДКЛЮЧЕНИЕ И ДАННЫЕ" title="Источник и настройки" text="Актуальность снимка и правила рабочего пространства"/><div className="settings-grid"><section className="surface settings-card"><h2><Icon name="layers"/>Источник инцидентов</h2><dl><div><dt>Подключение</dt><dd>{connected?'Активно':'Недоступно'}</dd></div><div><dt>Версия снимка</dt><dd>{snapshot?.revision??'—'}</dd></div><div><dt>Последнее изменение</dt><dd>{snapshot?dateTime(snapshot.updatedAt):'—'}</dd></div><div><dt>Записей в снимке</dt><dd>{items.length}</dd></div><div><dt>Последнее чтение источника</dt><dd>{dateTime(snapshot?.source.readAt)}</dd></div></dl>{DEMO&&<><p className="muted">Измените файл в VS Code. Сервер автоматически передаст изменения на страницу.</p><code className="file-path">{snapshot?.source.path??'data/incidents.json'}</code><button className="button secondary" onClick={()=>uploadRef.current?.click()} disabled={busy==='import'}><Icon name="plus" size={17}/>{busy==='import'?'Загружаем…':'Импортировать JSON'}</button><input type="file" accept=".json,application/json" hidden ref={uploadRef} onChange={e=>{if(e.target.files?.[0])void importFile(e.target.files[0]);}}/><p className="caption">Импорт заменяет тестовый снимок целиком. Дубли идентификаторов и неверный формат отклоняются.</p></>}</section><section className="surface settings-card"><h2><Icon name="circleCheck"/>Статусы без путаницы</h2><div className="status-explainer"><strong>Завершён</strong><p>Проблема устранена. Если она сохраняется или повторяется, инцидент можно вернуть в работу.</p></div><div className="status-explainer"><strong>Закрыт</strong><p>Вся работа с инцидентом закончена.</p></div><div className="status-explainer"><strong>Исследование</strong><p>Идёт разбор причин. Инцидент остаётся в поле внимания, включая назначение координаторам.</p></div><div className="status-explainer solution-note"><strong>Описание решения</strong><p>Текст может быть заполнен заранее или описывать прошлую попытку, которая не помогла. Само поле solution не подтверждает устранение.</p></div></section><section className="surface settings-card"><h2><Icon name="spark"/>Помощник координатора</h2><p>Собирает факты, объясняет срочность по явным правилам и находит команды из похожих завершённых записей.</p><div className="small-tag tone-purple">Анализ по правилам · LLM не подключена</div><p className="muted">Не меняет статус и не переназначает инциденты. При недостатке оснований сообщает об этом.</p></section><section className="surface settings-card"><h2><Icon name="monitor"/>Рабочие переходы</h2><p>Переход в ITSM доступен из карточки после настройки ссылки на стороне API.</p><p className="muted">Часовой пояс: Москва (UTC+3). Критический приоритет: 4. Обновления не сбрасывают выбранные фильтры.</p><button className="button secondary" onClick={()=>void refresh()}><Icon name="sort" size={17}/>Проверить подключение</button></section></div></>}
 </div>
 {detailId&&(selected&&snapshot?<Detail key={selected.sysId} item={selected} snapshot={snapshot} now={clock} onBack={closeIncident} backLabel={backLabels[page]} onAssign={()=>setAssignId(selected.sysId)}/>:<section className="surface incident-unavailable"><button className="button secondary detail-back" onClick={closeIncident}><Icon name="left" size={16}/>{backLabels[page]}</button><Empty title={snapshot?'Инцидент недоступен':'Загружаем инцидент'} icon="inbox">{snapshot?'Запись отсутствует в текущем снимке. Её изменения могут оставаться в журнале событий.':'Ожидаем актуальные данные сервера.'}</Empty></section>)}
 </main></div><nav className="bottom-nav" aria-label="Компактное меню">{pages.map(link=><a className={`nav-item ${page===link.id?'selected':''}`} key={link.id} href={'#'+link.id}><Icon name={link.icon}/><span>{link.label}</span></a>)}{!DEMO&&<button className="logout-mobile" aria-label="Выйти из аккаунта" onClick={()=>signOut()}><Icon name="logout" size={17}/></button>}</nav>
 {demoOpen&&<Dialog title="Проверка живых обновлений" onClose={()=>setDemoOpen(false)}><HeaderSimulator items={items} now={clock} preview={headerPreview} onAdd={item=>{setHeaderPreview(previous=>[...(previous??[]),item]);setDemoOpen(false);}} onRemove={id=>setHeaderPreview(previous=>(previous??[]).filter(item=>item.sysId!==id))} onClear={()=>setHeaderPreview([])} onLive={()=>setHeaderPreview(null)}/>{DEMO&&<><p className="muted">Каждый сценарий изменяет тестовый JSON через API. Список, группы и события обновляются на тех же данных.</p><div className="simulation-grid">{[['coordinator-wait','Ожидание у координатора','Без команды решения более 8 минут','clock'],['mass','Массовая проблема','Три связанных инцидента одного сервиса','layers'],['unassigned','Нет ответственной команды','Не распределён более 15 минут','people'],['critical','Критический инцидент','Приоритет 4 и дедлайн через 12 минут','alert'],['assign','Передать координаторам','Инцидент появится в соответствующей группе','people'],['deadline','Изменить дедлайн','Установить срок через 5 минут','clock'],['resolve','Устранить проблему','Статус «Завершён», возможен возврат','circleCheck'],['reopen','Вернуть в работу','Повторное открытие завершённого инцидента','pulse'],['research','Начать исследование','Исследование и назначение координаторам','search'],['close','Полностью закрыть','Вся работа с инцидентом окончена','check']].map(([action,title,description,icon])=><button key={action} className="simulation-choice" disabled={busy!==null} onClick={()=>void simulate(action)}><span className="event-icon tone-purple"><Icon name={icon}/></span><span><strong>{title}</strong><small>{description}</small></span></button>)}</div><button className="button secondary" disabled={busy!==null} onClick={()=>void simulate('reset')}>Восстановить исходные 44 записи</button><p className="caption">Сброс восстановит тестовый файл из seed.json. Прошлые события останутся в журнале.</p></>}</Dialog>}

 {assignment&&snapshot&&<AssignTeam key={assignment.sysId} item={assignment} snapshot={snapshot} onClose={()=>setAssignId(null)} onAccept={data.accept}/>}
 </div>;
}
function PageHeading({eyebrow,title,text,action}:{eyebrow:string;title:string;text:string;action?:React.ReactNode}) {return <header className="page-heading secondary-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p></div>{action}</header>;}
