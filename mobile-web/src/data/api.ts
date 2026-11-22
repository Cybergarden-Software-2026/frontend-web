import type {MobileSession} from './vault.ts';
import {parseMobileSnapshot} from '../domain/mobileIncidents.ts';
export const API_BASE=(import.meta.env?.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'');
let token:string|null=null;
export function setToken(value:string|null){token=value}
export class ApiError extends Error{readonly status:number;readonly code:string;constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code}}
export interface Notice {id:string|number;type:string;title:string;body:string;createdAt:string;isRead:boolean;readAt:string|null}
export interface NoticePage {items:Notice[];nextCursor:string|null;unreadCount:number}
export async function request<T>(path:string,init:RequestInit={}):Promise<T>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(API_BASE+path,{...init,signal:init.signal||controller.signal,credentials:'omit',cache:'no-store',headers:{...(init.body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...init.headers}});
  if(!response.ok){const body=await response.json().catch(()=>null);const code=body?.code||body?.error?.code||body?.error||'HTTP_'+response.status;throw new ApiError(response.status,String(code),messageFor(String(code),response.status));}
  return response.status===204?undefined as T:response.json();
 }catch(e){if(e instanceof ApiError)throw e;throw new Error('Нет соединения с сервером. Проверьте сеть и повторите.')}finally{clearTimeout(timer)}
}
export function messageFor(code:string,status:number){
 if(code==='SOURCE_NOT_READY')return 'Первый снимок инцидентов ещё не загружен на сервер. Попробуйте позже.';
 if(code==='MOBILE_PAIRING_INVALID')return 'QR-код истёк или уже использован. Получите новый в веб-кабинете.';
 if(code==='MOBILE_DEVICE_IN_USE')return 'Устройство связано с другим аккаунтом. Сначала отвяжите его в прежнем кабинете.';
 if(code==='FCM_TOKEN_IN_USE')return 'Уведомления уже привязаны к другому устройству. Отзовите прежнюю привязку.';
 if(status===401)return 'Сессия завершена. Подключите устройство по новому QR-коду.';
 if(status===404||status===405)return 'Этот маршрут ещё не опубликован на сервере. Попробуйте после обновления backend.';
 if(status===503)return 'Мобильный вход или отправка push пока не включены на сервере.';
 return 'Сервер недоступен. Попробуйте ещё раз.';
}
export const api={
 login:async(code:string,id:string)=>{
  const value=await request<MobileSession>('/mobile/session',{method:'POST',body:JSON.stringify({code,deviceId:id,platform:'web'})});
  if(!value.token||value.tokenType!=='Bearer'||value.deviceId!==id||typeof value.user?.login!=='string')throw Error('Некорректный ответ входа');return value;
 },
 session:()=>request<Omit<MobileSession,'token'|'tokenType'>>('/mobile/session'),
 logout:()=>request<void>('/mobile/session',{method:'DELETE'}),
 incidents:()=>request<unknown>('/mobile/incidents').then(parseMobileSnapshot),
 notifications:(cursor?:string)=>request<NoticePage>('/mobile/notifications?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):'')),
 read:(id:string|number)=>request<void>('/mobile/notifications/'+encodeURIComponent(String(id))+'/read',{method:'PUT'}),
 registerPush:(fcmToken:string)=>request<void>('/mobile/devices/current/token',{method:'PUT',body:JSON.stringify({fcmTargetType:'token',fcmToken})}),
};
