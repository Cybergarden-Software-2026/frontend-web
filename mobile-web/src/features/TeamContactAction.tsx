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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{message: string; retry: boolean} | null>(null);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function record() {
    if (!telephone || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
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
      if (outdated) refresh();
      setError({message: message(failure), retry});
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  const label = <><Icon name="handset" size={18}/>Связаться с командой</>;

  return <div className="mobile-team-contact">
    {telephone ? <a className="button outline" href={telephone} aria-disabled={busy} aria-busy={busy} onClick={event => {
      if (inFlight.current) {
        event.preventDefault();
        return;
      }
      // Preserve the link's default action so the same tap opens the dialer.
      void record();
    }}>{label}</a> : <button type="button" className="button outline" disabled>{label}</button>}
    {error && <>
      <p role="alert" className="error">{error.message}</p>
      {error.retry && telephone && <button type="button" className="text-button" onClick={() => void record()}>Повторить запись</button>}
    </>}
  </div>;
}
