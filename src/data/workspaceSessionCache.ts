export const SNAPSHOT_KEY = 'underctrl.web.snapshot.v1';
export const EVENT_READ_KEY = 'underctrl.events.read.v1';
const LEGACY_KEY_PREFIX = 'underctrl.coordinator-session.v1:';

export function clearLegacyCoordinatorKeys() {
 try {
  for (let index = localStorage.length - 1; index >= 0; index--) {
   const key = localStorage.key(index);
   if (key?.startsWith(LEGACY_KEY_PREFIX)) localStorage.removeItem(key);
  }
 } catch {}
}

export function clearWorkspaceSessionCache() {
 try {
  localStorage.removeItem(SNAPSHOT_KEY);
  localStorage.removeItem(EVENT_READ_KEY);
 } catch {}
}
