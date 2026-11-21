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
 return {buckets,points};
}
