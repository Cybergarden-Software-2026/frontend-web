import test from 'node:test';
import assert from 'node:assert/strict';
import {formAllocationLabel} from '../src/domain/deadlineDisplay.ts';
import {headerAlerts,countdown} from '../src/domain/alerts.ts';
import {COORDINATOR_TEAM} from '../src/domain/incidents.ts';
const now=Date.parse('2026-11-22T10:00:00Z');
const item={sysId:'1',id:'INC1',header:'Incident',stateEnum:'Assigned',stateId:0,priorityId:2,assignedGroupName:'Resolution team',submitDate:new Date(now-80*60000).toISOString(),deadline:new Date(now+20*60000).toISOString(),lastAssignmentToTeamDateTime:new Date(now).toISOString()};
test('exactly 20 percent is ordinary; a millisecond below enters the header',()=>{assert.equal(headerAlerts([item],now).length,0);assert.equal(headerAlerts([item],now+1)[0].reason,'Истекает')});
test('coordinator wait must exceed eight minutes and be assigned to the coordinator team',()=>{const i={...item,assignedGroupName:COORDINATOR_TEAM,lastAssignmentToTeamDateTime:new Date(now-8*60000).toISOString(),deadline:new Date(now+80*60000).toISOString()};assert.equal(headerAlerts([i],now).length,0);assert.equal(headerAlerts([i],now+1)[0].kind,'waiting');assert.equal(headerAlerts([{...i,assignedGroupName:''}],now+1).length,0)});
test('critical Research remains with a team until resolution or closure',()=>{const i={...item,stateEnum:'Research',priorityId:4};assert.equal(headerAlerts([i],now)[0].kind,'critical');for(const stateEnum of ['Resolved','Closed'])assert.equal(headerAlerts([{...i,stateEnum}],now).length,0)});
test('assigned overdue noncritical disappears while unassigned overdue remains',()=>{const i={...item,deadline:new Date(now-1000).toISOString()};assert.equal(headerAlerts([i],now).length,0);assert.equal(headerAlerts([{...i,assignedGroupName:''}],now)[0].kind,'deadline');assert.equal(countdown(i,now),'−00:00:01')});

test('native form detail shows the whole allocation only when the report has a deadline', () => {
 const record = { id: 'INC-FORM-5', submitDate: '2026-11-21T23:30:00Z', deadline: '2026-11-22T01:00:00Z' };
 assert.equal(formAllocationLabel(record), '1 ч 30 мин');
 assert.equal(formAllocationLabel({ ...record, deadline: '2026-11-22T00:30:00Z' }), '1 ч');
 assert.equal(formAllocationLabel({ ...record, deadline: '2026-11-21T23:31:00Z' }), '1 мин');
 assert.equal(formAllocationLabel({ ...record, deadline: null }), null);
 assert.equal(formAllocationLabel({ ...record, id: 'INC-WEB-5' }), null);
 assert.equal(formAllocationLabel({ ...record, deadline: record.submitDate }), null);
});
