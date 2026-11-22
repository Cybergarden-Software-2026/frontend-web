import type { Incident, Sla } from './incidents.ts';
import { slaKind, timestamp } from './incidents.ts';

export function formAllocationLabel(item: Pick<Incident, 'id' | 'submitDate' | 'deadline'>): string | null {
 if (!item.id.startsWith('INC-FORM-')) return null;
 const start = timestamp(item.submitDate);
 const end = timestamp(item.deadline);
 if (start === null || end === null || end <= start) return null;
 const minutes = (end - start) / 60_000;
 if (!Number.isInteger(minutes)) return null;
 const hours = Math.floor(minutes / 60);
 const remainder = minutes % 60;
 return [hours && `${hours} ч`, remainder && `${remainder} мин`].filter(Boolean).join(' ');
}

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
