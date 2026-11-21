import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';
import type { MassClusters, MassEdit } from './api';

export function useMassClusters(connected: boolean, snapshotRevision: number | undefined, active: boolean) {
 const [view, setView] = useState<MassClusters | null>(null);
 const [loading, setLoading] = useState(false);
 const [loadError, setLoadError] = useState(false);
 const [editError, setEditError] = useState<string | null>(null);
 const [editing, setEditing] = useState(false);
 const [attempt, setAttempt] = useState(0);
 const sequence = useRef(0);
 const writing = useRef(false);
 const retry = () => setAttempt(value => value + 1);

 useEffect(() => {
  if (!connected) {
   setLoading(false);
   return;
  }
  let request: AbortController | null = null;
  async function load() {
   if (writing.current || request) return;
   const id = ++sequence.current;
   const controller = new AbortController();
   request = controller;
   setLoading(true);
   try {
    const result = await api.massClusters(controller.signal);
    if (id === sequence.current && !controller.signal.aborted) {
     setView(result);
     setLoadError(false);
    }
   } catch {
    if (id === sequence.current && !controller.signal.aborted) setLoadError(true);
   } finally {
    request = null;
    if (id === sequence.current && !controller.signal.aborted) setLoading(false);
   }
  }
  void load();
  const timer = active ? setInterval(() => void load(), 10_000) : undefined;
  return () => {
   if (timer !== undefined) clearInterval(timer);
   request?.abort();
  };
 }, [connected, snapshotRevision, attempt, active]);

 async function edit(change: MassEdit, expectedRevision = view?.revision, errorPrefix = '') {
  if (!connected || expectedRevision === undefined || writing.current) return null;
  writing.current = true;
  ++sequence.current;
  setLoading(false);
  setEditing(true);
  setEditError(null);
  try {
   const updated = await api.editMassClusters(change, expectedRevision);
   setView(updated);
   setLoadError(false);
   return updated;
  } catch (error) {
   const reason = error instanceof ApiError && error.status === 409
    ? 'Состав групп или данные инцидентов изменились. Проверьте обновлённые данные и повторите действие.'
    : error instanceof Error ? error.message : 'Не удалось сохранить состав групп.';
   setEditError(errorPrefix + reason);
   return null;
  } finally {
   writing.current = false;
   setEditing(false);
   retry();
  }
 }

 return { view, loading, loadError, editError, editing, edit, retry };
}
