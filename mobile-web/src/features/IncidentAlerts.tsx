import {useEffect, useState} from 'react';
import {Icon} from '../components/Icon.tsx';
import {Spinner} from '../components/ui.tsx';
import {coordinationClaimLabel, currentMobileAlerts, type CoordinationClaim, type MobileSnapshot} from '../domain/mobileIncidents.ts';
import {countdown, type HeaderAlert} from '../domain/alerts.ts';
import {belongs, STATES, stateOf} from '../domain/incidents.ts';
import {displaySlaKind} from '../domain/deadlineDisplay.ts';
import {IncidentDetail} from './IncidentDetail.tsx';
import './incident-alerts.css';

interface Props {
 snapshot: MobileSnapshot | null;
 now: number;
 loading: boolean;
 error: string;
 refresh: () => void;
 owner: string;
 onExpired: () => void;
}

const alertIcon = {critical: 'alert', waiting: 'people', deadline: 'clock'};
const alertCountGrammar = new Intl.PluralRules('ru');
const deadlineLabel = {
 late: 'Просрочен', soon: 'Истекает', normal: 'Осталось', restored: 'Устранён',
 closed: 'Остановлен', unknown: 'Срок не указан', research: 'Осталось',
};

function incidentId(hash: string) {
 if (!hash.startsWith('#incident/')) return '';
 try { return decodeURIComponent(hash.slice('#incident/'.length)); } catch { return ''; }
}

function IncidentCard({alert, now, claim, owner}: {alert: HeaderAlert; now: number; claim?: CoordinationClaim; owner: string}) {
 const {item, kind, reason} = alert;
 const sla = displaySlaKind(item, now);
 const team = item.assignedGroupName.trim();
 const initials = team.replace(/^КЦ\s+/i, '').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
 const description = item.shortDescription?.trim() || item.description.trim();
 return <li>
  <a className={`mobile-queue-card attention-${kind}`} href={`#incident/${encodeURIComponent(item.sysId)}`}>
   <span className="mobile-queue-head">
    <span className="mobile-queue-id">{item.id}</span>
    <span className={`mobile-queue-priority priority-${item.priorityId}`}>{[1, 2, 3, 4].includes(item.priorityId) ? 'P' + (5 - item.priorityId) : '—'}</span>
    <Icon name="right" size={16}/>
   </span>
   <strong className="mobile-queue-title">{item.header}</strong>
   {description && <span className="mobile-queue-description">{description}</span>}
   <span className="mobile-queue-reason"><Icon name={alertIcon[kind]} size={15}/>{reason}</span>
   <span className="mobile-queue-metrics">
    <span><small>Статус</small><strong className="mobile-queue-state">{STATES[stateOf(item)]}</strong></span>
    <span><small>SLA · {deadlineLabel[sla]}</small><strong className={`mobile-queue-timer sla-${sla}`}>{countdown(item, now)}</strong></span>
   </span>
   <span className="mobile-queue-team">
    <span className="mobile-queue-avatar" aria-hidden="true">{team ? initials : <Icon name="people" size={17}/>}</span>
    <span><small>Команда</small><strong>{team || 'Не назначена'}</strong></span>
   </span>
   {claim && belongs(item,'coordinators') && <span className="mobile-claim-label">{coordinationClaimLabel(claim,owner)}</span>}
  </a>
 </li>;
}

export function IncidentAlerts({snapshot, now, loading, error, refresh, owner, onExpired}: Props) {
 const [hash, setHash] = useState(() => location.hash);
 useEffect(() => {
  const change = () => {
   setHash(location.hash);
   window.scrollTo({top: 0});
  };
  window.addEventListener('hashchange', change);
  return () => window.removeEventListener('hashchange', change);
 }, []);

 const selectedId = incidentId(hash);
 const selected = snapshot?.items.find(item => item.sysId === selectedId);
 const back = () => { location.hash = 'alerts'; };
 const connection = error && <div className="connection" role="status">
  <Icon name="signal"/>
  <span><strong>Не удалось обновить инциденты</strong><small>{error}</small></span>
  <button onClick={refresh} disabled={loading}>{loading ? <Spinner/> : 'Повторить'}</button>
 </div>;

 if (selectedId) return <>
  {connection}
  {selected && snapshot ? <IncidentDetail key={selected.sysId} item={selected} revision={snapshot.revision} now={now} onBack={back} owner={owner} refresh={refresh} onExpired={onExpired}/> :
   <>
    <button className="back" onClick={back}><Icon name="left" size={18}/>Назад к важному</button>
    <section className="surface empty-state" role="status">
     <Icon name="inbox" size={34}/>
     <h2>{loading || (!snapshot && !error) ? 'Загружаем инцидент…' : 'Инцидент недоступен'}</h2>
     {(!loading && (snapshot || error)) && <button className="button outline" onClick={refresh}>Повторить</button>}
    </section>
   </>}
 </>;

 const alerts = snapshot ? currentMobileAlerts(snapshot, now) : [];
 const claims = new Map<string, CoordinationClaim>();
 for (const item of snapshot?.items ?? []) if (item.coordinationClaim) claims.set(item.sysId,item.coordinationClaim);
 return <>
  <section className={`summary mobile-alert-summary${alerts.length ? ' needs-attention' : ''}`}>
   <div className="key-pattern" aria-hidden="true"><i>Ctrl</i><i>МТС</i><i>{'{ }'}</i><i>+</i></div>
   <span className="eyebrow">МТС · ЦЕНТР КООРДИНАЦИИ</span>
   <div className="summary-heading">
    <div>
     <h1>{!snapshot ? 'Важные инциденты' : alerts.length ? 'Нужна ваша реакция' : 'Всё под контролем'}</h1>
     {snapshot && <p>{alerts.length ? `${alerts.length} ${alertCountGrammar.select(alerts.length) === 'one' ? 'требует' : 'требуют'} внимания` : 'Нет срочных задач'}</p>}
    </div>
    <span className="summary-symbol"><Icon name={alerts.length ? 'alert' : snapshot ? 'circleCheck' : 'bell'} size={32}/></span>
   </div>
  </section>
  {connection}
  <section aria-labelledby="mobile-alert-list-title">
   <h2 className="mobile-alert-list-title" id="mobile-alert-list-title">Требуют внимания</h2>
   {!snapshot && !error ? <div className="loading-state" role="status"><Spinner/><span>Загружаем инциденты…</span></div> :
    !snapshot ? <div className="surface empty-state"><Icon name="signal" size={35}/><h2>Пока нет загруженных данных</h2></div> :
    !alerts.length ? <div className="surface empty-state"><Icon name="circleCheck" size={35}/><p>Список важных инцидентов пуст.</p></div> :
    <ul className="mobile-queue" aria-label="Важные инциденты">{alerts.map(alert => <IncidentCard key={alert.item.sysId} alert={alert} now={now} claim={claims.get(alert.item.sysId)} owner={owner}/>)}</ul>}
  </section>
 </>;
}
