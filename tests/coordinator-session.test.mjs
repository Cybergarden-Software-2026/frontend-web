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
 assert.deepEqual(await api.signInCoordinator({ key: 'fixture-key', remember: false }), { required: true, authenticated: true });
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

 await assert.rejects(api.signInCoordinator({ key: 'invalid-key', remember: false }), error => error instanceof ApiError && error.status === 401);
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
 await api.signInCoordinator({ key: 'new-key', remember: true });
 stale.resolve(Response.json({ error: 'Unauthorized' }, { status: 401 }));
 await assert.rejects(pending, error => error instanceof ApiError && error.status === 401);
 assert.equal(unauthorized, 0);
});

test('an invalid status response fails closed', async t => {
 t.mock.method(globalThis, 'fetch', async () => Response.json({ authenticated: true }));
 await assert.rejects(api.coordinatorSession(), /некорректное состояние входа/);
});

test('personal accounts can sign in with either set of credentials and receive the server identity', async t => {
 const coordinator = { login: 'fixture-user', displayName: 'Тестовый координатор' };
 const requests = [];
 t.mock.method(globalThis, 'fetch', async (url, init) => {
  assert.equal(url, '/api/v1/auth/coordinator/session');
  assert.equal(init.credentials, 'include');
  assert.equal(init.headers.has('Authorization'), false);
  if (init.body) requests.push(JSON.parse(init.body));
  return Response.json(init.method === 'POST'
   ? { required: true, authenticated: true, mode: 'accounts', coordinator }
   : { required: true, authenticated: false, mode: 'accounts' });
 });

 assert.deepEqual(await api.coordinatorSession(), { required: true, authenticated: false, mode: 'accounts' });
 const login = { login: 'fixture-user', password: ' fixture-password ', remember: true };
 const key = { key: 'fixture-individual-key', remember: false };
 for (const credentials of [login, key]) {
  const session = await api.signInCoordinator(credentials);
  assert.deepEqual(session.coordinator, coordinator);
  assert.equal(session.mode, 'accounts');
 }
 assert.deepEqual(requests, [login, key]);
});

test('an authenticated account response requires a valid coordinator identity', async t => {
 const responses = [
  { required: true, authenticated: true, mode: 'accounts' },
  { required: true, authenticated: true, mode: 'accounts', coordinator: { login: 'fake' } },
  { required: true, authenticated: false, mode: 'invalid-mode' },
 ];
 t.mock.method(globalThis, 'fetch', async () => Response.json(responses.shift()));
 for (let i = 0; i < 3; i++) {
  await assert.rejects(api.coordinatorSession(), /некорректное состояние входа/);
 }
});
