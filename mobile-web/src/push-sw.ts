/// <reference lib="webworker" />
import {initializeApp} from 'firebase/app';
import {getMessaging,onBackgroundMessage} from 'firebase/messaging/sw';
import {firebaseConfig} from './firebase-config.ts';
import {loadSession} from './data/vault.ts';
declare const self:ServiceWorkerGlobalScope;
declare const __PRECACHE__:string[];
declare const __BUILD_HASH__:string;
const ROOT=import.meta.env.BASE_URL,CACHE='underctrl-mobile-'+ROOT.replace(/\W/g,'_')+'-'+__BUILD_HASH__;
// Register before the Firebase handler to keep notification navigation inside this app.
self.addEventListener('notificationclick',event=>{
 event.stopImmediatePropagation();event.notification.close();
 const data=event.notification.data?.FCM_MSG?.data||event.notification.data||{};
 const route=data.sysId?'#incident/'+encodeURIComponent(String(data.sysId)):'#alerts';
 const url=new URL(ROOT+route,self.location.origin);
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  const own=clients.find(c=>new URL(c.url).origin===url.origin&&new URL(c.url).pathname.startsWith(ROOT));
  if(own){await (own as WindowClient).navigate(url.href);return (own as WindowClient).focus()}
  return self.clients.openWindow(url.href);
 }));
});
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(__PRECACHE__))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('underctrl-mobile-'+ROOT.replace(/\W/g,'_')+'-')&&k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(event.request.mode==='navigate'&&url.pathname.startsWith(ROOT))event.respondWith(fetch(event.request).catch(async()=>await caches.match(ROOT+'index.html')||Response.error()));
 else if(__PRECACHE__.includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
if(firebaseConfig.apiKey&&firebaseConfig.appId){
 onBackgroundMessage(getMessaging(initializeApp(firebaseConfig)),async payload=>{
  // The Rust backend sends webpush.notification: Firebase displays it automatically.
  // Rendering it again here would create duplicates. Only handle data-only fallback.
  if(payload.notification||payload.data?.type!=='critical.raised')return;
  if(!await loadSession())return;
  const data=payload.data;
  await self.registration.showNotification(data.title||'Критический сбой',{body:data.body||'Поступило важное событие',icon:ROOT+'icons/icon-192.png',tag:data.notificationId||'underctrl-critical',data:{notificationId:data.notificationId,sysId:data.sysId}});
 });
}
