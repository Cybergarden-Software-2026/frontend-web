import type { ProblemCluster, QueuePage, QueueQuery } from '../domain/operations';
import type { MassExclusion } from '../domain/massProblems.ts';
import type { PersonalStatistics } from '../domain/personalStatistics.ts';
import type { Analysis } from '../domain/incidents';
import { normalizeIncident, normalizeSnapshot, normalizeEvent, type WireEvent, type WireSnapshot } from './wire.ts';

export const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(API_BASE + path, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.error ?? body?.message ?? `Сервер вернул HTTP ${response.status}`);
  }
  return response.json();
}

const snapshotRequest = async (path: string, init?: RequestInit) =>
  normalizeSnapshot(await request<WireSnapshot>(path, init));

export interface MassClusters {
  revision: number;
  items: ProblemCluster[];
  exclusions: MassExclusion[];
}

export type MassEdit =
  | { action: 'add'; groupId: string; sysIds: string[] }
  | { action: 'exclude'; groupId: string; sysId: string }
  | { action: 'restore'; sysId: string };

interface WireIncidentDetail {
  incident: WireSnapshot['items'][number];
  revision: number;
  details?: { isPresent: boolean };
}

async function eventPage(path: string, limit: number, beforeId?: string, signal?: AbortSignal, afterId?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId) params.set('beforeId', beforeId);
  if (afterId) params.set('afterId', afterId);
  const page = await request<{ items: WireEvent[]; nextCursor?: string | null }>(path + '?' + params, { signal, cache: 'no-store' });
  return { items: page.items.map(normalizeEvent), nextCursor: page.nextCursor ?? null };
}

export const api = {
  snapshot: (signal?: AbortSignal) => snapshotRequest('/snapshot?view=web', { cache: 'no-store', signal }),
  async incidents(query: QueueQuery): Promise<QueuePage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, page: query.page ?? 1 })) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const page = await request<QueuePage>('/incidents?' + params);
    return { ...page, items: page.items.map(normalizeIncident) };
  },
  async incident(key: string, signal?: AbortSignal) {
    const { incident: raw, revision, details } = await request<WireIncidentDetail>(
      '/incidents/' + encodeURIComponent(key) + '?view=web', { signal },
    );
    return { incident: normalizeIncident(raw), revision, isPresent: details?.isPresent ?? true };
  },
  events: (beforeId?: string, signal?: AbortSignal, afterId?: string) => eventPage('/events', 200, beforeId, signal, afterId),
  incidentEvents: (key: string, beforeId?: string, signal?: AbortSignal) =>
    eventPage('/incidents/' + encodeURIComponent(key) + '/events', 3, beforeId, signal),
  teams: () => request<{ items: { name: string; activeCount: number }[] }>('/teams'),
  assign: (id: string, team: string, expectedRevision: number) =>
    snapshotRequest('/incidents/' + encodeURIComponent(id) + '/assignment', {
      method: 'POST',
      body: JSON.stringify({ team, expectedRevision }),
    }),
  shiftStatistics(from: number, to: number, signal?: AbortSignal) {
    const params = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    });
    return request<PersonalStatistics>('/statistics/shift?' + params, { signal });
  },
  massClusters: (signal?: AbortSignal) => request<MassClusters>('/problems/clusters', { signal }),
  editMassClusters: (edit: MassEdit, expectedRevision: number) =>
    request<MassClusters>('/problems/clusters', {
      method: 'PATCH',
      body: JSON.stringify({ ...edit, expectedRevision }),
    }),
  analysis: (id: string) => request<Analysis>(`/incidents/${encodeURIComponent(id)}/analysis`),
  simulate: (action: string) => snapshotRequest('/demo', { method: 'POST', body: JSON.stringify({ action }) }),
  import: (items: unknown) => snapshotRequest('/incidents', { method: 'PUT', body: JSON.stringify(items) }),
};
