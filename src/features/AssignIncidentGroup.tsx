import { useEffect,useRef,useState } from 'react';
import type { Snapshot } from '../domain/incidents';
import { canAssign } from '../domain/operations';
import type { GroupAssignmentResult,AssignmentReview } from '../data/assignIncidentGroup';
import { assignIncidentGroup } from '../data/assignIncidentGroup';
import { api } from '../data/api';
import { Dialog,Team } from '../components/ui';
import { Icon } from '../components/Icon';

export function AssignIncidentGroup({title,memberIds,snapshot,onAccept,onClose,initialTeam=''}:{title:string;memberIds:string[];snapshot:Snapshot;onAccept:(value:Snapshot)=>void;onClose:()=>void;initialTeam?:string}){
 const [reviewed,setReviewed]=useState<AssignmentReview[]>(()=>[...new Set(memberIds)].map(sysId=>({sysId,team:snapshot.items.find(i=>i.sysId===sysId)?.assignedGroupName??''})));
 const [teams,setTeams]=useState<string[]>([]),[loading,setLoading]=useState(true),[selected,setSelected]=useState(initialTeam),[search,setSearch]=useState('');
 const [running,setRunning]=useState(false),[results,setResults]=useState<GroupAssignmentResult[]>([]),[needsReview,setNeedsReview]=useState(false),[finished,setFinished]=useState(false),[error,setError]=useState(''),[refreshing,setRefreshing]=useState(false),[stopping,setStopping]=useState(false);
 const stop=useRef(false),alive=useRef(true),busy=useRef(false);
 useEffect(()=>{alive.current=true;api.teams().then(value=>{if(alive.current)setTeams(value.items.map(row=>row.name));}).catch(()=>{if(alive.current)setError('Не удалось загрузить команды. Закройте окно и повторите попытку.');}).finally(()=>{if(alive.current)setLoading(false);});return()=>{alive.current=false;stop.current=true;};},[]);
 const complete=new Set(results.filter(row=>['assigned','unchanged'].includes(row.status)).map(row=>row.sysId));
 const remaining=reviewed.filter(row=>!complete.has(row.sysId));
 function requestClose(){if(refreshing)return;if(busy.current){stop.current=true;setStopping(true);}else onClose();}
 async function save(){
  if(!selected||busy.current||needsReview)return;
  busy.current=true;
  stop.current=false;setStopping(false);setRunning(true);setError('');
  const previous=results.filter(row=>['assigned','unchanged'].includes(row.status));
  try{
   const outcome=await assignIncidentGroup({reviewed:remaining,team:selected,snapshot,onSnapshot:value=>{if(alive.current)onAccept(value);},onProgress:value=>{if(alive.current)setResults([...previous,...value]);},shouldStop:()=>stop.current});
   if(!alive.current)return;
   setResults([...previous,...outcome.results]);setNeedsReview(outcome.interrupted);setFinished(!outcome.interrupted);
   if(outcome.interrupted)setError(outcome.stopped?'Обработка остановлена. Уже выполненные назначения сохранены.':'Обработка остановлена после ошибки. Уже выполненные назначения сохранены. Обновите данные перед продолжением.');
  }catch(error){if(alive.current){setNeedsReview(true);setError(error instanceof Error?error.message:'Не удалось завершить групповое назначение. Обновите данные и проверьте результаты.');}}
  finally{busy.current=false;if(alive.current){setRunning(false);setStopping(false);}}
 }
 async function refresh(){
  setRefreshing(true);setError('');
  try{
   const current=await api.snapshot();if(!alive.current)return;onAccept(current);
   const pending=reviewed.filter(row=>!complete.has(row.sysId));
   setReviewed([...reviewed.filter(row=>complete.has(row.sysId)),...pending.map(row=>({sysId:row.sysId,team:current.items.find(i=>i.sysId===row.sysId)?.assignedGroupName??''}))]);
   setResults(results.filter(row=>['assigned','unchanged'].includes(row.status)));setNeedsReview(false);
  }catch(error){if(alive.current)setError(error instanceof Error?error.message:'Не удалось обновить данные.');}
  finally{if(alive.current)setRefreshing(false);}
 }
 const footer=<footer className="assignment-footer"><button className="button secondary" disabled={stopping||refreshing} onClick={requestClose}>{running?(stopping?'Останавливаем…':'Остановить'):'Отмена'}</button>{finished?<button className="button primary" onClick={onClose}>Готово</button>:needsReview?<button className="button primary" disabled={refreshing} onClick={()=>void refresh()}>{refreshing?'Обновляем…':'Обновить и проверить'}</button>:<button className="button primary" disabled={!selected||loading||running||refreshing||!remaining.length} onClick={()=>void save()}>{running?'Назначаем…':results.length?'Продолжить оставшиеся':'Назначить группе'}</button>}</footer>;
 const options=teams.filter(name=>name.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru'))).sort((a,b)=>a.localeCompare(b,'ru'));
 return <Dialog title="Назначить команду группе" className="assignment-dialog mass-assignment-dialog" footer={footer} onClose={requestClose}>
  <div className="assignment-intro"><h3>{title}</h3><p>{reviewed.length} инцидентов в проверенном составе группы. Исключённые и новые задачи в это назначение не попадут.</p><p className="mass-batch-warning">Указанная команда заменит текущие команды у выбранных инцидентов.</p></div>
  <details className="mass-batch-members"><summary>Проверить состав · {reviewed.length}</summary><ul>{reviewed.map(row=>{const item=snapshot.items.find(i=>i.sysId===row.sysId);return <li key={row.sysId}><strong>{item?.id??row.sysId}</strong><span>{item?.header??'Запись больше не доступна'}</span><small>{item&&!canAssign(item)?'Уже завершён или закрыт':item?.assignedGroupName||'Команда не назначена'}</small></li>;})}</ul></details>
  {!complete.size&&!finished&&!needsReview&&!running&&<label className="search-field assignment-search"><Icon name="search" size={17}/><input aria-label="Найти команду для всей группы" placeholder="Найти команду" value={search} onChange={event=>setSearch(event.target.value)}/></label>}
  {loading?<p className="loading-text">Загружаем команды…</p>:!complete.size&&!running&&!finished&&!needsReview?<div className="assignment-options" role="radiogroup" aria-label="Команда для всей группы">{options.map(name=><label className={`assignment-option ${selected===name?'selected':''}`} key={name}><input type="radio" name="group-assignment" checked={selected===name} onChange={()=>setSelected(name)}/><span><Team name={name}/></span></label>)}{!options.length&&<p className="assignment-note">Команды не найдены.</p>}</div>:<div className="mass-batch-progress" aria-live="polite"><p>{selected} · обработано {results.length} из {reviewed.length}</p><progress max={Math.max(1,reviewed.length)} value={results.length}/><ul>{results.map(row=><li key={row.sysId} className={`mass-result-${row.status}`}><strong>{row.incidentId}</strong><span>{row.message}</span></li>)}</ul>{finished&&<p>Назначено: {results.filter(row=>row.status==='assigned').length}; уже в этой команде: {results.filter(row=>row.status==='unchanged').length}; пропущено: {results.filter(row=>row.status==='skipped').length}.</p>}</div>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  {needsReview&&<p className="assignment-note">После обновления проверьте состав и команды, затем подтвердите продолжение. Завершённые и удалённые инциденты будут пропущены.</p>}
 </Dialog>;
}
