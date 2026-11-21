import { useEffect, useState } from 'react';
import { api, ApiError, onApiUnauthorized } from '../data/api';
import type { CoordinatorSession } from '../data/api';
import { clearLegacyCoordinatorKeys, clearWorkspaceSessionCache } from '../data/workspaceSessionCache';
import { LoginPage } from '../features/LoginPage';
import { App } from './App';

const DEMO = import.meta.env.VITE_DEMO_API === 'true';
const AUTH_TIMEOUT_MS = 10_000;
const SIGNED_OUT = { required: true, authenticated: false };

export function AuthGate() {
 const [session, setSession] = useState<CoordinatorSession | null>(null);
 const [checkFailed, setCheckFailed] = useState(false);
 const [attempt, setAttempt] = useState(0);
 const [notice, setNotice] = useState<string | null>(null);

 useEffect(() => {
  clearLegacyCoordinatorKeys();
  return onApiUnauthorized(() => {
   clearWorkspaceSessionCache();
   setSession(SIGNED_OUT);
   setNotice('Сессия завершилась. Войдите снова.');
  });
 }, []);

 useEffect(() => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  let active = true;
  void api.coordinatorSession(controller.signal).then(value => {
   if (!active) return;
   if (value.required) clearWorkspaceSessionCache();
   setSession(value);
  }).catch(error => {
   if (!active) return;
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

 async function signIn(key: string, remember: boolean) {
  const next = await api.signInCoordinator(key, remember, AbortSignal.timeout(AUTH_TIMEOUT_MS));
  if (next.required && !next.authenticated) throw new Error('Не удалось подтвердить сессию.');
  if (next.required) clearWorkspaceSessionCache();
  setNotice(null);
  setSession(next);
 }

 async function signOut() {
  await api.signOutCoordinator(AbortSignal.timeout(AUTH_TIMEOUT_MS));
  clearWorkspaceSessionCache();
  setNotice(null);
  setSession(SIGNED_OUT);
 }

 if (session && (!session.required || session.authenticated)) {
  return <App sessionRequired={session.required} onSignOut={session.required ? signOut : undefined} />;
 }

 function retry() {
  setCheckFailed(false);
  setAttempt(value => value + 1);
 }

 return <LoginPage
  notice={notice}
  check={session ? 'complete' : checkFailed ? 'failed' : 'pending'}
  onRetry={retry}
  onLogin={signIn}
 />;
}
