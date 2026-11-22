import {clearIncidentCache} from './data/useMobileIncidents.ts';
import {useCallback,useEffect,useState} from 'react';
import {api,ApiError,setToken} from './data/api.ts';
import {deviceId,loadSession,saveSession,clearSession,type MobileSession} from './data/vault.ts';
import {clearCache} from './data/cache.ts';
import {Brand,Spinner} from './components/ui.tsx';
import {Login} from './features/Login.tsx';
import {Workspace} from './features/Workspace.tsx';
export function App(){
 const [session,setSession]=useState<MobileSession|null>(null),[checking,setChecking]=useState(true),[notice,setNotice]=useState('');
 const expired=useCallback(()=>{setToken(null);clearCache();clearIncidentCache();try{localStorage.removeItem('underctrl-mobile-push-owner')}catch{}void clearSession();setSession(null);setNotice('Сессия завершена. Подключите телефон по новому QR-коду.');location.hash='alerts';},[]);
 useEffect(()=>{let alive=true;void loadSession().then(async saved=>{if(!saved)return;setToken(saved.token);try{const current=await api.session();if(current.deviceId!==saved.deviceId)throw new ApiError(401,'MOBILE_SESSION_UNAUTHORIZED','Сессия устройства недействительна');if(alive)setSession({...saved,user:current.user});}catch(e){if(e instanceof ApiError&&e.status===401){if(alive)expired()}else if(alive){setSession(saved);setNotice('Нет связи с сервером. Доступны последние данные.')}}}).catch(()=>{if(alive)setNotice('Хранилище браузера недоступно. Разрешите сохранение данных сайта.');}).finally(()=>{if(alive)setChecking(false)});return()=>{alive=false}},[expired]);
 async function login(code:string){const id=await deviceId();setToken(null);const value=await api.login(code,id);setToken(value.token);try{await saveSession(value)}catch{try{await api.logout()}catch{}setToken(null);throw Error('Не удалось сохранить сессию. Разрешите хранилище данных сайта и получите новый QR-код.')}clearCache();clearIncidentCache();setSession(value);setNotice('');location.hash='alerts';}
 async function exit(){await api.logout();try{localStorage.removeItem('underctrl-mobile-push-owner')}catch{}await clearSession();clearCache();clearIncidentCache();setToken(null);setSession(null);setNotice('');location.hash='alerts';try{const p=await import('./push.ts');await p.disablePush()}catch{}}
 if(checking)return <main className="startup"><Brand/><Spinner/><p>Проверяем подключение…</p></main>;
 return session?<Workspace key={session.user.login} session={session} onExit={exit} onExpired={expired}/>:<Login onLogin={login} notice={notice}/>;
}
