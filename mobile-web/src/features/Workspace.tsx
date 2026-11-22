import {useCallback, useEffect, useRef, useState} from 'react';
import {Icon} from '../components/Icon.tsx';
import {Brand, Spinner, message} from '../components/ui.tsx';
import {api, ApiError} from '../data/api.ts';
import {useMobileIncidents} from '../data/useMobileIncidents.ts';
import type {MobileSession} from '../data/vault.ts';
import {IncidentAlerts} from './IncidentAlerts.tsx';
import './mobile-workspace.css';

const pushOwnerKey = 'underctrl-mobile-push-owner';

function remembersPush(owner: string) {
 try { return localStorage.getItem(pushOwnerKey) === owner; }
 catch { return false; }
}

function keepIncidentsRoute() {
 const {hash} = location;
 if (hash === '#alerts' || hash.startsWith('#incident/')) return;
 history.replaceState(history.state, '', '#alerts');
}

export function Workspace({session, onExit, onExpired}: {
 session: MobileSession;
 onExit: () => Promise<void>;
 onExpired: () => void;
}) {
 const owner = session.user.login;
 const current = useMobileIncidents(owner, onExpired);
 const {refresh} = current;
 const [pushBusy, setPushBusy] = useState(false);
 const [pushEnabled, setPushEnabled] = useState(false);
 const [pushStatus, setPushStatus] = useState('');
 const [exitError, setExitError] = useState('');
 const [exiting, setExiting] = useState(false);
 const alive = useRef(true);
 const connectingPush = useRef(false);
 const leaving = useRef(false);

 useEffect(() => {
  keepIncidentsRoute();
  window.addEventListener('hashchange', keepIncidentsRoute);
  return () => window.removeEventListener('hashchange', keepIncidentsRoute);
 }, []);

 useEffect(() => {
  alive.current = true;
  let unsubscribe = () => {};
  void import('../push.ts').then(push => push.listenForeground(refresh)).then(stop => {
   if (alive.current) unsubscribe = stop;
   else stop();
  }).catch(() => {});
  return () => { alive.current = false; unsubscribe(); };
 }, [refresh]);

 const connectPush = useCallback(async (interactive: boolean) => {
  if (connectingPush.current || leaving.current) return;
  connectingPush.current = true;
  setPushBusy(true);
  if (interactive) setPushStatus('');
  try {
   if (typeof Notification === 'undefined') {
    throw new Error('Откройте приложение с домашнего экрана, чтобы подключить уведомления.');
   }
   // iOS requires a direct user gesture. Request permission before loading Firebase.
   const permission = interactive && Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission;
   if (permission !== 'granted') {
    setPushEnabled(false);
    throw new Error('Разрешите уведомления для приложения в системных настройках.');
   }
   const push = await import('../push.ts');
   const {token} = await push.enablePush();
   if (!alive.current || leaving.current) return;
   await api.registerPush(token);
   if (!alive.current || leaving.current) return;
   setPushEnabled(true);
   try { localStorage.setItem(pushOwnerKey, owner); } catch {}
   if (interactive) setPushStatus('Уведомления о критических сбоях подключены.');
  } catch (error) {
   if (!alive.current || leaving.current) return;
   if (error instanceof ApiError && error.status === 401) {
    onExpired();
    return;
   }
   if (error instanceof ApiError || interactive) setPushEnabled(false);
   if (interactive) {
    setPushStatus(error instanceof ApiError && error.code === 'MOBILE_PUSH_DISABLED'
     ? 'Отправка уведомлений пока отключена на сервере.'
     : message(error));
   }
  } finally {
   connectingPush.current = false;
   if (alive.current) setPushBusy(false);
  }
 }, [owner, onExpired]);

 useEffect(() => {
  function renew() {
   if (document.visibilityState !== 'visible') return;
   if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    setPushEnabled(false);
    return;
   }
   if (remembersPush(owner)) void connectPush(false);
  }
  renew();
  const timer = setInterval(renew, 3600000);
  document.addEventListener('visibilitychange', renew);
  window.addEventListener('online', renew);
  return () => {
   clearInterval(timer);
   document.removeEventListener('visibilitychange', renew);
   window.removeEventListener('online', renew);
  };
 }, [owner, connectPush]);

 function openNotifications() {
  if (pushEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
   setPushStatus(status => status ? '' : 'Уведомления о критических сбоях подключены.');
   return;
  }
  void connectPush(true);
 }

 async function exit() {
  if (leaving.current) return;
  leaving.current = true;
  setExiting(true);
  setExitError('');
  setPushStatus('');
  try {
   await onExit();
  } catch (error) {
   if (!alive.current) return;
   if (error instanceof ApiError && error.status === 401) {
    onExpired();
    return;
   }
   leaving.current = false;
   setExiting(false);
   setExitError(message(error));
  }
 }

 return <div className="workspace incident-workspace">
  <header className="app-header">
   <Brand/>
   <div className="workspace-actions">
    <button type="button" className="workspace-action" disabled={pushBusy || exiting}
     aria-label={pushEnabled ? 'Уведомления подключены' : 'Подключить уведомления'}
     aria-busy={pushBusy} onClick={openNotifications}>
     {pushBusy ? <Spinner/> : <Icon name="bell" size={22}/>}
     {pushEnabled && <span className="workspace-push-check"><Icon name="check" size={11}/></span>}
    </button>
    <button type="button" className="workspace-action workspace-exit" aria-label="Выйти из аккаунта"
     disabled={exiting} onClick={() => void exit()}>
     {exiting ? <Spinner/> : <Icon name="logout" size={22}/>}
    </button>
   </div>
  </header>
  <main className="main-content">
   {(pushStatus || exitError) && <div className="workspace-status" role={exitError ? 'alert' : 'status'}>
    <Icon name={exitError ? 'alert' : pushEnabled ? 'circleCheck' : 'bell'} size={18}/>
    <span>{exitError || pushStatus}</span>
    <button type="button" aria-label="Закрыть сообщение" onClick={() => { setPushStatus(''); setExitError(''); }}>
     <Icon name="close" size={18}/>
    </button>
   </div>}
   <IncidentAlerts snapshot={current.snapshot} now={current.now} loading={current.loading} error={current.error} refresh={refresh}/>
  </main>
 </div>;
}
