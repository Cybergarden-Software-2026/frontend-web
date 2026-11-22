import { useEffect, useState } from 'react';
import type { Analysis, ChangeEvent, Incident, Snapshot } from '../domain/incidents';
import { EVENT_LABELS, describeEvent } from '../domain/incidents';
import { canAssign } from '../domain/operations';
import { Status, Dialog, Empty, dateTime } from '../components/ui';
import { Icon } from '../components/Icon';
import { ApiError, api } from '../data/api';
import { watchIncidentBrief } from '../data/incidentBriefAnalysis';
import { detailBrief, detailDate, detailSla } from './detailPresentation';


export function IncidentDetailPage({ incidentKey, snapshot, online, now, onBack, backLabel, onAssign }: {
 incidentKey: string;
 snapshot: Snapshot | null;
 online: boolean;
 now: number;
 onBack: () => void;
 backLabel: string;
 onAssign: (id: string) => void;
}) {
 const revision = snapshot?.revision ?? 0;
 const cached = snapshot?.items.find(item => item.sysId === incidentKey || item.id === incidentKey);
 const [response, setResponse] = useState<Awaited<ReturnType<typeof api.incident>> | null>(null);
 const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
 const [attempt, setAttempt] = useState(0);
 useEffect(() => {
  if (!online) return;
  const controller = new AbortController();
  setStatus('loading');
  api.incident(incidentKey, controller.signal).then(result => {
   if (controller.signal.aborted) return;
   setResponse(result);
   setStatus('ready');
  }).catch(error => {
   if (controller.signal.aborted) return;
   setStatus(error instanceof ApiError && error.status === 404 ? 'missing' : 'error');
  });
  return () => controller.abort();
 }, [incidentKey, online, revision, attempt]);

 const item = status === 'missing' ? undefined
  : response && (response.revision >= revision || !cached) ? response.incident : cached;
 if (!item) {
  return <section className="surface incident-unavailable">
   <button className="button secondary detail-back" onClick={onBack}><Icon name="left" size={16}/>{backLabel}</button>
   {!online ? <Empty title="Нет соединения" icon="inbox">Карточка ещё не сохранена для просмотра без сети.</Empty>
    : status === 'loading' ? <Empty title="Загружаем инцидент" icon="inbox">Ожидаем ответ сервера.</Empty>
    : status === 'missing' ? <Empty title="Инцидент недоступен" icon="inbox">Запись отсутствует в реестре.</Empty>
    : <Empty title="Не удалось загрузить инцидент" icon="inbox"><button className="text-button" onClick={() => setAttempt(value => value + 1)}>Повторить</button></Empty>}
  </section>;
 }
 const assign = online && cached && response?.isPresent !== false ? () => onAssign(item.sysId) : undefined;
 const present = response && response.revision >= revision ? response.isPresent : Boolean(cached);
 return <>
  {online && status === 'error' && <p className="detail-inline-error" role="status">Не удалось обновить карточку. Показаны последние данные. <button className="text-button" onClick={() => setAttempt(value => value + 1)}>Повторить</button></p>}
  <Detail item={item} snapshot={snapshot} revision={Math.max(revision, response?.revision ?? 0)} present={present} online={online} now={now} onBack={onBack} backLabel={backLabel} onAssign={assign}/>
 </>;
}

const HISTORY_PAGE_SIZE = 3;

function IncidentHistory({ item, snapshot, revision, online, onLatest }: {
 item: Incident;
 snapshot: Snapshot | null;
 revision: number;
 online: boolean;
 onLatest: (events: ChangeEvent[]) => void;
}) {
 const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
 const [index, setIndex] = useState(0);
 const [attempt, setAttempt] = useState(0);
 const [result, setResult] = useState<{
  cursor: string | undefined;
  page: Awaited<ReturnType<typeof api.incidentEvents>>;
 } | null>(null);
 const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
 const cached = snapshot?.events.filter(event => event.sysId === item.sysId) ?? [];
 const page = online ? Math.min(index, cursors.length - 1) : Math.min(index, Math.max(0, Math.ceil(cached.length / HISTORY_PAGE_SIZE) - 1));
 const cursor = cursors[page];
 const headRevision = page === 0 ? revision : null;

 useEffect(() => {
  if (!online) return;
  const controller = new AbortController();
  setStatus('loading');
  api.incidentEvents(item.sysId, cursor, controller.signal).then(value => {
   if (controller.signal.aborted) return;
   if (cursor === undefined) onLatest(value.items);
   setResult({ cursor, page: value });
   setStatus('ready');
  }).catch(() => {
   if (!controller.signal.aborted) setStatus('error');
  });
  return () => controller.abort();
 }, [online, item.sysId, cursor, headRevision, attempt, onLatest]);

 const server = result?.cursor === cursor ? result?.page : undefined;
 const fallback = !online || (status === 'error' && !server && page === 0);
 const records = fallback
  ? cached.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE)
  : server?.items ?? [];
 const nextCursor = fallback ? undefined : server?.nextCursor;
 const hasNext = fallback ? cached.length > (page + 1) * HISTORY_PAGE_SIZE : Boolean(nextCursor);
 const pending = online && status === 'loading';
 function next() {
  if (nextCursor) setCursors([...cursors.slice(0, page + 1), nextCursor]);
  setIndex(page + 1);
 }
 return <section className="surface detail-card incident-history" aria-labelledby="history-title">
  <div className="detail-history-heading">
   <h2 id="history-title">История</h2>
   {(records.length > 0 || page > 0) && <div className="detail-history-pagination">
    <div className="detail-history-position"><span>Страница {page + 1}</span></div>
    <div className="detail-history-arrows">
     <button className="icon-button" aria-label="Предыдущие события инцидента" disabled={pending || page === 0} onClick={() => setIndex(page - 1)}><Icon name="left" size={17}/></button>
     <button className="icon-button" aria-label="Следующие события инцидента" disabled={pending || !hasNext} onClick={next}><Icon name="right" size={17}/></button>
    </div>
   </div>}
  </div>
  {status === 'error' && online && <p className="detail-inline-error" role="status">Не удалось загрузить историю. <button className="text-button" onClick={() => setAttempt(value => value + 1)}>Повторить</button></p>}
  {!online && <p className="detail-muted">Показаны сохранённые события.</p>}
  {records.length > 0 ? <ol>{records.map(event => <li key={event.eventId}>
   <div className="detail-history-event"><strong>{event.types.map(type => EVENT_LABELS[type] || 'Изменение').join(' · ')}</strong><time dateTime={event.at}>{dateTime(event.at)}</time></div>
   <p>{describeEvent(event)}</p>
  </li>)}</ol> : pending ? <p className="detail-muted" role="status">Загружаем историю…</p>
   : status !== 'error' && <DetailEmpty icon="clock" title="История пока пуста" text="Новые изменения инцидента появятся здесь автоматически."/>}
 </section>;
}


function Detail({ item, snapshot, revision, present, online, now, onBack, backLabel, onAssign }: {
 item: Incident; snapshot: Snapshot | null; revision: number; present: boolean; online: boolean;
 now: number; onBack: () => void; backLabel: string; onAssign?: () => void;
}) {
 const [aiOpen, setAiOpen] = useState(false);
 const [analysis, setAnalysis] = useState<Analysis | null>(null);
 const [latestEvents, setLatestEvents] = useState<ChangeEvent[]>([]);
 const [copyError, setCopyError] = useState(false);
 const [copied, setCopied] = useState(false);
 useEffect(() => {
  if (!aiOpen || !online || !present) return;
  setAnalysis(null);
  return watchIncidentBrief(item.sysId, revision, setAnalysis);
 }, [aiOpen, item.sysId, revision, online, present]);
 useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1800); return () => clearTimeout(timer); }, [copied]);
 const sla = detailSla(item, now);
 const priority = ({ 4: 'P1 · Критический', 3: 'P2 · Высокий', 2: 'P3 · Средний', 1: 'P4 · Низкий' } as Record<number, string>)[item.priorityId] || item.priority || 'Приоритет не указан';
 const facts = [['Продукт', item.productName], ['Сервис', item.service], ['Сценарий использования', item.scenarioName],
  ['Тип сервиса', item.serviceType], ['Влияние', item.impact], ['Срочность', item.urgency]];
 const brief = aiOpen ? detailBrief(item, [...latestEvents, ...(snapshot?.events ?? [])], revision, online && present ? analysis : null) : null;


 return <article className="incident-detail-page" aria-labelledby="incident-title" data-incident-id={item.sysId}>
  <div className="incident-detail-layout">
   <div className="incident-detail-main">
    <nav className="incident-detail-toolbar" aria-label="Действия инцидента">
     <button className="button secondary detail-back" onClick={onBack}><Icon name="left" size={16}/>{backLabel}</button>
     <button className={`button detail-outline-action detail-ai-toggle ${aiOpen ? 'selected' : ''}`} aria-expanded={aiOpen} aria-controls="incident-assistant" onClick={() => setAiOpen(value => !value)}>Помощь ИИ<Icon name="spark" size={16}/></button>
    </nav>
    <header className="surface incident-summary">
     <h1 id="incident-title" tabIndex={-1}>{item.header || 'Инцидент без заголовка'}</h1>
     <p className={`incident-short-description ${item.shortDescription ? '' : 'detail-missing'}`}>{item.shortDescription || 'Краткое описание пока не добавлено'}</p>
     <div className="incident-summary-meta">
      <span className="incident-number">{item.id}<button className="icon-button copy-incident" aria-label={copied ? 'Номер скопирован' : 'Копировать номер инцидента'} title={copied ? 'Скопировано' : 'Копировать номер'} onClick={() => { setCopyError(false); void navigator.clipboard.writeText(item.id).then(() => setCopied(true)).catch(() => setCopyError(true)); }}><Icon name={copied ? 'check' : 'copy'} size={15}/></button></span>
      {copyError && <small role="status">Не удалось скопировать номер.</small>}
      <span className={`priority source-priority-${item.priorityId}`}>{priority}</span><Status item={item}/>
     </div>
    </header>
    {brief && <Dialog title="Помощь ИИ" onClose={() => setAiOpen(false)}>
     <div className="incident-assistant detail-card" id="incident-assistant">
      <p aria-live="polite">{brief.text}</p>
      <small className="detail-muted">{brief.generated ? 'ИИ-сводка' : !present ? 'По архивной карточке' : !online ? 'По сохранённой карточке' : 'По данным карточки'}</small>
     </div>
    </Dialog>}
    <section className="surface detail-card incident-problem" aria-labelledby="problem-title">
     <h2 id="problem-title">Описание проблемы</h2>{item.description ? <p className="preserve-lines problem-description">{item.description}</p> : <DetailEmpty icon="inbox" title="Описание пока не добавлено" text="Здесь появятся симптомы и обстоятельства инцидента."/>}
     <h3>Затронутая система</h3><dl className="incident-system-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value ? undefined : 'detail-missing'}>{value || 'Не указано'}</dd></div>)}</dl>
    </section>
    <section className="surface detail-card incident-solution" aria-labelledby="solution-title">
     <h2 id="solution-title">Описание решения</h2>{item.solution ? <p className="preserve-lines">{item.solution}</p> : <DetailEmpty icon="check" title="Решение пока не описано" text="Когда появится описание решения, оно отобразится здесь."/>}
     <p className="detail-explanation">Текст может описывать предварительное решение или прошлую попытку, которая не помогла. Факт устранения определяется статусом.</p>
    </section>

   </div>
   <aside className="incident-detail-aside" aria-label="Координация инцидента">
    <section className={`surface detail-card incident-deadline deadline-${sla.kind}`} aria-label="Сроки инцидента">
     <div className="detail-deadline-band" role="timer" aria-live="off"><span>{sla.label}</span><strong>{sla.value}</strong></div>
     <dl className="detail-table deadline-dates"><DetailRow label="Регистрация" value={detailDate(item.submitDate)}/><DetailRow label="Дедлайн" value={detailDate(item.deadline)}/></dl>
    </section>
    <section className="surface detail-card incident-owner"><h2>Ответственные</h2>
     <dl className="detail-table"><DetailRow label="Команда" value={item.assignedGroupName} empty="Не назначена"/><DetailRow label="Исполнитель" value={item.assignedEmployee} empty="Не назначен"/><DetailRow label="Логин исполнителя" value={item.assignedEmployeeLogin}/><DetailRow label="Назначение команде" value={detailDate(item.lastAssignmentToTeamDateTime)}/></dl>
     {onAssign && canAssign(item) && <button className="button detail-outline-action detail-assign" onClick={onAssign}><Icon name="userPlus" size={16}/>Назначить / сменить команду</button>}
    </section>
    <IncidentHistory item={item} snapshot={snapshot} revision={revision} online={online} onLatest={setLatestEvents}/>
   </aside>
  </div>
 </article>;
}

function DetailRow({ label, value, empty = 'Не указано' }: { label: string; value?: string | null; empty?: string }) {
 return <div><dt>{label}</dt><dd className={!value || value === 'Не указано' ? 'detail-missing' : undefined}>{value || empty}</dd></div>;
}
function DetailEmpty({ icon, title, text }: { icon: string; title: string; text: string }) {
 return <div className="detail-empty"><span className="detail-empty-icon" aria-hidden="true"><Icon name={icon} size={22}/></span><strong>{title}</strong><p>{text}</p></div>;
}
