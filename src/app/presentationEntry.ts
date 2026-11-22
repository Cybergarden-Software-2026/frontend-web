import { api, API_BASE, ApiError } from '../data/api.ts';
import type { CoordinatorSession } from '../data/api.ts';

const PRESENTATION_LOGIN = 'test-coordinator-1';
const KEY_SHA256 = '359a05347d6cbd4d926d7e39807e9b20c8df3780dbbc22361792663da2bae47e';
const INVALID_LINK = 'Ссылка для показа недействительна. Можно войти вручную.';
const UNAVAILABLE = 'Не удалось выполнить вход на демонстрацию. Откройте ссылку ещё раз или войдите вручную.';

// Consume the fragment before rendering. The callback releases its only copy on first use.
export function takePresentationLink(location: Location, history: History): (() => string) | null {
 if (location.pathname !== '/presentation' && location.pathname !== '/presentation/') return null;
 if (location.hash !== '#guest' && !location.hash.startsWith('#guest=')) return null;
 let key = '';
 try {
  key = decodeURIComponent(location.hash.slice('#guest='.length));
 } catch { /* A malformed link follows the normal manual sign-in path. */ }
 history.replaceState(history.state, '', '/');
 return () => {
  const value = key;
  key = '';
  return value;
 };
}

export async function enterPresentation(
 session: CoordinatorSession,
 key: string,
 origin: string,
 signal: AbortSignal,
 expectedDigest = KEY_SHA256,
): Promise<{ session: CoordinatorSession; notice?: string }> {
 if (!session.required || session.mode !== 'accounts') {
  return { session, notice: 'В этом режиме вход по ссылке для показа недоступен.' };
 }
 if (session.authenticated) {
  if (session.coordinator?.login === PRESENTATION_LOGIN) return { session };
  return { session, notice: 'На этом устройстве уже открыт другой аккаунт. Чтобы посмотреть демонстрацию, откройте ссылку из QR-кода в приватном окне.' };
 }
 try {
  if (!key || new URL(API_BASE, origin).origin !== origin) return { session, notice: INVALID_LINK };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hex !== expectedDigest) return { session, notice: INVALID_LINK };
  const next = await api.signInCoordinator({ key, remember: false }, signal, { mode: 'same-origin', redirect: 'error' });
  if (next.required && next.authenticated && next.mode === 'accounts' && next.coordinator?.login === PRESENTATION_LOGIN) {
   return { session: next };
  }
  if (next.authenticated) await api.signOutCoordinator(AbortSignal.timeout(10_000));
 } catch (error) {
  return { session, notice: error instanceof ApiError && error.status === 401 ? INVALID_LINK : UNAVAILABLE };
 }
 return { session, notice: INVALID_LINK };
}
