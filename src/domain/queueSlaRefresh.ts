import type { Sla } from './incidents.ts';

const SLA_REFRESH_MS = 30_000;

export function queueSlaTimeBucket(sla: Sla | '', now: number): number | null {
 return sla === 'late' || sla === 'soon' || sla === 'normal'
  ? Math.floor(now / SLA_REFRESH_MS)
  : null;
}
