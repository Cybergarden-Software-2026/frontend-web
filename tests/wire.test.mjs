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

test('web HTTP reads and assignment normalize raw records and scope the bearer to the explicit write', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/assignment') && !init.headers.has('Authorization')) {
      return new Response('Authentication required', { status: 401 });
    }
    return Response.json(url.includes('/incidents?')
      ? { items: [raw], total: 1, page: 1, pageSize: 9, totalPages: 1, revision: 5 }
      : snapshot);
  });
  const fetched = await api.snapshot();
  assert.equal(fetched.items[0].service, '');
  assert.equal(calls[0].url, '/api/v1/snapshot?view=web');
  await assert.rejects(api.assign('uuid/one', 'Ops', 5), e => e instanceof ApiError && e.status === 401);
  const assigned = await api.assign('uuid/one', 'Ops', 5, 'test-key');
  assert.equal(assigned.items[0].assignedGroupName, '');
  assert.equal(calls[2].url, '/api/v1/incidents/uuid%2Fone/assignment');
  assert.equal(calls[2].init.headers.get('Authorization'), 'Bearer test-key');
  assert.deepEqual(JSON.parse(calls[2].init.body), { team: 'Ops', expectedRevision: 5 });
  const page = await api.incidents({});
  assert.deepEqual(page.items, fetched.items);
  assert.equal(calls[3].url, '/api/v1/incidents?page=1');
  assert.deepEqual(calls.map(c => c.init.headers.has('Authorization')), [false, false, true, false]);
});
