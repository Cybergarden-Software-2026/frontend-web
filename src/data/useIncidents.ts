import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../domain/incidents';
import { api, API_BASE } from './api';
import { normalizeSnapshot } from './wire';
import { SNAPSHOT_KEY } from './workspaceSessionCache';

const RETRY_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;

function cached(): Snapshot | null {
 try {
  const value = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null');
  return value && Array.isArray(value.items) && Array.isArray(value.events) ? normalizeSnapshot(value) : null;
 } catch { return null; }
}

export function useIncidents(persistSnapshot = true) {
 const [snapshot, setSnapshot] = useState<Snapshot | null>(() => persistSnapshot ? cached() : null);
 const [connected, setConnected] = useState(false);
 const [checked, setChecked] = useState(false);
 const [online, setOnline] = useState(navigator.onLine);
 const [loading, setLoading] = useState(navigator.onLine);
 const [error, setError] = useState<string | null>(null);
 const [clockOffset, setClockOffset] = useState(0);
 const [historyEpoch, setHistoryEpoch] = useState(0);
 const live = useRef<Snapshot | null>(null);
 const transport = useRef({ http: false, stream: false });
 const requestId = useRef(0);
 const pending = useRef<{ controller: AbortController; request: Promise<void> } | null>(null);

 const updateConnection = useCallback(() => {
  setConnected(navigator.onLine && (transport.current.http || transport.current.stream));
 }, []);

 const accept = useCallback((incoming: Snapshot, fromStream = false, reset = false) => {
  const current = live.current;
  const rolledBack = current !== null && incoming.revision < current.revision;
  if (rolledBack && !reset) return;
  if (current && incoming.revision === current.revision && Date.parse(incoming.serverTime) < Date.parse(current.serverTime)) return;
  if (rolledBack) setHistoryEpoch(epoch => epoch + 1);
  live.current = incoming;
  // HTTP responses carry a fresh clock sample. SSE can replay a snapshot from an earlier time.
  if (!fromStream) setClockOffset(Date.parse(incoming.serverTime) - Date.now());
  setSnapshot(incoming);
  setLoading(false);
  setError(null);
  if (persistSnapshot) {
   try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(incoming)); } catch {}
  }
 }, [persistSnapshot]);

 const refresh = useCallback((): Promise<void> => {
  if (!navigator.onLine) return Promise.resolve();
  if (pending.current) return pending.current.request;
  const id = ++requestId.current;
  const previous = live.current;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  setLoading(true);

  const request = (async () => {
   try {
    const incoming = await api.snapshot(controller.signal);
    if (requestId.current !== id) return;
    // Reset the baseline only if the HTTP request did not race a newer accepted snapshot.
    accept(incoming, false, live.current === previous);
    transport.current.http = true;
    setError(null);
   } catch (err) {
    if (requestId.current !== id) return;
    transport.current.http = false;
    if (!transport.current.stream) {
     setError(err instanceof Error ? err.message : 'Сервер недоступен');
    }
   } finally {
    clearTimeout(timeout);
    if (requestId.current === id) {
     pending.current = null;
     setChecked(true);
     setLoading(false);
     updateConnection();
    }
   }
  })();
  pending.current = { controller, request };
  return request;
 }, [accept, updateConnection]);

 const refreshAfterMutation = useCallback(async () => {
  // A snapshot request started before the mutation may return the previous revision.
  await pending.current?.request;
  await refresh();
 }, [refresh]);

 useEffect(() => {
  let stream: EventSource | null = null;
  function connect() {
   if (!navigator.onLine || (stream && stream.readyState !== EventSource.CLOSED)) return;
   const source = new EventSource(API_BASE + '/events/stream?view=web', { withCredentials: true });
   stream = source;
   source.addEventListener('snapshot', event => {
    if (source !== stream || !navigator.onLine) return;
    try {
     const incoming = normalizeSnapshot(JSON.parse((event as MessageEvent).data));
     if (live.current && incoming.revision < live.current.revision) {
      void refresh();
      return;
     }
     accept(incoming, true);
     transport.current.stream = true;
     setChecked(true);
     updateConnection();
    } catch {
     transport.current.stream = false;
     updateConnection();
     void refresh();
    }
   });
   source.onerror = () => {
    if (source !== stream) return;
    const hadStream = transport.current.stream;
    transport.current.stream = false;
    updateConnection();
    if (hadStream || source.readyState === EventSource.CLOSED) void refresh();
   };
  }

  function restore() {
   connect();
   void refresh();
  }

  function disconnect() {
   ++requestId.current;
   pending.current?.controller.abort();
   pending.current = null;
   stream?.close();
   stream = null;
   transport.current = { http: false, stream: false };
  }

  function updateNetwork() {
   setOnline(navigator.onLine);
   if (navigator.onLine) restore();
   else {
    disconnect();
    setLoading(false);
    updateConnection();
   }
  }

  restore();
  window.addEventListener('online', updateNetwork);
  window.addEventListener('offline', updateNetwork);
  const retry = setInterval(() => {
   if (navigator.onLine && !transport.current.stream) restore();
  }, RETRY_MS);

  return () => {
   disconnect();
   clearInterval(retry);
   window.removeEventListener('online', updateNetwork);
   window.removeEventListener('offline', updateNetwork);
  };
 }, [accept, refresh, updateConnection]);

 return { snapshot, connected, checked, online, loading, error, clockOffset, historyEpoch, refresh, refreshAfterMutation, accept };
}
