'use strict';

const chartTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const chartDay = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', day: 'numeric', month: 'short'
});
const chartDateTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', day: 'numeric', month: 'short',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const numberFormat = new Intl.NumberFormat('ru-RU');

function analyticsReport(incidents, days, selectedTeam, now = Date.now()) {
  const start = now - days * 24 * 60 * MINUTE;
  const bucketCount = days === 7 ? 7 : 6;
  const bucketSize = (now - start) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    start: start + index * bucketSize,
    end: start + (index + 1) * bucketSize,
    created: 0,
    resolved: 0
  }));
  const services = new Map();
  const workload = new Map();
  let created = 0;
  let resolved = 0;
  let measuredSla = 0;
  let onTime = 0;
  let measuredDuration = 0;
  let totalDuration = 0;
  const inPeriod = time => Number.isFinite(time) && time >= start && time <= now;
  const bucketFor = time => buckets[Math.min(bucketCount - 1, Math.floor((time - start) / bucketSize))];

  incidents.forEach(item => {
    if (selectedTeam && item.team !== selectedTeam) return;
    if (item.status !== 'done') {
      const team = item.team || 'unassigned';
      const active = workload.get(team) || { key: team, total: 0, critical: 0 };
      active.total += 1;
      active.critical += Number(item.priority === 1);
      workload.set(team, active);
    }
    if (inPeriod(item.createdAt)) {
      created += 1;
      bucketFor(item.createdAt).created += 1;
      const service = services.get(item.service) || { key: item.service, total: 0, critical: 0 };
      service.total += 1;
      service.critical += Number(item.priority === 1);
      services.set(item.service, service);
    }
    if (item.status !== 'done' || !inPeriod(item.resolvedAt)) return;
    resolved += 1;
    bucketFor(item.resolvedAt).resolved += 1;
    if (Number.isFinite(item.deadline)) {
      measuredSla += 1;
      onTime += Number(item.resolvedAt <= item.deadline);
    }
    if (Number.isFinite(item.createdAt) && item.createdAt <= item.resolvedAt) {
      measuredDuration += 1;
      totalDuration += item.resolvedAt - item.createdAt;
    }
  });

  const ranked = map => [...map.values()].sort((a, b) => b.total - a.total || b.critical - a.critical);
  return {
    days, buckets, created, resolved, measuredSla, onTime,
    averageDuration: measuredDuration ? totalDuration / measuredDuration : null,
    services: ranked(services).slice(0, 5),
    workload: ranked(workload)
  };
}

function durationLabel(duration) {
  if (duration === null) return '—';
  const minutes = Math.round(duration / MINUTE);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} ч ${minutes % 60} мин` : `${minutes} мин`;
}

function analysisMetric([label, value, note, glyph, tone]) {
  return `<article class="metric surface analysis-metric">
    <span class="metric-top"><span class="metric-icon tone-${tone}">${icon(glyph)}</span><span class="metric-label">${label}</span></span>
    <strong class="metric-count">${value}</strong><small>${note}</small>
  </article>`;
}

function flowMarkup(report, tableOpen) {
  const { days, buckets, created, resolved } = report;
  const maximum = Math.max(2, ...buckets.flatMap(bucket => [bucket.created, bucket.resolved]));
  const scale = Math.ceil(maximum / 2) * 2;
  const format = days === 1 ? chartTime : chartDay;
  const formatInterval = bucket => `${chartDateTime.format(bucket.start)} – ${chartDateTime.format(bucket.end)}`;
  const bar = (count, kind) => `<i class="analysis-bar bar-${kind}" style="height:${100 * count / scale}%"><span>${count || ''}</span></i>`;
  return `<section class="analysis-panel surface" aria-labelledby="flow-title">
    <div class="analysis-panel-heading"><div><h2 id="flow-title">Динамика инцидентов</h2><p>Регистрации и решения по интервалам</p></div></div>
    <div class="analysis-legend"><span><i class="bar-created"></i>Новые</span><span><i class="bar-resolved"></i>Решённые</span></div>
    ${created || resolved ? `<div class="analysis-chart" aria-hidden="true">
      <div class="analysis-axis"><span>${scale}</span><span>${scale / 2}</span><span>0</span></div>
      <div class="analysis-plot" style="--buckets:${buckets.length}">${buckets.map(bucket =>
        `<div class="analysis-bucket" title="${formatInterval(bucket)} · новые: ${bucket.created}, решённые: ${bucket.resolved}">
          <div class="analysis-bars">${bar(bucket.created, 'created')}${bar(bucket.resolved, 'resolved')}</div>
          <span class="analysis-bucket-label">${format.format(bucket.end)}</span>
        </div>`).join('')}</div></div>` : '<p class="analysis-empty">За выбранный период регистраций и решений нет.</p>'}
    <details class="analysis-data" ${tableOpen ? 'open' : ''}>
      <summary>Данные графика</summary>
      <table><thead><tr><th scope="col">Интервал, МСК</th><th scope="col">Новые</th><th scope="col">Решённые</th></tr></thead>
        <tbody>${buckets.map(bucket => `<tr><th scope="row">${formatInterval(bucket)}</th><td>${bucket.created}</td><td>${bucket.resolved}</td></tr>`).join('')}</tbody>
      </table>
    </details>
  </section>`;
}

function analyticsMarkup(report, renderTeam, tableOpen) {
  const percentage = report.measuredSla ? Math.round(100 * report.onTime / report.measuredSla) + '%' : '—';
  const metrics = [
    ['Новые', numberFormat.format(report.created), 'Зарегистрировано за период', 'inbox', 'blue'],
    ['Решённые', numberFormat.format(report.resolved), 'Закрыто за период', 'circleCheck', 'green'],
    ['Выполнение SLA', percentage, report.measuredSla ? `${report.onTime} из ${report.measuredSla} с заданным SLA` : 'Нет решений с заданным SLA', 'clock', 'warning'],
    ['Среднее время восстановления', durationLabel(report.averageDuration), 'От регистрации до решения', 'pulse', 'purple']
  ];
  const maxService = report.services[0]?.total || 1;
  return `<section class="metrics analysis-metrics" aria-label="Показатели за выбранный период">${metrics.map(analysisMetric).join('')}</section>
    <div class="analysis-layout">
      ${flowMarkup(report, tableOpen)}
      <section class="analysis-panel surface" aria-labelledby="services-title">
        <div class="analysis-panel-heading"><div><h2 id="services-title">Инциденты по сервисам</h2><p>До 5 сервисов по новым регистрациям</p></div><span class="metric-icon tone-blue">${icon('layers')}</span></div>
        ${report.services.length ? `<ul class="service-ranking">${report.services.map(service =>
          `<li><div><strong>${escapeHtml(service.key)}</strong><span>${service.critical ? `<small>${service.critical} P1</small>` : ''}<b>${service.total}</b></span></div>
            <div class="ranking-track" aria-hidden="true"><i style="width:${100 * service.total / maxService}%"></i></div></li>`
        ).join('')}</ul>` : '<p class="analysis-empty">За выбранный период новых инцидентов нет.</p>'}
      </section>
      <section class="analysis-panel surface analysis-workload" aria-labelledby="workload-title">
        <div class="analysis-panel-heading"><div><h2 id="workload-title">Нагрузка команд</h2><p>Активные инциденты сейчас · период на этот блок не влияет</p></div><span class="metric-icon tone-purple">${icon('people')}</span></div>
        ${report.workload.length ? `<div class="analysis-teams">${report.workload.map(team =>
          `<button class="team-entry workload-entry" type="button" data-action="filter-team" data-value="${escapeHtml(team.key)}">${renderTeam(team.key)}
            <span class="workload-numbers">${team.critical ? `<span class="priority priority-1">${team.critical} P1</span>` : ''}<strong>${team.total}</strong></span>
            ${icon('right')}</button>`
        ).join('')}</div>` : '<p class="analysis-empty">В текущей очереди активных инцидентов нет.</p>'}
      </section>
    </div>`;
}
