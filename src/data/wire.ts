import type { ChangeEvent, Incident, Snapshot } from '../domain/incidents';

type RawIncident = Record<string, unknown>;
type WireEvent = Omit<ChangeEvent, 'header' | 'current' | 'previous'> & {
  header: string | null;
  current: RawIncident | null;
  previous: RawIncident | null;
};
export type WireSnapshot = Omit<Snapshot, 'items' | 'events'> & {
  items: RawIncident[];
  events: WireEvent[];
};

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function numberOrNull(value: unknown): number | null {
  const digits = text(value);
  return digits && Number.isFinite(Number(digits)) ? Number(digits) : null;
}

function flag(value: unknown): boolean | undefined {
  const word = text(value).toLowerCase();
  return word ? ['true', 'да', 'yes', '1'].includes(word) : undefined;
}

interface SourceDates {
  submitDate: string;
  deadline: string | null;
  completionDate: string | null;
  lastAssignmentToTeamDateTime: string | null;
}

export function normalizeIncident(raw: RawIncident): Incident {
  const dashboard = raw.dashboard as { sourceDates?: SourceDates } | undefined;
  // In a web response the importer has already interpreted source-local times in its configured zone.
  const dates = dashboard?.sourceDates ?? raw;
  return {
    ...raw,
    sysId: text(raw.sysId), id: text(raw.id),
    header: text(raw.header), description: text(raw.description), shortDescription: text(raw.shortDescription),
    productName: text(raw.productName), service: text(raw.service), scenarioName: text(raw.scenarioName),
    productId: text(raw.productId), productMasterId: text(raw.productMasterId), serviceId: text(raw.serviceId) || null,
    stateId: numberOrNull(raw.stateId), stateEnum: text(raw.stateEnum), state: text(raw.state),
    stateReason: text(raw.stateReason) || null,
    priorityId: Number(raw.priorityId), priority: text(raw.priority),
    impactId: numberOrNull(raw.impactId), impact: text(raw.impact),
    urgencyId: numberOrNull(raw.urgencyId), urgency: text(raw.urgency),
    assignedGroupName: text(raw.assignedGroupName), assignedEmployee: text(raw.assignedEmployee),
    assignedEmployeeLogin: text(raw.assignedEmployeeLogin), initiatorName: text(raw.initiatorName),
    initiatorLogin: text(raw.initiatorLogin), serviceType: text(raw.serviceType),
    receivingChannel: text(raw.receivingChannel), solution: text(raw.solution),
    submitDate: text(dates.submitDate), deadline: text(dates.deadline) || null,
    completionDate: text(dates.completionDate) || null,
    lastAssignmentToTeamDateTime: text(dates.lastAssignmentToTeamDateTime) || null,
    isDouble: flag(raw.isDouble), isMaster: flag(raw.isMaster), isEffect: flag(raw.isEffect),
    isReason: flag(raw.isReason), isNeedUp: flag(raw.isNeedUp) ?? null,
  };
}

export function normalizeSnapshot(snapshot: WireSnapshot): Snapshot {
  return {
    ...snapshot,
    items: snapshot.items.map(normalizeIncident),
    events: snapshot.events.map(event => ({
      ...event,
      header: text(event.header),
      previous: event.previous && normalizeIncident(event.previous),
      current: event.current && normalizeIncident(event.current),
    })),
  };
}
