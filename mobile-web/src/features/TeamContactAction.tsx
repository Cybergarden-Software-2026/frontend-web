import {useEffect, useRef, useState} from 'react';
import {Icon} from '../components/Icon.tsx';
import {message} from '../components/ui.tsx';
import {api, ApiError, API_BASE} from '../data/api.ts';

export function TeamContactAction({owner, sysId, team, telephone, refresh, onExpired}: {
  owner: string;
  sysId: string;
  team: string;
  telephone: string | null;
  refresh: () => void;
  onExpired: () => void;
}) {
  const storageKey = 'underctrl-team-contact:' + JSON.stringify([API_BASE, owner, sysId, team]);
  const pendingId = useRef<string | null>(null);
  const active = useRef(true);
  const inFlight = useRef(false);
  const callDialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{message: string; retry: boolean} | null>(null);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function record() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setSaved(false);
    setError(null);
    let storedId: string | null = null;
    try { storedId = localStorage.getItem(storageKey); } catch {}
    const requestId = pendingId.current ?? storedId ?? crypto.randomUUID();
    pendingId.current = requestId;
    try { localStorage.setItem(storageKey, requestId); } catch {}

    function clearPending() {
      pendingId.current = null;
      try {
        if (localStorage.getItem(storageKey) === requestId) localStorage.removeItem(storageKey);
      } catch {}
    }

    try {
      await api.recordTeamContact(sysId, team, requestId);
      clearPending();
      if (active.current) setSaved(true);
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : '';
      const outdated = ['INCIDENT_NOT_FOUND', 'TEAM_CONTACT_ASSIGNMENT_CHANGED', 'TEAM_CONTACT_UNAVAILABLE'].includes(code);
      const retry = !outdated && code !== 'TEAM_CONTACT_REQUEST_CONFLICT';
      if (!retry) clearPending();
      if (!active.current) return;
      if (failure instanceof ApiError && failure.status === 401) {
        onExpired();
        return;
      }
      if (outdated) {
        callDialog.current?.close();
        refresh();
      }
      setError({message: message(failure), retry});
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  return <div className="mobile-team-contact">
    <button type="button" className="button outline" aria-haspopup="dialog" disabled={busy} aria-busy={busy} onClick={() => {
      void record();
      callDialog.current?.showModal();
    }}>
      <Icon name="handset" size={18}/>Связаться с командой
    </button>
    <dialog ref={callDialog} className="mobile-team-call-dialog" aria-labelledby="team-call-title" aria-describedby="team-call-detail">
      <h2 id="team-call-title">{telephone ? 'Открыть приложение «Телефон»?' : 'Рабочий номер команды недоступен'}</h2>
      <p id="team-call-detail">{telephone ? <>Будет подставлен номер <strong>{telephone.slice(4)}</strong>.</> : 'Позвонить можно после добавления рабочего номера.'}</p>
      <div className="mobile-team-call-actions">
        <button type="button" className="button outline" onClick={() => callDialog.current?.close()}>{telephone ? 'Отмена' : 'Понятно'}</button>
        {telephone && <a className="button primary" href={telephone} onClick={() => callDialog.current?.close()}>
          Открыть телефон
        </a>}
      </div>
    </dialog>
    {saved && <p role="status">Контакт записан в журнал.</p>}
    {error && <>
      <p role="alert" className="error">{error.message}</p>
      {error.retry && <button type="button" className="text-button" onClick={() => void record()}>Повторить запись</button>}
    </>}
  </div>;
}
