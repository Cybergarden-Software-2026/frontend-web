import { useEffect,useMemo,useState } from 'react';
import type { Snapshot } from '../domain/incidents';
import { buildShiftStatistics,durationLabel,moscowInput,parseMoscowInput } from '../domain/shiftStatistics';
import type { PersonalStatistics } from '../domain/personalStatistics';
import { api } from '../data/api';
import type { CoordinatorIdentity } from '../data/api';
import { useEventHistory } from '../data/useEventHistory';
import { Icon } from '../components/Icon';
import { downloadShiftReport } from '../reports/downloadShiftReport';
import { PersonalCharts } from './PersonalCharts';

const NO_EVENTS: NonNullable<Snapshot>['events']=[];
const MINUTE_MS=60_000;

const operationTime=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export function Analytics({snapshot,now,connected,loading,historyEpoch,coordinator}:{
 snapshot:Snapshot|null;now:number;connected:boolean;loading:boolean;historyEpoch:number;coordinator?:CoordinatorIdentity;
}){
 const coordinatorLogin=coordinator?.login;
 const isPersonal=coordinator!==undefined;
 const statisticsOwner=coordinatorLogin??'shift';
 const [initialStart]=useState(()=>moscowInput(now-12*3600_000));
 const [draft,setDraft]=useState<{start:string;end:string}|null>(null);
 const [fixedRange,setFixedRange]=useState<{start:string;end:string}|null>(null);
 const [validation,setValidation]=useState('');
 const [exporting,setExporting]=useState<'pdf'|'xlsx'|null>(null),[exportError,setExportError]=useState('');
 // The upper bound is exclusive. Include the current minute in the live
 // period, and keep any user-selected range at its exact bounds.
 const minute=Math.floor(now/MINUTE_MS);
 const range=fixedRange??{start:initialStart,end:moscowInput((minute+1)*MINUTE_MS)};
 const formRange=draft??range;
 const start=parseMoscowInput(range.start)!,end=parseMoscowInput(range.end)!;
 const liveEvents=snapshot?.events??NO_EVENTS;
 const history=useEventHistory({period:'all',connected,now,since:start,events:liveEvents,historyEpoch});
 const events=useMemo(()=>[...history.archive,...liveEvents],[history.archive,liveEvents]);
 const general=useMemo(()=>buildShiftStatistics(snapshot?.items??[],events,start,end,now),[snapshot?.items,events,start,end,minute]);
 const shiftScope=JSON.stringify([coordinatorLogin,historyEpoch,start,fixedRange?end:'live']);
 const [shiftResult,setShiftResult]=useState<{scope:string;value:PersonalStatistics}|null>(null);
 const [shiftError,setShiftError]=useState<string|null>(null);
 const [shiftLoading,setShiftLoading]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const shift=shiftResult?.scope===shiftScope?shiftResult.value:null;
 useEffect(()=>{
  if(!connected){setShiftLoading(false);return;}
  const controller=new AbortController();
  setShiftError(null);setShiftLoading(true);
  api.shiftStatistics(start,end,controller.signal).then(value=>{
   if(controller.signal.aborted)return;
   if(value.coordinator?.id!==statisticsOwner){
    setShiftResult(null);
    setShiftError('Сессия изменилась. Обновите страницу, чтобы загрузить статистику.');
    return;
   }
   setShiftResult({scope:shiftScope,value});
  }).catch(error=>{
   if(!controller.signal.aborted)setShiftError(error instanceof Error?error.message:'Сервер не вернул данные.');
  }).finally(()=>{
   if(!controller.signal.aborted)setShiftLoading(false);
  });
  return()=>controller.abort();
 },[start,end,shiftScope,connected,snapshot?.revision,attempt,statisticsOwner]);
 const pendingGeneral=history.loading||connected&&!history.settled&&!history.failed;
 const generalAvailable=Boolean(snapshot)&&!pendingGeneral;
 const dirty=draft!==null&&(draft.start!==range.start||draft.end!==range.end);
 const context={revision:snapshot?.revision??0,connected,historyIncomplete:history.failed||!history.settled||!connected,updatedAt:snapshot?.updatedAt??'',sourceStale:Boolean(snapshot?.source.error),personal:shift??undefined,personalAccount:isPersonal,generalAvailable};
 function apply(){
  const a=parseMoscowInput(formRange.start),b=parseMoscowInput(formRange.end);
  if(a===null||b===null||a>=b||a>=now){setValidation('Начало должно быть раньше конца и текущего времени.');return;}
  setValidation('');setFixedRange(formRange);setDraft(null);
 }
 async function download(format:'pdf'|'xlsx'){
  if(exporting||dirty||!shift||shiftLoading||shiftError||!connected)return;
  setExporting(format);setExportError('');
  try{await downloadShiftReport(format,{...general,generatedAt:now},context);}
  catch(error){setExportError(error instanceof Error?error.message:'Не удалось подготовить отчёт. Повторите скачивание.');}
  finally{setExporting(null);}
 }
 const cards=shift?[
  {label:'Распределено',value:shift.transferred,icon:'userPlus',hint:'Передано командам решения',tone:'purple'},
  {label:'Среднее время',value:durationLabel(shift.averageMs),icon:'clock',hint:'От начала ожидания до назначения',tone:'blue'},
  {label:'KPI: меньше 10 минут',value:shift.kpiPercent===null?'—':shift.kpiPercent.toFixed(1)+'%',icon:'check',hint:`${shift.kpiMet} из ${shift.measured} измеренных`,tone:'green'},
  {label:'Критических распределено',value:shift.critical,icon:'alert',hint:'Инциденты с приоритетом P1',tone:'danger'},
 ]:[];
 return <div className="shift-statistics">
  <section className="surface shift-controls">
   <div className="shift-heading"><div><h1>{isPersonal?'Личная статистика':'Статистика смены'}</h1>{coordinator&&<p>{coordinator.displayName}</p>}</div><div className="shift-export" aria-label="Скачать отчёт"><span>Скачать отчёт</span>{(['pdf','xlsx'] as const).map(format=><button key={format} className="button secondary" onClick={()=>void download(format)} disabled={Boolean(exporting)||dirty||!shift||shiftLoading||Boolean(shiftError)||!connected}><Icon name="download" size={16}/>{exporting===format?'Готовим…':format==='pdf'?'PDF':'Excel .xlsx'}</button>)}</div></div>
   <form className="shift-range" onSubmit={event=>{event.preventDefault();apply();}}><label>Начало периода<input type="datetime-local" value={formRange.start} required onChange={event=>setDraft({...formRange,start:event.target.value})}/></label><span className="shift-range-dash" aria-hidden="true">—</span><label>Конец периода<input type="datetime-local" value={formRange.end} required onChange={event=>setDraft({...formRange,end:event.target.value})}/></label><button className="button secondary" type="submit">Рассчитать</button></form>
   {validation&&<p className="shift-error" role="alert">{validation}</p>}{exportError&&<p className="shift-error" role="alert">{exportError}</p>}
   {dirty?<p className="shift-note">Нажмите «Рассчитать», чтобы применить новый период.</p>:!fixedRange&&<p className="shift-note">По текущую минуту · обновляется автоматически</p>}
  </section>
  {shiftError&&connected&&<p className="shift-error" role="alert">Не удалось обновить статистику. {shiftError} <button className="text-button" onClick={()=>setAttempt(value=>value+1)}>Повторить</button></p>}
  {!connected&&<p className="shift-note" role="status">{loading?'Загружаем статистику…':shift?'Нет соединения. Показана последняя полученная статистика.':'Статистика недоступна без соединения с сервером.'}</p>}
  {connected&&shiftLoading&&!shift&&<p className="shift-note" role="status">Загружаем статистику…</p>}
  {shift&&<section className="shift-personal" aria-label={isPersonal?'Личные показатели':'Показатели смены'}>
   <div className="shift-metrics">{cards.map(card=><article className="surface shift-metric" key={card.label}><div><span className={`metric-icon tone-${card.tone}`}><Icon name={card.icon} size={17}/></span><span>{card.label}</span></div><strong>{card.value}</strong><small>{card.hint}</small></article>)}</div>
  </section>}
  {shift&&<PersonalCharts stats={shift}/>}
  <div className="shift-personal-layout">
   {shift&&<section className="surface shift-panel" aria-labelledby="transfers-title"><div className="shift-section-heading"><h2 id="transfers-title">{isPersonal?'Мои распределения':'Распределения смены'}</h2><small>Последние {Math.min(5,shift.transferred)} из {shift.transferred}</small></div>
    {shift.transfers.length?<div className="shift-table-scroll"><table><thead><tr><th>Инцидент</th><th>Команда решения</th><th>Время</th><th>KPI &lt; 10 мин</th></tr></thead><tbody>{shift.transfers.slice(0,5).map(row=><tr key={row.id}><td><strong className="shift-demo-id">{row.incidentId}</strong><span className="shift-incident-title">{row.title}</span><time dateTime={new Date(row.assignedAt).toISOString()}>{operationTime.format(row.assignedAt)} МСК</time></td><td>{row.team}</td><td className="shift-duration">{durationLabel(row.durationMs)}</td><td><span className={`shift-kpi-result ${row.kpiMet===true?'is-met':row.kpiMet===false?'is-missed':'is-unknown'}`}>{row.kpiMet===null?'Нет данных':row.kpiMet?'Выполнен':'Не выполнен'}</span></td></tr>)}</tbody></table></div>:<div className="shift-empty"><Icon name="inbox" size={27}/><strong>Нет распределений за период</strong><p>Выберите другой период.</p></div>}
   </section>}
   <aside className="surface shift-panel shift-general" aria-labelledby="general-title"><h2 id="general-title">Общая очередь</h2><p>На конец выбранного периода</p><dl>{[['Ожидают распределения',general.coordinator.atEnd],['Критических без команды',general.coordinator.critical],['Ждут больше 8 минут',general.waitingOver8]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{generalAvailable?value:'—'}</dd></div>)}</dl>
    {pendingGeneral||loading&&!snapshot?<p className="shift-general-status" role="status"><span className="shift-spinner"/>Загружаем общие данные…</p>:!snapshot?<p className="shift-general-status">Общие данные пока не загружены.</p>:history.failed?<p className="shift-general-status">История неполная. <button className="text-button" disabled={!connected} onClick={history.retry}>Повторить</button></p>:!connected?<p className="shift-general-status">Последние данные могли устареть.</p>:<p className="shift-general-status">По снимку и доступной истории</p>}
   </aside>
  </div>
 </div>;
}
