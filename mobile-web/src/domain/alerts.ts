import type {Incident} from './incidents.ts';
import {stateOf,timestamp} from './incidents.ts';

export function countdown(item:Incident,now:number){
 const end=timestamp(item.deadline);
 if(['Resolved','Closed'].includes(stateOf(item)))return '00:00:00';
 if(end===null)return '--:--:--';
 const delta=end-now,sec=Math.floor(Math.abs(delta)/1000);
 return (delta<=0?'−':'')+[Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(n=>String(n).padStart(2,'0')).join(':');
}
