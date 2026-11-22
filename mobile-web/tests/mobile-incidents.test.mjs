import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMobileSnapshot,currentMobileAlerts,mobileIncident} from '../src/domain/mobileIncidents.ts';
import {countdown} from '../src/domain/alerts.ts';
const now=Date.parse('2026-11-22T09:10:00Z');
const item={sysId:'10027',id:'INC000027',header:'Касса не принимает оплату',normalizedState:'Assigned',priorityId:2,assignedGroupName:'КЦ ИТ Координаторы Массовых Инцидентов',submitDate:'2026-11-22T09:00:00.000Z',lastAssignmentToTeamDateTime:null,deadline:'2026-11-22T10:00:00.000Z',headerKind:'waiting'};
test('new mobile contract maps the server header classification and canonical UTC timer',()=>{const s=parseMobileSnapshot({revision:42,serverTime:new Date(now).toISOString(),items:[item]});const alerts=currentMobileAlerts(s,now);assert.equal(alerts.length,1);assert.equal(alerts[0].kind,'waiting');assert.equal(countdown(alerts[0].item,now),'00:50:00');assert.equal(alerts[0].item.sysId,'10027')});
test('time boundaries update even if the revision stays identical',()=>{const at=Date.parse('2026-11-22T09:08:00Z'),s={revision:42,serverTime:new Date(at).toISOString(),items:[{...item,headerKind:null}]};assert.equal(currentMobileAlerts(s,at).length,0);assert.equal(currentMobileAlerts(s,at+1)[0].kind,'waiting');assert.equal(currentMobileAlerts({...s,items:[]},at+1).length,0)});
test('closed and resolved updates remove cards while an opened detail has a stopped timer',()=>{for(const normalizedState of ['Resolved','Closed']){const i={...item,priorityId:4,normalizedState,headerKind:null};assert.equal(currentMobileAlerts({revision:43,serverTime:new Date(now).toISOString(),items:[i]},now).length,0);assert.equal(countdown(mobileIncident(i),now),'00:00:00')}});
test('nullable title/team/deadline are safe; cache replacement rejects malformed or duplicate records',()=>{const i={...item,header:null,assignedGroupName:null,deadline:null,priorityId:4,headerKind:'critical'};const s=parseMobileSnapshot({revision:43,serverTime:new Date(now).toISOString(),items:[i]});assert.equal(currentMobileAlerts(s,now)[0].item.header,'Без названия');assert.equal(countdown(mobileIncident(i),now),'--:--:--');assert.throws(()=>parseMobileSnapshot({...s,items:[i,i]}));assert.throws(()=>parseMobileSnapshot({...s,items:[{...i,assignedGroupName:{bad:true}}]}));assert.throws(()=>parseMobileSnapshot({...s,items:null}))});

test('phone flags survive the mobile snapshot and invalid optional fields do not discard it',()=>{
 const snapshot={revision:43,serverTime:new Date(now).toISOString(),items:[
  {...item,teamPhone:'+78194693716',teamPhoneIsTest:true},
  {...item,sysId:'2',teamPhone:'+12025550100',teamPhoneIsTest:false},
  {...item,sysId:'3',teamPhone:42,teamPhoneIsTest:'false'},
 ]};
 const [testNumber,realNumber,malformed]=parseMobileSnapshot(snapshot).items;
 assert.equal(testNumber.teamPhoneIsTest,true);
 assert.equal(realNumber.teamPhoneIsTest,false);
 assert.equal(malformed.teamPhone,undefined);
 assert.equal(malformed.teamPhoneIsTest,undefined);
});

test('claim data distinguishes an available incident from an older or malformed snapshot',()=>{
 const claim={login:'anna',displayName:'Анна',claimedAt:new Date(now).toISOString()};
 const snapshot=parseMobileSnapshot({revision:43,serverTime:new Date(now).toISOString(),items:[
  item,
  {...item,sysId:'2',coordinationClaim:null},
  {...item,sysId:'3',coordinationClaim:claim},
  {...item,sysId:'4',coordinationClaim:{...claim,claimedAt:'broken'}},
 ]});
 assert.deepEqual(snapshot.items.map(i=>i.coordinationClaim),[undefined,null,claim,undefined]);
});
