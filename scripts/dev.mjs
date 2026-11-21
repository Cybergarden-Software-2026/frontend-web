import { createServer } from 'vite';
const demo=process.argv.includes('--demo');
let api=null;
if (demo) {
  api = await (await import('../tools/demo-api/index.mjs')).startApi();
  process.env.VITE_DEMO_API = 'true';
  process.env.VITE_API_BASE_URL = '/api/v1';
  process.env.VITE_API_PROXY_TARGET = `http://127.0.0.1:${api.port}`;
}
const vite=await createServer();await vite.listen();vite.printUrls();
console.log(demo?'Демо API: data/incidents.json. Изменения подхватываются автоматически.':'Frontend: адрес API задаётся через VITE_API_BASE_URL.');
let closing=false;
async function stop(){if(closing)return;closing=true;await vite.close();await api?.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
