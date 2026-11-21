import { createServer } from 'vite';

const demo = process.argv.includes('--demo');
if (demo) {
  process.env.VITE_DEMO_API = 'true';
  process.env.VITE_API_BASE_URL = '/api/v1';
  process.env.VITE_API_PROXY_TARGET ||= 'http://127.0.0.1:18081';
}

const vite = await createServer();
await vite.listen();
vite.printUrls();
console.log(demo
  ? 'Демо: Vite проксирует /api/v1 в отдельный Rust API.'
  : 'Frontend: адрес API задаётся через VITE_API_BASE_URL.');

async function stop() {
  await vite.close();
  process.exit(0);
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
