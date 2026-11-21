import { useEffect,useState } from 'react';
import type { ChangeEvent } from '../domain/incidents';
import { timestamp } from '../domain/incidents';
import { JOURNAL_PERIODS } from '../domain/eventJournal';
import { api } from './api';

export function useEventHistory(period:string,connected:boolean,now:number,since?:number) {
 const [archive,setArchive]=useState<ChangeEvent[]>([]),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0),[settledFor,setSettledFor]=useState<string|null>(null);
 const requestKey=period+':'+String(since)+':'+attempt;
 useEffect(()=>{
  if(!connected){setLoading(false);setSettledFor(null);return;}
  const controller=new AbortController();let alive=true;
  const duration=JOURNAL_PERIODS.find(value=>value.id===period)?.duration??24*3600_000,cutoff=since??now-duration;
  setLoading(true);setFailed(false);
  async function load(){
   const collected:ChangeEvent[]=[],seen=new Set<string>();let cursor:string|undefined;
   try{
    do{
     const page=await api.events(cursor,controller.signal);if(!alive)return;
     collected.push(...page.items);setArchive([...collected]);
     if(!page.nextCursor||!page.items.length||page.items.some(event=>{const at=timestamp(event.at);return at!==null&&at<cutoff;}))break;
     if(seen.has(page.nextCursor))throw new Error('Повтор курсора истории');
     cursor=page.nextCursor;seen.add(cursor);
    }while(alive);
   }catch(error){if(alive&&!(error instanceof DOMException&&error.name==='AbortError'))setFailed(true);}
   finally{if(alive){setLoading(false);setSettledFor(requestKey);}}
  }
  void load();
  return()=>{alive=false;controller.abort();};
 },[period,connected,attempt,since]);
 return {archive,loading,failed,settled:settledFor===requestKey,retry:()=>setAttempt(value=>value+1)};
}
