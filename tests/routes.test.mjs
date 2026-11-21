import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoute, incidentHash, backLabels } from '../src/app/routes.ts';

test('incident routes preserve the originating screen and string identifiers', () => {
 for (const page of ['incidents', 'events', 'teams', 'analytics', 'settings', 'problems']) {
  const id = '179413934903718013';
  assert.deepEqual(readRoute(incidentHash(id, page)), { page, incidentId: id });
  assert.ok(backLabels[page].startsWith('Назад'));
 }
});
test('existing incident links remain valid for queue and events', () => {
 assert.deepEqual(readRoute('#incidents?incident=179413934903718013'), { page: 'incidents', incidentId: '179413934903718013' });
 assert.deepEqual(readRoute('#events?incident=INC-1'), { page: 'events', incidentId: 'INC-1' });
});
test('incident links encode separators and recover their original identifier', () => {
 assert.deepEqual(readRoute(incidentHash('incident/number ?&', 'problems')), { page: 'problems', incidentId: 'incident/number ?&' });
});
test('direct incident links and invalid origins return to the queue', () => {
 assert.deepEqual(readRoute('#incident/INC-1'), { page: 'incidents', incidentId: 'INC-1' });
 assert.deepEqual(readRoute('#incident/INC-1?from=https://outside.example'), { page: 'incidents', incidentId: 'INC-1' });
 assert.deepEqual(readRoute('#unknown'), { page: 'incidents', incidentId: null });
});
test('malformed identifiers do not crash route parsing', () => {
 assert.deepEqual(readRoute('#incident/%E0%A4?from=events'), { page: 'events', incidentId: null });
 assert.deepEqual(readRoute(''), { page: 'incidents', incidentId: null });
});
