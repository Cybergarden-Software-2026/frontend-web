export interface CoordinatorSession { token: string; savedAt: number; remembered: boolean; }
export interface AuthState { session: CoordinatorSession | null; notice: string | null; }
export interface SessionStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }

export function createCoordinatorSessionStore(storage: SessionStorage | null, key: string) {
 const listeners = new Set<() => void>();
 function restore(): CoordinatorSession | null {
  try {
   const value = JSON.parse(storage?.getItem(key) || 'null');
   return value && typeof value.token === 'string' && value.token.trim() && Number.isFinite(value.savedAt)
    ? { token: value.token.trim(), savedAt: value.savedAt, remembered: true } : null;
  } catch { return null; }
 }
 let state: AuthState = { session: restore(), notice: null };
 function publish(next: AuthState) { state = next; for (const listener of listeners) listener(); }
 return {
  key,
  getSnapshot: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  save(token: string, remember = true) {
   const clean = token.trim(); if (!clean) throw new Error('Введите ключ координатора.');
   const session = { token: clean, savedAt: Date.now(), remembered: false };
   try {
    if (remember && storage) { storage.setItem(key, JSON.stringify({ token: clean, savedAt: session.savedAt })); session.remembered = true; }
    else storage?.removeItem(key);
   } catch { /* Storage may be unavailable; keep this tab usable. */ }
   publish({ session, notice: null });
  },
  clear(notice: string | null = null) {
   try { storage?.removeItem(key); } catch {}
   publish({ session: null, notice });
  },
  reload() { publish({ session: restore(), notice: null }); },
 };
}

let storage: SessionStorage | null = null;
try { if (typeof window !== 'undefined') storage = window.localStorage; } catch {}
const scope = (import.meta.env?.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
export const coordinatorAuth = createCoordinatorSessionStore(storage, `underctrl.coordinator-session.v1:${scope}`);
export function signOut(notice: string | null = null) {
 coordinatorAuth.clear(notice);
 try {
  storage?.removeItem('underctrl.web.snapshot.v1');
  storage?.removeItem('underctrl.events.read.v1');
 } catch {}
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
 if (event.key === coordinatorAuth.key || event.key === null) coordinatorAuth.reload();
});
