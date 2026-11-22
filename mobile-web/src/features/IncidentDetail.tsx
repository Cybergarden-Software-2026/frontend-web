import {Icon} from '../components/Icon.tsx';
import {countdown} from '../domain/alerts.ts';
import {displaySlaKind} from '../domain/deadlineDisplay.ts';
import {COORDINATOR_TEAM, STATES, stateOf, timestamp} from '../domain/incidents.ts';
import {mobileIncident, type MobileIncident} from '../domain/mobileIncidents.ts';
import {TeamContactAction} from './TeamContactAction.tsx';
import './incident-detail.css';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

const priorities: Record<number, string> = {
  4: 'P1 · Критический', 3: 'P2 · Высокий', 2: 'P3 · Средний', 1: 'P4 · Низкий',
};

function dateLabel(value: string | null): string {
  const time = timestamp(value);
  return time === null ? 'Не указано' : `${dateFormatter.format(time)} МСК`;
}

export function IncidentDetail({item, now, onBack, owner, refresh, onExpired}: {
  item: MobileIncident;
  now: number;
  onBack: () => void;
  owner: string;
  refresh: () => void;
  onExpired: () => void;
}) {
  const incident = mobileIncident(item);
  const state = stateOf(incident);
  const sla = displaySlaKind(incident, now);
  const stopped = sla === 'restored' || sla === 'closed';
  const deadlineLabel = stopped ? 'Остановлен' : sla === 'unknown' ? 'Срок не указан' : sla === 'late' ? 'Просрочка' : 'До дедлайна';
  const team = item.assignedGroupName?.trim();
  const number = item.teamPhone?.trim();
  const phone = team && number && /^\+[1-9][0-9]{1,14}$/.test(number) ? number : null;
  const telephone = phone ? `tel:${phone}` : null;
  const canContact = team && team !== COORDINATOR_TEAM && team !== 'AutoClosedMi';
  const systemFacts = [
    ['Продукт', item.productName], ['Сервис', item.service], ['Сценарий использования', item.scenarioName],
    ['Тип сервиса', item.serviceType], ['Влияние', item.impact], ['Срочность', item.urgency],
  ].filter(([, value]) => Boolean(value?.trim()));

  return <article className="mobile-detail" aria-labelledby="mobile-incident-title">
    <button className="back mobile-detail-back" type="button" onClick={onBack}>
      <Icon name="left" size={16}/>К инцидентам
    </button>

    <header className="surface mobile-detail-card mobile-detail-summary">
      <h1 id="mobile-incident-title">{item.header?.trim() || 'Инцидент без заголовка'}</h1>
      {item.shortDescription?.trim() && <p className="mobile-detail-subtitle">{item.shortDescription}</p>}
      <div className="mobile-detail-meta">
        <strong className="mobile-detail-number">{item.id}</strong>
        {priorities[item.priorityId] && <span className={`mobile-detail-chip priority-${item.priorityId}`}>{priorities[item.priorityId]}</span>}
        <span className={`mobile-detail-chip${stopped ? ' is-stopped' : ''}`}>{STATES[state]}</span>
      </div>
    </header>

    <div className="mobile-detail-columns">
      <div className="mobile-detail-coordination">
        <section className="surface mobile-detail-card" aria-label="Сроки инцидента">
          <div className={`mobile-detail-timer ${sla}`} role="timer">
            <span>{deadlineLabel}</span>
            <strong>{sla === 'unknown' ? '--:--:--' : countdown(incident, now)}</strong>
          </div>
          <dl className="mobile-detail-table">
            <div><dt>Регистрация</dt><dd>{dateLabel(item.submitDate)}</dd></div>
            <div><dt>Дедлайн</dt><dd>{dateLabel(item.deadline)}</dd></div>
          </dl>
        </section>

        <section className="surface mobile-detail-card" aria-labelledby="mobile-incident-owner">
          <h2 id="mobile-incident-owner">Ответственные</h2>
          <dl className="mobile-detail-table">
            <div>
              <dt>Команда</dt>
              <dd className="mobile-detail-team">
                <span>{team || 'Не назначена'}{team && <small>{phone ?? 'Номер не указан'}</small>}</span>
              </dd>
            </div>
            {item.assignedEmployee && <div><dt>Исполнитель</dt><dd>{item.assignedEmployee}</dd></div>}
            {item.assignedEmployeeLogin && <div><dt>Логин исполнителя</dt><dd>{item.assignedEmployeeLogin}</dd></div>}
            {item.lastAssignmentToTeamDateTime && <div><dt>Назначение команде</dt><dd>{dateLabel(item.lastAssignmentToTeamDateTime)}</dd></div>}
          </dl>
          {canContact && <TeamContactAction key={team} owner={owner} sysId={item.sysId} team={team} telephone={telephone} refresh={refresh} onExpired={onExpired}/>}
        </section>
      </div>

      {Boolean(item.description?.trim() || systemFacts.length || item.solution?.trim()) && <div className="mobile-detail-context">
        {Boolean(item.description?.trim() || systemFacts.length) && <section className="surface mobile-detail-card" aria-labelledby="mobile-incident-problem">
          <h2 id="mobile-incident-problem">Описание проблемы</h2>
          {item.description?.trim() && <p className="mobile-detail-description">{item.description}</p>}
          {systemFacts.length > 0 && <>
            <h3>Затронутая система</h3>
            <dl className="mobile-detail-facts">{systemFacts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          </>}
        </section>}
        {item.solution?.trim() && <section className="surface mobile-detail-card" aria-labelledby="mobile-incident-solution">
          <h2 id="mobile-incident-solution">Описание решения</h2>
          <p className="mobile-detail-description">{item.solution}</p>
        </section>}
      </div>}
    </div>
  </article>;
}
