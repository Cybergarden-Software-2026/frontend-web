import { useState,useEffect,useRef,useCallback } from 'react';
import type { Snapshot } from '../domain/incidents';
import { api, API_BASE } from './api';
const KEY='underctrl.web.snapshot.v1';
function cached():Snapshot|null {try {const value=JSON.parse(localStorage.getItem(KEY)??'null');return value&&Array.isArray(value.items)&&Array.isArray(value.events)?value:null;}catch{return null;}}
export function useIncidents() {
 const [snapshot,setSnapshot]=useState<Snapshot|null>(cached);
 const [connected,setConnected]=useState(false),[online,setOnline]=useState(navigator.onLine),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);
 const [clockOffset,setClockOffset]=useState(0);
 const seen=useRef<number|null>(null),revision=useRef(snapshot?.revision??-1);
 if(seen.current===null&&snapshot)seen.current=snapshot.events.reduce((n,e)=>Math.max(n,e.eventId),0);
 const accept=useCallback((incoming:Snapshot)=>{
  if(incoming.revision<revision.current)return;
  revision.current=incoming.revision;
  const newest=incoming.events.reduce((n,e)=>Math.max(n,e.eventId),0);
  seen.current=newest;
  setClockOffset(Date.parse(incoming.serverTime)-Date.now());setSnapshot(incoming);setLoading(false);setError(null);
  try{localStorage.setItem(KEY,JSON.stringify(incoming));}catch{}
 },[]);
 const refresh=useCallback(async()=>{setLoading(true);try{accept(await api.snapshot());setConnected(true);}catch(e){setError(e instanceof Error?e.message:'Сервер недоступен');setLoading(false);setConnected(false);}},[accept]);
 useEffect(()=>{
  void refresh();
  const stream=new EventSource(API_BASE+'/events/stream');
  stream.addEventListener('snapshot',e=>{try{accept(JSON.parse((e as MessageEvent).data));setConnected(true);}catch{setError('Некорректное обновление сервера');}});
  stream.onopen=()=>setConnected(true);stream.onerror=()=>setConnected(false);
  const update=()=>{setOnline(navigator.onLine);if(navigator.onLine)void refresh();};
  window.addEventListener('online',update);window.addEventListener('offline',update);
  const retry=setInterval(()=>{if(stream.readyState===EventSource.CLOSED)void refresh();},15_000);
  return()=>{stream.close();clearInterval(retry);window.removeEventListener('online',update);window.removeEventListener('offline',update);};
 },[accept,refresh]);
 return {snapshot,connected,online,loading,error,clockOffset,refresh,accept};
}
