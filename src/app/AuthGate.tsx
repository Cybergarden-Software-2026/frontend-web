import { useEffect, useRef, useState } from 'react';
import { api, ApiError, onApiUnauthorized } from '../data/api';
import type { CoordinatorCredentials, CoordinatorSession } from '../data/api';
import { clearLegacyCoordinatorKeys, clearWorkspaceSessionCache } from '../data/workspaceSessionCache';
import { LoginPage } from '../features/LoginPage';
import { App } from './App';

const DEMO = import.meta.env.VITE_DEMO_API === 'true';
const AUTH_TIMEOUT_MS = 10_000;

export function AuthGate() {
 const [session, setSession] = useState<CoordinatorSession | null>(null);
 const [checkFailed, setCheckFailed] = useState(false);
 const [attempt, setAttempt] = useState(0);
 const [notice, setNotice] = useState<string | null>(null);
 const sessionChange = useRef(0);

 useEffect(() => {
  clearLegacyCoordinatorKeys();
  return onApiUnauthorized(() => {
   clearWorkspaceSessionCache();
   setSession(null);
   setCheckFailed(false);
   setAttempt(value => value + 1);
   setNotice('Сессия завершилась. Войдите снова.');
  });
 }, []);

 useEffect(() => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  const checkingVersion = sessionChange.current;
  let active = true;
  void api.coordinatorSession(controller.signal).then(value => {
   if (!active || sessionChange.current !== checkingVersion) return;
   if (value.required) clearWorkspaceSessionCache();
   setSession(value);
  }).catch(error => {
   if (!active || sessionChange.current !== checkingVersion) return;
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
  setSession(next);
 }

 async function signOut() {
  await api.signOutCoordinator(AbortSignal.timeout(AUTH_TIMEOUT_MS));
  sessionChange.current++;
  clearWorkspaceSessionCache();
  setNotice(null);
  setSession(current => ({
   required: true,
   authenticated: false,
   mode: current?.mode,
  }));
 }

 if (session && (!session.required || session.authenticated)) {
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
  notice={notice}
  check={session ? 'complete' : checkFailed ? 'failed' : 'pending'}
  accounts={session?.mode === 'accounts'}
  onRetry={retry}
  onLogin={signIn}
 />;
}
