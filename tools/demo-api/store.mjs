import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseIncidents, canonical, changedFields, eventTypes, analyze, COORDINATOR_TEAM, stateOf } from '../../src/domain/incidents.ts';

export class IncidentStore {
 constructor({sourcePath,dbPath,seedPath,itsmUrlTemplate=null}) {
  this.sourcePath=resolve(sourcePath); this.seedPath=seedPath; this.itsmUrlTemplate=itsmUrlTemplate;
  mkdirSync(dirname(dbPath),{recursive:true});
  this.db=new DatabaseSync(dbPath);
  this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS snapshot(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,revision INTEGER NOT NULL,hash TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,payload TEXT NOT NULL);');
  this.listeners=new Set(); this.readAt=null; this.error=null; this.lastError=null;
  this.readSource();
 }
 onChange(fn) { this.listeners.add(fn); return ()=>this.listeners.delete(fn); }
 emit() { const snapshot=this.snapshot(); for(const fn of this.listeners) fn(snapshot); }
 row() { return this.db.prepare('SELECT * FROM snapshot WHERE id=1').get(); }
 snapshot() {
  const row=this.row();
  const events=this.db.prepare('SELECT id,payload FROM events ORDER BY id DESC LIMIT 200').all().map(row=>({...JSON.parse(row.payload),eventId:Number(row.id)}));
  return {revision:row?.revision??0,serverTime:new Date().toISOString(),updatedAt:row?.updated_at??new Date().toISOString(),items:row?JSON.parse(row.payload):[],events,
   source:{path:this.sourcePath,readAt:this.readAt,error:this.error},itsmUrlTemplate:this.itsmUrlTemplate};
 }
 readSource() {
  try {
   const items=parseIncidents(JSON.parse(readFileSync(this.sourcePath,'utf8')));
   this.readAt=new Date().toISOString();
   const recovering=this.error!==null; this.error=null;
   const changed=this.ingest(items);
   if(recovering&&!changed)this.emit();
  } catch(error) {
   const message=error instanceof Error?error.message:'Не удалось прочитать источник';
   if(message!==this.error) {this.error=message;this.emit();}
  }
 }
 ingest(items) {
  const previous=this.row();
  const hash=createHash('sha256').update(canonical([...items].sort((a,b)=>a.sysId.localeCompare(b.sysId)))).digest('hex');
  if(previous?.hash===hash)return false;
  const old=previous?JSON.parse(previous.payload):[];
  const oldById=new Map(old.map(item=>[item.sysId,item]));
  const currentById=new Map(items.map(item=>[item.sysId,item]));
  const revision=(previous?.revision??0)+1,at=new Date().toISOString();
  const changes=[];
  if(previous) {
   for(const item of items) {
    const before=oldById.get(item.sysId)??null;
    const fields=before?changedFields(before,item):Object.keys(item);
    if(!fields.length)continue;
    changes.push({revision,sysId:item.sysId,incidentId:item.id,header:item.header,types:eventTypes(before,item),fields,at,previous:before,current:item});
   }
   for(const item of old)if(!currentById.has(item.sysId))changes.push({revision,sysId:item.sysId,incidentId:item.id,header:item.header,types:['removed'],fields:[],at,previous:item,current:null});
  }
  this.db.exec('BEGIN IMMEDIATE');
  try {
   this.db.prepare('INSERT OR REPLACE INTO snapshot(id,payload,revision,hash,updated_at) VALUES(1,?,?,?,?)').run(JSON.stringify(items),revision,hash,at);
   const insert=this.db.prepare('INSERT INTO events(payload) VALUES(?)');
   for(const event of changes)insert.run(JSON.stringify(event));
   this.db.exec('COMMIT');
  } catch(error) {this.db.exec('ROLLBACK');throw error;}
  this.emit(); return true;
 }
 write(items) {
  parseIncidents(items);
  const temporary=this.sourcePath+'.tmp';
  writeFileSync(temporary,JSON.stringify(items,null,2)+'\n'); renameSync(temporary,this.sourcePath);
  this.readSource(); return this.snapshot();
 }
 patch(sysId,patch) {
  const items=this.snapshot().items;
  const index=items.findIndex(item=>item.sysId===sysId||item.id===sysId);
  if(index<0)throw new Error('Инцидент не найден');
  if(patch.sysId&&patch.sysId!==items[index].sysId)throw new Error('sysId нельзя изменять');
  items[index]={...items[index],...patch};
  return this.write(items);
 }
 simulation(action) {
  const snapshot=this.snapshot(),items=snapshot.items.map(item=>({...item}));
  if(action==='reset')return this.write(parseIncidents(JSON.parse(readFileSync(this.seedPath,'utf8'))));
  if(action==='mass') {
   const stamp=Date.now(),base=items[0];if(!base)throw new Error('Нет исходных данных');
   const demo=Array.from({length:3},(_,index)=>({...base,sysId:`demo-mass-${stamp}-${index}`,id:`DEMO-MASS-${stamp}-${index+1}`,header:['Ошибки при оплате картой','Отказ авторизации платежа','Платежи не проходят'][index],description:'Демонстрация: сбой в общем сервисе обработки платежей. Требуется проверка связи инцидентов.',shortDescription:'Не проходит оплата через общий платёжный сервис.',service:'ДЕМО · Сервис обработки платежей',serviceId:'demo-payments',productName:'Демонстрационный платёжный сервис',stateEnum:'Assigned',stateId:0,state:'Назначен',priorityId:3,priority:'Высокий',submitDate:new Date(stamp+index).toISOString(),deadline:new Date(stamp+20*60_000).toISOString(),completionDate:null,assignedGroupName:'',assignedEmployee:'',assignedEmployeeLogin:'',lastAssignmentToTeamDateTime:null,solution:''}));
   return this.write([...items,...demo]);
  }
  let item=items.find(i=>['Assigned','WorkInProgress'].includes(stateOf(i))&&i.assignedGroupName===COORDINATOR_TEAM)??items.find(i=>['Assigned','WorkInProgress'].includes(stateOf(i)))??items[0];
  if(!item)throw new Error('Для симуляции необходим хотя бы один инцидент');
  if(action==='critical') {item=items.find(i=>['Assigned','WorkInProgress'].includes(stateOf(i))&&i.priorityId!==4)??item;Object.assign(item,{priorityId:4,priority:'Наивысший',assignedGroupName:'',assignedEmployee:'',assignedEmployeeLogin:'',lastAssignmentToTeamDateTime:new Date().toISOString(),deadline:new Date(Date.now()+12*60_000).toISOString()});}
  else if(action==='assign') {item=items.find(i=>i.assignedGroupName!==COORDINATOR_TEAM&&['Assigned','WorkInProgress','Research'].includes(stateOf(i)))??item;item.assignedGroupName=COORDINATOR_TEAM;item.lastAssignmentToTeamDateTime=new Date().toISOString();}
  else if(action==='resolve') {item=items.find(i=>i.priorityId===4&&['Assigned','WorkInProgress'].includes(stateOf(i)))??item;Object.assign(item,{stateId:7,stateEnum:'Resolved',state:'Завершен',completionDate:new Date().toISOString(),solution:'Проблема устранена в сценарии демонстрации. Запись допускает возврат в работу.'});}
  else if(action==='close') {item=items.find(i=>stateOf(i)==='Resolved')??item;Object.assign(item,{stateId:10,stateEnum:'Closed',state:'Закрыт',completionDate:item.completionDate??new Date().toISOString()});}
  else if(action==='reopen') {item=items.find(i=>stateOf(i)==='Resolved')??items.find(i=>stateOf(i)==='Research')??item;Object.assign(item,{stateId:2,stateEnum:'WorkInProgress',state:'Выполняется',completionDate:null,deadline:new Date(Date.now()+45*60_000).toISOString()});}
  else if(action==='research') {Object.assign(item,{stateId:20,stateEnum:'Research',state:'Исследование ситуации',completionDate:new Date().toISOString(),assignedGroupName:COORDINATOR_TEAM});}
  else if(action==='coordinator-wait') {item=items.find(i=>['Assigned','WorkInProgress','Research'].includes(stateOf(i))&&i.priorityId!==4)??item;Object.assign(item,{assignedGroupName:COORDINATOR_TEAM,assignedEmployee:'',assignedEmployeeLogin:'',lastAssignmentToTeamDateTime:new Date(Date.now()-9*60_000).toISOString()});}
  else if(action==='unassigned') {item.assignedGroupName='';item.assignedEmployee='';item.assignedEmployeeLogin='';item.lastAssignmentToTeamDateTime=new Date(Date.now()-20*60_000).toISOString();item.deadline=new Date(Date.now()+60*60_000).toISOString();}
  else if(action==='deadline') item.deadline=new Date(Date.now()+5*60_000).toISOString();
  else throw new Error('Неизвестный сценарий');
  return this.write(items);
 }
 analysis(sysId) {
  const snapshot=this.snapshot(),item=snapshot.items.find(i=>i.sysId===sysId);
  if(!item)return null;
  return analyze(item,snapshot.items,snapshot.revision);
 }
 close() {this.db.close();}
}
