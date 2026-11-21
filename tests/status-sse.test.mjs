import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApi } from '../tools/demo-api/index.mjs';
import { normalizeSnapshot } from '../src/data/wire.ts';
import { queryIncidents, headerAlerts } from '../src/domain/operations.ts';
import { stateOf, COORDINATOR_TEAM } from '../src/domain/incidents.ts';

test('atomic JSON status changes reach the shared snapshot, queue, open incident and header through one SSE connection', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'underctrl-status-sse-'));
 const path = join(dir, 'incidents.json'), now = Date.now();
 const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8'));
 const rows = [{ ...seed[0], stateEnum: 'Assigned', stateId: 0, state: 'Назначен',
  priorityId: 4, priority: 'Наивысший', assignedGroupName: '',
  submitDate: new Date(now).toISOString(), lastAssignmentToTeamDateTime: new Date(now).toISOString(),
  deadline: new Date(now + 3600_000).toISOString(), completionDate: null }];
 writeFileSync(path, JSON.stringify(rows));
 const api = await startApi({ port: 0, sourcePath: path, dbPath: join(dir, 'test.sqlite'), seedPath: path });
 const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12_000);
 let reader;
 try {
  const response = await fetch(`http://127.0.0.1:${api.port}/api/v1/events/stream?view=web`, { signal: controller.signal });
  reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  async function nextSnapshot() {
   while (true) {
    const end = buffer.indexOf('\n\n');
    if (end !== -1) {
     const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
     if (!frame.includes('event: snapshot')) continue;
     return normalizeSnapshot(JSON.parse(frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')));
    }
    const chunk = await reader.read();
    if (chunk.done) throw new Error('SSE connection closed before status update');
    buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
   }
  }
  const initial = await nextSnapshot();
  const openSysId = initial.items[0].sysId;
  assert.equal(headerAlerts(initial.items, now)[0].tone, 'critical');
  let revision = initial.revision;
  for (const [stateEnum, stateId, state, group, expectedHeader] of [
   ['Research', 20, 'Исследование ситуации', 'research', null],
   ['Resolved', 7, 'Завершен', 'resolved', null],
   ['WorkInProgress', 2, 'Выполняется', 'critical', 'critical'],
   ['Closed', 10, 'Закрыт', 'closed', null],
  ]) {
   Object.assign(rows[0], { stateEnum, stateId, state, completionDate: ['Resolved', 'Closed'].includes(stateEnum) ? new Date().toISOString() : null });
   writeFileSync(path + '.next', JSON.stringify(rows)); renameSync(path + '.next', path);
   const snapshot = await nextSnapshot();
   assert.equal(snapshot.revision, ++revision);
   const openIncident = snapshot.items.find(item => item.sysId === openSysId);
   assert.equal(stateOf(openIncident), stateEnum);
   const queue = queryIncidents(snapshot.items, { group: 'all' }, snapshot.revision, now);
   assert.equal(stateOf(queue.items.find(item => item.sysId === openSysId)), stateEnum);
   assert.equal(queryIncidents(snapshot.items, { group }, snapshot.revision, now).total, 1);
   assert.equal(headerAlerts(snapshot.items, now)[0]?.tone ?? null, expectedHeader);
   assert.equal(snapshot.events[0].current.stateEnum, stateEnum);
   assert.ok(snapshot.events[0].fields.includes('stateEnum'));
  }
  // Research is excluded from critical, but still waits for a resolution team.
  Object.assign(rows[0], { stateEnum: 'Research', stateId: 20, state: 'Исследование ситуации',
   assignedGroupName: COORDINATOR_TEAM, lastAssignmentToTeamDateTime: new Date(now - 9 * 60_000).toISOString() });
  writeFileSync(path + '.next', JSON.stringify(rows)); renameSync(path + '.next', path);
  const snapshot = await nextSnapshot();
  assert.equal(headerAlerts(snapshot.items, now)[0].tone, 'warning');
  assert.equal(queryIncidents(snapshot.items, { group: 'critical' }, snapshot.revision, now).total, 0);
  assert.equal(queryIncidents(snapshot.items, { group: 'coordinators' }, snapshot.revision, now).total, 1);
 } finally {
  clearTimeout(timeout); controller.abort(); await reader?.cancel().catch(() => {});
  await api.close(); rmSync(dir, { recursive: true, force: true });
 }
});
