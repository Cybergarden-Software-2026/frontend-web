import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCoordinatorSessionStore, coordinatorAuth } from '../src/data/coordinatorSession.ts';
import { api, ApiError } from '../src/data/api.ts';
function memoryStorage() {
 const values = new Map();
 return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values };
}
test('remembered coordinator key survives a fresh store; only token and timestamp are persisted', () => {
 const storage = memoryStorage(), first = createCoordinatorSessionStore(storage, 'session:test');
 first.save('  test-coordinator-key  ', true);
 assert.deepEqual(Object.keys(JSON.parse(storage.getItem('session:test'))).sort(), ['savedAt', 'token']);
 const restored = createCoordinatorSessionStore(storage, 'session:test').getSnapshot().session;
 assert.equal(restored.token, 'test-coordinator-key');
 assert.equal(restored.remembered, true);
 assert.equal(createCoordinatorSessionStore(storage, 'session:other-api').getSnapshot().session, null);
});
test('opting out of remember removes a previously persisted session', () => {
 const storage = memoryStorage(), store = createCoordinatorSessionStore(storage, 'session');
 store.save('old-key');store.save('tab-only-key', false);
 assert.equal(store.getSnapshot().session.token, 'tab-only-key');
 assert.equal(store.getSnapshot().session.remembered, false);
 assert.equal(createCoordinatorSessionStore(storage, 'session').getSnapshot().session, null);
});
test('logout removes persisted credentials and notifies subscribers', () => {
 const storage = memoryStorage(), store = createCoordinatorSessionStore(storage, 'session');let changes = 0;
 const unsubscribe = store.subscribe(() => changes++);
 store.save('test-key');store.clear();unsubscribe();store.save('other-key', false);
 assert.equal(changes, 2);assert.equal(storage.getItem('session'), null);
});
test('empty and corrupt sessions are rejected without crashing the interface', () => {
 const storage = memoryStorage();storage.setItem('session', '{broken');
 const store = createCoordinatorSessionStore(storage, 'session');
 assert.equal(store.getSnapshot().session, null);
 assert.throws(() => store.save('  '));
 storage.setItem('session', JSON.stringify({ token: {}, savedAt: Date.now() }));store.reload();
 assert.equal(store.getSnapshot().session, null);
});
test('unavailable storage keeps a usable session in memory', () => {
 const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
 const store = createCoordinatorSessionStore(storage, 'session');
 store.save('test-key');assert.equal(store.getSnapshot().session.token, 'test-key');assert.equal(store.getSnapshot().session.remembered, false);
 store.clear();assert.equal(store.getSnapshot().session, null);
});
test('storage changes from another tab restore or end the current session', () => {
 const storage = memoryStorage(), first = createCoordinatorSessionStore(storage, 'session'), second = createCoordinatorSessionStore(storage, 'session');
 first.save('shared-key');second.reload();assert.equal(second.getSnapshot().session.token, 'shared-key');
 first.clear();second.reload();assert.equal(second.getSnapshot().session, null);
});
test('saved key is automatically sent only to assignment, never to reads', async t => {
 const item = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8'))[0];
 const snapshot = { revision: 1, items: [item], events: [], serverTime: new Date().toISOString(), updatedAt: new Date().toISOString(), source: { path: 'test.json', readAt: null, error: null }, itsmUrlTemplate: null };
 const calls = [];
 coordinatorAuth.save('saved-test-key');t.after(() => coordinatorAuth.clear());
 t.mock.method(globalThis, 'fetch', async (url, init) => {
  calls.push({ url, authorization: init.headers.get('Authorization') });
  return Response.json(url.includes('/incidents?') ? { revision: 1, items: [item], page: 1, pageSize: 9, totalPages: 1, total: 1 } : snapshot);
 });
 await api.snapshot();await api.teams();await api.incidents({});await api.analysis(item.sysId);await api.assign(item.sysId, 'Ops', 1);
 assert.deepEqual(calls.map(call => call.authorization), [null, null, null, null, 'Bearer saved-test-key']);
 assert.ok(calls.every(call => !call.url.includes('saved-test-key')));
});
test('401 on assignment ends the saved session and asks for a fresh key', async t => {
 coordinatorAuth.save('rejected-test-key');t.after(() => coordinatorAuth.clear());
 t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Unauthorized' }, { status: 401 }));
 await assert.rejects(api.assign('id', 'Ops', 1), error => error instanceof ApiError && error.status === 401);
 assert.equal(coordinatorAuth.getSnapshot().session, null);assert.ok(coordinatorAuth.getSnapshot().notice);
});
test('a late 401 from an old session does not sign out a newer session', async t => {
 coordinatorAuth.save('old-test-key');t.after(() => coordinatorAuth.clear());let complete;
 t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { complete = resolve; }));
 const pending = api.assign('id', 'Ops', 1);coordinatorAuth.save('new-test-key');
 complete(Response.json({ error: 'Unauthorized' }, { status: 401 }));
 await assert.rejects(pending, error => error instanceof ApiError && error.status === 401);
 assert.equal(coordinatorAuth.getSnapshot().session.token, 'new-test-key');
});
