import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { api } from '../src/data/api.ts';
import { watchIncidentBrief } from '../src/data/incidentBriefAnalysis.ts';
import { incidentBrief } from '../src/domain/incidents.ts';
import { detailBrief } from '../src/features/detailPresentation.ts';

const item = { sysId: 'a', shortDescription: 'Таймаут оплаты', stateEnum: 'WorkInProgress' };
const ready = { sysId: 'a', revision: 7, provider: 'llm', summary: 'Оплата восстановлена.' };
const reopened = { sysId: 'a', revision: 7, eventId: 3, types: ['reopened'] };

test('a reopened card keeps the recorded attempt separate from its current outcome', () => {
 const attempt = 'Перезапустили терминал, ошибка повторилась.';
 assert.equal(incidentBrief({ ...item, solution: attempt }, [reopened]),
  'Таймаут оплаты. В поле решения указано «Перезапустили терминал, ошибка повторилась». Инцидент снова в работе, результат пока не подтверждён.');
 assert.match(incidentBrief(item, [{ ...reopened, previous: { solution: attempt } }]),
  /Ранее в карточке указали «Перезапустили терминал, ошибка повторилась». Инцидент снова в работе/);
});

test('the brief remains readable with sparse, multiline or long fields', () => {
 assert.equal(incidentBrief({ sysId: 'a' }),
  'Описание проблемы пока отсутствует. Выполненные действия пока не описаны. Текущий статус не определён.');
 const text = incidentBrief({ ...item, shortDescription: ' ', description: 'Таймаут\n  оплаты',
  solution: 'Сброшено соединение. '.repeat(80), stateEnum: 'Resolved' });
 assert.match(text, /^Таймаут оплаты\./);
 assert.match(text, /В карточке инцидент отмечен как решённый\.$/);
 assert.ok(text.length < 250);
});

test('only the current incident and revision supply server text or fallback history', () => {
 const events = [
  { ...reopened, previous: { solution: 'Перезапуск' } },
  { ...reopened, sysId: 'b', previous: { solution: 'Другая заявка' } },
  { ...reopened, revision: 8, previous: { solution: 'Следующая ревизия' } },
 ];
 const fallback = detailBrief(item, events, 7, null);
 assert.match(fallback.text, /Ранее в карточке указали «Перезапуск»/);
 assert.doesNotMatch(fallback.text, /Другая заявка|Следующая ревизия/);
 for (const invalid of [{ ...ready, sysId: 'b' }, { ...ready, revision: 6 }, { ...ready, summary: '  ' }]) {
  assert.deepEqual(detailBrief(item, events, 7, invalid), fallback);
 }
 assert.deepEqual(detailBrief(item, events, 7, ready), { text: ready.summary, generated: true });
 assert.deepEqual(detailBrief(item, events, 7, { ...ready, provider: 'rules' }), { text: ready.summary, generated: false });
 assert.deepEqual(detailBrief(item, events, 7, { ...ready, provider: 'rules', summary: 'Разбор ИИ. ' + ready.summary }),
  { text: ready.summary, generated: true });
});

test('an open card replaces a pending summary with the finished one and stops polling', async t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const pending = { ...ready, provider: 'rules', summary: 'Проблема зарегистрирована.', summaryPending: true };
 const responses = [pending, ready], received = [];
 const requests = t.mock.method(api, 'analysis', async () => responses.shift());
 const stop = watchIncidentBrief('a', 7, value => received.push(value));
 t.after(stop);
 await nextTurn();
 assert.deepEqual(received, [pending]);
 t.mock.timers.tick(2_000);
 await nextTurn();
 assert.deepEqual(received, [pending, ready]);
 t.mock.timers.tick(300_000);
 assert.equal(requests.mock.callCount(), 2);
});

test('closing during generation cancels the retry and ignores a response already in flight', async t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const pending = { ...ready, summaryPending: true };
 const requests = t.mock.method(api, 'analysis', async () => pending);
 const received = [];
 const stop = watchIncidentBrief('a', 7, value => received.push(value));
 await nextTurn();
 stop();
 t.mock.timers.tick(300_000);
 assert.equal(requests.mock.callCount(), 1);

 let resolve;
 requests.mock.mockImplementation(() => new Promise(done => { resolve = done; }));
 const stopSecond = watchIncidentBrief('a', 7, value => received.push(value));
 stopSecond();
 assert.equal(requests.mock.calls[1].arguments[1].aborted, true);
 resolve(ready);
 await nextTurn();
 assert.deepEqual(received, [pending]);
});

test('wrong versions, legacy rules and errors do not start polling; pending retries are bounded', async t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const requests = t.mock.method(api, 'analysis');
 for (const response of [{ ...ready, revision: 8, summaryPending: true }, { ...ready, sysId: 'b', summaryPending: true },
  { ...ready, provider: 'rules' }, new Error('offline')]) {
  requests.mock.mockImplementation(async () => { if (response instanceof Error) throw response; return response; });
  requests.mock.resetCalls();
  const received = [];
  const stop = watchIncidentBrief('a', 7, value => received.push(value));
  await nextTurn();
  t.mock.timers.tick(300_000);
  assert.equal(requests.mock.callCount(), 1);
  assert.deepEqual(received, response.provider === 'rules' ? [response] : []);
  stop();
 }
 requests.mock.mockImplementation(async () => ({ ...ready, summaryPending: true }));
 requests.mock.resetCalls();
 const stop = watchIncidentBrief('a', 7, () => {});
 await nextTurn();
 for (let step = 0; step < 12; step++) {
  t.mock.timers.tick(300_000);
  await nextTurn();
 }
 assert.equal(requests.mock.callCount(), 7);
 stop();
});
