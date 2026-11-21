import type { PersonalStatistics } from '../domain/personalStatistics';
import { durationLabel } from '../domain/shiftStatistics';

const date=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'medium'});
const priority:Record<number,string>={4:'P1 · Критический',3:'P2 · Высокий',2:'P3 · Средний',1:'P4 · Низкий'};
export function ChartIncidentDetails({transfer,includeWaitStart=false}:{transfer:PersonalStatistics['transfers'][number];includeWaitStart?:boolean}){
 return <article className="chart-incident-details">
  <div className="chart-incident-heading"><strong>{transfer.incidentId.replace(/^DEMO-/,"№ ")}</strong><span className={transfer.priorityId===4?'is-critical':''}>{priority[transfer.priorityId]??'Приоритет не указан'}</span></div>
  <h3>{transfer.title}</h3>
  <dl><div><dt>Команда решения</dt><dd>{transfer.team}</dd></div>
   {includeWaitStart&&<div><dt>Начало ожидания</dt><dd>{transfer.waitingStartedAt!==null&&Number.isFinite(transfer.waitingStartedAt)?date.format(transfer.waitingStartedAt)+' МСК':'Неизвестно'}</dd></div>}
   <div><dt>Передан команде</dt><dd>{date.format(transfer.assignedAt)} МСК</dd></div>
   <div><dt>Координирование</dt><dd>{durationLabel(transfer.durationMs)}</dd></div>
   <div><dt>KPI &lt; 10 минут</dt><dd><span className={`chart-incident-kpi ${transfer.kpiMet===true?'is-met':transfer.kpiMet===false?'is-missed':''}`}>{transfer.kpiMet===null?'Нет данных':transfer.kpiMet?'Выполнен':'Не выполнен'}</span></dd></div>
  </dl>
 </article>;
}
