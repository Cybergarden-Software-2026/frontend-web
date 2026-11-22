import test from 'node:test';
import assert from 'node:assert/strict';
import {countdown} from '../src/domain/alerts.ts';

const now = Date.parse('2026-11-22T10:00:00Z');
const incident = {stateEnum: 'Assigned', deadline: new Date(now + 60000).toISOString()};

test('the countdown keeps running between mobile snapshot requests', () => {
 assert.equal(countdown(incident, now), '00:01:00');
 assert.equal(countdown(incident, now + 1000), '00:00:59');
 assert.equal(countdown(incident, now + 61000), '−00:00:01');
});
