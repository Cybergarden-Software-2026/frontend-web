import { useEffect,useState } from 'react';
import type { Incident,Snapshot,Analysis } from '../domain/incidents';
import { api } from '../data/api';
import { Dialog,Team } from '../components/ui';
import { Icon } from '../components/Icon';
export function AssignTeam({item,snapshot,onClose,onAccept}:{item:Incident;snapshot:Snapshot;onClose:()=>void;onAccept:(s:Snapshot)=>void}) {
 const [teams,setTeams]=useState<string[]>([]),[analysis,setAnalysis]=useState<Analysis|null>(null),[query,setQuery]=useState('');
 const [selected,setSelected]=useState(''),[chosen,setChosen]=useState(false),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null);
 useEffect(()=>{let alive=true;setLoading(true);setAnalysis(null);setError(null);
  Promise.allSettled([api.teams(),api.analysis(item.sysId)]).then(results=>{
   if(!alive)return;
   const names=results[0].status==='fulfilled'?results[0].value.items.map(t=>t.name):[...new Set(snapshot.items.map(i=>i.assignedGroupName).filter(Boolean))].sort();
   const result=results[1].status==='fulfilled'&&results[1].value.revision===snapshot.revision?results[1].value:null;
   setTeams(names);setAnalysis(result);setSelected('');setChosen(false);setLoading(false);
  });return()=>{alive=false;};
 },[item.sysId,snapshot.revision]);
 const candidate=analysis?.candidates.find(c=>teams.includes(c.team)&&c.evidenceIds.length>0);
 const value=chosen?selected:(candidate?.team??'');
 const ordered=[...teams].sort((a,b)=>Number(b===candidate?.team)-Number(a===candidate?.team)||a.localeCompare(b,'ru'));
 async function save(){if(!value)return;setSaving(true);setError(null);try{onAccept(await api.assign(item.sysId,value,snapshot.revision));onClose();}catch(e){setError(e instanceof Error?e.message:'Не удалось назначить команду');}finally{setSaving(false);}}
 return <Dialog title={`Назначить команду · ${item.id}`} onClose={()=>{if(!saving)onClose();}}><div className="assignment-intro"><h3>{item.header}</h3><p>Выберите команду, которая продолжит работу с инцидентом.</p></div>
 <label className="search-field assignment-search"><Icon name="search" size={17}/><input aria-label="Найти команду для назначения" placeholder="Найти команду" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 {loading?<p className="loading-text">Загружаем команды и проверяем похожие случаи…</p>:<>
 {!candidate&&<p className="assignment-note">Рекомендации нет: недостаточно подтверждённых похожих случаев. Выберите команду самостоятельно.</p>}
 <div className="assignment-options" role="radiogroup" aria-label="Команда для назначения">{ordered.filter(name=>name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))).map(name=><label className={`assignment-option ${value===name?'selected':''}`} key={name}><input type="radio" name="assignment" checked={value===name} onChange={()=>{setSelected(name);setChosen(true);}}/><span><Team name={name}/>{name===candidate?.team&&<><span className="recommendation-label"><Icon name="spark" size={14}/>Рекомендация · {analysis?.provider==='llm'?'ИИ':'по правилам'}</span><small>{candidate.reason}</small><small>Похожие случаи: {candidate.evidenceIds.join(', ')}</small></>}</span></label>)}{!ordered.some(name=>name.toLowerCase().includes(query.toLowerCase()))&&<p className="assignment-note">Команды не найдены.</p>}</div></>}
 {error&&<p className="form-error" role="alert">{error}</p>}<footer className="assignment-footer"><button className="button secondary" onClick={onClose} disabled={saving}>Отмена</button><button className="button primary" onClick={()=>void save()} disabled={!value||loading||saving||value===item.assignedGroupName}>{saving?'Назначаем…':'Назначить команду'}</button></footer>
 </Dialog>;
}
