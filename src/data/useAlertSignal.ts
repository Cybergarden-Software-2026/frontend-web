import { useEffect,useRef,useState } from 'react';
import type { Incident } from '../domain/incidents';
import { headerAlerts } from '../domain/operations';
import { AlertSignalTracker } from '../domain/alertSignals';
import { bellAudio } from './bellAudio';
import type { BellAudioStatus } from './bellAudio';

export function useAlertSignal(items:Incident[],now:number,ready:boolean){
 const tracker=useRef(new AlertSignalTracker());
 const serial=useRef(0);
 const [sequence,setSequence]=useState(0),[audioStatus,setAudioStatus]=useState<BellAudioStatus>('locked');
 useEffect(()=>{
  const activate=()=>{void bellAudio.activate();};
  const resume=()=>{if(document.visibilityState==='visible'&&navigator.userActivation?.hasBeenActive)activate();};
  window.addEventListener('pointerdown',activate);window.addEventListener('keydown',activate);
  window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
  const unsubscribe=bellAudio.subscribe(status=>{setAudioStatus(status);if(status==='playing')setSequence(++serial.current);});
  return()=>{window.removeEventListener('pointerdown',activate);window.removeEventListener('keydown',activate);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);unsubscribe();};
 },[]);
 useEffect(()=>{
  if(tracker.current.update(items,now,ready)){setSequence(++serial.current);void bellAudio.ring();}
  if(ready&&!headerAlerts(items,now).length){bellAudio.cancelPending();setSequence(0);}
 },[items,Math.floor(now/1000),ready]);
 useEffect(()=>{if(!sequence)return;const timer=setTimeout(()=>setSequence(0),3200);return()=>clearTimeout(timer);},[sequence]);
 return {sequence,audioStatus};
}
