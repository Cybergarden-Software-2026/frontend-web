import { useEffect,useRef,useState } from 'react';
import type { ChangeEvent } from '../domain/incidents.ts';
import { timestamp } from '../domain/incidents.ts';
import { JOURNAL_PERIODS } from '../domain/eventJournal.ts';
import { api } from './api.ts';

interface HistoryOptions {
 period: string;
 connected: boolean;
 now: number;
 since?: number;
 events: readonly ChangeEvent[];
 historyEpoch: number;
}

interface Archive {
 key: string;
 events: ChangeEvent[];
 loading: boolean;
 failed: boolean;
 settled: boolean;
}

export function eventWindow(events: ReadonlyArray<Pick<ChangeEvent,'eventId'>>, coveredHead: number) {
 let oldest = Infinity, newest = coveredHead;
 for (const { eventId } of events) {
  oldest = Math.min(oldest, eventId);
  newest = Math.max(newest, eventId);
 }
 const gap = newest > coveredHead && oldest > coveredHead + 1;
 return {
  newest,
  bounds: gap ? { afterId: String(coveredHead), beforeId: String(oldest) } : null,
 };
}

async function readPages(
 signal: AbortSignal,
 visit: (events: ChangeEvent[]) => boolean,
 beforeId?: string,
 afterId?: string,
) {
 const seen = new Set<string>();
 if (beforeId) seen.add(beforeId);
 while (!signal.aborted) {
  const page = await api.events(beforeId,signal,afterId);
  if (signal.aborted) return;
  const done = visit(page.items);
  if (done || !page.nextCursor || !page.items.length) return;
  if (seen.has(page.nextCursor)) throw new Error('Повтор курсора истории');
  beforeId = page.nextCursor;
  seen.add(beforeId);
 }
}

export function useEventHistory({period,connected,now,since,events,historyEpoch}: HistoryOptions) {
 const key = JSON.stringify([historyEpoch,period,since]);
 const [archive,setArchive] = useState<Archive | null>(null);
 const [attempt,setAttempt] = useState(0);
 const saved = useRef<Archive | null>(null);
 const recent = useRef(events);
 const offer = useRef<((incoming: readonly ChangeEvent[]) => void) | null>(null);
 const clock = useRef(now);

 useEffect(() => { clock.current = now; },[now]);
 useEffect(() => {
  recent.current = events;
  offer.current?.(events);
 },[events]);

 useEffect(() => {
  if (!connected) return;
  const controller = new AbortController();
  const { signal } = controller;
  const duration = JOURNAL_PERIODS.find(row=>row.id===period)?.duration ?? 24*3600_000;
  const cutoff = since ?? clock.current - duration;
  const retained = saved.current?.key===key ? saved.current.events : [];
  const rows = new Map(retained.map(event=>[event.eventId,event]));
  let loading = true, failed = false, loaded = false;
  let coveredHead = 0;

  function merge(incoming: readonly ChangeEvent[]) {
   let changed = false;
   for (const event of incoming) {
    if (rows.get(event.eventId) === event) continue;
    rows.set(event.eventId,event);
    changed = true;
   }
   return changed;
  }

  function publish() {
   if (signal.aborted) return;
   const state = { key, events:[...rows.values()], loading, failed, settled:loaded&&!loading&&!failed };
   saved.current = state;
   setArchive(state);
  }

  // A complete live window overlaps the archive head. When it does not, the
  // server can return the older missing interval without repeating the archive.
  async function catchUp() {
   if (!loaded || loading || failed || signal.aborted) return;
   let window = eventWindow(recent.current,coveredHead);
   if (!window.bounds) {
    coveredHead = window.newest;
    return;
   }
   loading = true;
   publish();
   try {
    while (!signal.aborted) {
     const { newest,bounds } = window;
     if (bounds) {
      await readPages(signal,page=>{
       if (merge(page)) publish();
       return false;
      },bounds.beforeId,bounds.afterId);
     }
     coveredHead = newest;
     window = eventWindow(recent.current,coveredHead);
     if (window.newest===coveredHead) break;
    }
   } catch {
    failed = !signal.aborted;
   } finally {
    loading = false;
    publish();
   }
  }

  const acceptLive = (incoming: readonly ChangeEvent[]) => {
   if (merge(incoming)) publish();
   void catchUp();
  };
  offer.current = acceptLive;
  merge(recent.current);
  publish();

  async function load() {
   let first = true;
   try {
    await readPages(signal,page=>{
     if (first) {
      coveredHead = eventWindow(page,0).newest;
      first = false;
     }
     if (merge(page)) publish();
     return page.some(event=>{
      const at=timestamp(event.at);
      return at!==null && at<cutoff;
     });
    });
    loaded = !signal.aborted;
   } catch {
    failed = !signal.aborted;
   } finally {
    loading = false;
    publish();
   }
   void catchUp();
  }
  void load();
  return () => {
   controller.abort();
   if (offer.current===acceptLive) offer.current = null;
  };
 },[connected,key,period,since,attempt]);

 const current = archive?.key===key ? archive : null;
 return {
  archive: current?.events ?? events,
  loading: connected && (current?.loading ?? true),
  failed: current?.failed ?? false,
  settled: connected && (current?.settled ?? false),
  retry:()=>setAttempt(value=>value+1),
 };
}
