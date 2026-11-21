import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AlertSignalTracker,IncidentArrivalTracker} from '../src/domain/alertSignals.ts';
import {BellAudio,MediaBell} from '../src/data/bellAudio.ts';
const seed=JSON.parse(readFileSync(new URL('../data/seed.json',import.meta.url),'utf8'));
const now=Date.parse('2026-11-20T12:00:00Z');
const item={...seed[0],priorityId:4,stateEnum:'Assigned',stateId:0,deadline:new Date(now+10*60_000).toISOString()};
test('initial data and countdown stay silent; material updates of eligible incidents ring',()=>{
 const tracker=new AlertSignalTracker();assert.equal(tracker.update([item],now),false);
 assert.equal(tracker.update([item],now+1000),false);
 assert.equal(tracker.update([{...item,deadline:new Date(now+12*60_000).toISOString()}],now+2000),true);
});
test('adding or returning an important incident rings; resolving it does not',()=>{
 const tracker=new AlertSignalTracker();tracker.update([],now);
 assert.equal(tracker.update([item],now),true);
 assert.equal(tracker.update([{...item,stateEnum:'Resolved'}],now),false);
 assert.equal(tracker.update([item],now),true);
});
test('a coordinator incident rings only when waiting exceeds 8 minutes',()=>{
 const tracker=new AlertSignalTracker(),quiet={...item,priorityId:2,lastAssignmentToTeamDateTime:new Date(now-7*60_000).toISOString()};
 tracker.update([quiet],now);assert.equal(tracker.update([quiet],now+60_000),false);
 assert.equal(tracker.update([quiet],now+60_001),true);
 assert.equal(tracker.update([quiet],now+61_000),false);
});
test('assigned critical and overdue incidents never produce a routing chime',()=>{
 const tracker=new AlertSignalTracker();tracker.update([],now);
 const assigned={...item,assignedGroupName:'Команда X',deadline:new Date(now-60_000).toISOString()};
 assert.equal(tracker.update([assigned],now),false);
 assert.equal(tracker.update([{...assigned,deadline:new Date(now-30_000).toISOString()}],now),false);
});
test('assigning a resolution team removes the alert without sounding again',()=>{
 const tracker=new AlertSignalTracker();tracker.update([],now);assert.equal(tracker.update([item],now),true);
 assert.equal(tracker.update([{...item,assignedGroupName:'Команда X'}],now),false);
});
test('new row tracking uses complete source IDs and does not mistake a page change for arrival',()=>{
 const tracker=new IncidentArrivalTracker();assert.deepEqual(tracker.update([item]),[]);
 assert.deepEqual(tracker.update([item]),[]);
 assert.deepEqual(tracker.update([item,{...item,sysId:'new',id:'NEW'}]),['new']);
 assert.deepEqual(tracker.update([item,{...item,sysId:'new',id:'NEW'}]),[]);
});
test('Research alone does not trigger a critical alert',()=>{
 const tracker=new AlertSignalTracker();tracker.update([],now);
 assert.equal(tracker.update([{...item,stateEnum:'Research',assignedGroupName:'Команда X'}],now),false);
});
function fakeAudio(){
 let starts=0,resumes=0,created=0;
 const param={setValueAtTime(){},exponentialRampToValueAtTime(){}};
 const context={state:'suspended',currentTime:0,destination:{},async resume(){resumes++;this.state='running';},createOscillator(){return {frequency:param,connect(){},disconnect(){},start(){starts++;},stop(){}};},createGain(){return {gain:param,connect(){},disconnect(){}};}};
 const bell=new BellAudio(()=>{created++;return context;});
 return {bell,context,get starts(){return starts;},get resumes(){return resumes;},get created(){return created;}};
}
test('locked audio queues a single chime and plays it after user activation',async()=>{
 const fake=fakeAudio();await fake.bell.ring();await fake.bell.ring();assert.equal(fake.starts,0);
 await fake.bell.activate();assert.equal(fake.starts,2);assert.equal(fake.created,1);
 await fake.bell.activate();assert.equal(fake.starts,2);
});
test('suspended audio resumes and reuses its context for later alerts',async()=>{
 const fake=fakeAudio();await fake.bell.activate();await fake.bell.ring();assert.equal(fake.starts,2);
 fake.context.state='suspended';await fake.bell.ring();assert.equal(fake.starts,4);assert.equal(fake.created,1);assert.equal(fake.resumes,2);
});
test('unsupported audio does not throw or prevent visual notifications',async()=>{
 const bell=new BellAudio(()=>{throw new Error('Unavailable');}),states=[];bell.subscribe(state=>states.push(state));
 await bell.activate();await bell.ring();assert.equal(states.at(-1),'unavailable');
});

test('a pending sound can be cancelled when routing alerts disappear before activation',async()=>{
 const fake=fakeAudio();await fake.bell.ring();fake.bell.cancelPending();await fake.bell.activate();assert.equal(fake.starts,0);
});

test('renewed coordinator assignment still rings when its card is already in the header',()=>{
 const value={...item,priorityId:2,lastAssignmentToTeamDateTime:new Date(now-10*60_000).toISOString()},tracker=new AlertSignalTracker();tracker.update([value],now);
 assert.equal(tracker.update([{...value,lastAssignmentToTeamDateTime:new Date(now-9*60_000).toISOString()}],now),true);
 assert.equal(tracker.update([{...value,assignedGroupName:'Команда X'}],now),false);
});
function fakeMedia(){
 const plays=[];let fail=false;const element={volume:1,muted:false,currentTime:0,addEventListener(){},pause(){},async play(){plays.push(this.volume);if(fail)throw new Error('blocked');}};
 return {bell:new MediaBell(()=>element),element,plays,setBlocked(value){fail=value;}};
}
test('native audio is primed on a gesture and alert playback uses full volume',async()=>{
 const media=fakeMedia();await media.bell.activate();assert.deepEqual(media.plays,[0]);await media.bell.ring();assert.deepEqual(media.plays,[0,1]);assert.equal(media.element.muted,false);
});
test('native audio queues before interaction and retries a blocked alert on the next gesture',async()=>{
 const media=fakeMedia();await media.bell.ring();assert.equal(media.plays.length,0);media.setBlocked(true);await media.bell.activate();media.setBlocked(false);await media.bell.activate();assert.equal(media.plays.at(-1),1);
});
test('cancelled native audio does not play a stale alert',async()=>{
 const media=fakeMedia();await media.bell.ring();media.bell.cancelPending();await media.bell.activate();assert.deepEqual(media.plays,[0]);
});

test('crossing the deadline threshold alone is silent; becoming critical still rings',()=>{
 const record={...item,priorityId:2,assignedGroupName:'',lastAssignmentToTeamDateTime:new Date(now+3600_000).toISOString(),submitDate:new Date(now-70*60_000).toISOString(),deadline:new Date(now+30*60_000).toISOString()},tracker=new AlertSignalTracker();
 tracker.update([record],now);assert.equal(tracker.update([record],now+1),false);
 assert.equal(tracker.update([{...record,deadline:new Date(now-1000).toISOString()}],now),false);
 assert.equal(tracker.update([{...record,priorityId:4}],now),true);
});
