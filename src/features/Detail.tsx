import { useEffect, useState } from 'react';
import type { Incident, Snapshot, Analysis } from '../domain/incidents';
import { EVENT_LABELS, describeEvent } from '../domain/incidents';
import { canAssign } from '../domain/operations';
import { Status, Team, Dialog, dateTime } from '../components/ui';
import { Icon } from '../components/Icon';
import { api } from '../data/api';
import { detailDate, detailSla } from './detailPresentation';

export function Detail({ item, snapshot, now, onBack, backLabel, onAssign }: {
 item: Incident; snapshot: Snapshot; now: number; onBack: () => void; backLabel: string; onAssign: () => void;
}) {
 const [aiOpen, setAiOpen] = useState(false), [historyPage, setHistoryPage] = useState(0);
 const [analysis, setAnalysis] = useState<Analysis | null>(null), [busy, setBusy] = useState(false);
 const [failure, setFailure] = useState<string | null>(null), [retry, setRetry] = useState(0);
 const [copied, setCopied] = useState(false);
 const currentAnalysis = analysis?.revision === snapshot.revision ? analysis : null;
 useEffect(() => {
  if (!aiOpen) return;
  let alive = true; setBusy(true); setFailure(null); setAnalysis(null);
  api.analysis(item.sysId).then(value => {
   if (!alive) return;
   if (value.revision !== snapshot.revision) setFailure('Данные изменились. Повторите разбор актуального инцидента.');
   else setAnalysis(value);
  }).catch(() => { if (alive) setFailure('Не удалось подготовить разбор. Попробуйте ещё раз.'); })
   .finally(() => { if (alive) setBusy(false); });
  return () => { alive = false; };
 }, [aiOpen, item.sysId, snapshot.revision, retry]);
 useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1800); return () => clearTimeout(timer); }, [copied]);
 const history = snapshot.events.filter(event => event.sysId === item.sysId);
 const pageCount = Math.max(1, Math.ceil(history.length / 3)), page = Math.min(historyPage, pageCount - 1);
 const displayedHistory = history.slice(page * 3, page * 3 + 3);
 const sla = detailSla(item, now);
 const priority = ({ 4: 'P1 · Критический', 3: 'P2 · Высокий', 2: 'P3 · Средний', 1: 'P4 · Низкий' } as Record<number, string>)[item.priorityId] || item.priority || 'Приоритет не указан';
 const facts = [['Продукт', item.productName], ['Сервис', item.service], ['Сценарий использования', item.scenarioName],
  ['Тип сервиса', item.serviceType], ['Влияние', item.impact], ['Срочность', item.urgency]];


 return <article className="incident-detail-page" aria-labelledby="incident-title" data-incident-id={item.sysId}>
  <div className="incident-detail-layout">
   <div className="incident-detail-main">
    <nav className="incident-detail-toolbar" aria-label="Действия инцидента">
     <button className="button secondary detail-back" onClick={onBack}><Icon name="left" size={16}/>{backLabel}</button>
     <button className={`button detail-ai-toggle ${aiOpen ? 'selected' : ''}`} aria-expanded={aiOpen} aria-controls="incident-assistant" onClick={() => setAiOpen(value => !value)}>Помощь ИИ<Icon name="spark" size={16}/></button>
    </nav>
    <header className="surface incident-summary">
     <h1 id="incident-title" tabIndex={-1}>{item.header || 'Инцидент без заголовка'}</h1>
     <p className={`incident-short-description ${item.shortDescription ? '' : 'detail-missing'}`}>{item.shortDescription || 'Краткое описание пока не добавлено'}</p>
     <div className="incident-summary-meta">
      <span className="incident-number">{item.id}<button className="icon-button copy-incident" aria-label={copied ? 'Номер скопирован' : 'Копировать номер инцидента'} title={copied ? 'Скопировано' : 'Копировать номер'} onClick={() => { void navigator.clipboard.writeText(item.id).then(() => setCopied(true)).catch(() => setFailure('Не удалось скопировать номер.')); }}><Icon name={copied ? 'check' : 'copy'} size={15}/></button></span>
      <span className={`priority source-priority-${item.priorityId}`}>{priority}</span><Status item={item}/>
     </div>
    </header>
    {aiOpen && <Dialog title="Помощь ИИ" onClose={() => setAiOpen(false)}><section className="incident-assistant detail-card" id="incident-assistant" aria-labelledby="assistant-title">
     <div className="detail-card-heading"><h2 id="assistant-title"><Icon name="spark" size={18}/>Помощь координатору</h2><span className="small-tag tone-purple">{currentAnalysis?.provider === 'llm' ? 'ИИ-анализ' : 'Анализ по правилам'}</span></div>
     {busy && <p className="detail-muted" role="status">Собираем факты и похожие случаи…</p>}
     {failure && <div className="detail-inline-error" role="alert"><p>{failure}</p><button className="text-button" onClick={() => setRetry(value => value + 1)}>Повторить</button></div>}
     {currentAnalysis && <><p>{currentAnalysis.summary}</p>{currentAnalysis.attention.length > 0 && <ul>{currentAnalysis.attention.map(text => <li key={text}>{text}</li>)}</ul>}
      <h3>Команды из похожих случаев</h3>{currentAnalysis.candidates.length ? currentAnalysis.candidates.map(candidate => <div className="detail-candidate" key={candidate.team}><Team name={candidate.team}/><p>{candidate.reason}</p><small>Похожие инциденты: {candidate.evidenceIds.join(', ')}</small></div>) : <p className="detail-muted">Недостаточно похожих завершённых случаев для рекомендации.</p>}
      {currentAnalysis.missing.length > 0 && <details><summary>Каких данных не хватает</summary><ul>{currentAnalysis.missing.map(text => <li key={text}>{text}</li>)}</ul></details>}
      <small className="detail-muted">Рекомендации требуют проверки координатором.</small></>}
    </section></Dialog>}
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
     {canAssign(item) && <button className="button secondary detail-assign" onClick={onAssign}><Icon name="userPlus" size={16}/>Назначить / сменить команду</button>}
    </section>
    <section className="surface detail-card incident-history" aria-labelledby="history-title">
     <div className="detail-history-heading"><h2 id="history-title">История</h2>{history.length > 0 && <div className="detail-history-pagination"><div className="detail-history-position"><span className="detail-history-progress" aria-hidden="true"><i style={{ width: `${Math.min(100, (page + 1) / pageCount * 100)}%` }}/></span><span>{page * 3 + 1}–{Math.min((page + 1) * 3, history.length)} из {history.length}</span></div><div className="detail-history-arrows"><button className="icon-button" aria-label="Предыдущие события инцидента" disabled={page === 0} onClick={() => setHistoryPage(page - 1)}><Icon name="left" size={17}/></button><button className="icon-button" aria-label="Следующие события инцидента" disabled={page + 1 >= pageCount} onClick={() => setHistoryPage(page + 1)}><Icon name="right" size={17}/></button></div></div>}</div>
     {history.length ? <ol>{displayedHistory.map(event => <li key={event.eventId}><div className="detail-history-event"><strong>{event.types.map(type => EVENT_LABELS[type] || 'Изменение').join(' · ')}</strong><time dateTime={event.at}>{dateTime(event.at)}</time></div><p>{describeEvent(event)}</p></li>)}</ol> : <DetailEmpty icon="clock" title="История пока пуста" text="Новые изменения инцидента появятся здесь автоматически."/>}
    </section>
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
