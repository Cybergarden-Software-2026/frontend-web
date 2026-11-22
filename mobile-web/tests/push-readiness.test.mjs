import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForPushWorker, withPushDeadline} from '../src/push-readiness.ts';

test('an installed worker that never activates fails in bounded time', async () => {
 await assert.rejects(waitForPushWorker({active: null}, 10), /ещё не запустился/);
 const active = {state: 'activated'};
 await waitForPushWorker({active}, 10);
});

test('a late Firebase token cannot complete an expired attempt', async () => {
 let finish;
 const response = new Promise(resolve => { finish = resolve; });
 await assert.rejects(withPushDeadline(response, 10, 'timeout'), /timeout/);
 finish('late-token');
 assert.equal(await withPushDeadline(Promise.resolve('new-token'), 50, 'timeout'), 'new-token');
});
