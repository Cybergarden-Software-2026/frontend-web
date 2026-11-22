import {useCallback,useEffect,useRef,useState} from 'react';
import {api,ApiError,API_BASE} from './api.ts';
import {parseMobileSnapshot,type MobileSnapshot} from '../domain/mobileIncidents.ts';
interface Saved {owner:string;snapshot:MobileSnapshot;offset:number;syncedAt:number}
const KEY='underctrl-mobile-incidents-v1';
function cached(owner:string):Saved|null{try{const value=JSON.parse(localStorage.getItem(KEY)||'null');if(value?.owner!==API_BASE+'|'+owner)return null;parseMobileSnapshot(value.snapshot);return value}catch{return null}}
export function clearIncidentCache(){try{localStorage.removeItem(KEY)}catch{}}
export function useMobileIncidents(owner:string,onExpired:()=>void){
 const [saved,setSaved]=useState(()=>cached(owner)),[now,setNow]=useState(Date.now()),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [attempt,setAttempt]=useState(0);const expired=useRef(onExpired);expired.current=onExpired;const latest=useRef(saved);latest.current=saved;
 const refresh=useCallback(()=>setAttempt(v=>v+1),[]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{let alive=true,busy=false;
  async function load(){if(busy||!alive)return;busy=true;setLoading(true);try{const snapshot=await api.incidents();if(!alive)return;if(latest.current&&latest.current.snapshot.revision>snapshot.revision)throw Error('Сервер вернул более старый снимок. Последние данные сохранены.');const syncedAt=Date.now(),next={owner:API_BASE+'|'+owner,snapshot,offset:Date.parse(snapshot.serverTime)-syncedAt,syncedAt};setSaved(previous=>{if(previous&&previous.snapshot.revision>snapshot.revision)return previous;try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}return next});setError('');setNow(syncedAt)}catch(e){if(!alive)return;if(e instanceof ApiError&&e.status===401){expired.current();return}setError(e instanceof Error?e.message:'Не удалось обновить инциденты')}finally{busy=false;if(alive)setLoading(false)}}
  void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},15000);const wake=()=>{if(document.visibilityState==='visible')void load()};const disconnected=()=>setError('В данный момент сети нет. Данные могли устареть.');window.addEventListener('offline',disconnected);window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('offline',disconnected);window.removeEventListener('online',wake);document.removeEventListener('visibilitychange',wake)};
 },[owner,attempt]);
 return {snapshot:saved?.snapshot??null,now:now+(saved?.offset??0),syncedAt:saved?.syncedAt??null,loading,error,refresh};
}
