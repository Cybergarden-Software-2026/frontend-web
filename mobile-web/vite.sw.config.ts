import {defineConfig,loadEnv} from 'vite';
import {readdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export default defineConfig(({mode})=>{
 const base=loadEnv(mode,process.cwd(),'').APP_BASE_PATH||'/';
 const files=readdirSync('dist',{recursive:true}).map(String).filter(p=>!p.endsWith('service-worker.js')&&!p.endsWith('.map')&&/\.(html|js|css|woff2|png|svg|webmanifest)$/.test(p));
 const precache=files.map(p=>base+p),hash=createHash('sha256');files.forEach(p=>hash.update(readFileSync('dist/'+p)));
 return {base,publicDir:false,define:{__PRECACHE__:JSON.stringify(precache),__BUILD_HASH__:JSON.stringify(hash.digest('hex').slice(0,12))},build:{emptyOutDir:false,outDir:'dist',lib:{entry:'src/push-sw.ts',formats:['iife'],name:'UnderCtrlWorker',fileName:()=> 'service-worker.js'},rollupOptions:{output:{inlineDynamicImports:true}}}};
});
