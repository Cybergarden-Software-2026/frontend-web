import { Icon } from '../components/Icon';
import { belongs, type Incident } from '../domain/incidents';

export interface CoordinationActions {
 login?: string;
 enabled: boolean;
 pending: ReadonlySet<string>;
 change: (sysId: string, claim: boolean) => void;
}

export function CoordinationControl({ item, actions, present = true }: {
 item: Incident;
 actions: CoordinationActions;
 present?: boolean;
}) {
 const claim = item.coordinationClaim;
 if (claim === undefined || !present || !belongs(item, 'coordinators')) return null;

 const own = claim !== null && claim.login === actions.login;
 const canChange = Boolean(actions.login) && (!claim || own);
 const pending = actions.pending.has(item.sysId);
 if (!claim && !canChange) return null;

 return <div className="coordination-control">
  {claim && <span className="coordination-status" role="status">
   <Icon name="circleCheck" size={14}/>
   {own ? 'В работе у вас' : `В работе · ${claim.displayName}`}
  </span>}
  {canChange && <button
   className="coordination-action"
   type="button"
   disabled={!actions.enabled || pending}
   onClick={event => {
    event.stopPropagation();
    actions.change(item.sysId, !own);
   }}
  >
   {pending ? 'Обновляем…' : own ? 'Освободить инцидент' : 'Принять в работу'}
  </button>}
 </div>;
}
