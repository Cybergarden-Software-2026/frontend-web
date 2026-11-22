import test from 'node:test';
import assert from 'node:assert/strict';
import {api,setToken,ApiError} from '../src/data/api.ts';
import {mergeNotices} from '../src/domain/notices.ts';

test('QR exchange includes persistent installation identity and web platform; no cookie auth',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json({token:'session-for-test',tokenType:'Bearer',deviceId:'installation-123',user:{login:'anna',displayName:'Анна'}},{status:201})};
 try{setToken(null);const value=await api.login('one-time-code','installation-123');assert.equal(value.token,'session-for-test');assert.match(calls[0].url,/\/mobile\/session$/);assert.deepEqual(JSON.parse(calls[0].init.body),{code:'one-time-code',deviceId:'installation-123',platform:'web'});assert.equal(calls[0].init.credentials,'omit');assert.equal(calls[0].init.headers.Authorization,undefined)}finally{globalThis.fetch=original}
});
test('registration uses the FCM delivery token, not Firebase Installation ID',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response(null,{status:204})};
 try{setToken('valid-mobile-session');await api.registerPush('delivery-address');await api.read('notice/42');await api.logout();assert.equal(calls[0].init.headers.Authorization,'Bearer valid-mobile-session');assert.deepEqual(JSON.parse(calls[0].init.body),{fcmTargetType:'token',fcmToken:'delivery-address'});assert.match(calls[1].url,/notifications\/notice%2F42\/read$/);assert.equal(calls[2].init.method,'DELETE')}finally{setToken(null);globalThis.fetch=original}
});
test('invalid pairing codes and revoked sessions retain actionable server error codes',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({error:'MOBILE_PAIRING_INVALID'},{status:401});
 try{await assert.rejects(api.login('expired','installation-123'),e=>e instanceof ApiError&&e.code==='MOBILE_PAIRING_INVALID'&&e.message.includes('истёк'))}finally{globalThis.fetch=original}
});
test('pagination deduplicates records and replaces read state from the server',()=>{
 const a={id:1,type:'critical.raised',createdAt:'2026-11-22T10:00:00Z',isRead:false};const b={...a,id:'2',createdAt:'2026-11-22T11:00:00Z'};const result=mergeNotices([a,b],[{...a,id:'1',isRead:true}]);assert.equal(result.length,2);assert.equal(result[1].isRead,true);assert.equal(String(result[0].id),'2');
});
test('current incident list uses only the new bearer route and accepts a confirmed empty snapshot',async()=>{
 const original=globalThis.fetch;let call;
 globalThis.fetch=async(url,init)=>{call={url,init};return Response.json({revision:4,serverTime:'2026-11-22T10:00:00Z',items:[]})};
 try{setToken('mobile');const result=await api.incidents();assert.deepEqual(result.items,[]);assert.match(call.url,/\/mobile\/incidents$/);assert.equal(call.init.headers.Authorization,'Bearer mobile');assert.equal(call.init.credentials,'omit')}finally{setToken(null);globalThis.fetch=original}
});

test('team contact records the exact team with a stable idempotency key for a repeat',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init)=>{
  calls.push({url,init});
  return Response.json({eventId:517,types:['team_contacted']},{status:calls.length===1?201:200});
 };
 try{
  setToken('mobile');
  const requestId='ec14a7dc-4627-4a1c-91fc-985123882b77';
  const first=await api.recordTeamContact('sys/1','Инфраструктура',requestId);
  const replay=await api.recordTeamContact('sys/1','Инфраструктура',requestId);
  assert.deepEqual(first,replay);
  for(const {url,init} of calls){
   assert.match(url,/\/mobile\/incidents\/sys%2F1\/team-contact$/);
   assert.equal(init.method,'POST');
   assert.equal(init.keepalive,true);
   assert.equal(init.credentials,'omit');
   assert.equal(init.headers.Authorization,'Bearer mobile');
   assert.deepEqual(JSON.parse(init.body),{team:'Инфраструктура',requestId});
  }
 }finally{setToken(null);globalThis.fetch=original}
});
