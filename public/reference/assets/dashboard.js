'use strict';

const storageKey = 'ctrl-ops-mts-demo-v1';
const pageSize = 8;
const app = document.querySelector('#app');
const FILTERS = [
  ['all', 'Все', 'Все'], ['critical', 'Критические', 'P1'], ['mine', 'На координаторах', 'У нас'], ['done', 'Решённые', 'Решённые']
];
const EMPTY_FILTERS = { priority: '', status: '', team: '', sla: '' };
const state = {
  data: loadData(), tab: 'all', search: '', filters: { ...EMPTY_FILTERS },
  page: 1, sort: 'default', detail: null, auto: null, nextEvent: 0,
  openAI: false, resolving: false, toast: null, returnFocus: null,
  analysisRange: '7', analysisTeam: ''
};

function loadData() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(data?.incidents) && Array.isArray(data.events)) {
      return { ...data, customTeams: Array.isArray(data.customTeams) ? data.customTeams : [] };
    }
  } catch {
    // File URLs and private browsing may restrict local storage.
  }
  return { ...initialData(), customTeams: [] };
}

function teamEntries() {
  return [...Object.entries(TEAMS), ...state.data.customTeams.map(team => [team.id, team])];
}

function teamById(id) {
  return Object.hasOwn(TEAMS, id) ? TEAMS[id] : state.data.customTeams.find(team => team.id === id);
}

function teamOptions() {
  return teamEntries().map(([id, team]) => [id, team.name]);
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state.data));
  } catch {
    // The demo remains usable in memory.
  }
}

const navButton = (action, label, glyph) =>
  `<button class="nav-item" type="button" data-action="${action}">${icon(glyph)}<span>${label}</span></button>`;
const navLink = (href, label, glyph) =>
  `<a class="nav-item" href="${href}">${icon(glyph)}<span>${label}</span></a>`;
const routeLink = (view, label, glyph) =>
  `<a class="nav-item" href="#${view}" data-view="${view}">${icon(glyph)}<span>${label}</span></a>`;
const iconButton = (action, label, glyph, extra = '') =>
  `<button class="icon-button" type="button" data-action="${action}" aria-label="${label}" title="${label}" ${extra}>${icon(glyph)}</button>`;

app.innerHTML = `
  <a class="skip-link" href="#main" data-action="skip-main">К содержанию</a>
  <aside class="sidebar" aria-label="Боковая панель">
    ${brand()}
    <nav aria-label="Основное меню">
      <p class="nav-caption">РАБОЧАЯ ОБЛАСТЬ</p>
      ${routeLink('main', 'Инциденты', 'grid')}
      ${navButton('events', 'События', 'pulse')}
      ${navButton('teams', 'Команды', 'people')}
      ${routeLink('analytics', 'Аналитика', 'chart')}
      <p class="nav-caption">МАТЕРИАЛЫ КЕЙСА</p>
      ${navLink('requirements.html', 'Функционал', 'book')}
      ${navLink('ui-kit.html', 'UI-кит', 'layers')}
      ${navLink('mobile.html', 'Мобильная версия', 'phone')}
    </nav>
    <div class="sidebar-profile"><span class="avatar">АС</span><span><strong>Анна Смирнова</strong><small>Координатор</small></span></div>
  </aside>

  <div class="workspace">
    <header class="topbar">
      <span class="top-context">Мониторинг <span class="crumb-divider">/</span> <strong id="view-title">Инциденты</strong></span>
      <div class="mobile-brand">${brand()}</div>
      <div class="top-actions">
        <span class="live-indicator"><i></i>Демо-режим</span>
        <div class="top-separator"></div>
        <button class="icon-button notification-button" type="button" data-action="events" aria-label="Уведомления" title="Уведомления">${icon('bell')}<span id="unread" hidden></span></button>
        ${iconButton('more', 'Материалы кейса', 'dotMenu', 'data-mobile-menu')}
        <span class="avatar top-avatar" aria-label="Анна Смирнова">АС</span>
      </div>
    </header>

    <main class="main" id="main" tabindex="-1">
      <div id="incident-view">
      <section class="page-heading hero-heading" aria-labelledby="page-title">
        <div class="hero-copy">
          <h1 id="page-title">Инциденты</h1>
          <p>Очередь координации и контроль сроков SLA</p>
        </div>
        ${heroEmblem()}
        <button class="button brand-button demo-button" type="button" data-action="demo"><span class="brand-action-mark">${icon('flask')}</span><span>Симуляция</span></button>
      </section>
      <section class="metrics" id="metrics" aria-label="Сводка инцидентов"></section>
      <div class="dashboard-grid">
        <section class="queue surface" aria-labelledby="queue-title">
          <div class="queue-heading">
            <h2 id="queue-title">Очередь инцидентов</h2>
            <span class="update-time">${icon('clock')} <span id="last-update"></span></span>
          </div>
          <div class="tab-rail" id="tabs" role="group" aria-label="Быстрый отбор">
            ${FILTERS.map(([value, label, short]) => `<button class="tab" type="button" data-action="tab" data-value="${value}" data-label="${label}" aria-pressed="false"><span class="tab-label">${label}</span><span class="tab-short">${short}</span><span data-count="${value}"></span></button>`).join('')}
          </div>
          <div class="queue-toolbar">
            <label class="search-field">${icon('search')}<span class="sr-only">Поиск инцидентов</span><input id="search" type="search" placeholder="Найти инцидент" title="Номер, название, сервис, локация или команда" autocomplete="off" aria-controls="table-zone card-zone"></label>
            <button class="button secondary filter-button" type="button" data-action="filter">${icon('filter')}<span>Фильтры</span><span class="filter-number" id="filter-number" hidden></span></button>
            ${iconButton('sort', 'Изменить сортировку SLA', 'sort', 'data-mobile-sort')}
          </div>
          <div id="filter-line" class="filter-line" hidden></div>
          <div id="table-zone" class="table-zone"></div>
          <div id="card-zone" class="card-zone"></div>
          <div id="queue-footer" class="queue-footer"></div>
        </section>
        <aside class="insights" aria-label="События и подсказки">
          <section class="activity surface" aria-labelledby="activity-title">
            <header class="section-heading"><h2 id="activity-title">Лента событий</h2><span class="event-header-icon">${icon('pulse')}</span></header>
            <div id="activity-list"></div>
            <div class="activity-footer"><button type="button" class="text-button" data-action="events">Все события</button></div>
          </section>
          <section class="ai-panel" id="ai-panel" aria-label="Подсказка ИИ"></section>
        </aside>
      </div>
      <p class="dashboard-caption">${icon('clock')} Время на экране указано по Москве (МСК)</p>
      </div>
      <section id="analytics-view" aria-labelledby="analytics-title" hidden>
        <header class="page-heading analytics-heading">
          <div><h1 id="analytics-title" tabindex="-1">Аналитика</h1><p>Динамика инцидентов, выполнение SLA и нагрузка команд</p></div>
          <div class="analysis-controls" aria-label="Фильтры аналитики">
            <label class="field"><span>За последние</span><select id="analysis-range"><option value="1">24 часа</option><option value="7" selected>7 дней</option><option value="30">30 дней</option></select></label>
            <label class="field"><span>Команда</span><select id="analysis-team"></select></label>
          </div>
        </header>
        <div id="analysis-results"></div>
        <p class="dashboard-caption">${icon('clock')} Текущая очередь и демонстрационный архив · МСК</p>
      </section>
    </main>
  </div>

  <nav class="bottom-nav" aria-label="Мобильное меню">
    ${routeLink('main', 'Инциденты', 'grid')}
    ${navButton('events', 'События', 'pulse')}
    ${navButton('teams', 'Команды', 'people')}
    ${routeLink('analytics', 'Аналитика', 'chart')}
  </nav>
  <dialog id="dialog" class="dialog" aria-labelledby="dialog-title">
    <div class="dialog-header"><h2 id="dialog-title"></h2>${iconButton('close', 'Закрыть', 'close')}</div>
    <div id="dialog-content" class="dialog-content"></div>
  </dialog>
  <div id="toast" class="toast" role="status" aria-live="polite" aria-atomic="true"></div>
`;

const elements = {
  metrics: document.querySelector('#metrics'),
  tabs: document.querySelector('#tabs'),
  search: document.querySelector('#search'),
  filters: document.querySelector('#filter-number'),
  filterLine: document.querySelector('#filter-line'),
  table: document.querySelector('#table-zone'),
  cards: document.querySelector('#card-zone'),
  footer: document.querySelector('#queue-footer'),
  events: document.querySelector('#activity-list'),
  ai: document.querySelector('#ai-panel'),
  unread: document.querySelector('#unread'),
  updated: document.querySelector('#last-update'),
  incidentView: document.querySelector('#incident-view'),
  analytics: document.querySelector('#analytics-view'),
  analysisTeam: document.querySelector('#analysis-team'),
  analysisResults: document.querySelector('#analysis-results'),
  dialog: document.querySelector('#dialog'),
  dialogTitle: document.querySelector('#dialog-title'),
  dialogContent: document.querySelector('#dialog-content'),
  toast: document.querySelector('#toast')
};

const moscowTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const fullTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function incidentById(id) {
  return state.data.incidents.find(item => item.id === id);
}

function isActive(item) {
  return item.status !== 'done';
}

function slaKind(item, now = Date.now()) {
  if (!isActive(item)) return item.resolvedAt > item.deadline ? 'closed-late' : 'closed';
  const left = item.deadline - now;
  if (left <= 0) return 'late';
  return left <= 30 * MINUTE ? 'soon' : 'normal';
}

function slaFormat(duration) {
  const seconds = Math.ceil(Math.abs(duration) / 1000);
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return `${duration < 0 ? '−' : ''}${parts.map(unit => String(unit).padStart(2, '0')).join(':')}`;
}

function slaContent(item, now) {
  const kind = slaKind(item, now);
  if (kind === 'closed' || kind === 'closed-late') {
    return `<strong>${icon(kind === 'closed' ? 'check' : 'alert')}${kind === 'closed' ? 'В срок' : 'С опозданием'}</strong>`;
  }
  const subtitles = { late: 'Просрочен', soon: 'Скоро истечёт', normal: 'Осталось' };
  return `<strong>${slaFormat(item.deadline - now)}</strong><small>${subtitles[kind]}</small>`;
}

function slaMarkup(item) {
  return `<span class="sla sla-${slaKind(item)}" data-timer="${item.id}">${slaContent(item, Date.now())}</span>`;
}

function teamMarkup(team) {
  const info = teamById(team);
  if (!info) return '<span class="team-tag unassigned">Не назначена</span>';
  return `<span class="team-tag"><span class="team-avatar tone-${escapeHtml(info.color)}" aria-hidden="true">${escapeHtml(info.initials)}</span><span>${escapeHtml(info.name)}</span></span>`;
}

function statusMarkup(item) {
  return `<span class="status status-${item.status}"><i></i>${STATUSES[item.status]}</span>`;
}

function priorityMarkup(item) {
  return `<span class="priority priority-${item.priority}" aria-label="P${item.priority} · ${PRIORITY[item.priority]}" title="${PRIORITY[item.priority]}">P${item.priority}</span>`;
}

function reportCounts() {
  const list = state.data.incidents;
  return {
    all: list.length,
    active: list.filter(isActive).length,
    critical: list.filter(item => isActive(item) && item.priority === 1).length,
    mine: list.filter(item => isActive(item) && item.team === 'coord').length,
    risk: list.filter(item => ['late', 'soon'].includes(slaKind(item))).length,
    done: list.filter(item => !isActive(item)).length
  };
}

function renderMetrics() {
  const counts = reportCounts();
  const signature = JSON.stringify(counts);
  if (elements.metrics.dataset.counts === signature) return;
  elements.metrics.dataset.counts = signature;
  const cards = [
    ['active', 'Активные', 'Открытые инциденты', 'inbox', 'blue'],
    ['critical', 'Критические', 'Приоритет P1', 'alert', 'danger'],
    ['risk', 'SLA под риском', '≤ 30 мин или просрочен', 'clock', 'warning'],
    ['done', 'Решённые', 'За период демо', 'circleCheck', 'green']
  ];
  elements.metrics.innerHTML = cards.map(([key, title, detail, symbol, tone]) => `
    <button class="metric surface" type="button" data-action="metric" data-value="${key}" aria-label="${title}, ${counts[key]}. ${detail}">
      <span class="metric-top"><span class="metric-icon tone-${tone}">${icon(symbol)}</span><span class="metric-label">${title}</span></span>
      <strong class="metric-count">${counts[key]}</strong><small>${detail}</small>
    </button>`).join('');
}

function filterMatch(item, key, value) {
  if (!value) return true;
  if (key === 'sla') return value === 'risk' ? ['late', 'soon'].includes(slaKind(item)) : slaKind(item) === value;
  if (key === 'team') return value === 'unassigned' ? !item.team : item.team === value;
  if (key === 'status' && value === 'active') return isActive(item);
  return String(item[key]) === value;
}

function visibleIncidents() {
  const query = state.search.trim().toLocaleLowerCase('ru');
  const list = state.data.incidents.filter(item => {
    if (state.tab === 'critical' && (!isActive(item) || item.priority !== 1)) return false;
    if (state.tab === 'mine' && (!isActive(item) || item.team !== 'coord')) return false;
    if (state.tab === 'done' && isActive(item)) return false;
    if (!Object.entries(state.filters).every(([key, value]) => filterMatch(item, key, value))) return false;
    const terms = [item.id, item.title, item.service, item.location, teamById(item.team)?.name].join(' ').toLocaleLowerCase('ru');
    return terms.includes(query);
  });
  if (state.sort === 'default') return list;
  const direction = state.sort === 'asc' ? 1 : -1;
  return list.sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || (a.deadline - b.deadline) * direction);
}

const sortLabels = { default: 'SLA', asc: 'SLA ↑', desc: 'SLA ↓' };
const fieldLabels = { priority: 'Приоритет', status: 'Статус', team: 'Команда', sla: 'SLA' };
const fieldOptions = {
  priority: Object.entries(PRIORITY).map(([key, value]) => [key, `P${key} · ${value}`]),
  status: [['active', 'Активные'], ...Object.entries(STATUSES)],
  get team() { return [['unassigned', 'Не назначена'], ...teamOptions()]; },
  sla: [['risk', 'Под риском'], ['soon', 'Скоро истечёт'], ['late', 'Просрочен'], ['normal', 'В пределах срока'], ['closed', 'Закрыт в срок'], ['closed-late', 'Закрыт с опозданием']]
};

function renderQueue() {
  const counts = reportCounts();
  const filtered = visibleIncidents();
  const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  state.page = Math.min(state.page, maxPage);
  const offset = (state.page - 1) * pageSize;
  const current = filtered.slice(offset, offset + pageSize);
  elements.tabs.querySelectorAll('.tab').forEach(button => {
    const count = counts[button.dataset.value];
    button.setAttribute('aria-pressed', button.dataset.value === state.tab);
    button.setAttribute('aria-label', button.dataset.label + ' ' + count);
    button.querySelector('[data-count]').textContent = count;
  });
  const filters = Object.entries(state.filters).filter(([, value]) => value);
  elements.filters.hidden = filters.length === 0;
  elements.filters.textContent = filters.length;
  elements.filterLine.hidden = filters.length === 0;
  elements.filterLine.innerHTML = filters.map(([key, value]) => {
    const label = fieldOptions[key].find(([option]) => option === value)?.[1];
    return `<button class="filter-token" type="button" data-action="drop-filter" data-value="${key}" aria-label="Убрать фильтр: ${escapeHtml(label)}">${escapeHtml(label)}${icon('close')}</button>`;
  }).join('');

  if (current.length === 0) {
    const empty = `<div class="empty-state">${icon('search')}<strong>Инциденты не найдены</strong><p>Измените запрос или сбросьте фильтры.</p><button data-action="clear-all" class="button secondary" type="button">Сбросить отбор</button></div>`;
    elements.table.innerHTML = empty;
    elements.cards.innerHTML = empty;
  } else {
    const sortState = { default: 'none', asc: 'ascending', desc: 'descending' };
    elements.table.innerHTML = `
      <table aria-label="Инциденты">
        <colgroup><col class="col-incident"><col class="col-priority"><col class="col-status"><col class="col-team"><col class="col-sla"></colgroup>
        <thead><tr><th scope="col">Инцидент</th><th scope="col"><abbr title="Приоритет">Приор.</abbr></th><th scope="col">Статус</th><th scope="col">Команда</th><th scope="col" aria-sort="${sortState[state.sort]}"><button class="sort-header" type="button" data-action="sort" aria-label="Изменить сортировку SLA">${sortLabels[state.sort]}${icon('sort')}</button></th></tr></thead>
        <tbody>${current.map(item => `
          <tr data-row="${item.id}">
            <td><button type="button" class="incident-main" data-action="detail" data-value="${item.id}">
              <span class="incident-id">${item.id}</span><strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.service)} · ${escapeHtml(item.location)}</small>
            </button></td>
            <td>${priorityMarkup(item)}</td><td>${statusMarkup(item)}</td><td>${teamMarkup(item.team)}</td><td>${slaMarkup(item)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    elements.cards.innerHTML = current.map(item => `
      <article class="incident-card ${item.priority === 1 && isActive(item) ? 'incident-critical' : ''}">
        <button type="button" class="card-hit" data-action="detail" data-value="${item.id}" aria-label="Открыть ${item.id} · ${escapeHtml(item.title)}"></button>
        <div class="incident-card-meta"><span class="incident-id">${item.id}</span>${priorityMarkup(item)}${statusMarkup(item)}</div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.service)} · ${escapeHtml(item.location)}</p>
        <div class="incident-card-footer">${teamMarkup(item.team)}${slaMarkup(item)}</div>
      </article>`).join('');
  }

  elements.footer.innerHTML = `
    <span aria-live="polite">${filtered.length ? `${offset + 1}–${offset + current.length} из ${filtered.length}` : '0 инцидентов'}</span>
    <div class="pagination">
      ${iconButton('previous', 'Предыдущая страница', 'left', state.page <= 1 ? 'disabled' : '')}
      <span class="page-index" aria-label="Страница ${state.page} из ${maxPage}">${state.page} <span>/ ${maxPage}</span></span>
      ${iconButton('next', 'Следующая страница', 'right', state.page >= maxPage ? 'disabled' : '')}
    </div>`;
  const mobileSort = app.querySelector('[data-mobile-sort]');
  mobileSort.classList.toggle('sort-active', state.sort !== 'default');
  mobileSort.title = state.sort === 'default' ? 'Сортировка SLA' : 'Сортировка ' + sortLabels[state.sort];
}

function eventMarkup(event, showDate = false) {
  const config = EVENTS[event.type];
  const item = incidentById(event.id);
  const unread = event.time > state.data.lastRead;
  return `<button type="button" class="event-row" data-action="detail" data-value="${event.id}">
    <span class="event-icon tone-${config.tone}">${icon(config.icon)}</span>
    <span class="event-body"><strong>${config.label}</strong><span>${event.id} · ${escapeHtml(item?.service || '')}</span></span>
    <span class="event-time"><time datetime="${new Date(event.time).toISOString()}">${showDate ? fullTime.format(event.time) : moscowTime.format(event.time)}</time>${unread ? '<i aria-label="Новое"></i>' : ''}</span>
  </button>`;
}

function riskIncident() {
  const list = state.data.incidents.filter(item => isActive(item) && item.risk === 'high');
  return list.find(item => item.id === 'INC-1048') || list[0];
}

function renderInsights() {
  elements.events.innerHTML = state.data.events.slice(0, 3).map(event => eventMarkup(event)).join('');
  const unread = state.data.events.filter(event => event.time > state.data.lastRead).length;
  elements.unread.hidden = unread === 0;
  elements.unread.textContent = unread > 99 ? '99+' : unread;
  elements.unread.parentElement.setAttribute('aria-label', unread ? `Уведомления, новых: ${unread}` : 'Уведомления');
  elements.updated.textContent = 'Обновлено в ' + moscowTime.format(state.data.lastUpdated);
  const item = riskIncident();
  elements.ai.innerHTML = `
    <div class="ai-top"><span class="ai-symbol">${icon('spark')}</span><h2>Подсказка ИИ</h2><span class="ai-demo">Демо</span></div>
    ${item ? `<span class="ai-risk"><i></i> Высокий риск</span><h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.riskReason)}</p>
      <button type="button" class="button ai-button" data-action="detail-ai" data-value="${item.id}">Смотреть разбор</button>`
      : '<h3>Нет активных инцидентов с высоким риском</h3><p>Разбор доступен в карточке каждого инцидента.</p>'}`;
}

function render() {
  renderMetrics();
  renderQueue();
  renderInsights();
  if (!elements.analytics.hidden) renderAnalytics();
}

function renderAnalytics() {
  if (state.analysisTeam && !teamById(state.analysisTeam)) state.analysisTeam = '';
  const options = selectOptions(teamOptions(), state.analysisTeam, 'Все команды');
  if (elements.analysisTeam.dataset.options !== options) {
    elements.analysisTeam.innerHTML = options;
    elements.analysisTeam.dataset.options = options;
  }
  const anchor = state.data.incidents.find(incident => incident.id === 'INC-1048')?.createdAt;
  const archive = demoArchive(Number.isFinite(anchor) ? anchor + 5 * MINUTE : Date.now());
  const report = analyticsReport([...state.data.incidents, ...archive], Number(state.analysisRange), state.analysisTeam);
  const tableOpen = Boolean(elements.analysisResults.querySelector('details[open]'));
  elements.analysisResults.innerHTML = analyticsMarkup(report, teamMarkup, tableOpen);
}

function showView(moveFocus = false) {
  const showAnalytics = location.hash === '#analytics';
  elements.incidentView.hidden = showAnalytics;
  elements.analytics.hidden = !showAnalytics;
  document.querySelector('#view-title').textContent = showAnalytics ? 'Аналитика' : 'Инциденты';
  app.querySelectorAll('[data-view]').forEach(link => {
    const selected = link.dataset.view === (showAnalytics ? 'analytics' : 'main');
    link.classList.toggle('selected', selected);
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (showAnalytics) renderAnalytics();
  if (moveFocus) {
    document.querySelector(showAnalytics ? '#analytics-title' : '#main').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function toggleTimers() {
  const now = Date.now();
  app.querySelectorAll('[data-timer]').forEach(element => {
    const item = incidentById(element.dataset.timer);
    if (!item) return;
    const kind = slaKind(item, now);
    const display = slaContent(item, now);
    if (display !== element.innerHTML) element.innerHTML = display;
    element.className = 'sla sla-' + kind;
  });
  const breached = state.data.incidents.filter(item => slaKind(item, now) === 'late' && !item.slaNotified);
  if (breached.length) {
    breached.forEach(item => {
      item.slaNotified = true;
      pushEvent('breached', item);
    });
    sync(`Нарушен SLA · ${breached[0].id}${breached.length > 1 ? ' и ещё ' + (breached.length - 1) : ''}`);
  }
  const priorRisk = Number(elements.timersRisk);
  const risk = reportCounts().risk;
  if (risk !== priorRisk) {
    elements.timersRisk = risk;
    renderMetrics();
    if (state.filters.sla) renderQueue();
  }
}

function announce(message) {
  window.clearTimeout(state.toast);
  elements.toast.innerHTML = `${icon('pulse')}<span>${escapeHtml(message)}</span>`;
  elements.toast.classList.add('visible');
  state.toast = window.setTimeout(() => {
    elements.toast.classList.remove('visible');
    elements.toast.textContent = '';
  }, 5500);
}

function setDialog(kind, title, content) {
  elements.dialog.dataset.kind = kind;
  elements.dialogTitle.textContent = title;
  elements.dialogContent.innerHTML = content;
  elements.dialogContent.scrollTop = 0;
  if (!elements.dialog.open) {
    state.returnFocus = document.activeElement;
    elements.dialog.showModal();
  }
}

function selectOptions(options, selected, blank = 'Все') {
  const list = blank === null ? options : [['', blank], ...options];
  return list.map(([key, label]) =>
    `<option value="${escapeHtml(key)}" ${String(key) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`
  ).join('');
}

function openFilter() {
  setDialog('filter', 'Фильтры', `
    <form data-form="filter" class="dialog-form">
      ${Object.entries(fieldLabels).map(([key, label]) => `<label class="field"><span>${label}</span><select name="${key}">${selectOptions(fieldOptions[key], state.filters[key])}</select></label>`).join('')}
      <div class="dialog-actions"><button class="button secondary" type="button" data-action="clear-filter">Сбросить</button><button class="button primary" type="submit">Применить</button></div>
    </form>`);
}

function openEvents() {
  state.data.lastRead = Date.now();
  persist();
  renderInsights();
  setDialog('events', 'Все события', `<div class="event-list-full">${state.data.events.map(event => eventMarkup(event, true)).join('')}</div>`);
}

function normalizedTeamName(value) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
}

function renderTeamDirectory(query = '') {
  const normalized = normalizedTeamName(query);
  const counts = new Map();
  state.data.incidents.filter(isActive).forEach(item => {
    const team = item.team;
    counts.set(team, (counts.get(team) || 0) + 1);
  });
  const entries = teamEntries().filter(([, team]) => normalizedTeamName(team.name + ' ' + team.scope).includes(normalized));
  elements.dialogContent.querySelector('#team-directory').innerHTML = entries.length
    ? entries.map(([id, team]) => `
      <button class="team-entry directory-entry" type="button" data-action="filter-team" data-value="${escapeHtml(id)}">
        <span class="directory-team">${teamMarkup(id)}${team.scope ? `<small>${escapeHtml(team.scope)}</small>` : ''}</span>
        <span class="directory-count">${counts.get(id) || 0} активн.</span>${icon('right')}
      </button>`).join('')
    : '<p class="directory-empty">Команды не найдены</p>';
}

function openTeams(created = '') {
  setDialog('teams', 'Команды', `
    <p class="dialog-intro">Выберите команду, чтобы открыть её активные инциденты.</p>
    <div class="directory-toolbar">
      <label class="search-field">${icon('search')}<span class="sr-only">Поиск команды</span><input id="team-search" type="search" placeholder="Найти команду" autocomplete="off" aria-controls="team-directory"></label>
      <button type="button" class="button primary" data-action="add-team">${icon('plus')}Добавить команду</button>
    </div>
    ${created ? `<p class="directory-notice" role="status">${icon('check')} Команда «${escapeHtml(created)}» добавлена и доступна для назначения.</p>` : ''}
    <div class="team-list" id="team-directory"></div>`);
  renderTeamDirectory();
  if (created) focusAfterRender('add-team');
}

function openTeamForm() {
  setDialog('new-team', 'Новая команда', `
    <p class="dialog-intro">Добавьте команду в справочник, чтобы назначать ей инциденты и фильтровать её очередь.</p>
    <form data-form="create-team" class="team-form">
      <label class="field"><span>Название команды</span><input name="name" type="text" placeholder="Например, Мобильные платежи" required maxlength="48" autocomplete="off" aria-describedby="team-name-error"><small class="field-error" id="team-name-error" role="alert"></small></label>
      <label class="field"><span>Сервисы или зона ответственности <small>(необязательно)</small></span><textarea name="scope" rows="2" maxlength="160" placeholder="Например, SmartPay и платёжные шлюзы приложения"></textarea></label>
      <div class="dialog-actions"><button type="button" class="button secondary" data-action="back-teams">Отмена</button><button type="submit" class="button primary">Создать команду</button></div>
    </form>`);
  elements.dialogContent.querySelector('input').focus();
}

function createTeam(form, fields) {
  const input = form.elements.namedItem('name');
  const name = fields.get('name').trim().replace(/\s+/g, ' ');
  const normalized = normalizedTeamName(name);
  let error = '';
  if (name.length < 2) error = 'Введите хотя бы два символа.';
  else if (teamEntries().some(([, team]) => normalizedTeamName(team.name) === normalized)) error = 'Команда с таким названием уже есть.';
  if (error) {
    input.setAttribute('aria-invalid', 'true');
    form.querySelector('#team-name-error').textContent = error;
    input.focus();
    return;
  }
  const words = name.split(' ');
  const initials = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  const id = 'team-' + (window.crypto?.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2));
  state.data.customTeams.push({ id, name, initials: initials.toLocaleUpperCase('ru'), color: 'cyan', scope: fields.get('scope').trim() });
  sync();
  openTeams(name);
}

function openMore() {
  setDialog('more', 'Материалы кейса', `<nav aria-label="Ссылки">${navLink('requirements.html', 'Функционал', 'book')}${navLink('ui-kit.html', 'UI-кит', 'layers')}${navLink('index.html', 'Адаптивная версия', 'monitor')}${navLink('mobile.html', 'Мобильный прототип', 'phone')}</nav>`);
}

function riskLabel(risk) {
  return { high: 'Высокий', medium: 'Средний', low: 'Низкий' }[risk];
}

function showDetail(id, openAI = false, resolving = false) {
  const item = incidentById(id);
  if (!item) return;
  state.detail = id;
  state.openAI = openAI;
  state.resolving = resolving;
  const history = item.history.map(entry =>
    `<li><time datetime="${new Date(entry.time).toISOString()}">${moscowTime.format(entry.time)}</time><span>${escapeHtml(entry.label)}</span></li>`
  ).join('');
  const ai = `
    <section class="detail-ai">
      <header>${icon('spark')}<h3>Разбор ИИ</h3><span class="ai-mini">Демонстрация</span></header>
      ${openAI ? `<p>${escapeHtml(item.summary)}</p>
        <dl><div><dt>Риск</dt><dd>${riskLabel(item.risk)} · ${escapeHtml(item.riskReason)}</dd></div>
        <div><dt>Кому передать</dt><dd>${escapeHtml(teamById(item.suggestedTeam)?.name || 'Требуется уточнение')} · ${escapeHtml(item.routeReason)}</dd></div>
        ${aiActions[item.id.slice(4)] ? `<div><dt>Что проверить</dt><dd>${escapeHtml(aiActions[item.id.slice(4)])}</dd></div>` : ''}
        <div><dt>Входные данные</dt><dd>Демонстрационное описание, сервис, приоритет и SLA.</dd></div></dl>
        <a class="detail-ai-link" href="requirements.html#ai">Как ИИ помогает координатору</a>`
        : '<button type="button" class="button secondary" data-action="reveal-ai">Показать разбор</button>'}
    </section>`;
  const actions = isActive(item) ? `
    <form class="assignment-form" data-form="assign">
      <label class="field"><span>Передать команде</span><select name="team" required>${selectOptions(teamOptions(), item.team, 'Выберите команду')}</select></label>
      <button class="button primary" type="submit">Назначить</button>
      <p class="field-error" role="status"></p>
    </form>
    ${resolving ? `<form data-form="resolve" class="resolve-form">
      <label class="field"><span>Комментарий к решению</span><textarea name="note" rows="2" required maxlength="240" placeholder="Что восстановили или проверили?"></textarea></label>
      <div class="dialog-actions"><button class="button secondary" type="button" data-action="cancel-resolve">Отмена</button><button class="button primary" type="submit">Подтвердить решение</button></div></form>`
      : '<button class="button secondary" data-action="start-resolve" type="button">Отметить решённым</button>'}` : '';
  setDialog('detail', item.id, `
    <div class="detail-title"><div>${priorityMarkup(item)} ${statusMarkup(item)}</div><h3>${escapeHtml(item.title)}</h3><p>${icon('pin')} ${escapeHtml(item.service)} · ${escapeHtml(item.location)}</p></div>
    <div class="detail-grid">
      <div><span>Команда</span>${teamMarkup(item.team)}</div>
      <div><span>SLA восстановления</span>${slaMarkup(item)}<small>До ${fullTime.format(item.deadline)} МСК</small></div>
    </div>
    ${ai}
    <div class="detail-history"><h3>История</h3><ol>${history}</ol></div>
    ${actions}`);
}

function openDemo() {
  setDialog('demo', 'Симуляция событий', `
    <p class="dialog-intro">Проверьте, как очередь, SLA и уведомления обновляются при новых событиях.</p>
    <div class="demo-choices">
      ${Object.entries(EVENTS).filter(([type]) => ['critical', 'assignment', 'resolved'].includes(type)).map(([type, event]) => `
        <button type="button" class="event-choice" data-action="simulate" data-value="${type}"><span class="event-icon tone-${event.tone}">${icon(event.icon)}</span><strong>${event.label}</strong>${icon('right')}</button>`).join('')}
    </div>
    <label class="switch-row"><span><strong>Автосимуляция</strong><small>Раз в 25 секунд, пока открыт экран</small></span><input id="auto-switch" type="checkbox" role="switch" ${state.auto ? 'checked' : ''}></label>
    <button type="button" class="button secondary" data-action="reset-demo">Сбросить демоданные</button>
    <p class="reset-hint">Добавленные команды сохранятся.</p>`);
}

function pushEvent(type, item, note) {
  const time = Date.now();
  state.data.events.unshift({ type, id: item.id, time });
  item.history.unshift({ label: note || EVENTS[type].label, time });
}

function sync(message) {
  state.data.lastUpdated = Date.now();
  persist();
  render();
  if (message) announce(message);
}

function assignIncident(item, team) {
  item.team = team;
  const type = team === 'coord' ? 'assignment' : 'routed';
  const name = teamById(team).name;
  pushEvent(type, item, 'Назначен команде «' + name + '»');
  return `${item.id} · назначен команде «${name}»`;
}

function resolveIncident(item, note) {
  item.status = 'done';
  item.resolvedAt = Date.now();
  pushEvent('resolved', item, 'Решён · ' + note);
  return `${item.id} · отмечен решённым`;
}

function simulate(type) {
  let message;
  if (type === 'critical') {
    const index = state.data.incidents.length - examples.length;
    const source = simulations[index % simulations.length];
    const number = Math.max(...state.data.incidents.map(item => Number(item.id.slice(4)))) + 1;
    const item = makeIncident([number, ...source.slice(1)], Date.now(), 0);
    state.data.incidents.unshift(item);
    pushEvent(type, item);
    message = 'Новый критический · ' + item.id;
  } else if (type === 'assignment') {
    const item = state.data.incidents.find(item => isActive(item) && item.team !== 'coord' && !item.team)
      || state.data.incidents.find(item => isActive(item) && item.team !== 'coord');
    message = item ? assignIncident(item, 'coord') : 'Все активные инциденты уже у координаторов';
  } else if (type === 'resolved') {
    const item = state.data.incidents.find(item => item.status === 'monitoring')
      || state.data.incidents.find(isActive);
    message = item ? resolveIncident(item, 'Восстановление подтверждено в симуляции.') : 'В очереди нет активных инцидентов';
  }
  sync(message);
  if (elements.dialog.open && elements.dialog.dataset.kind === 'detail' && state.detail) {
    showDetail(state.detail, state.openAI, state.resolving);
  }
}

function clearAll() {
  state.filters = { ...EMPTY_FILTERS };
  state.tab = 'all';
  state.search = '';
  elements.search.value = '';
  state.page = 1;
}

function focusAfterRender(action, value) {
  const candidates = app.querySelectorAll(`[data-action="${action}"]`);
  const target = Array.from(candidates).find(button => button.getClientRects().length && !button.disabled && (!value || button.dataset.value === value));
  target?.focus();
}

function metricFilter(key) {
  clearAll();
  if (key === 'critical' || key === 'done') state.tab = key;
  if (key === 'active') state.filters.status = 'active';
  if (key === 'risk') state.filters.sla = 'risk';
  renderQueue();
  document.querySelector('#queue-title').scrollIntoView({ block: 'nearest' });
}

app.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  const row = event.target.closest('[data-row]');
  if (!button && row) {
    showDetail(row.dataset.row);
    return;
  }
  if (!button) return;
  const { action, value } = button.dataset;
  switch (action) {
    case 'skip-main':
      event.preventDefault();
      document.querySelector(elements.analytics.hidden ? '#main' : '#analytics-title').focus();
      break;
    case 'events': openEvents(); break;
    case 'teams': openTeams(); break;
    case 'add-team': openTeamForm(); break;
    case 'back-teams': openTeams(); focusAfterRender('add-team'); break;
    case 'more': openMore(); break;
    case 'filter': openFilter(); break;
    case 'demo': openDemo(); break;
    case 'detail': showDetail(value); break;
    case 'detail-ai': showDetail(value, true); break;
    case 'reveal-ai':
      showDetail(state.detail, true, state.resolving);
      elements.dialogContent.querySelector('.detail-ai').scrollIntoView({ block: 'nearest' });
      break;
    case 'start-resolve':
      showDetail(state.detail, state.openAI, true);
      elements.dialogContent.querySelector('textarea')?.focus();
      break;
    case 'cancel-resolve': showDetail(state.detail, state.openAI); focusAfterRender('start-resolve'); break;
    case 'close': elements.dialog.close(); break;
    case 'metric': metricFilter(value); break;
    case 'tab':
      if (state.tab !== value) {
        state.tab = value;
        state.filters = { ...EMPTY_FILTERS };
        state.page = 1;
        renderQueue();
      }
      break;
    case 'sort':
      state.sort = { default: 'asc', asc: 'desc', desc: 'default' }[state.sort];
      state.page = 1;
      renderQueue();
      focusAfterRender('sort');
      break;
    case 'previous':
    case 'next':
      state.page += action === 'next' ? 1 : -1;
      renderQueue();
      focusAfterRender(action);
      if (document.activeElement === document.body) focusAfterRender(action === 'next' ? 'previous' : 'next');
      break;
    case 'drop-filter':
      state.filters[value] = '';
      state.page = 1;
      renderQueue();
      focusAfterRender('filter');
      break;
    case 'clear-filter':
      state.filters = { ...EMPTY_FILTERS };
      state.page = 1;
      renderQueue();
      elements.dialog.close();
      break;
    case 'clear-all':
      clearAll();
      renderQueue();
      elements.search.focus();
      break;
    case 'filter-team':
      clearAll();
      state.filters.team = value;
      state.filters.status = 'active';
      renderQueue();
      if (elements.dialog.open) elements.dialog.close();
      if (!elements.analytics.hidden) location.hash = 'main';
      break;
    case 'simulate':
      elements.dialog.close();
      simulate(value);
      break;
    case 'reset-demo':
      window.clearInterval(state.auto);
      state.auto = null;
      state.nextEvent = 0;
      state.sort = 'default';
      state.data = { ...initialData(), customTeams: state.data.customTeams };
      clearAll();
      elements.dialog.close();
      sync('Демоданные восстановлены');
      break;
  }
});

elements.search.addEventListener('input', () => {
  state.search = elements.search.value;
  state.page = 1;
  renderQueue();
});

elements.dialogContent.addEventListener('input', event => {
  if (event.target.id === 'team-search') renderTeamDirectory(event.target.value);
  else if (event.target.name === 'name' && event.target.form?.dataset.form === 'create-team') {
    event.target.removeAttribute('aria-invalid');
    elements.dialogContent.querySelector('#team-name-error').textContent = '';
  }
});

app.addEventListener('change', event => {
  if (event.target.id === 'analysis-range' || event.target.id === 'analysis-team') {
    if (event.target.id === 'analysis-range') state.analysisRange = event.target.value;
    else state.analysisTeam = event.target.value;
    renderAnalytics();
    return;
  }
  if (event.target.id !== 'auto-switch') return;
  if (event.target.checked) {
    const order = ['critical', 'assignment', 'resolved'];
    state.auto = window.setInterval(() => {
      if (document.hidden || elements.dialog.open) return;
      simulate(order[state.nextEvent % order.length]);
      state.nextEvent += 1;
    }, 25_000);
    elements.dialog.close();
    announce('Автосимуляция включена');
  } else {
    window.clearInterval(state.auto);
    state.auto = null;
    announce('Автосимуляция выключена');
  }
});

app.addEventListener('submit', event => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  const fields = new FormData(form);
  if (form.dataset.form === 'create-team') {
    createTeam(form, fields);
    return;
  }
  if (form.dataset.form === 'filter') {
    state.filters = Object.fromEntries(fields);
    state.page = 1;
    renderQueue();
    elements.dialog.close();
    return;
  }
  const item = incidentById(state.detail);
  if (!item || !isActive(item)) return;
  if (form.dataset.form === 'assign') {
    const team = fields.get('team');
    if (!teamById(team)) return;
    if (item.team === team) {
      form.querySelector('[role="status"]').textContent = 'Эта команда уже назначена';
      return;
    }
    const message = assignIncident(item, team);
    elements.dialog.close();
    sync(message);
  } else if (form.dataset.form === 'resolve') {
    const note = fields.get('note').trim();
    if (!note) {
      form.querySelector('textarea').focus();
      return;
    }
    const message = resolveIncident(item, note);
    elements.dialog.close();
    sync(message);
  }
});

elements.dialog.addEventListener('click', event => {
  if (event.target === elements.dialog) {
    const rect = elements.dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      elements.dialog.close();
    }
  }
});
elements.dialog.addEventListener('close', () => {
  if (state.returnFocus?.isConnected) state.returnFocus.focus();
  else document.querySelector(elements.analytics.hidden ? '#main' : '#analytics-title').focus({ preventScroll: true });
  state.returnFocus = null;
  state.detail = null;
});
window.addEventListener('storage', event => {
  if (event.key !== storageKey) return;
  state.data = loadData();
  render();
  if (elements.dialog.open && elements.dialog.dataset.kind === 'detail' && state.detail) {
    showDetail(state.detail, state.openAI, state.resolving);
  }
  if (elements.dialog.open && elements.dialog.dataset.kind === 'teams') {
    renderTeamDirectory(elements.dialogContent.querySelector('#team-search').value);
  }
});

window.addEventListener('hashchange', () => showView(true));
render();
showView();
window.setInterval(toggleTimers, 1000);
