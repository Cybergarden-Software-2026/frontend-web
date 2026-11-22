import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { enterPresentation, takePresentationLink } from '../src/app/presentationEntry.ts';

const origin = 'https://presentation.example';
const signedOut = { mode: 'accounts', required: true, authenticated: false };
const demoSession = {
 ...signedOut, authenticated: true,
 coordinator: { login: 'test-coordinator-1', displayName: 'Демонстрация' },
};
const fixtureKey = randomUUID();
const fixtureDigest = createHash('sha256').update(fixtureKey).digest('hex');
const enter = (session, key = fixtureKey) =>
 enterPresentation(session, key, origin, new AbortController().signal, fixtureDigest);

test('bootstrap scrubs the fragment before use and releases the key exactly once', () => {
 const url = new URL('/presentation?view=compact#guest=' + encodeURIComponent(fixtureKey), origin);
 const history = { state: { page: 1 }, replaceState(state, _, target) {
  assert.equal(state, this.state);
  url.href = new URL(target, url).href;
 } };
 const read = takePresentationLink(url, history);
 assert.equal(url.href, origin + '/');
 assert.equal(takePresentationLink(url, history), null);
 assert.equal(read(), fixtureKey);
 assert.equal(read(), '');
 for (const hash of ['#guest', '#guest=', '#guest=%ZZ']) {
  url.pathname = '/presentation/';
  url.hash = hash;
  assert.equal(takePresentationLink(url, history)(), '');
  assert.equal(url.hash, '');
 }
 url.hash = '#guest=' + fixtureKey;
 assert.equal(takePresentationLink(url, history), null);
 url.pathname = '/presentation';
 url.hash = '#incident/123';
 assert.equal(takePresentationLink(url, history), null);
 assert.equal(url.hash, '#incident/123');
});

test('presentation key signs in without persistence and cannot follow redirects off origin', async t => {
 const fetch = t.mock.method(globalThis, 'fetch', async (url, init) => {
  assert.equal(url, '/api/v1/auth/coordinator/session');
  assert.equal(init.method, 'POST');
  assert.equal(init.mode, 'same-origin');
  assert.equal(init.redirect, 'error');
  assert.deepEqual(JSON.parse(init.body), { key: fixtureKey, remember: false });
  return Response.json(demoSession);
 });
 assert.deepEqual(await enter(signedOut), { session: demoSession });
 assert.equal(fetch.mock.callCount(), 1);
});

test('existing sessions, unsupported modes and unrelated keys never send login requests', async t => {
 const fetch = t.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected request'));
 assert.deepEqual(await enter(demoSession), { session: demoSession });
 const other = { ...demoSession, coordinator: { login: 'other-user', displayName: 'Другой аккаунт' } };
 for (const session of [other, { ...signedOut, mode: 'shared-key' }, { required: false, authenticated: false }]) {
  const result = await enter(session);
  assert.equal(result.session, session);
  assert.ok(result.notice);
 }
 for (const key of ['', randomUUID()]) {
  const result = await enter(signedOut, key);
  assert.equal(result.session, signedOut);
  assert.ok(result.notice);
 }
 assert.equal(fetch.mock.callCount(), 0);
});

test('revoked keys restore manual sign-in and an unexpected authenticated identity is signed out', async t => {
 const responses = [new Response(null, { status: 401 }), Response.json({
  ...demoSession, coordinator: { login: 'other-user', displayName: 'Другой аккаунт' },
 }), new Response(null, { status: 204 })];
 const methods = [];
 t.mock.method(globalThis, 'fetch', (_url, init) => {
  methods.push(init.method);
  return Promise.resolve(responses.shift());
 });
 for (let attempt = 0; attempt < 2; attempt++) {
  const result = await enter(signedOut);
  assert.equal(result.session, signedOut);
  assert.ok(result.notice);
 }
 assert.deepEqual(methods, ['POST', 'POST', 'DELETE']);
});

test('temporary connection errors explain that the link can be reopened', async t => {
 t.mock.method(globalThis, 'fetch', () => Promise.reject(new TypeError('offline')));
 const result = await enter(signedOut);
 assert.equal(result.session, signedOut);
 assert.match(result.notice, /ещё раз/);
});
