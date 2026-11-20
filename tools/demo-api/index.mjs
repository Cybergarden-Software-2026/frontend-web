import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { IncidentStore } from './store.mjs';
import { parseIncidents, belongs, stateOf, counts, analyze } from '../../src/domain/incidents.ts';
import { queryIncidents, detectMassProblems, canAssign } from '../../src/domain/operations.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
try {process.loadEnvFile(resolve(root,'.env'));} catch {}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.woff2':'font/woff2','.png':'image/png'};
export async function startApi({port=Number(process.env.API_PORT??3001),sourcePath=process.env.SOURCE_FILE??resolve(root,'data/incidents.json'),dbPath=resolve(root,'.data/underctrl.sqlite'),seedPath=resolve(root,'data/seed.json')}={}) {
 const store=new IncidentStore({sourcePath,dbPath,seedPath,itsmUrlTemplate:process.env.ITSM_URL_TEMPLATE??null});
 const clients=new Set();
 const unsubscribe=store.onChange(snapshot=>{const event=`id: ${snapshot.revision}\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;for(const res of clients)res.write(event);});
 const poll=setInterval(()=>store.readSource(),800);
 const heartbeat=setInterval(()=>{for(const res of clients)res.write(': heartbeat\n\n');},15_000);
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 async function body(req) {
  let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>5_000_000)throw new Error('Размер запроса превышает 5 МБ');}
  try{return JSON.parse(text);}catch{throw new Error('Некорректный JSON в запросе');}
 }
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url??'/','http://127.0.0.1');
  url.pathname=url.pathname.replace(/^\/api\/v1(?=\/|$)/,'/api');
  try {
   if(url.pathname.startsWith('/api/')) {
    if(req.method==='GET'&&url.pathname==='/api/events/stream') {
     res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
     res.write(`retry: 2000\nid: ${store.snapshot().revision}\nevent: snapshot\ndata: ${JSON.stringify(store.snapshot())}\n\n`);
     clients.add(res);req.on('close',()=>clients.delete(res));return;
    }
    if(req.method==='GET'&&url.pathname==='/api/snapshot')return json(res,200,store.snapshot());
    if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,source:store.snapshot().source,revision:store.snapshot().revision});
    if(req.method==='GET'&&url.pathname==='/api/incidents') {
     const snapshot=store.snapshot(),params=url.searchParams;
     const query={group:params.get('group')??'all',q:params.get('q')??'',team:params.get('team')??'',sort:params.get('sort')??'priority',priority:params.get('priority')??'',status:params.get('status')??'',sla:params.get('sla')??'',page:Number(params.get('page')??1),pageSize:Number(params.get('pageSize')??9)};
     if(!['all','critical','coordinators','research','high','resolved','closed'].includes(query.group))return json(res,400,{error:'Неизвестная группа'});
     if(!Number.isFinite(query.page)||!Number.isFinite(query.pageSize))return json(res,400,{error:'Некорректная пагинация'});
     return json(res,200,queryIncidents(snapshot.items,query,snapshot.revision));
    }
    if(req.method==='GET'&&url.pathname==='/api/teams') {
     const snapshot=store.snapshot();const names=[...new Set(snapshot.items.map(i=>i.assignedGroupName.trim()).filter(n=>n&&n!=='AutoClosedMi'))].sort();
     return json(res,200,{items:names.map(name=>({name,activeCount:snapshot.items.filter(i=>i.assignedGroupName===name&&canAssign(i)).length})),revision:snapshot.revision});
    }
    if(req.method==='GET'&&url.pathname==='/api/problems/clusters')return json(res,200,{items:detectMassProblems(store.snapshot().items),revision:store.snapshot().revision,provider:'rules'});
    if(req.method==='PUT'&&url.pathname==='/api/incidents')return json(res,200,store.write(parseIncidents(await body(req))));
    if(req.method==='POST'&&url.pathname==='/api/incidents') {
     const input=await body(req),incoming=parseIncidents(Array.isArray(input)?input:[input]);
     const merged=new Map(store.snapshot().items.map(i=>[i.sysId,i]));for(const item of incoming)merged.set(item.sysId,item);
     return json(res,200,store.write([...merged.values()]));
    }
    if(req.method==='POST'&&url.pathname==='/api/demo')return json(res,200,store.simulation((await body(req)).action));
    if(req.method==='GET'&&url.pathname==='/api/events')return json(res,200,{items:store.snapshot().events});
    const match=url.pathname.match(/^\/api\/incidents\/([^/]+)(?:\/(analysis|events|assignment))?$/);
    if(match) {
     const id=decodeURIComponent(match[1]),item=store.snapshot().items.find(i=>i.sysId===id||i.id===id);
     if(!item)return json(res,404,{error:'Инцидент не найден'});
     if(match[2]==='assignment'&&req.method==='POST') {
      const input=await body(req);store.readSource();const snapshot=store.snapshot(),current=snapshot.items.find(i=>i.sysId===item.sysId);
      if(input.expectedRevision!==snapshot.revision)return json(res,409,{error:'Данные изменились. Проверьте актуальную команду и повторите назначение.'});
      if(!current||!canAssign(current))return json(res,409,{error:'Нельзя назначить завершённый или закрытый инцидент.'});
      const teams=new Set(snapshot.items.map(i=>i.assignedGroupName.trim()).filter(n=>n&&n!=='AutoClosedMi'));
      if(typeof input.team!=='string'||!teams.has(input.team))return json(res,400,{error:'Выберите команду из справочника.'});
      return json(res,200,store.patch(item.sysId,{assignedGroupName:input.team,assignedEmployee:'',assignedEmployeeLogin:'',lastAssignmentToTeamDateTime:new Date().toISOString()}));
     }
     if(match[2]==='analysis'&&['GET','POST'].includes(req.method))return json(res,200,store.analysis(item.sysId));
     if(match[2]==='events'&&req.method==='GET')return json(res,200,{items:store.snapshot().events.filter(e=>e.sysId===item.sysId)});
     if(!match[2]&&req.method==='GET')return json(res,200,{incident:item,revision:store.snapshot().revision,normalizedState:stateOf(item)});
     if(!match[2]&&req.method==='PATCH')return json(res,200,store.patch(item.sysId,await body(req)));
    }
    return json(res,404,{error:'Маршрут не найден'});
   }
   const dist=resolve(root,'dist');
   let file=resolve(dist,'.'+decodeURIComponent(url.pathname));
   if(file!==dist&&!file.startsWith(dist+sep))return json(res,403,{error:'Недопустимый путь'});
   if(!existsSync(file)||statSync(file).isDirectory())file=resolve(dist,'index.html');
   if(!existsSync(file))return json(res,404,{error:'Сначала выполните сборку или запустите режим разработки.'});
   res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'});res.end(readFileSync(file));
  } catch(error) {if(!res.headersSent)json(res,400,{error:error instanceof Error?error.message:'Ошибка запроса'});else res.end();}
 });
 await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',accept);});
 console.log(`API: http://127.0.0.1:${server.address().port}`);
 return {server,store,port:server.address().port,async close(){clearInterval(poll);clearInterval(heartbeat);unsubscribe();for(const res of clients)res.end();await new Promise(done=>server.close(done));store.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const api=await startApi();
 let stopping=false;async function stop(){if(stopping)return;stopping=true;await api.close();process.exit(0);}
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
