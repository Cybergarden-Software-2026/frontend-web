import {initializeApp,getApps} from 'firebase/app';
import {getMessaging,getToken,deleteToken,isSupported,onMessage} from 'firebase/messaging';
import {firebaseConfig,vapidKey} from './firebase-config.ts';
import {waitForPushWorker,withPushDeadline} from './push-readiness.ts';
export const pushConfigured=Boolean(firebaseConfig.apiKey&&firebaseConfig.appId&&vapidKey);
export async function setupWorker(){
 if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return null;
 const scope = import.meta.env.BASE_URL;
 return withPushDeadline(navigator.serviceWorker.register(scope + 'service-worker.js', {scope}), 8000,
  'Не удалось запустить модуль уведомлений. Проверьте сеть и повторите.');
}
export async function enablePush(){
 if(!pushConfigured)throw Error('Подключение push-уведомлений ещё настраивается.');
 const supported = await withPushDeadline(isSupported(), 5000, 'Не удалось проверить доступ к уведомлениям. Закройте и снова откройте приложение.');
 if(!supported)throw Error('Установите приложение на экран «Домой» и откройте его оттуда.');
 if(Notification.permission==='denied')throw Error('Уведомления запрещены. Разрешите их в настройках браузера.');
 if(Notification.permission!=='granted')throw Error('Разрешите уведомления кнопкой в приложении.');
 const registration=await setupWorker();if(!registration)throw Error('Проверка push доступна в собранной HTTPS-версии приложения.');
 await waitForPushWorker(registration);
 const messaging=getMessaging(getApps()[0]||initializeApp(firebaseConfig));
 const token=await withPushDeadline(getToken(messaging,{vapidKey,serviceWorkerRegistration:registration}), 15000,
  'Не удалось получить адрес доставки уведомлений. Проверьте сеть и повторите.');
 if(!token)throw Error('Firebase не вернул адрес доставки. Попробуйте подключить уведомления ещё раз.');
 return {token};
}
export async function disablePush(){
 if(!pushConfigured||!await isSupported())return;
 const app=getApps()[0];if(app)await deleteToken(getMessaging(app));
 const registration=await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
 if(registration){const notifications=await registration.getNotifications();notifications.forEach(n=>n.close());}
}
export async function listenForeground(refresh:()=>void){if(!pushConfigured||!await isSupported())return()=>{};return onMessage(getMessaging(getApps()[0]||initializeApp(firebaseConfig)),()=>refresh());}
