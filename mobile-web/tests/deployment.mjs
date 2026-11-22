import assert from 'node:assert/strict';
const base=process.argv[2];if(!base)throw Error('Pass the deployment origin');
async function get(path){const response=await fetch(new URL(path,base));assert.equal(response.status,200,`${path}: HTTP ${response.status}`);return response}
assert.match(await (await get('/')).text(),/\/assets\/.+\.js/);
const mobile=await get('/mobile/'),html=await mobile.text();
assert.match(html,/underCtrl — важные инциденты/);
const scripts=[...html.matchAll(/src="(\/mobile\/assets\/[^\"]+\.js)"/g)].map(m=>m[1]);assert.ok(scripts.length);
for(const script of scripts){const response=await get(script);assert.match(response.headers.get('content-type')||'',/javascript/);assert.ok((await response.text()).length>1000)}
const response=await get('/mobile/manifest.webmanifest');assert.match(response.headers.get('content-type')||'',/manifest\+json/);const manifest=await response.json();assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./#alerts');
for(const icon of manifest.icons){const response=await get('/mobile/'+icon.src);const bytes=new Uint8Array(await response.arrayBuffer());assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10])}
const worker=await get('/mobile/service-worker.js');assert.match(worker.headers.get('content-type')||'',/javascript/);assert.equal(worker.headers.get('service-worker-allowed'),'/mobile/');const source=await worker.text();assert.match(source,/underctrl-d087a/);assert.match(source,/\/mobile\/index\.html/);
assert.equal((await fetch(new URL('/mobile/assets/missing-file.js',base))).status,404);
const redirect=await fetch(new URL('/mobile',base),{redirect:'manual'});assert.ok([301,302,307,308].includes(redirect.status));assert.equal(redirect.headers.get('location'),'/mobile/');
console.log('Verified desktop, mobile HTML/JS, manifest, icons, worker scope, unknown-file 404 and /mobile redirect.');
