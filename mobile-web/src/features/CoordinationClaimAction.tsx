import {useEffect, useRef, useState} from 'react';
import {Icon} from '../components/Icon.tsx';
import {message, Spinner} from '../components/ui.tsx';
import {api, ApiError, type CoordinationClaimResult} from '../data/api.ts';
import {coordinationClaimLabel, type CoordinationClaim} from '../domain/mobileIncidents.ts';

export function CoordinationClaimAction({sysId, claim, revision, owner, refresh, onExpired}: {
  sysId: string;
  claim: CoordinationClaim | null;
  revision: number;
  owner: string;
  refresh: () => void;
  onExpired: () => void;
}) {
  const [confirmed, setConfirmed] = useState<CoordinationClaimResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const active = useRef(true);
  // Keep the returned owner visible until polling reaches the confirmed revision.
  const current = confirmed && confirmed.revision > revision ? confirmed.coordinationClaim : claim;
  const isOwner = current?.login === owner;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function update() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api.coordinationClaim(sysId, isOwner ? 'DELETE' : 'PUT');
      if (active.current) setConfirmed(result);
      refresh();
    } catch (failure) {
      if (failure instanceof ApiError && (failure.status === 409 || failure.code === 'INCIDENT_NOT_FOUND')) refresh();
      if (!active.current) return;
      if (failure instanceof ApiError && failure.status === 401) {
        onExpired();
        return;
      }
      setError(message(failure));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  return <div className="mobile-claim-action">
    {current && <p className="mobile-claim-label" role="status">{coordinationClaimLabel(current,owner)}</p>}
    {(!current || isOwner) && <button type="button" className="button outline" disabled={busy} aria-busy={busy} onClick={() => void update()}>
      {busy ? <Spinner/> : <Icon name={isOwner ? 'close' : 'userPlus'} size={17}/>}
      {isOwner ? 'Освободить инцидент' : 'Принять в работу'}
    </button>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
