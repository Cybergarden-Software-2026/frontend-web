import {useEffect, useRef, useState} from 'react';
import {Icon} from '../components/Icon.tsx';
import {Spinner, message} from '../components/ui.tsx';
import {api, ApiError, API_BASE} from '../data/api.ts';

export function TeamContactAction({owner, sysId, team, refresh, onExpired}: {
  owner: string;
  sysId: string;
  team: string;
  refresh: () => void;
  onExpired: () => void;
}) {
  const storageKey = 'underctrl-team-contact:' + JSON.stringify([API_BASE, owner, sysId, team]);
  const pendingId = useRef<string | null>(null);
  const active = useRef(true);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function record() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setSaved(false);
    setError('');
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
      if (outdated || code === 'TEAM_CONTACT_REQUEST_CONFLICT') clearPending();
      if (!active.current) return;
      if (failure instanceof ApiError && failure.status === 401) {
        onExpired();
        return;
      }
      if (outdated) refresh();
      setError(message(failure));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  return <div className="mobile-team-contact">
    <button type="button" className="button outline" onClick={() => void record()} disabled={busy} aria-busy={busy}>
      {busy ? <Spinner/> : <Icon name="check" size={16}/>}
      {saved ? 'Отметить повторный контакт' : 'Связались с командой'}
    </button>
    {saved && <p role="status">Контакт записан в журнал.</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}
