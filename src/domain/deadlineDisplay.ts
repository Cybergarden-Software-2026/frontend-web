import type { Incident, Sla } from './incidents.ts';
import { slaKind, timestamp } from './incidents.ts';

// Research keeps its server-side group/filter classification, but an explicit
// deadline still has a live countdown in the coordinator's interface.
export function displaySlaKind(item: Incident, now: number): Sla {
 const kind = slaKind(item, now);
 if (kind !== 'research') return kind;
 const deadline = timestamp(item.deadline);
 if (deadline === null) return 'unknown';
 return deadline <= now ? 'late' : deadline - now <= 30 * 60_000 ? 'soon' : 'normal';
}
