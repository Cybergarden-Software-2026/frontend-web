import { useEffect,useMemo,useState } from 'react';
import { Icon } from '../components/Icon';
import { FilterSelect } from '../components/FilterSelect';
import { Dialog,Empty } from '../components/ui';
import type { Incident,Snapshot } from '../domain/incidents';
import { requiresAttention } from '../domain/incidents';
import type { ProblemCluster } from '../domain/operations';
import { canAssign } from '../domain/operations';
import { massGroupRouting } from '../domain/massProblems';
import type { useMassClusters } from '../data/useMassClusters';
import { useMassTeamRecommendation } from '../data/useMassTeamRecommendation';
import { api } from '../data/api';
import { AssignTeam } from './AssignTeam';
import { AssignIncidentGroup, useGroupAssignment } from './AssignIncidentGroup';

interface Props {
 workspace: ReturnType<typeof useMassClusters>;
 snapshot: Snapshot | null;
 connected: boolean;
 onOpen: (id: string) => void;
 onAccept: (value: Snapshot) => void;
}
export function ProblemClusters({ workspace, snapshot, connected, onOpen, onAccept }: Props) {
 const { view, loading, loadError, editError, editing, edit, retry } = workspace;
 const clusters = view?.items ?? [];
 const removed = view?.exclusions ?? [];
 const items = snapshot?.items ?? [];
 const byId = useMemo(() => new Map(items.map(item => [item.sysId, item])), [items]);
 const [selection, setSelection] = useState<{ id: string; ids: string[] } | null>(null);
 const [individual, setIndividual] = useState<{ sysId: string; groupId: string } | null>(null);
 const assignment = useGroupAssignment(snapshot, onAccept);
 const [adding, setAdding] = useState<ProblemCluster | null>(null);
 const [showRemoved, setShowRemoved] = useState(false);
 const [notice, setNotice] = useState<{ sysId: string; text: string } | null>(null);
 const active = clusters.find(group => group.id === selection?.id)
  ?? clusters.find(group => group.sysIds.some(id => selection?.ids.includes(id))) ?? clusters[0];
 const selected = individual ? byId.get(individual.sysId) : null;
 const writable = connected && !editing && view !== null;
 const empty = !connected ? 'Нет соединения'
  : loadError ? 'Группы недоступны'
  : loading || !view ? 'Загружаем группы…' : 'Связанные инциденты пока не обнаружены.';

 async function exclude(item: Incident, groupId: string, revision?: number, errorPrefix?: string) {
  const updated = await edit({ action: 'exclude', groupId, sysId: item.sysId }, revision, errorPrefix);
  if (updated) setNotice({ sysId: item.sysId, text: item.id + ' исключён из группы. Он остаётся в общей очереди.' });
 }
 async function restore(sysId: string) {
  const updated = await edit({ action: 'restore', sysId });
  if (updated) setNotice(previous => previous?.sysId === sysId ? null : previous);
 }
 async function add(group: ProblemCluster, records: Incident[]) {
  const sysIds = records.map(item => item.sysId);
  const updated = await edit({ action: 'add', groupId: group.id, sysIds });
  if (!updated) return;
  const newGroup = updated.items.find(candidate => sysIds.every(id => candidate.sysIds.includes(id)));
  if (newGroup) setSelection({ id: newGroup.id, ids: newGroup.sysIds });
  setAdding(null);
 }

 return <section className="mass-page" aria-label="Массовые сбои">
  {loadError && <p className="mass-storage-error" role="status">Не удалось загрузить группы с сервера. <button className="text-button" disabled={!connected || loading} onClick={retry}>Повторить</button></p>}
  {editError && <p className="mass-storage-error" role="alert">{editError}</p>}
  {notice && <div className="mass-action-notice" role="status"><span>{notice.text}</span><button className="text-button" disabled={!writable} onClick={() => void restore(notice.sysId)}>Вернуть в подбор</button><button className="icon-button" aria-label="Скрыть сообщение" onClick={() => setNotice(null)}><Icon name="close" size={16}/></button></div>}
  <div className="mass-workspace">
   <aside className="surface mass-groups-panel" aria-labelledby="mass-title">
    <h1 id="mass-title">Группы инцидентов</h1>
    {clusters.length > 0 ? <ul className="mass-groups-list" role="list">
     {clusters.map(group => {
      const members = group.sysIds.flatMap(id => { const item = byId.get(id); return item ? [item] : []; });
      const routing = massGroupRouting(members);
      const descriptionId = `mass-group-summary-${encodeURIComponent(group.id)}`;
      const selectedGroup = group.id === active?.id;
      return <li key={group.id}>
       <button type="button" className={selectedGroup ? 'mass-group-choice mass-choice-selected' : 'mass-group-choice'} aria-label={group.title} aria-describedby={descriptionId} aria-pressed={selectedGroup} onClick={() => setSelection({ id: group.id, ids: group.sysIds })}>
        <strong>{group.title}</strong><span id={descriptionId}>{group.sysIds.length} в группе · {routing.label}</span>
       </button>
      </li>;
     })}
    </ul> : <p className="mass-list-empty" role="status">{empty}</p>}
    {removed.length > 0 && <button className="mass-removed-toggle" onClick={() => setShowRemoved(true)}>Исключённые из подбора · {removed.length}</button>}
   </aside>
   {active ? <MassGroupDetails key={active.id} group={active} items={items} connected={writable} revision={view?.revision} assignmentReady={snapshot !== null && snapshot.revision === view?.revision} onOpen={onOpen} onExclude={item => void exclude(item, active.id)} onSeparate={item => setIndividual({ sysId: item.sysId, groupId: active.id })} onAdd={() => setAdding(active)} onAssign={(team, ids) => assignment.start(active.title, ids, team)}/>
    : <section className="surface mass-detail-panel mass-no-selection"><Empty icon="layers" title={empty}>{view && !loadError ? 'Связанные инциденты появятся здесь автоматически.' : ''}</Empty></section>}
  </div>
  {showRemoved && <Dialog title="Исключённые из подбора" onClose={() => setShowRemoved(false)}>
   <p className="mass-local-note">Инциденты остаются в общей очереди.</p>
   <div className="mass-removed-list">{removed.map(row => <div key={row.sysId}><span><strong>{row.incidentId}</strong>{row.header}</span><button className="button secondary" disabled={!writable} onClick={() => void restore(row.sysId)}>Вернуть</button></div>)}{!removed.length && <p>Исключённых инцидентов нет.</p>}</div>
  </Dialog>}
  {adding && <AddMassIncidents group={adding} groups={clusters} items={items} editable={writable} onClose={() => setAdding(null)} onAdd={records => void add(adding, records)}/>}
  {selected && individual && snapshot && <AssignTeam item={selected} snapshot={snapshot} note="Инцидент получит отдельное назначение и будет исключён из группы. Он останется в общей очереди." onClose={() => setIndividual(null)} onAccept={updated => {
   onAccept(updated);
   const item = updated.items.find(row => row.sysId === individual.sysId);
   if (item) void exclude(item, individual.groupId, updated.revision, 'Команда назначена, но исключение из группы не выполнено. ');
  }}/>}
  {snapshot && <AssignIncidentGroup controls={assignment} snapshot={snapshot}/>}
 </section>;
}

function MassGroupDetails({group,items,connected,revision,assignmentReady,onOpen,onExclude,onSeparate,onAdd,onAssign}:{group:ProblemCluster;items:Incident[];connected:boolean;revision:number|undefined;assignmentReady:boolean;onOpen:(id:string)=>void;onExclude:(item:Incident)=>void;onSeparate:(item:Incident)=>void;onAdd:()=>void;onAssign:(team:string,ids:string[])=>void}){
 const members=group.sysIds.flatMap(id=>{const item=items.find(row=>row.sysId===id);return item?[item]:[];}),routing=massGroupRouting(members);
 const [teams,setTeams]=useState<string[]>([]),[team,setTeam]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const [pickerOpen,setPickerOpen]=useState(false);
 useEffect(()=>{let alive=true;setLoading(true);setError(false);api.teams().then(result=>{if(alive)setTeams([...new Set(result.items.map(row=>row.name))].sort((a,b)=>a.localeCompare(b,'ru')));}).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[retry]);
 const active=members.filter(requiresAttention);
 const activeIds=active.map(item=>item.sysId);
 const recommendationEnabled=pickerOpen&&connected&&assignmentReady&&!loading&&!error&&teams.length>0&&activeIds.length>0;
 const {loading:recommendationLoading,recommendation}=useMassTeamRecommendation(activeIds,teams,revision,recommendationEnabled);
 const recommended=recommendation&&teams.includes(recommendation.team)?recommendation:null;
 const options=[
  ...(recommended?[{id:recommended.team,label:recommended.team,annotation:{title:'Рекомендация ИИ',detail:`${recommended.support} из ${recommended.total} ${recommended.total===1?'инцидента':'инцидентов'}`}}]:[]),
  {id:'',label:loading?'Загружаем команды…':error?'Не удалось загрузить команды':'Выберите команду'},
  ...teams.filter(name=>name!==recommended?.team).map(name=>({id:name,label:name})),
 ];
 const menuNotice=recommendationEnabled&&!recommended
  ? recommendationLoading?'Ищем общую рекомендацию ИИ…':'Нет общей рекомендации ИИ'
  : undefined;
 return <section className="surface mass-detail-panel" aria-labelledby="mass-group-title"><header className="mass-detail-heading"><span className="mass-detail-icon"><Icon name="layers" size={17}/></span><div><h2 id="mass-group-title">{group.title}</h2><p>{members.length} в группе · {active.length} активных</p></div></header><span className={`mass-routing mass-routing-${routing.tone}`}>{routing.label}</span>
  <section className="mass-composition" aria-labelledby="mass-composition-title"><h3 id="mass-composition-title">Состав группы</h3><ul>{members.map(item=><li key={item.sysId}><a href={`#incident/${encodeURIComponent(item.sysId)}?from=problems`} className="mass-member-link" onClick={event=>{event.preventDefault();onOpen(item.sysId);}}><strong>{item.id}</strong><b>{item.header}</b><span>{item.shortDescription||item.description||'Описание не указано'}</span></a><div className="mass-member-actions"><button className="mass-member-separate" title="Назначить отдельно и исключить из группы" aria-label={`Назначить отдельно ${item.id}`} disabled={!connected||!canAssign(item)} onClick={()=>onSeparate(item)}><Icon name="userPlus" size={15}/></button><span className={`mass-member-priority mass-priority-${item.priorityId}`}>P{5-item.priorityId}</span><button className="mass-member-remove" title="Убрать из группы" aria-label={`Исключить ${item.id} из группы`} disabled={!connected} onClick={()=>onExclude(item)}><Icon name="close" size={14}/></button></div></li>)}</ul><button className="mass-add-incidents" disabled={!connected} onClick={onAdd}><Icon name="plus" size={14}/>Добавить инциденты</button></section>
  <section className="mass-route-section" aria-labelledby="mass-route-title">
   <h3 id="mass-route-title">Направить одной команде</h3>
   <p>{connected&&!assignmentReady?'Обновляем состав группы…':'Выбранная команда заменит текущие назначения у всех активных инцидентов группы.'}</p>
   <div className="mass-route-controls">
    <div className="mass-team-field"><span id="mass-team-label">Группа назначения</span><FilterSelect label="Группа назначения" searchLabel="Найти команду" hideLabel value={team} onChange={setTeam} options={options} onOpenChange={setPickerOpen} menuNotice={menuNotice}/></div>
    <button className="mass-route-button" disabled={!connected||!assignmentReady||!team||loading||error||!active.length} onClick={()=>onAssign(team,activeIds)}><Icon name="userPlus" size={16}/>Назначить группе</button>
   </div>
   {error&&<p className="mass-teams-error">Не удалось загрузить справочник. <button className="text-button" onClick={()=>setRetry(value=>value+1)}>Повторить</button></p>}
  </section>
 </section>;
}
function AddMassIncidents({group,groups,items,editable,onClose,onAdd}:{group:ProblemCluster;groups:ProblemCluster[];items:Incident[];editable:boolean;onClose:()=>void;onAdd:(items:Incident[])=>void}){
 const [query,setQuery]=useState(''),[selected,setSelected]=useState<Set<string>>(()=>new Set()),[limit,setLimit]=useState(50);
 const grouped=new Set(groups.flatMap(row=>row.sysIds)),available=items.filter(item=>requiresAttention(item)&&!grouped.has(item.sysId)),text=query.trim().toLocaleLowerCase('ru');
 const filtered=available.filter(item=>[item.id,item.header,item.service].join(' ').toLocaleLowerCase('ru').includes(text));
 const chosen=available.filter(item=>selected.has(item.sysId));
 const footer=<footer className="assignment-footer"><button className="button secondary" onClick={onClose}>Отмена</button><button className="button primary" disabled={!editable||!chosen.length} onClick={()=>onAdd(chosen)}>Добавить · {chosen.length}</button></footer>;
 return <Dialog title="Добавить инциденты в группу" className="assignment-dialog mass-picker-dialog" footer={footer} onClose={onClose}><div className="assignment-intro"><h3>{group.title}</h3><p>Выберите активные инциденты, которые ещё не входят в другие группы.</p></div><label className="search-field assignment-search"><Icon name="search" size={17}/><input placeholder="Номер, название или сервис" aria-label="Найти инцидент для группы" value={query} onChange={event=>{setQuery(event.target.value);setLimit(50);}}/></label><div className="mass-picker-options">{filtered.slice(0,limit).map(item=><label key={item.sysId}><input type="checkbox" checked={selected.has(item.sysId)} onChange={()=>setSelected(previous=>{const next=new Set(previous);if(next.has(item.sysId))next.delete(item.sysId);else next.add(item.sysId);return next;})}/><span><strong>{item.id}</strong><b>{item.header}</b><small>{item.service||'Сервис не указан'}</small></span></label>)}{!filtered.length&&<Empty icon="search" title="Нет доступных инцидентов">{text?'Измените поисковый запрос.':'Все активные инциденты уже включены в группы.'}</Empty>}{filtered.length>limit&&<button className="button secondary" onClick={()=>setLimit(value=>value+50)}>Показать ещё · {filtered.length-limit}</button>}</div></Dialog>;
}
