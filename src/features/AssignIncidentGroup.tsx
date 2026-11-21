import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../domain/incidents';
import { canAssign } from '../domain/operations';
import type { AssignmentReview, GroupAssignmentResult } from '../data/assignIncidentGroup';
import { assignIncidentGroup } from '../data/assignIncidentGroup';
import { api } from '../data/api';
import { Dialog, Team } from '../components/ui';

interface GroupAssignment {
 title: string;
 team: string;
 reviewed: AssignmentReview[];
 results: GroupAssignmentResult[];
 phase: 'running' | 'stopping' | 'review' | 'refreshing' | 'ready' | 'finished';
 error: string;
}

function reviewMembers(memberIds: string[], snapshot: Snapshot): AssignmentReview[] {
 const items = new Map(snapshot.items.map(item => [item.sysId, item]));
 return [...new Set(memberIds)].map(sysId => ({
  sysId, team: items.get(sysId)?.assignedGroupName ?? '',
 }));
}

function confirmed(results: GroupAssignmentResult[]) {
 return results.filter(row => row.status === 'assigned' || row.status === 'unchanged');
}

export function useGroupAssignment(snapshot: Snapshot | null, onAccept: (value: Snapshot) => void) {
 const [batch, setBatch] = useState<GroupAssignment | null>(null);
 const alive = useRef(false);
 const busy = useRef(false);
 const stop = useRef(false);
 useEffect(() => {
  alive.current = true;
  return () => { alive.current = false; stop.current = true; };
 }, []);

 function update(change: Partial<GroupAssignment>) {
  if (alive.current) setBatch(current => current && { ...current, ...change });
 }

 async function submit(current: GroupAssignment, initialSnapshot: Snapshot) {
  if (busy.current) return;
  const previous = confirmed(current.results);
  const completed = new Set(previous.map(row => row.sysId));
  const remaining = current.reviewed.filter(row => !completed.has(row.sysId));
  if (!remaining.length) {
   update({ phase: 'finished' });
   return;
  }
  busy.current = true;
  stop.current = false;
  update({ phase: 'running', error: '' });
  try {
   const outcome = await assignIncidentGroup({
    reviewed: remaining, team: current.team, snapshot: initialSnapshot,
    onSnapshot: value => { if (alive.current) onAccept(value); },
    onProgress: results => update({ results: [...previous, ...results] }),
    shouldStop: () => stop.current,
   });
   update({
    results: [...previous, ...outcome.results],
    phase: outcome.interrupted ? 'review' : 'finished',
    error: !outcome.interrupted ? '' : outcome.stopped
     ? 'Обработка остановлена. Уже выполненные назначения сохранены.'
     : 'Обработка остановлена после ошибки. Уже выполненные назначения сохранены. Обновите данные перед продолжением.',
   });
  } catch (error) {
   update({ phase: 'review', error: error instanceof Error ? error.message : 'Не удалось завершить групповое назначение.' });
  } finally {
   busy.current = false;
  }
 }

 function start(title: string, memberIds: string[], team: string) {
  if (!snapshot || batch || busy.current || !team || !memberIds.length) return;
  const current: GroupAssignment = {
   title, team, reviewed: reviewMembers(memberIds, snapshot), results: [], phase: 'running', error: '',
  };
  setBatch(current);
  void submit(current, snapshot);
 }

 async function refresh() {
  if (!batch || batch.phase !== 'review' || busy.current) return;
  busy.current = true;
  update({ phase: 'refreshing', error: '' });
  try {
   const current = await api.snapshot();
   if (!alive.current) return;
   onAccept(current);
   const previous = confirmed(batch.results);
   const completed = new Set(previous.map(row => row.sysId));
   const remaining = batch.reviewed.filter(row => !completed.has(row.sysId));
   update({
    reviewed: [...batch.reviewed.filter(row => completed.has(row.sysId)), ...reviewMembers(remaining.map(row => row.sysId), current)],
    results: previous,
    phase: 'ready',
   });
  } catch (error) {
   update({ phase: 'review', error: error instanceof Error ? error.message : 'Не удалось обновить данные.' });
  } finally {
   busy.current = false;
  }
 }

 function resume() {
  if (batch?.phase === 'ready' && snapshot) void submit(batch, snapshot);
 }

 function close() {
  if (batch?.phase === 'refreshing') return;
  if (busy.current) {
   stop.current = true;
   update({ phase: 'stopping' });
  } else {
   setBatch(null);
  }
 }

 return { batch, start, refresh, resume, close };
}

type GroupAssignmentControls = ReturnType<typeof useGroupAssignment>;

export function AssignIncidentGroup({controls, snapshot}: {controls: GroupAssignmentControls; snapshot: Snapshot}) {
 const { batch, refresh, resume, close } = controls;
 if (!batch) return null;
 const { title, team, reviewed, results, phase, error } = batch;
 const running = phase === 'running' || phase === 'stopping';
 const refreshing = phase === 'refreshing';
 const footer = <footer className="assignment-footer">
  {phase !== 'finished' && <button className="button secondary" disabled={phase === 'stopping' || refreshing} onClick={close}>
   {running ? phase === 'stopping' ? 'Останавливаем…' : 'Остановить' : 'Закрыть'}
  </button>}
  {phase === 'finished' && <button className="button primary" onClick={close}>Готово</button>}
  {(phase === 'review' || refreshing) && <button className="button primary" disabled={refreshing} onClick={() => void refresh()}>
   {refreshing ? 'Обновляем…' : 'Обновить и проверить'}
  </button>}
  {phase === 'ready' && <button className="button primary" onClick={resume}>Продолжить оставшиеся</button>}
 </footer>;
 return <Dialog title="Назначение команды группе" className="assignment-dialog mass-assignment-dialog" footer={footer} onClose={close}>
  <div className="assignment-intro"><h3>{title}</h3><Team name={team}/></div>
  <details className="mass-batch-members" open={phase === 'ready'}>
   <summary>Состав группы · {reviewed.length}</summary>
   <ul>{reviewed.map(row => {
    const item = snapshot.items.find(value => value.sysId === row.sysId);
    return <li key={row.sysId}><strong>{item?.id ?? row.sysId}</strong><span>{item?.header ?? 'Запись больше не доступна'}</span>
     <small>{item && !canAssign(item) ? 'Уже завершён или закрыт' : item?.assignedGroupName || 'Команда не назначена'}</small>
    </li>;
   })}</ul>
  </details>
  <div className="mass-batch-progress" aria-live="polite">
   <p>Обработано {results.length} из {reviewed.length}</p>
   <progress max={Math.max(1, reviewed.length)} value={results.length}/>
   <ul>{results.map(row => <li key={row.sysId} className={`mass-result-${row.status}`}><strong>{row.incidentId}</strong><span>{row.message}</span></li>)}</ul>
   {phase === 'finished' && <p>Назначено {results.filter(row => row.status === 'assigned').length} · Уже в команде {results.filter(row => row.status === 'unchanged').length} · Пропущено {results.filter(row => row.status === 'skipped').length}</p>}
  </div>
  {error && <p className="form-error" role="alert">{error}</p>}
  {phase === 'ready' && <p className="assignment-note">Проверьте текущие команды перед продолжением.</p>}
 </Dialog>;
}
