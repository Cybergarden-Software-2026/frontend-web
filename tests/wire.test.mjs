import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/data/api.ts';
import { normalizeIncident, normalizeSnapshot } from '../src/data/wire.ts';
import { headerAlerts, detectMassProblems, queryIncidents } from '../src/domain/operations.ts';
import { stateOf } from '../src/domain/incidents.ts';

const raw = {
  sysId: 'uuid-1', id: 'INC-1', assignedGroupName: null, service: null,
  header: 104, description: false, stateEnum: null, stateId: ' 2 ', priorityId: 4,
  assignedEmployeeLogin: null, isDouble: 'Нет', isMaster: 'ДА', urgentTag: { v: 2 },
  submitDate: '2026-11-21 10:00:00', lastAssignmentToTeamDateTime: '2026-11-21 10:01:00',
  deadline: '2026-11-21 10:05:00', completionDate: '0001-01-01T00:00:00',
  dashboard: { sourceDates: {
    submitDate: '2026-11-21T07:00:00Z', lastAssignmentToTeamDateTime: '2026-11-21T07:01:00Z',
    deadline: '2026-11-21T07:05:00Z', completionDate: null,
  } },
};
const snapshot = {
  revision: 5, items: [raw],
  serverTime: '2026-11-21T07:10:00Z', updatedAt: '2026-11-21T07:10:00Z',
  events: [{ eventId: 4, revision: 5, sysId: raw.sysId, incidentId: raw.id, header: null,
    types: ['team'], fields: ['assignedGroupName'], at: '2026-11-21T07:10:00Z',
    previous: raw, current: null }], source: { path: 'fixture.json', readAt: null, error: null },
  itsmUrlTemplate: null,
};

test('backend scalar and nullable fields are safe for queue, alerts, event history and clusters', () => {
  const snapshotView = normalizeSnapshot(snapshot);
  const [item] = snapshotView.items;
  assert.equal(item.assignedGroupName, '');
  assert.equal(item.service, '');
  assert.equal(item.assignedEmployeeLogin, '');
  assert.equal(item.header, '104');
  assert.equal(item.description, 'false');
  assert.equal(stateOf(item), 'WorkInProgress');
  assert.equal(item.isMaster, true);
  assert.equal(item.isDouble, false);
  assert.deepEqual(item.urgentTag, { v: 2 });
  assert.equal(item.completionDate, null);
  assert.equal(item.submitDate, raw.dashboard.sourceDates.submitDate);
  const now = Date.parse(snapshot.serverTime);
  assert.equal(headerAlerts([item], now)[0].waitingSince, Date.parse('2026-11-21T07:01:00Z'));
  assert.equal(queryIncidents([item], { group: 'critical', q: '104', sla: 'late' }, 5, now).total, 1);
  assert.deepEqual(detectMassProblems([item, { ...item, sysId: 'uuid-2' }]), []);
  assert.equal(snapshotView.events[0].previous.assignedGroupName, '');
  assert.equal(snapshotView.events[0].current, null);
  assert.equal(snapshotView.events[0].header, '');
  assert.deepEqual(normalizeSnapshot(snapshotView), snapshotView);
  assert.equal(raw.assignedGroupName, null);
  assert.equal(normalizeIncident({ ...raw, stateEnum: 'Research', stateId: null }).stateId, null);
});

test('wire keeps raw status text and accepts source decimal codes without coercing invalid formats', () => {
  const original = { ...raw, stateEnum: 'CloseD', state: 'Статус выгрузки', stateId: ' ٢ ',
    dashboard: { ...raw.dashboard, normalizedState: 'Research' } };
  const incident = normalizeIncident(original);
  assert.equal(stateOf(incident), 'Research');
  assert.equal(incident.stateEnum, 'CloseD');
  assert.equal(incident.state, 'Статус выгрузки');
  assert.equal(incident.stateId, 2);

  for (const [source, expected] of [['020', 'Research'], ['𝟙𝟘', 'Closed'], [0, 'Assigned'],
    ['2e0', 'Unknown'], ['0xA', 'Unknown'], ['10.0', 'Unknown'], [false, 'Unknown']]) {
    const historical = normalizeIncident({ ...raw, dashboard: null, stateEnum: 'FutureState', stateId: source });
    assert.equal(stateOf(historical), expected, String(source));
  }
});

test('coordination claim is independent of ITSM state and distinguishes unsupported data', async t => {
  const coordinationClaim = { login: 'shift-a', displayName: 'Анна', claimedAt: '2026-11-21T07:00:00Z' };
  const claimed = { ...raw, coordinationClaim };
  t.mock.method(globalThis, 'fetch', async url => Response.json(url.includes('?view=web') && url.includes('/incidents/')
    ? { incident: claimed, revision: 6 }
    : { ...snapshot, items: [claimed], revision: 6 }));

  const [snapshotView, page, detail] = await Promise.all([api.snapshot(), api.incidents({}), api.incident(raw.sysId)]);
  for (const incident of [snapshotView.items[0], page.items[0], detail.incident]) {
    assert.deepEqual(incident.coordinationClaim, coordinationClaim);
    assert.equal(stateOf(incident), stateOf(normalizeIncident(raw)));
  }
  assert.equal(normalizeIncident({ ...raw, coordinationClaim: null }).coordinationClaim, null);
  assert.equal(normalizeIncident(raw).coordinationClaim, undefined);
  assert.equal(normalizeIncident({ ...raw, coordinationClaim: { login: 1 } }).coordinationClaim, undefined);
});

test('claim and release use the web session and surface a concurrent claim conflict', async t => {
  const calls = [];
  const coordinationClaim = { login: 'shift-a', displayName: 'Анна', claimedAt: '2026-11-21T07:00:00Z' };
  const conflict = { code: 'COORDINATION_ALREADY_CLAIMED', message: 'Инцидент уже взят в работу' };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 3) return Response.json(conflict, { status: 409 });
    return Response.json({ coordinationClaim: init.method === 'PUT' ? coordinationClaim : null, revision: 6 + calls.length });
  });

  assert.deepEqual(await api.setCoordinationClaim('uuid/one', true), { coordinationClaim, revision: 7 });
  assert.deepEqual(await api.setCoordinationClaim('uuid/one', false), { coordinationClaim: null, revision: 8 });
  await assert.rejects(api.setCoordinationClaim('uuid/one', true), error =>
    error instanceof ApiError && error.status === 409 && error.code === conflict.code);
  assert.deepEqual(calls.map(call => call.init.method), ['PUT', 'DELETE', 'PUT']);
  for (const { url, init } of calls) {
    assert.equal(url, '/api/v1/incidents/uuid%2Fone/coordination-claim');
    assert.equal(init.credentials, 'include');
    assert.equal(init.body, undefined);
    assert.equal(init.headers.has('Authorization'), false);
  }
});

test('web HTTP snapshot, queue, and keyless assignment use the same incident normalization', async t => {
  const calls = [];
  const conflict = 'Данные изменились. Проверьте актуальную команду и повторите назначение.';
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/assignment')) {
      const { team, expectedRevision } = JSON.parse(init.body);
      if (expectedRevision !== snapshot.revision) {
        return Response.json({ error: conflict }, { status: 409 });
      }
      return Response.json({ ...snapshot, revision: 6, items: [{ ...raw, assignedGroupName: ` ${team} ` }] });
    }
    return Response.json(url.includes('/incidents?')
      ? { items: [raw], total: 1, page: 1, pageSize: 9, totalPages: 1, revision: 5 }
      : snapshot);
  });
  const fetched = await api.snapshot();
  assert.equal(fetched.items[0].service, '');
  assert.equal(calls[0].url, '/api/v1/snapshot?view=web');

  const assigned = await api.assign('uuid/one', 'Ops', fetched.revision);
  assert.equal(assigned.items[0].assignedGroupName, 'Ops');
  assert.equal(assigned.revision, 6);
  assert.equal(calls[1].url, '/api/v1/incidents/uuid%2Fone/assignment');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[1].init.body), { team: 'Ops', expectedRevision: 5 });
  await assert.rejects(api.assign('uuid/one', 'Ops', 4), e =>
    e instanceof ApiError && e.status === 409 && e.message === conflict);

  const page = await api.incidents({});
  assert.deepEqual(page.items, fetched.items);
  assert.equal(calls[3].url, '/api/v1/incidents?page=1');
  assert.ok(calls.every(({ init }) => !init.headers.has('Authorization')));
});

test('incident details use web UTC fields and history follows an incident-specific cursor', async t => {
  const calls = [];
  const controller = new AbortController();
  const key = 'uuid/one';
  const cursor = 'v1:event:4';
  const detailPath = '/api/v1/incidents/uuid%2Fone?view=web';
  const eventsPath = '/api/v1/incidents/uuid%2Fone/events?limit=3';
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(url);
    assert.equal(init.signal, controller.signal);
    if (url === detailPath) {
      return Response.json({ incident: raw, revision: 12, details: { isPresent: false } });
    }
    if (url === eventsPath) return Response.json({ items: snapshot.events, nextCursor: cursor });
    assert.equal(url, eventsPath + '&beforeId=' + encodeURIComponent(cursor));
    return Response.json({ items: [], nextCursor: null });
  });

  const detail = await api.incident(key, controller.signal);
  assert.deepEqual(detail, { incident: normalizeIncident(raw), revision: 12, isPresent: false });
  const firstPage = await api.incidentEvents(key, undefined, controller.signal);
  assert.deepEqual(firstPage.items, normalizeSnapshot(snapshot).events);
  assert.equal(firstPage.nextCursor, cursor);
  assert.deepEqual(await api.incidentEvents(key, firstPage.nextCursor, controller.signal), {
    items: [],
    nextCursor: null,
  });
  assert.deepEqual(calls, [detailPath, eventsPath, eventsPath + '&beforeId=' + encodeURIComponent(cursor)]);
});

test('shift statistics and mass problem curation use server ranges and revisions', async t => {
  const calls = [];
  const controller = new AbortController();
  const from = Date.parse('2026-11-21T07:00:00Z');
  const to = from + 12 * 3600_000;
  const statistics = {
    source: 'api', coordinator: { id: 'shift', name: 'Смена координаторов' }, start: from, end: to,
    transferred: 0, critical: 0, measured: 0, averageMs: null, kpiMet: 0, kpiPercent: null,
    transfers: [],
  };
  const group = {
    id: 'uuid-1-uuid-2', title: 'Оплата', reason: 'Один сервис',
    sysIds: ['uuid-1', 'uuid-2'], incidentIds: ['INC-1', 'INC-2'],
  };
  const initial = { revision: 7, items: [group], exclusions: [] };
  const edited = {
    revision: 8, items: [], exclusions: [{
      sysId: 'uuid-1', incidentId: 'INC-1', header: 'Сбой оплаты', groupTitle: 'Оплата',
      contextKey: 'context-1', excludedAt: to,
    }],
  };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const path = new URL(url, 'https://underctrl.example');
    calls.push({ path, init });
    if (path.pathname === '/api/v1/statistics/shift') return Response.json(statistics);
    assert.equal(path.pathname, '/api/v1/problems/clusters');
    return Response.json(init.method === 'PATCH' ? edited : initial);
  });

  assert.deepEqual(await api.shiftStatistics(from, to, controller.signal), statistics);
  assert.deepEqual(Object.fromEntries(calls[0].path.searchParams), {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
  });
  assert.equal(calls[0].init.signal, controller.signal);

  const clusters = await api.massClusters(controller.signal);
  assert.deepEqual(clusters, initial);
  assert.equal(calls[1].init.signal, controller.signal);
  const edit = { action: 'exclude', groupId: group.id, sysId: 'uuid-1' };
  assert.deepEqual(await api.editMassClusters(edit, clusters.revision), edited);
  assert.equal(calls[2].init.method, 'PATCH');
  assert.equal(calls[2].init.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[2].init.body), { ...edit, expectedRevision: 7 });
  assert.ok(calls.every(({ init }) => !init.headers.has('Authorization')));
});
