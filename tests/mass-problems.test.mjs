import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {curateMassGroup,massGroupRouting,excludeMassIncident,visibleMassProblems,exclusionApplies} from '../src/domain/massProblems.ts';
import {MASS_GROUPS_KEY,readManualMassGroups,saveManualMassGroups,MASS_EXCLUSIONS_KEY,readMassExclusions,saveMassExclusions} from '../src/data/massProblemPreferences.ts';
import {assignIncidentGroup} from '../src/data/assignIncidentGroup.ts';

const seed=JSON.parse(readFileSync(new URL('../data/seed.json',import.meta.url),'utf8'))[0];
const base={...seed,stateEnum:'Assigned',stateId:0,assignedGroupName:'Old team',service:'Payment gateway',submitDate:'2026-11-21T08:00:00Z',header:'Authorization timeout'};
const incident=id=>({...base,sysId:id,id:'INC-'+id});
const snapshot=(items,revision=1)=>({revision,serverTime:'2026-11-21T09:00:00Z',updatedAt:'2026-11-21T09:00:00Z',items,events:[],source:{status:'ok'},itsmUrlTemplate:null});
const reviewed=items=>items.map(item=>({sysId:item.sysId,team:item.assignedGroupName}));
function storage(){const entries=new Map();return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};}
function options(items,patch={}){return {reviewed:reviewed(items),team:'New team',snapshot:snapshot(items),onSnapshot(){},onProgress(){},...patch};}

test('excluding a member changes only automatic grouping, leaves incident and queue intact, and can be undone',()=>{
 const items=['a','b','c'].map(incident),original=structuredClone(items);
 const excluded=excludeMassIncident([],items[0],'Gateway',100);
 assert.deepEqual(visibleMassProblems(items,excluded)[0].sysIds,['b','c']);
 assert.deepEqual(items,original);
 assert.equal(visibleMassProblems(items.slice(0,2),excluded).length,0);
 assert.deepEqual(visibleMassProblems(items,[])[0].sysIds,['a','b','c']);
});
test('exclusions survive team, priority and group membership changes, but new symptoms are reconsidered',()=>{
 const a=incident('a'),excluded=excludeMassIncident([],a,'Gateway',100);
 assert.ok(exclusionApplies(excluded[0],{...a,assignedGroupName:'Separate team',priorityId:4}));
 const items=[{...a,assignedGroupName:'Separate team'},incident('b'),incident('c'),incident('d')];
 assert.deepEqual(visibleMassProblems(items,excluded)[0].sysIds,['b','c','d']);
 for(const patch of [{service:'Other service'},{header:'Different symptoms'},{submitDate:'2026-11-21T09:00:00Z'}])assert.equal(exclusionApplies(excluded[0],{...a,...patch}),false);
 assert.equal(excludeMassIncident(excluded,a,'New title',200).length,1);
});
test('manual exclusions persist across reload and reject corrupt or unavailable storage',()=>{
 const store=storage(),rows=excludeMassIncident([],incident('a'),'Gateway',100);
 assert.equal(saveMassExclusions(rows,store),true);assert.deepEqual(readMassExclusions(store),rows);
 store.setItem(MASS_EXCLUSIONS_KEY,JSON.stringify([null,{},42,{...rows[0],excludedAt:'wrong'},...rows,rows[0]]));
 assert.deepEqual(readMassExclusions(store),rows);
 store.setItem(MASS_EXCLUSIONS_KEY,'broken');assert.deepEqual(readMassExclusions(store),[]);
 const broken={getItem(){throw Error('Denied');},setItem(){throw Error('Full');}};
 assert.deepEqual(readMassExclusions(broken),[]);assert.equal(saveMassExclusions(rows,broken),false);
 assert.equal(saveMassExclusions(rows,null),false);
});
test('batch uses existing assignment API sequentially with latest whole-snapshot revision and deduplicates members',async()=>{
 const items=['a','b','c'].map(incident),calls=[],snapshots=[],progress=[];
 let current=snapshot(items);
 const result=await assignIncidentGroup(options(items,{reviewed:[...reviewed(items),reviewed(items)[0]],onSnapshot:s=>snapshots.push(s.revision),onProgress:r=>progress.push(r.length)}),{async assign(id,team,revision){
  calls.push([id,team,revision]);assert.equal(revision,current.revision);
  current=snapshot(current.items.map(row=>row.sysId===id?{...row,assignedGroupName:team}:row),revision+1);return current;
 }});
 assert.deepEqual(calls,[['a','New team',1],['b','New team',2],['c','New team',3]]);
 assert.deepEqual(snapshots,[2,3,4]);assert.deepEqual(progress,[1,2,3]);
 assert.equal(result.interrupted,false);assert.ok(result.results.every(row=>row.status==='assigned'));
});
test('closed, resolved and removed records are skipped; unchanged team needs no write',async()=>{
 const items=[{...incident('a'),stateEnum:'Closed'},{...incident('b'),stateEnum:'Resolved'},{...incident('c'),assignedGroupName:'New team'}];
 const result=await assignIncidentGroup(options(items,{reviewed:[...reviewed(items),{sysId:'removed',team:'Old team'}]}),{async assign(){assert.fail('Unexpected write');}});
 assert.deepEqual(result.results.map(row=>row.status),['skipped','skipped','unchanged','skipped']);assert.equal(result.interrupted,false);
});
test('409 stops batch after partial success and does not retry or overwrite remaining records',async()=>{
 const items=['a','b','c'].map(incident),calls=[];
 const result=await assignIncidentGroup(options(items),{async assign(id,team,revision){calls.push(id);if(id==='b')throw Object.assign(Error('Conflict'),{status:409});return snapshot([{...items[0],assignedGroupName:team},items[1],items[2]],revision+1);}});
 assert.deepEqual(calls,['a','b']);assert.equal(result.interrupted,true);assert.deepEqual(result.results.map(r=>r.status),['assigned','failed']);
 assert.match(result.results[1].message,/Обновите/);
});
test('an externally changed team discovered in a prior response requires renewed review',async()=>{
 const items=['a','b'].map(incident),calls=[];
 const result=await assignIncidentGroup(options(items),{async assign(id,team){calls.push(id);return snapshot([{...items[0],assignedGroupName:team},{...items[1],assignedGroupName:'Someone else'}],2);}});
 assert.deepEqual(calls,['a']);assert.equal(result.results[1].status,'failed');assert.equal(result.interrupted,true);
});
test('network errors and unconfirmed responses are ambiguous, stop remaining writes and preserve progress',async()=>{
 for(const failure of ['network','server','unconfirmed']){
  const items=['a','b'].map(incident),calls=[];
  const result=await assignIncidentGroup(options(items),{async assign(id){calls.push(id);if(failure==='network')throw Error('Network');if(failure==='server')throw Object.assign(Error('Server'),{status:500});return snapshot(items,2);}});
  assert.deepEqual(calls,['a']);assert.equal(result.results[0].status,'unknown');assert.equal(result.interrupted,true);
 }
});
test('stop waits for current assignment, preserves it and never starts the next one',async()=>{
 const items=['a','b'].map(incident),calls=[];let stop=false;
 const result=await assignIncidentGroup(options(items,{shouldStop:()=>stop,onProgress(){stop=true;}}),{async assign(id,team){calls.push(id);return snapshot([{...items[0],assignedGroupName:team},items[1]],2);}});
 assert.deepEqual(calls,['a']);assert.equal(result.stopped,true);assert.equal(result.results[0].status,'assigned');
 const before=await assignIncidentGroup(options(items,{shouldStop:()=>true}),{async assign(){assert.fail('Unexpected write');}});
 assert.equal(before.stopped,true);assert.equal(before.results.length,0);
});
test('explicitly reviewed continuation can safely confirm an uncertain write without repeating it',async()=>{
 const items=[{...incident('a'),assignedGroupName:'New team'},incident('b')],calls=[];
 const result=await assignIncidentGroup(options(items),{async assign(id,team,revision){calls.push(id);return snapshot(items.map(row=>({...row,assignedGroupName:team})),revision+1);}});
 assert.deepEqual(calls,['b']);assert.deepEqual(result.results.map(r=>r.status),['unchanged','assigned']);assert.equal(result.interrupted,false);
});


test('manually adding an incident preserves reviewed composition across reload without duplicate groups',()=>{
 const items=['a','b'].map(incident),extra={...incident('c'),service:'Different service',header:'Different symptom'};
 const group=visibleMassProblems(items,[])[0],manual=curateMassGroup([],group,[...items,extra]);
 const store=storage();assert.equal(saveManualMassGroups(manual,store),true);
 const groups=visibleMassProblems([...items,extra],[],readManualMassGroups(store));
 assert.equal(groups.length,1);assert.deepEqual(groups[0].sysIds,['a','b','c']);assert.ok(groups[0].id.startsWith('manual:'));
 const excluded=excludeMassIncident([],extra,group.title,200);
 assert.deepEqual(visibleMassProblems([...items,extra],excluded,manual)[0].sysIds,['a','b']);
 const changed=[...items,{...extra,header:'New symptom'}];assert.deepEqual(visibleMassProblems(changed,[],manual)[0].sysIds,['a','b']);
});
test('curated groups accept active research and omit completed or missing records after live updates',()=>{
 const items=['a','b','c'].map(incident),group=visibleMassProblems(items,[])[0],manual=curateMassGroup([],group,items);
 const live=[{...items[0],stateEnum:'Research'},{...items[1],stateEnum:'Closed'}];
 const groups=visibleMassProblems(live,[],manual);assert.equal(groups.length,1);assert.deepEqual(groups[0].sysIds,['a']);
 assert.equal(visibleMassProblems([{...live[0],stateEnum:'Resolved'}],[],manual).length,0);
});
test('a manually moved incident is removed from previous manual membership',()=>{
 const items=['a','b','c','d'].map(incident),group=visibleMassProblems(items,[])[0];
 const first=curateMassGroup([],group,items.slice(0,2));
 const second=curateMassGroup(first,{...group,id:'other',title:'Other'},[items[0],items[2],items[3]]);
 const grouped=visibleMassProblems(items,[],second).flatMap(row=>row.sysIds);
 assert.equal(grouped.length,4);assert.equal(new Set(grouped).size,4);
});
test('manual membership storage validates corrupt input and handles failed persistence',()=>{
 const store=storage(),group=visibleMassProblems(['a','b'].map(incident),[])[0],manual=curateMassGroup([],group,['a','b'].map(incident));
 store.setItem(MASS_GROUPS_KEY,JSON.stringify([null,42,{},manual[0],{id:'manual:invalid',title:'title',reason:'reason',members:[null,{},42]}]));
 assert.deepEqual(readManualMassGroups(store)[0],manual[0]);assert.deepEqual(readManualMassGroups(store)[1].members,[]);
 store.setItem(MASS_GROUPS_KEY,'invalid');assert.deepEqual(readManualMassGroups(store),[]);
 assert.equal(saveManualMassGroups(manual,null),false);
});
test('group routing badge reflects real teams instead of always showing waiting',()=>{
 const a=incident('a'),b=incident('b');
 assert.equal(massGroupRouting([{...a,assignedGroupName:''},b]).tone,'waiting');
 assert.equal(massGroupRouting([a,b]).tone,'assigned');
 assert.equal(massGroupRouting([a,{...b,assignedGroupName:'Other team'}]).tone,'mixed');
});
