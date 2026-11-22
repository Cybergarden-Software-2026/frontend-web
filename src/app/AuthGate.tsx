import { useEffect, useRef, useState } from 'react';
import { api, ApiError, onApiUnauthorized } from '../data/api';
import type { CoordinatorCredentials, CoordinatorSession } from '../data/api';
import { clearLegacyCoordinatorKeys, clearWorkspaceSessionCache } from '../data/workspaceSessionCache';
import { LoginPage } from '../features/LoginPage';
import { App } from './App';
import { enterPresentation } from './presentationEntry';

const DEMO = import.meta.env.VITE_DEMO_API === 'true';
const AUTH_TIMEOUT_MS = 10_000;

export function AuthGate({ presentationLink }: { presentationLink: (() => string) | null }) {
 const [session, setSession] = useState<CoordinatorSession | null>(null);
 const [checkFailed, setCheckFailed] = useState(false);
 const [attempt, setAttempt] = useState(0);
 const [notice, setNotice] = useState<string | null>(null);
 const [presentationNotice, setPresentationNotice] = useState<string | undefined>();
 const sessionChange = useRef(0);
 const pendingLink = useRef(presentationLink);

 useEffect(() => {
  clearLegacyCoordinatorKeys();
  return onApiUnauthorized(() => {
   clearWorkspaceSessionCache();
   setSession(null);
   setCheckFailed(false);
   setPresentationNotice(undefined);
   setAttempt(value => value + 1);
   setNotice('Сессия завершилась. Войдите снова.');
  });
 }, []);

 useEffect(() => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  const checkingVersion = sessionChange.current;
  let active = true;
  void api.coordinatorSession(controller.signal).then(async value => {
   if (!active || sessionChange.current !== checkingVersion) return;
   const link = pendingLink.current;
   if (link) {
    pendingLink.current = null;
    const result = await enterPresentation(value, link(), location.origin, controller.signal);
    if (!active || sessionChange.current !== checkingVersion) return;
    value = result.session;
    setPresentationNotice(result.notice);
   }
   if (value.required) clearWorkspaceSessionCache();
   setSession(value);
  }).catch(error => {
   if (!active || sessionChange.current !== checkingVersion) return;
   if (pendingLink.current) {
    pendingLink.current();
    pendingLink.current = null;
    setNotice('Не удалось проверить ссылку для показа. Попробуйте открыть её ещё раз или войдите вручную.');
   }
   if (DEMO && error instanceof ApiError && error.status === 404) {
    setSession({ required: false, authenticated: false });
   } else {
    setCheckFailed(true);
   }
  }).finally(() => clearTimeout(timeout));
  return () => {
   active = false;
   clearTimeout(timeout);
   controller.abort();
  };
 }, [attempt]);

 async function signIn(credentials: CoordinatorCredentials) {
  const next = await api.signInCoordinator(credentials, AbortSignal.timeout(AUTH_TIMEOUT_MS));
  if (next.required && !next.authenticated) throw new Error('Не удалось подтвердить сессию.');
  sessionChange.current++;
  if (next.required) clearWorkspaceSessionCache();
  setNotice(null);
  setPresentationNotice(undefined);
  setSession(next);
 }

 async function signOut() {
  await api.signOutCoordinator(AbortSignal.timeout(AUTH_TIMEOUT_MS));
  sessionChange.current++;
  clearWorkspaceSessionCache();
  setNotice(null);
  setPresentationNotice(undefined);
  setSession(current => ({
   required: true,
   authenticated: false,
   mode: current?.mode,
  }));
 }

 if (session && (!session.required || session.authenticated)) {
  if (presentationNotice) return <main className="login-page">
   <section className="login-form-panel presentation-notice" aria-labelledby="presentation-title">
    <div className="login-form">
     <h1 id="presentation-title">Вход на демонстрацию</h1>
     <p className="login-intro" role="status">{presentationNotice}</p>
     <button type="button" className="button login-submit" onClick={() => setPresentationNotice(undefined)}>
      Продолжить в текущем пространстве
     </button>
    </div>
   </section>
  </main>;
  return <App
   sessionRequired={session.required}
   coordinator={session.authenticated ? session.coordinator : undefined}
   onSignOut={session.required ? signOut : undefined}
  />;
 }

 function retry() {
  setCheckFailed(false);
  setAttempt(value => value + 1);
 }

 return <LoginPage
  notice={presentationNotice ?? notice}
  check={session ? 'complete' : checkFailed ? 'failed' : 'pending'}
  accounts={session?.mode === 'accounts'}
  onRetry={retry}
  onLogin={signIn}
 />;
}
