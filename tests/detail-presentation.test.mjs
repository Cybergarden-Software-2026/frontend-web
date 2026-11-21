import test from 'node:test';
import assert from 'node:assert/strict';
import { displaySlaKind } from '../src/domain/deadlineDisplay.ts';
import { slaKind, belongs } from '../src/domain/incidents.ts';
import { detailDate, detailSla } from '../src/features/detailPresentation.ts';
const now = Date.parse('2026-11-21T07:00:00Z');
const active = { stateEnum: 'WorkInProgress', stateId: 2, deadline: '2026-11-21T06:41:00Z' };
test('detail SLA displays elapsed and remaining time with hours and seconds', () => {
 assert.deepEqual(detailSla(active, now), { kind: 'late', label: 'Просрочка', value: '−00:19:00' });
 assert.equal(detailSla({ ...active, deadline: '2026-11-21T08:03:04Z' }, now).value, '01:03:04');
 assert.equal(detailSla({ ...active, deadline: '2026-11-19T07:00:00Z' }, now).value, '−48:00:00');
});
test('resolved and closed incidents never show an active overdue timer', () => {
 for (const [stateEnum, value] of [['Resolved', '00:00:00'], ['Closed', '00:00:00']]) {
  assert.equal(detailSla({ ...active, stateEnum }, now).value, value);
 }
 assert.equal(detailSla({ ...active, deadline: null }, now).value, '--:--:--');
});
test('detail dates use Moscow time and missing dates have a safe placeholder', () => {
 assert.equal(detailDate(null), 'Не указано');assert.equal(detailDate('0001-01-01T00:00:00Z'), 'Не указано');assert.equal(detailDate('invalid'), 'Не указано');
 assert.equal(detailDate('2026-11-21T06:41:00Z'), '21 ноября 2026 г. в 09:41:00 МСК');
});

test('research displays an explicit deadline without changing its server SLA class or active priority groups', () => {
 const item = { ...active, stateEnum: 'Research', stateId: 20, priorityId: 4, submitDate: new Date(now-90*60_000).toISOString() };
 assert.deepEqual(detailSla(item, now), { kind: 'late', label: 'Просрочка', value: '−00:19:00' });
 assert.equal(displaySlaKind(item, now), 'late');assert.equal(slaKind(item, now), 'research');
 assert.equal(belongs(item, 'critical'), false);assert.equal(belongs(item, 'high'), false);
 assert.equal(detailSla({ ...item, deadline: '2026-11-21T08:03:04Z' }, now).value, '01:03:04');
 assert.equal(displaySlaKind({ ...item, deadline: '2026-11-21T07:10:00Z' }, now), 'soon');
});
test('research handles missing deadlines and updates the display as time and deadline change', () => {
 const item = { ...active, stateEnum: 'Research', stateId: 20, deadline: '2026-11-21T07:00:01Z' };
 assert.equal(detailSla(item, now).value, '00:00:01');
 assert.equal(detailSla(item, now + 2000).value, '−00:00:01');
 assert.equal(detailSla({ ...item, deadline: '2026-11-21T09:00:00Z' }, now).value, '02:00:00');
 for (const deadline of [null, '', '0001-01-01T00:00:00Z'])assert.equal(detailSla({ ...item, deadline }, now).value, '--:--:--');
});

test('deadline color category uses a percentage rather than a fixed thirty minutes', () => {
 const record={...active,submitDate:new Date(now-9*3600_000).toISOString(),deadline:new Date(now+2*3600_000).toISOString()};
 assert.equal(displaySlaKind(record,now),'soon');
 const short={...record,submitDate:new Date(now-5*60_000).toISOString(),deadline:new Date(now+15*60_000).toISOString()};
 assert.equal(displaySlaKind(short,now),'normal');
 const edge={...record,submitDate:new Date(now-80*60_000).toISOString(),deadline:new Date(now+20*60_000).toISOString()};
 assert.equal(displaySlaKind(edge,now),'normal');assert.equal(displaySlaKind(edge,now+1),'soon');
 assert.equal(displaySlaKind(record,now+3*3600_000),'late');
 for(const stateEnum of ['Resolved','Closed'])assert.ok(['restored','closed'].includes(displaySlaKind({...record,stateEnum},now)));
});
