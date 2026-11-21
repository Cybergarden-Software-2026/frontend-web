import { useRef, useState } from 'react';
import type { Snapshot } from '../domain/incidents';
import { Icon } from './Icon';
import { dateTime } from './ui';

export function ConnectionNotice({ online, snapshot, loading, onRetry }: {
 online: boolean;
 snapshot: Snapshot | null;
 loading: boolean;
 onRetry: () => Promise<void>;
}) {
 const [retrying, setRetrying] = useState(false);
 const inFlight = useRef(false);
 const busy = loading || retrying;

 async function retry() {
  if (inFlight.current || loading) return;
  inFlight.current = true;
  setRetrying(true);
  try {
   // Keep fast failures legible while the request itself starts immediately.
   await Promise.allSettled([onRetry(), new Promise(resolve => setTimeout(resolve, 600))]);
  } finally {
   inFlight.current = false;
   setRetrying(false);
  }
 }

 return <div className="notice notice-warning" role="status">
  <Icon name="alert"/>
  <div>
   <strong>{!online ? 'В данный момент сети нет' : 'Нет соединения с сервером'}</strong>
   <p>{snapshot
    ? `Показываем сохранённые данные. Они могли устареть. Последнее изменение: ${dateTime(snapshot.updatedAt)}.`
    : 'Последние данные ещё не загружены. Подключитесь к серверу и обновите страницу.'}</p>
  </div>
  <button className="text-button connection-retry" disabled={busy} aria-busy={busy} onClick={() => void retry()}>
   {busy && <span className="retry-spinner" aria-hidden="true"/>}
   {busy ? 'Подключаемся…' : 'Повторить'}
  </button>
 </div>;
}
