import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import assert from 'node:assert/strict';
globalThis.location={hash:'#alerts'};
const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false}});
try{
 const {IncidentAlerts}=await server.ssrLoadModule('/src/features/IncidentAlerts.tsx');
 const {IncidentDetail}=await server.ssrLoadModule('/src/features/IncidentDetail.tsx');
 const {Login}=await server.ssrLoadModule('/src/features/Login.tsx');
 const now=Date.parse('2026-11-22T10:00:00Z'),start='2026-11-22T09:00:00Z';
 const base={header:'Сбой сервиса',normalizedState:'Assigned',priorityId:2,assignedGroupName:'Команда решения',submitDate:start,lastAssignmentToTeamDateTime:start,deadline:'2026-11-22T11:00:00Z',headerKind:null};
 const snapshot={revision:1,serverTime:new Date(now).toISOString(),items:[
 {...base,sysId:'1',id:'INC1',header:'Критическая задача',priorityId:4,headerKind:'critical'},
 {...base,sysId:'2',id:'INC2',header:'Ждёт координатора',assignedGroupName:'КЦ ИТ Координаторы Массовых Инцидентов',headerKind:'waiting'},
 {...base,sysId:'3',id:'INC3',header:'Срок подходит',deadline:'2026-11-22T10:01:00Z',headerKind:'deadline'},
 {...base,sysId:'4',id:'INC4',header:'Обычная невидимая задача'}]};
 const markup=renderToStaticMarkup(React.createElement(IncidentAlerts,{snapshot,now,loading:false,error:'',refresh(){},owner:'anna',onExpired(){}}));
 assert.match(markup,/Критическая задача/);assert.match(markup,/Ждёт координатора/);assert.match(markup,/Срок подходит/);assert.doesNotMatch(markup,/Обычная невидимая задача/);assert.match(markup,/00:01:00/);
 const detail=(fields)=>renderToStaticMarkup(React.createElement(IncidentDetail,{item:{...snapshot.items[0],...fields},revision:snapshot.revision,now,owner:'anna',onBack(){},refresh(){},onExpired(){}}));
 const coordinatorGroup=snapshot.items[1].assignedGroupName;
 const mine={login:'anna',displayName:'Анна',claimedAt:start};
 const other={...mine,login:'boris',displayName:'Борис'};
 const claimable=(claim,fields={})=>detail({assignedGroupName:coordinatorGroup,coordinationClaim:claim,...fields});
 assert.match(claimable(null),/Принять в работу/);
 assert.match(claimable(mine),/В работе у вас/);assert.match(claimable(mine),/Освободить инцидент/);
 assert.match(claimable(other),/В работе · Борис/);assert.doesNotMatch(claimable(other),/Принять в работу|Освободить инцидент/);
 assert.doesNotMatch(claimable(undefined),/Принять в работу/);
 assert.doesNotMatch(claimable(null,{normalizedState:'Resolved'}),/Принять в работу/);
 assert.doesNotMatch(claimable(null,{assignedGroupName:'Команда решения'}),/Принять в работу/);
 const claimedSnapshot={...snapshot,items:snapshot.items.map(i=>i.sysId==='2'?{...i,coordinationClaim:mine}:i)};
 const claimedMarkup=renderToStaticMarkup(React.createElement(IncidentAlerts,{snapshot:claimedSnapshot,now,loading:false,error:'',refresh(){},owner:'anna',onExpired(){}}));
 assert.match(claimedMarkup,/В работе у вас/);
 const realPhone=detail({teamPhone:'+12025550100',teamPhoneIsTest:false});
 assert.match(realPhone,/<a[^>]+href="tel:\+12025550100"[^>]*><svg[^>]*>.*<\/svg>Связаться с командой<\/a>/);
 assert.doesNotMatch(realPhone,/<dialog\b/);
 assert.equal((realPhone.match(/href="tel:/g)||[]).length,1);
 assert.doesNotMatch(realPhone,/Отметить контакт/);
 const testPhone=detail({teamPhone:'+78194693716',teamPhoneIsTest:true});
 assert.doesNotMatch(testPhone,/тестовый|Рабочий номер команды недоступен/i);
 assert.match(testPhone,/<small>\+78194693716<\/small>/);
 assert.match(testPhone,/<a[^>]+href="tel:\+78194693716"[^>]*><svg[^>]*>.*<\/svg>Связаться с командой<\/a>/);
 assert.match(detail({teamPhone:'+78194693716'}),/href="tel:\+78194693716"/);
 assert.doesNotMatch(detail({teamPhone:'javascript:alert(1)'}),/href="tel:/);
 const withoutPhone=detail({teamPhone:null,teamPhoneIsTest:false});
 assert.doesNotMatch(withoutPhone,/href="tel:|<dialog\b/);
 assert.match(withoutPhone,/<button[^>]+disabled=""[^>]*><svg[^>]*>.*<\/svg>Связаться с командой<\/button>/);
 assert.doesNotMatch(detail({assignedGroupName:null}),/Связаться с командой/);
 assert.doesNotMatch(detail({assignedGroupName:'КЦ ИТ Координаторы Массовых Инцидентов',teamPhone:'+12025550100',teamPhoneIsTest:false}),/Связаться с командой/);
 const login=renderToStaticMarkup(React.createElement(Login,{notice:'',onLogin:async()=>{}}));
 assert.match(login,/Сканировать QR-код/);assert.match(login,/Код действует 5 минут/);assert.match(login,/globe-scene/);
 Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
 try{
  const installed=renderToStaticMarkup(React.createElement(Login,{notice:'',onLogin:async()=>{}}));
  assert.equal(installed,login);
 }finally{delete navigator.standalone}
 console.log('SSR checks: three live header categories, ordinary incident exclusion, timer, QR login and globe.');
}finally{await server.close()}
