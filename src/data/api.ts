import type { ProblemCluster, QueuePage, QueueQuery } from '../domain/operations';
import type { MassExclusion } from '../domain/massProblems.ts';
import type { PersonalStatistics } from '../domain/personalStatistics.ts';
import type { Analysis, CoordinationClaim } from '../domain/incidents';
import type { TeamDirectoryEntry } from '../domain/teamDirectory.ts';
import { normalizeIncident, normalizeSnapshot, normalizeEvent, type WireEvent, type WireSnapshot } from './wire.ts';

export const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
const COORDINATOR_SESSION_PATH = '/auth/coordinator/session';
const unauthorized = new EventTarget();
let sessionVersion = 0;

export function onApiUnauthorized(listener: () => void) {
  unauthorized.addEventListener('unauthorized', listener);
  return () => unauthorized.removeEventListener('unauthorized', listener);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function responseFor(path: string, init?: RequestInit): Promise<Response> {
  const requestedSession = sessionVersion;
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(API_BASE + path, { cache: 'no-store', ...init, headers, credentials: 'include' });
  if (!response.ok) {
    if (response.status === 401 && path !== COORDINATOR_SESSION_PATH && requestedSession === sessionVersion) {
      unauthorized.dispatchEvent(new Event('unauthorized'));
    }
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.error ?? body?.message ?? `Сервер вернул HTTP ${response.status}`, body?.code);
  }
  return response;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await responseFor(path, init)).json();
}

export type CoordinatorMode = 'accounts' | 'shared-key' | 'none';
export type CoordinatorCredentials =
  | { key: string; remember: boolean }
  | { login: string; password: string; remember: boolean };

export interface CoordinatorIdentity {
  login: string;
  displayName: string;
}

export interface MobilePairing {
  code: string;
  expiresAt: string;
}

export interface MobileDevice {
  deviceId: string;
  platform: 'android' | 'web';
  createdAt: string;
  pushEnabled: boolean;
}

export interface CoordinatorSession {
  required: boolean;
  authenticated: boolean;
  mode?: CoordinatorMode;
  coordinator?: CoordinatorIdentity;
}

async function coordinatorSession(init: RequestInit): Promise<CoordinatorSession> {
  const value = await request<CoordinatorSession | null>(COORDINATOR_SESSION_PATH, init);
  if (typeof value?.required !== 'boolean' || typeof value.authenticated !== 'boolean') {
    throw new Error('Сервер вернул некорректное состояние входа');
  }
  const { mode, coordinator } = value;
  if ((mode !== undefined && !['accounts', 'shared-key', 'none'].includes(mode))
    || (coordinator !== undefined && (typeof coordinator?.login !== 'string' || typeof coordinator.displayName !== 'string'))
    || (mode === 'accounts' && value.authenticated && !coordinator)) {
    throw new Error('Сервер вернул некорректное состояние входа');
  }
  return value;
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
  createMobilePairing: (signal: AbortSignal) =>
    request<MobilePairing>('/mobile/pairings', { method: 'POST', signal }),
  mobileDevices: (signal: AbortSignal) =>
    request<{ items: MobileDevice[] }>('/mobile/devices', { signal }),
  async removeMobileDevice(deviceId: string, signal: AbortSignal) {
    await responseFor('/mobile/devices/' + encodeURIComponent(deviceId), { method: 'DELETE', signal });
  },
  coordinatorSession: (signal?: AbortSignal) => coordinatorSession({ signal }),
  async signInCoordinator(credentials: CoordinatorCredentials, signal?: AbortSignal) {
    const session = await coordinatorSession({ method: 'POST', body: JSON.stringify(credentials), signal });
    sessionVersion++;
    return session;
  },
  async signOutCoordinator(signal?: AbortSignal) {
    await responseFor(COORDINATOR_SESSION_PATH, { method: 'DELETE', signal });
    sessionVersion++;
  },
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
  teams: () => request<{ items: (TeamDirectoryEntry & { activeCount: number })[] }>('/teams'),
  setCoordinationClaim: (sysId: string, claim: boolean, signal?: AbortSignal) =>
    request<{ coordinationClaim: CoordinationClaim | null; revision: number }>(
      '/incidents/' + encodeURIComponent(sysId) + '/coordination-claim', { method: claim ? 'PUT' : 'DELETE', signal },
    ),
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
  analysis: (id: string, signal?: AbortSignal) =>
    request<Analysis>(`/incidents/${encodeURIComponent(id)}/analysis`, { signal }),
  simulate: (action: string) => snapshotRequest('/demo', { method: 'POST', body: JSON.stringify({ action }) }),
  import: (items: unknown) => snapshotRequest('/incidents', { method: 'PUT', body: JSON.stringify(items) }),
};
