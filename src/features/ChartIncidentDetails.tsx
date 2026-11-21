import type { PersonalStatistics } from '../domain/personalStatistics';
import { durationLabel } from '../domain/shiftStatistics';
import { reassignmentDurationLabel } from '../domain/personalCharts';

const date=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'medium'});
const priority:Record<number,string>={4:'P1 · Критический',3:'P2 · Высокий',2:'P3 · Средний',1:'P4 · Низкий'};
export function ChartIncidentDetails({transfer,mode}:{
 transfer:PersonalStatistics['transfers'][number];
 mode:'summary'|'coordination'|'reassignment';
}){
 const interval=transfer.reassignmentMs;
 const reassignment=mode==='reassignment';
 return <article className="chart-incident-details">
  <div className="chart-incident-heading"><strong>{transfer.incidentId.replace(/^DEMO-/,"№ ")}</strong><span className={transfer.priorityId===4?'is-critical':''}>{priority[transfer.priorityId]??'Приоритет не указан'}</span></div>
  <h3>{transfer.title}</h3>
  <dl><div><dt>Команда решения</dt><dd>{transfer.team}</dd></div>
   {mode==='coordination'&&<div><dt>Начало ожидания</dt><dd>{transfer.waitingStartedAt!==null&&Number.isFinite(transfer.waitingStartedAt)?date.format(transfer.waitingStartedAt)+' МСК':'Неизвестно'}</dd></div>}
   {reassignment&&interval!=null&&<div><dt>Предыдущее назначение</dt><dd>{date.format(transfer.assignedAt-interval)} МСК</dd></div>}
   <div><dt>{reassignment?'Текущее назначение':'Передан команде'}</dt><dd>{date.format(transfer.assignedAt)} МСК</dd></div>
   {reassignment?<div><dt>Время между назначениями</dt><dd>{interval==null?'Нет данных':reassignmentDurationLabel(interval)}</dd></div>:<>
    <div><dt>Координирование</dt><dd>{durationLabel(transfer.durationMs)}</dd></div>
    <div><dt>KPI &lt; 10 минут</dt><dd><span className={`chart-incident-kpi ${transfer.kpiMet===true?'is-met':transfer.kpiMet===false?'is-missed':''}`}>{transfer.kpiMet===null?'Нет данных':transfer.kpiMet?'Выполнен':'Не выполнен'}</span></dd></div>
   </>}
  </dl>
 </article>;
}
