import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeCameraFrame,startQrCamera} from '../src/components/qr-camera.ts';
const fixture=JSON.parse(readFileSync(new URL('./qr-fixture.json',import.meta.url),'utf8'));
function frame(inverted=false){
 const width=fixture.rows.length*4,data=new Uint8ClampedArray(width*width*4);
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){
  const dark=fixture.rows[Math.floor(y/4)][Math.floor(x/4)]==='1',i=(y*width+x)*4;
  data[i]=data[i+1]=data[i+2]=dark!==inverted?0:255;data[i+3]=255;
 }
 return {data,width,height:width};
}
function canvas(inverted=false){return {getContext:()=>({drawImage(){},getImageData:()=>frame(inverted)})}}
test('the actual decoder reads normal and inverted QR pixels without altering the one-use code',()=>{
 for(const inverted of [false,true])assert.equal(decodeCameraFrame({readyState:2,videoWidth:164,videoHeight:164},canvas(inverted)),fixture.code);
 assert.equal(decodeCameraFrame({readyState:0,videoWidth:0,videoHeight:0},canvas()),null);
});
test('camera starts scanning after permission and releases its stream after detection',async()=>{
 const media=Object.getOwnPropertyDescriptor(navigator,'mediaDevices'),doc=globalThis.document;
 let allow,stopped=0,played=false,ready=false,received=[];
 const stream={getTracks:()=>[{stop(){stopped++}}]},video={readyState:2,videoWidth:164,videoHeight:164,srcObject:null,async play(){played=true}};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(resolve=>allow=()=>resolve(stream))}});
 globalThis.document={createElement:()=>canvas()};
 try{
  const task=startQrCamera(video,new AbortController().signal,code=>received.push(code),()=>ready=true);
  assert.equal(played,false);allow();await task;
  assert.equal(played,true);assert.equal(ready,true);assert.deepEqual(received,[fixture.code]);assert.ok(stopped);assert.equal(video.srcObject,null);
 }finally{if(media)Object.defineProperty(navigator,'mediaDevices',media);else delete navigator.mediaDevices;globalThis.document=doc}
});
test('closing while camera permission is pending stops a later stream without logging in',async()=>{
 const media=Object.getOwnPropertyDescriptor(navigator,'mediaDevices');let allow,stopped=false;
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(resolve=>allow=()=>resolve({getTracks:()=>[{stop(){stopped=true}}]}))}});
 try{const controller=new AbortController();const task=startQrCamera({srcObject:null,play(){assert.fail()}},controller.signal,()=>assert.fail(),()=>assert.fail());controller.abort();allow();await task;assert.equal(stopped,true)}finally{if(media)Object.defineProperty(navigator,'mediaDevices',media);else delete navigator.mediaDevices}
});
