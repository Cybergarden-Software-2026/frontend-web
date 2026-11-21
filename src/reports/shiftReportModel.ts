import type { ShiftStatistics } from '../domain/shiftStatistics.ts';
import { durationLabel } from '../domain/shiftStatistics.ts';
import { STATES,stateOf,timestamp } from '../domain/incidents.ts';
import { journalDescription,journalEventType } from '../domain/eventJournal.ts';
import type { PersonalStatistics } from '../domain/personalStatistics.ts';

export interface ReportContext { revision:number; connected:boolean; historyIncomplete:boolean; updatedAt:string; sourceStale?:boolean; personal?:PersonalStatistics; generalAvailable?:boolean; }
export type ReportValue=string|number|null;
export interface ReportSection { title:string; columns:{label:string;format?:'minutes'|'percent'|'decimal'}[]; rows:ReportValue[][]; }
export const reportDate=(ms:number)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'medium'}).format(ms)+' МСК';
const date=(value:unknown)=>{const ms=timestamp(value);return ms===null?'Не указана':reportDate(ms);};
const minutes=(value:number|null)=>value===null?null:value/60_000;
export function reportNotes(s:ShiftStatistics,context:ReportContext){return [
 'Источник: снимок инцидентов и доступный журнал изменений. Время московское (UTC+3). Начало периода включено, конец исключён.',
 `Версия снимка: ${context.revision}. Последнее изменение: ${date(context.updatedAt)}. Отчёт сформирован: ${reportDate(s.generatedAt)}.`,
 context.connected?'Соединение активно на момент расчёта.':'Нет соединения. Использованы последние загруженные данные, они могли устареть.',
 context.sourceStale?'Источник инцидентов временно не обновляется. Использован последний корректный снимок.':'Состояние источника: ошибки обновления не зафиксированы в доступном снимке.',
 context.historyIncomplete?'История загружена не полностью. Показатели событий и восстановления очереди предварительные.':'Загружена вся доступная история за период. Начальный импорт не содержит событий; изменения до начала ведения журнала восстановить нельзя.',
 'Отчёт оценивает процесс координирования в целом. Автор назначения в данных отсутствует. Логин исполнителя инцидента не является логином координатора, поэтому индивидуальная продуктивность не рассчитывается.',
 'Очередь координации — инциденты без команды или на команде координаторов в статусах «Назначен», «Выполняется», «Исследование». Количество на границах периода восстановлено по доступным изменениям.',
 'Поступление — переход в очередь координации; возврат — поступление из команды решения. Передача — переход из очереди к команде решения. Повторные операции по одному инциденту считаются отдельно.',
 `Поступлений из истории: ${s.coordinator.received-s.coordinator.inferredEntries}; дополнительно ${s.coordinator.inferredEntries} выведено по регистрации ещё не распределённых инцидентов. Начальные записи, уже назначенные командам до ведения журнала, не доказывают факт распределения в периоде.`,
 'Полное время координирования — от начала ожидания до обнаруженного назначения. Для координаторов используется дата назначения на них, иначе дата регистрации. Оно включает ожидание до начала периода; отдельная метрика ограничена выбранным периодом.',
 `Длительность известна для ${s.coordinationTimes.count} из ${s.coordination.length} передач. Медиана делит измерения пополам; P90 — время, в которое уложились 90% измеренных передач. KPI координаторов — передача строго меньше чем за 10 минут; ровно 10 минут уже не соответствует KPI. Предупреждение в хедере появляется после 8 минут ожидания у координаторов, чтобы осталось время на распределение. Это отдельные пороги, не SLA решения инцидента.`,
 'Временные метки событий показывают обнаружение изменения импортёром и могут отличаться от времени действия в ITSM. Исправления дат и пропуски истории ограничивают точность.',
 'Просроченные в этом отчёте — оставшиеся в очереди координации с истёкшим дедлайном решения. Устранение исполнителями и загрузка команд не используются как оценка эффективности координаторов.',
 'Заполненное решение и старая дата устранения у незавершённого инцидента не означают завершение. Приоритеты операций взяты на момент события, очередь по приоритетам — на конец периода. Пустые значения означают отсутствие данных.',
 ];}
export function shiftReportSections(s:ShiftStatistics,context:ReportContext):ReportSection[]{
 if(context.personal)return personalReportSections(s,context,context.personal);
 const c=(label:string,format?:'minutes'|'percent'|'decimal')=>({label,format});
 const q=s.coordinator;
 const incidentIds=new Map(q.incidents.map(i=>[i.sysId,i.id]));
 return [
  {title:'Итоги координации',columns:[c('Показатель'),c('Значение')],rows:[
   ['Начало периода',reportDate(s.start)],['Конец расчёта',reportDate(s.end)],['Очередь координации на начало',q.atStart],['Поступлений на распределение',q.received],['Уникальных поступивших инцидентов',q.uniqueReceived],['В том числе возвратов из команд решения',q.returned],['Передано командам решения',s.coordination.length],['Очередь координации на конец',q.atEnd],['Максимум очереди по доступной истории',q.peakQueue],['Ждут более 8 минут на конец',s.waitingOver8],['Просрочено без команды решения',q.overdue],['Критических без команды решения',q.critical],['Среднее координирование, ЧЧ:ММ:СС',durationLabel(s.coordinationTimes.average)],['Медиана координирования',durationLabel(s.coordinationTimes.median)],['P90 координирования',durationLabel(s.coordinationTimes.p90)],['Максимум координирования',durationLabel(s.coordinationTimes.max)],['Среднее ожидание в пределах периода',durationLabel(s.coordinationDuringShift.average)],['Среднее ожидание оставшихся',durationLabel(s.waitingTimes.average)],['KPI: передано меньше чем за 10 минут',q.kpiMet],['Передач с измеренной длительностью',s.coordinationTimes.count],['KPI: доля передач меньше 10 минут, %',q.kpiPercent],['Передач в час',s.coordinationPerHour],['Версия снимка',context.revision]]},
  {title:'Приоритеты',columns:[c('Приоритет'),c('Поступлений'),c('Передано командам'),c('Осталось распределить'),c('Среднее координирование, мин','minutes')],rows:q.priorities.map(p=>[p.label,p.received,p.assigned,p.waiting,minutes(p.average)])},
  {title:'Динамика координации',columns:[c('Начало интервала МСК'),c('Конец интервала МСК'),c('Поступлений'),c('Передано командам'),c('Очередь на конец интервала')],rows:s.hourly.map(h=>[reportDate(h.from),reportDate(h.to),h.received,h.assigned,h.waiting])},
  {title:'Поступления и возвраты',columns:[c('Инцидент'),c('Обнаружено МСК'),c('Тип поступления'),c('Приоритет исходный 1–4'),c('Источник')],rows:q.entries.map(e=>[incidentIds.get(e.sysId)??e.sysId,reportDate(e.at),e.returned?'Возврат из команды решения':'Поступление',e.priorityId,e.source==='event'?'История изменений':'Дата регистрации'])},
  {title:'Передачи командам',columns:[c('Инцидент'),c('Команда решения'),c('Начало ожидания МСК'),c('Назначено МСК'),c('Полное ожидание, мин','minutes'),c('Ожидание в периоде, мин','minutes')],rows:s.coordination.map(t=>[t.id,t.team,t.startedAt===null?'Неизвестно':reportDate(t.startedAt),reportDate(t.at),minutes(t.durationMs),minutes(t.duringPeriodMs)])},
  {title:'Передача смены',columns:[c('Инцидент'),c('Название'),c('Приоритет'),c('Статус на конец'),c('Команда на конец'),c('Регистрация МСК'),c('Дедлайн МСК'),c('Просрочен на конец')],rows:q.handover.map(i=>[i.id,i.header,i.priorityId===4?'P1':i.priorityId===3?'P2':i.priorityId===2?'P3':i.priorityId===1?'P4':'Неизвестен',STATES[stateOf(i)],i.assignedGroupName||'Без команды',date(i.submitDate),date(i.deadline),timestamp(i.deadline)!==null&&timestamp(i.deadline)!<=s.end?'Да':'Нет'])},
  {title:'События координации',columns:[c('Время МСК'),c('Инцидент'),c('Тип события'),c('Что изменилось')],rows:[...q.events].reverse().map(e=>[date(e.at),e.incidentId,journalEventType(e).label,journalDescription(e)])},
  {title:'Методика',columns:[c('Условия расчёта')],rows:reportNotes(s,context).map(note=>[note])},
 ];
}
function personalReportSections(s:ShiftStatistics,context:ReportContext,p:PersonalStatistics):ReportSection[]{
 const general=(value:number)=>context.generalAvailable===false?null:value;
 const demo=p.source==='demo';
 return [
  {title:demo?'Личная статистика':'Статистика смены',columns:[{label:'Показатель'},{label:'Значение'}],rows:[
   [demo?'Сотрудник':'Смена',p.coordinator.name],['Источник показателей',demo?'ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ — тестовый аккаунт':'Журнал назначений на сервере'],
   ['Начало периода',reportDate(p.start)],['Конец периода',reportDate(p.end)],['Распределено',p.transferred],['Среднее время координирования',durationLabel(p.averageMs)],['KPI: доля передач меньше 10 минут, %',p.kpiPercent],['KPI выполнен, передач',p.kpiMet],['Передач с измеренным временем',p.measured],['Критических распределено',p.critical],
  ]},
  {title:demo?'Мои распределения':'Распределения смены',columns:[{label:'Инцидент'},{label:'Название'},{label:'Команда решения'},{label:'Назначено МСК'},{label:'Время координирования, мин',format:'minutes'},{label:'KPI меньше 10 минут'}],rows:p.transfers.map(row=>[row.incidentId,row.title,row.team,reportDate(row.assignedAt),minutes(row.durationMs),row.kpiMet===null?'Нет данных':row.kpiMet?'Выполнен':'Не выполнен'])},
  {title:'Общая очередь',columns:[{label:'На конец выбранного периода'},{label:'Количество'}],rows:[['Ожидают распределения',general(s.coordinator.atEnd)],['Критических без команды',general(s.coordinator.critical)],['Ждут больше 8 минут',general(s.waitingOver8)]]},
  {title:'О данных',columns:[{label:'Источник и правила'}],rows:[
   [demo?'Личные показатели и распределения вымышлены для тестового аккаунта. Они не отражают работу реальных сотрудников.':'Показатели относятся ко всей смене координаторов.'],
   ['KPI выполнен при передаче строго меньше чем за 10 минут. Ровно 10:00 не соответствует KPI. Неизвестные длительности не входят в среднее и долю KPI.'],
   ['Период задан в московском времени UTC+3. Начало включено, конец исключён. Все распределения за период включены в отчёт.'],
   [context.generalAvailable===false?'Общая очередь не загружена; пустые значения не означают нулевую очередь.':`Общая очередь — по загруженному снимку версии ${context.revision} и доступной истории изменений. Последнее изменение: ${date(context.updatedAt)}.`],
   [context.historyIncomplete||!context.connected||context.sourceStale?'Данные общей очереди могут быть неполными или устаревшими.':'Общие данные получены из доступного снимка и истории; изменения до начала ведения истории восстановить нельзя.'],
   [`Сформирован: ${reportDate(s.generatedAt)}.`],
  ].map(row=>row as ReportValue[])},
 ];
}
