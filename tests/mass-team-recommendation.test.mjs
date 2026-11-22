import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendMassTeam } from '../src/domain/massTeamRecommendation.ts';

const validCandidate = team => ({ team, evidenceIds: ['INC-SOLVED'] });
const llm = (sysId, team = 'Платформа', options = {}) => ({
 sysId,
 revision: 7,
 provider: 'llm',
 candidates: [validCandidate(team)],
 ...options,
});
const directory = ['Платформа', 'Сеть'];

test('an agreed AI recommendation reports unique active members and partial coverage', () => {
 const analyses = [llm('a'), llm('a'), llm('b'), llm('c', 'Сеть', { candidates: [] })];
 assert.deepEqual(recommendMassTeam(['a', 'b', 'c', 'a'], directory, 7, analyses), {
  team: 'Платформа', support: 2, total: 3,
 });
});

test('conflicting AI recommendations leave the team selection to the coordinator', () => {
 assert.equal(recommendMassTeam(['a', 'b'], directory, 7, [llm('a'), llm('b', 'Сеть')]), null);
});

test('rules, stale results, other incidents and unsupported teams do not become AI recommendations', () => {
 const analyses = [
  llm('rules', 'Платформа', { provider: 'rules' }),
  llm('stale', 'Платформа', { revision: 6 }),
  llm('other'),
  llm('gone', 'Команда удалена'),
  llm('unsupported', 'Платформа', { candidates: [{ team: 'Платформа', evidenceIds: [] }] }),
  llm('ambiguous', 'Платформа', { candidates: directory.map(validCandidate) }),
 ];
 assert.equal(recommendMassTeam(['rules', 'stale', 'gone', 'unsupported', 'ambiguous'], directory, 7, analyses), null);
});
