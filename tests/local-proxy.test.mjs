import test from 'node:test';
import assert from 'node:assert/strict';
import {localApiProxy} from '../vite.config.ts';
function handlers(){const result={};localApiProxy('https://cybergarden.sosmooth.ru').configure({on(name,fn){result[name]=fn}});return result}
test('loopback development maps only the coordinator cookie and preserves HttpOnly and SameSite',()=>{
 const h=handlers(),response={headers:{'set-cookie':['__Host-underctrl-coordinator=opaque; Secure; HttpOnly; SameSite=Strict; Path=/','other=value; Secure; HttpOnly']}};
 h.proxyRes(response);assert.equal(response.headers['set-cookie'][0],'underctrl-local-coordinator=opaque; HttpOnly; SameSite=Strict; Path=/');assert.equal(response.headers['set-cookie'][1],'other=value; Secure; HttpOnly');
 const headers={};h.proxyReq({setHeader(k,v){headers[k]=v},destroy(){assert.fail()}},{headers:{origin:'http://127.0.0.1:5173',cookie:'other=kept; underctrl-local-coordinator=opaque'}});
 assert.equal(headers.Origin,'https://cybergarden.sosmooth.ru');assert.equal(headers.Cookie,'other=kept; __Host-underctrl-coordinator=opaque');
});
test('remote pages cannot use the local authenticated development proxy',()=>{
 let rejected=false;handlers().proxyReq({destroy(){rejected=true},setHeader(){assert.fail()}},{headers:{origin:'https://unrelated.example',cookie:'underctrl-local-coordinator=opaque'}});assert.ok(rejected);assert.equal(localApiProxy('http://127.0.0.1:8080').configure,undefined);
});
