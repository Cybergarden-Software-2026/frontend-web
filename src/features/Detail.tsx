import { useEffect, useState } from 'react';
import type { Incident, Snapshot, Analysis } from '../domain/incidents';
import { EVENT_LABELS, describeEvent, stateOf } from '../domain/incidents';
import { canAssign } from '../domain/operations';
import { Status, Team, Sla, dateTime } from '../components/ui';
import { Icon } from '../components/Icon';
import { api } from '../data/api';

export function Detail({ item, snapshot, now, onBack, backLabel, onAssign }: {
 item: Incident; snapshot: Snapshot; now: number; onBack: () => void; backLabel: string; onAssign: () => void;
}) {
 const [aiOpen, setAiOpen] = useState(false), [allHistory, setAllHistory] = useState(false);
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
 const displayedHistory = allHistory ? history : history.slice(0, 5);
 const priority = ({ 4: 'P1 · Критический', 3: 'P2 · Высокий', 2: 'P3 · Средний', 1: 'P4 · Низкий' } as Record<number, string>)[item.priorityId] || item.priority || 'Приоритет не указан';
 const rawUrl = snapshot.itsmUrlTemplate?.replace('{sysId}', encodeURIComponent(item.sysId)).replace('{id}', encodeURIComponent(item.id));
 const itsmUrl = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : null;
 const facts = [['Продукт', item.productName], ['Сервис', item.service], ['Сценарий использования', item.scenarioName],
  ['Тип сервиса', item.serviceType], ['Влияние', item.impact], ['Срочность', item.urgency]];
 const flags = [[item.isNeedUp, 'Требуется устранение последствий'], [item.isDouble, 'Дубль'],
  [item.isMaster, 'Мастер-инцидент'], [item.isEffect, 'Последствие'], [item.isReason, 'Причина']];

 return <article className="incident-detail-page" aria-labelledby="incident-title" data-incident-id={item.sysId}>
  <div className="incident-detail-layout">
   <div className="incident-detail-main">
    <nav className="incident-detail-toolbar" aria-label="Действия инцидента">
     <button className="button secondary detail-back" onClick={onBack}><Icon name="left" size={16}/>{backLabel}</button>
     <button className={`button detail-ai-toggle ${aiOpen ? 'selected' : ''}`} aria-expanded={aiOpen} aria-controls="incident-assistant" onClick={() => setAiOpen(value => !value)}>Помощь ИИ<Icon name="spark" size={16}/></button>
    </nav>
    <header className="surface incident-summary">
     <h1 id="incident-title" tabIndex={-1}>{item.header || 'Инцидент без заголовка'}</h1>
     {item.shortDescription && <p className="incident-short-description">{item.shortDescription}</p>}
     <div className="incident-summary-meta">
      <span className="incident-number">{item.id}<button className="icon-button copy-incident" aria-label={copied ? 'Номер скопирован' : 'Копировать номер инцидента'} title={copied ? 'Скопировано' : 'Копировать номер'} onClick={() => { void navigator.clipboard.writeText(item.id).then(() => setCopied(true)).catch(() => setFailure('Не удалось скопировать номер.')); }}><Icon name={copied ? 'check' : 'copy'} size={15}/></button></span>
      <span className={`priority source-priority-${item.priorityId}`}>{priority}</span><Status item={item}/>
     </div>
    </header>
    {aiOpen && <section className="surface incident-assistant detail-card" id="incident-assistant" aria-labelledby="assistant-title">
     <div className="detail-card-heading"><h2 id="assistant-title"><Icon name="spark" size={18}/>Помощь координатору</h2><span className="small-tag tone-purple">{currentAnalysis?.provider === 'llm' ? 'ИИ-анализ' : 'Анализ по правилам'}</span></div>
     {busy && <p className="detail-muted" role="status">Собираем факты и похожие случаи…</p>}
     {failure && <div className="detail-inline-error" role="alert"><p>{failure}</p><button className="text-button" onClick={() => setRetry(value => value + 1)}>Повторить</button></div>}
     {currentAnalysis && <><p>{currentAnalysis.summary}</p>{currentAnalysis.attention.length > 0 && <ul>{currentAnalysis.attention.map(text => <li key={text}>{text}</li>)}</ul>}
      <h3>Команды из похожих случаев</h3>{currentAnalysis.candidates.length ? currentAnalysis.candidates.map(candidate => <div className="detail-candidate" key={candidate.team}><Team name={candidate.team}/><p>{candidate.reason}</p><small>Похожие инциденты: {candidate.evidenceIds.join(', ')}</small></div>) : <p className="detail-muted">Недостаточно похожих завершённых случаев для рекомендации.</p>}
      {currentAnalysis.missing.length > 0 && <details><summary>Каких данных не хватает</summary><ul>{currentAnalysis.missing.map(text => <li key={text}>{text}</li>)}</ul></details>}
      <small className="detail-muted">Рекомендации требуют проверки координатором.</small></>}
    </section>}
    <section className="surface detail-card incident-problem" aria-labelledby="problem-title">
     <h2 id="problem-title">Описание проблемы</h2><p className="preserve-lines">{item.description || 'Описание пока не указано.'}</p>
     <h3>Затронутая система</h3><dl className="incident-system-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Не указано'}</dd></div>)}</dl>
    </section>
    <section className="surface detail-card incident-solution" aria-labelledby="solution-title">
     <h2 id="solution-title">Описание решения</h2><p className="preserve-lines">{item.solution || 'Описание решения пока не заполнено.'}</p>
     <p className="detail-explanation">Текст может описывать предварительное решение или прошлую попытку, которая не помогла. Факт устранения определяется статусом.</p>
    </section>
    <section className="surface detail-card incident-registration" aria-labelledby="registration-title"><h2 id="registration-title">Регистрация инцидента</h2>
     <dl className="incident-registration-facts">{[['Канал регистрации', item.receivingChannel], ['Инициатор', item.initiatorName], ['Подстатус', item.stateReason], ['Дата завершения', item.completionDate ? dateTime(item.completionDate) : null]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Не указано'}</dd></div>)}</dl>
     {flags.some(([value]) => value) && <div className="group-tags">{flags.filter(([value]) => value).map(([, label]) => <span className="small-tag tone-warning" key={String(label)}>{label}</span>)}</div>}
    </section>
   </div>
   <aside className="incident-detail-aside" aria-label="Координация инцидента">
    <section className="surface detail-card incident-owner"><h2>Ответственные</h2><Team name={item.assignedGroupName}/><p>{item.assignedEmployee || 'Исполнитель не указан'}</p>
     <small className="detail-muted">Назначен {dateTime(item.lastAssignmentToTeamDateTime)}</small>
     {canAssign(item) && <button className="button secondary" onClick={onAssign}><Icon name="userPlus" size={16}/>{item.assignedGroupName ? 'Сменить команду' : 'Назначить команду'}</button>}
    </section>
    <section className={`surface detail-card incident-deadline state-${stateOf(item)}`}><h2>Срок решения</h2><Sla item={item} now={now}/><small className="detail-muted">Зарегистрирован {dateTime(item.submitDate)}</small>{itsmUrl && <a className="button secondary" href={itsmUrl} target="_blank" rel="noreferrer"><Icon name="monitor" size={16}/>Открыть в ITSM</a>}</section>
    <section className="surface detail-card incident-history" aria-labelledby="history-title"><div className="detail-card-heading"><h2 id="history-title">История изменений</h2><span className="detail-history-count">{history.length}</span></div>
     {history.length ? <><ol>{displayedHistory.map(event => <li key={event.eventId}><span className={`history-point ${event.types.some(type => ['resolved', 'closed'].includes(type)) ? 'done' : ''}`}/><div><strong>{event.types.map(type => EVENT_LABELS[type] || 'Изменение').join(' · ')}</strong><p>{describeEvent(event)}</p><time dateTime={event.at}>{dateTime(event.at)}</time></div></li>)}</ol>{history.length > 5 && <button className="text-button" onClick={() => setAllHistory(value => !value)}>{allHistory ? 'Свернуть историю' : `Вся история · ${history.length}`}</button>}</> : <p className="detail-muted">Изменений пока нет. Новые события появятся здесь автоматически.</p>}
    </section>
   </aside>
  </div>
 </article>;
}
