import type { PersonalStatistics } from './personalStatistics.ts';

export function personalChartData(stats:PersonalStatistics){
 const duration=stats.end-stats.start;
 const size=Math.min(12,Math.max(1,Math.ceil(duration/3600_000)));
 const step=duration/size;
 const buckets=Array.from({length:size},(_,index)=>({from:stats.start+index*step,to:Math.min(stats.end,stats.start+(index+1)*step),count:0,transfers:[] as PersonalStatistics['transfers']}));
 for(const row of stats.transfers){
  if(row.assignedAt<stats.start||row.assignedAt>=stats.end)continue;
  const bucket=buckets[Math.min(size-1,Math.floor((row.assignedAt-stats.start)/step))];
  bucket.count++;bucket.transfers.push(row);
 }
 const points=stats.transfers.filter(row=>row.durationMs!==null).map(row=>({id:row.id,incidentId:row.incidentId,at:row.assignedAt,minutes:row.durationMs!/60_000,kpiMet:row.kpiMet})).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
 const reassignments=stats.transfers.flatMap(row=>{
  const durationMs=row.reassignmentMs;
  if(typeof durationMs!=='number'||!Number.isFinite(durationMs)||durationMs<0) return [];
  if(!Number.isFinite(row.assignedAt)||row.assignedAt<stats.start||row.assignedAt>=stats.end) return [];
  return [{id:row.id,incidentId:row.incidentId,at:row.assignedAt,durationMs}];
 }).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
 return {buckets,points,reassignments};
}

const REASSIGNMENT_UNITS=[
 {ms:86_400_000,label:'дн.'},
 {ms:3_600_000,label:'ч'},
 {ms:60_000,label:'мин'},
 {ms:1000,label:'с'},
 {ms:1,label:'мс'},
];

export function reassignmentChartScale(maximumMs:number){
 const unit=REASSIGNMENT_UNITS.find(unit=>maximumMs>=unit.ms)??REASSIGNMENT_UNITS[3];
 const step=Math.max(1,Math.ceil(maximumMs/unit.ms/4));
 return {unit:unit.label,unitMs:unit.ms,ticks:[0,step,step*2,step*3,step*4],maximumMs:step*4*unit.ms};
}

export function reassignmentDurationLabel(durationMs:number){
 let remaining=durationMs;
 const parts:string[]=[];
 for(const unit of REASSIGNMENT_UNITS){
  const amount=Math.floor(remaining/unit.ms);
  if(amount>0) parts.push(amount+' '+unit.label);
  remaining%=unit.ms;
 }
 return parts.join(' ')||'0 с';
}
