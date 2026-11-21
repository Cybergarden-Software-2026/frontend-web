import type { QueuePage, QueueQuery } from '../domain/operations';
import { coordinatorAuth, signOut } from './coordinatorSession.ts';
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

export const api = {
  snapshot: () => snapshotRequest('/snapshot?view=web'),
  async incidents(query: QueueQuery): Promise<QueuePage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, page: query.page ?? 1 })) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const page = await request<QueuePage>('/incidents?' + params);
    return { ...page, items: page.items.map(normalizeIncident) };
  },
  async events(beforeId?:string,signal?:AbortSignal) {
    const params=new URLSearchParams({limit:'200'});
    if(beforeId)params.set('beforeId',beforeId);
    const page=await request<{items:WireEvent[];nextCursor?:string|null}>('/events?'+params,{signal});
    return {items:page.items.map(normalizeEvent),nextCursor:page.nextCursor??null};
  },
  teams: () => request<{ items: { name: string; activeCount: number }[] }>('/teams'),
  async assign(id: string, team: string, expectedRevision: number, token?: string) {
    const saved = coordinatorAuth.getSnapshot().session?.token;
    const key = token ?? saved;
    try {
      return await snapshotRequest(`/incidents/${encodeURIComponent(id)}/assignment`, {
        method: 'POST', headers: key ? { Authorization: `Bearer ${key}` } : undefined,
        body: JSON.stringify({ team, expectedRevision }),
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && key && key === coordinatorAuth.getSnapshot().session?.token) {
        signOut('Ключ больше не действует или указан неверно. Введите ключ координатора заново.');
      }
      throw error;
    }
  },
  analysis: (id: string) => request<Analysis>(`/incidents/${encodeURIComponent(id)}/analysis`),
  simulate: (action: string) => snapshotRequest('/demo', { method: 'POST', body: JSON.stringify({ action }) }),
  import: (items: unknown) => snapshotRequest('/incidents', { method: 'PUT', body: JSON.stringify(items) }),
};
