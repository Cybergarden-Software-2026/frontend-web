import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../domain/incidents';
import { api, API_BASE } from './api';
import { normalizeSnapshot } from './wire';

const KEY = 'underctrl.web.snapshot.v1';

function cached(): Snapshot | null {
 try {
  const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  return value && Array.isArray(value.items) && Array.isArray(value.events) ? normalizeSnapshot(value) : null;
 } catch { return null; }
}

export function useIncidents() {
 const [snapshot, setSnapshot] = useState<Snapshot | null>(cached);
 const [connected, setConnected] = useState(false);
 const [online, setOnline] = useState(navigator.onLine);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [clockOffset, setClockOffset] = useState(0);
 // Only compare revisions received from the current API. The offline cache can belong to the demo.
 const live = useRef<Snapshot | null>(null);
 const requestId = useRef(0);

 const accept = useCallback((incoming: Snapshot, fromStream = false, reset = false) => {
  const current = live.current;
  if (current && incoming.revision < current.revision && !reset) return;
  if (current && incoming.revision === current.revision && Date.parse(incoming.serverTime) < Date.parse(current.serverTime)) return;
  live.current = incoming;
  // SSE replays a snapshot built at revision time. HTTP responses carry a fresh clock sample.
  if (!fromStream) setClockOffset(Date.parse(incoming.serverTime) - Date.now());
  setSnapshot(incoming);
  setLoading(false);
  setError(null);
  try { localStorage.setItem(KEY, JSON.stringify(incoming)); } catch {}
 }, []);

 const refresh = useCallback(async () => {
  const id = ++requestId.current;
  const previous = live.current;
  setLoading(true);
  try {
   const incoming = await api.snapshot();
   if (requestId.current !== id) return;
   // A fresh GET can establish a new revision baseline after the database is reinitialized.
   accept(incoming, false, live.current === previous);
   setConnected(true);
  } catch (err) {
   if (requestId.current === id && live.current === previous) {
    setError(err instanceof Error ? err.message : 'Сервер недоступен');
    setConnected(false);
   }
  } finally {
   if (requestId.current === id) setLoading(false);
  }
 }, [accept]);

 useEffect(() => {
  function connect() {
   const stream = new EventSource(API_BASE + '/events/stream?view=web');
   stream.addEventListener('snapshot', event => {
    try {
     const incoming = normalizeSnapshot(JSON.parse((event as MessageEvent).data));
     if (live.current && incoming.revision < live.current.revision) {
      void refresh();
      return;
     }
     accept(incoming, true);
     setConnected(true);
    } catch { setError('Некорректное обновление сервера'); }
   });
   stream.onerror = () => setConnected(false);
   return stream;
  }

  let stream = connect();
  void refresh();
  function restore() {
   if (stream.readyState === EventSource.CLOSED) stream = connect();
   void refresh();
  }
  function updateNetwork() {
   setOnline(navigator.onLine);
   if (navigator.onLine) restore();
   else setConnected(false);
  }
  window.addEventListener('online', updateNetwork);
  window.addEventListener('offline', updateNetwork);
  const retry = setInterval(() => {
   if (navigator.onLine && stream.readyState !== EventSource.OPEN) restore();
  }, 15_000);
  return () => {
   ++requestId.current;
   stream.close();
   clearInterval(retry);
   window.removeEventListener('online', updateNetwork);
   window.removeEventListener('offline', updateNetwork);
  };
 }, [accept, refresh]);

 return { snapshot, connected, online, loading, error, clockOffset, refresh, accept };
}
