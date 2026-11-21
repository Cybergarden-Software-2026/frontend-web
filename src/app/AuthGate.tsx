import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { coordinatorAuth } from '../data/coordinatorSession';
import { LoginPage } from '../features/LoginPage';
const DEMO = import.meta.env.VITE_DEMO_API === 'true';
export function AuthGate({ children }: { children: ReactNode }) {
 const state = useSyncExternalStore(coordinatorAuth.subscribe, coordinatorAuth.getSnapshot, coordinatorAuth.getSnapshot);
 if (DEMO || state.session) return children;
 return <LoginPage notice={state.notice} onLogin={(key, remember) => coordinatorAuth.save(key, remember)}/>;
}
