import test from 'node:test';
import assert from 'node:assert/strict';
import { detailDate, detailSla } from '../src/features/detailPresentation.ts';
const now = Date.parse('2026-11-21T07:00:00Z');
const active = { stateEnum: 'WorkInProgress', stateId: 2, deadline: '2026-11-21T06:41:00Z' };
test('detail SLA displays elapsed and remaining time with hours and seconds', () => {
 assert.deepEqual(detailSla(active, now), { kind: 'late', label: 'Просрочка', value: '−00:19:00' });
 assert.equal(detailSla({ ...active, deadline: '2026-11-21T08:03:04Z' }, now).value, '01:03:04');
 assert.equal(detailSla({ ...active, deadline: '2026-11-19T07:00:00Z' }, now).value, '−48:00:00');
});
test('research and resolved incidents never show an active overdue timer', () => {
 for (const [stateEnum, value] of [['Research', 'Разбор причин'], ['Resolved', 'Завершён'], ['Closed', 'Закрыт']]) {
  assert.equal(detailSla({ ...active, stateEnum }, now).value, value);
 }
 assert.equal(detailSla({ ...active, deadline: null }, now).value, 'Не указан');
});
test('detail dates use Moscow time and missing dates have a safe placeholder', () => {
 assert.equal(detailDate(null), 'Не указано');assert.equal(detailDate('0001-01-01T00:00:00Z'), 'Не указано');assert.equal(detailDate('invalid'), 'Не указано');
 assert.equal(detailDate('2026-11-21T06:41:00Z'), '21 ноября 2026 г. в 09:41:00 МСК');
});
