import type { Incident, Sla } from './incidents.ts';
import { slaKind, timestamp } from './incidents.ts';

export function deadlineRemainingRatio(item:Incident,now:number):number|null {
 const start=timestamp(item.submitDate),end=timestamp(item.deadline);
 return start===null||end===null||end<=start||now<start?null:(end-now)/(end-start);
}

// Display the source deadline for research without changing backend filtering.
export function displaySlaKind(item: Incident, now: number): Sla {
 const kind = slaKind(item, now);
 if (['restored','closed','unknown'].includes(kind)) return kind;
 const deadline = timestamp(item.deadline);
 if (deadline === null) return 'unknown';
 if (deadline <= now) return 'late';
 const ratio=deadlineRemainingRatio(item,now);
 return ratio!==null&&ratio<0.2?'soon':'normal';
}
