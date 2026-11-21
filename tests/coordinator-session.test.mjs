import assert from 'node:assert/strict';
import test from 'node:test';
import { api, ApiError, onApiUnauthorized } from '../src/data/api.ts';

test('session uses the HTTP-only cookie through status, sign-in, and 204 sign-out', async t => {
 const calls = [];
 t.mock.method(globalThis, 'fetch', async (url, init) => {
  calls.push({ url, init });
  if (init.method === 'DELETE') return new Response(null, { status: 204 });
  return Response.json({ required: true, authenticated: init.method === 'POST' });
 });

 assert.deepEqual(await api.coordinatorSession(), { required: true, authenticated: false });
 assert.deepEqual(await api.signInCoordinator('fixture-key', false), { required: true, authenticated: true });
 assert.equal(await api.signOutCoordinator(), undefined);

 assert.equal(calls.length, 3);
 for (const { url, init } of calls) {
  assert.equal(url, '/api/v1/auth/coordinator/session');
  assert.equal(init.credentials, 'include');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.headers.has('Authorization'), false);
 }
 assert.deepEqual(JSON.parse(calls[1].init.body), { key: 'fixture-key', remember: false });
 assert.equal(calls[1].init.headers.get('Content-Type'), 'application/json');
 assert.equal(calls[0].init.body, undefined);
 assert.equal(calls[2].init.body, undefined);
});

test('only 401 from a protected request triggers a return to login', async t => {
 let unauthorized = 0;
 t.after(onApiUnauthorized(() => { unauthorized++; }));
 t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Unauthorized' }, { status: 401 }));

 await assert.rejects(api.signInCoordinator('invalid-key', false), error => error instanceof ApiError && error.status === 401);
 assert.equal(unauthorized, 0);
 await assert.rejects(api.snapshot(), error => error instanceof ApiError && error.status === 401);
 assert.equal(unauthorized, 1);
});

test('late unauthorized response from a prior session cannot sign out the new session', async t => {
 const stale = Promise.withResolvers();
 let unauthorized = 0;
 t.after(onApiUnauthorized(() => { unauthorized++; }));
 t.mock.method(globalThis, 'fetch', async (_url, init) => init.method === 'POST'
  ? Response.json({ required: true, authenticated: true })
  : stale.promise);

 const pending = api.teams();
 await api.signInCoordinator('new-key', true);
 stale.resolve(Response.json({ error: 'Unauthorized' }, { status: 401 }));
 await assert.rejects(pending, error => error instanceof ApiError && error.status === 401);
 assert.equal(unauthorized, 0);
});

test('an invalid status response fails closed', async t => {
 t.mock.method(globalThis, 'fetch', async () => Response.json({ authenticated: true }));
 await assert.rejects(api.coordinatorSession(), /некорректное состояние входа/);
});
