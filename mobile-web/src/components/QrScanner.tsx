import {useEffect,useRef,useState} from 'react';
import {startQrCamera} from './qr-camera.ts';

export function QrScanner({onCode,onClose,onManual}:{onCode:(code:string)=>void;onClose:()=>void;onManual:()=>void}){
 const video=useRef<HTMLVideoElement>(null),[error,setError]=useState(''),[ready,setReady]=useState(false),[attempt,setAttempt]=useState(0);
 const code=useRef(onCode);code.current=onCode;
 useEffect(()=>{
  const controller=new AbortController();setError('');setReady(false);
  async function start(){
   try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Камера доступна только в браузере по HTTPS. Откройте приложение в Safari или Chrome.');
    await startQrCamera(video.current!,controller.signal,raw=>code.current(raw),()=>setReady(true));
   }catch(e){
    if(controller.signal.aborted)return;
    const name=e instanceof Error?e.name:'';
    setError(name==='NotAllowedError'?'Разрешите доступ к камере в настройках браузера и повторите.':name==='NotFoundError'?'Камера не найдена. Введите код с основного сайта вручную.':name==='NotReadableError'?'Камера занята другим приложением. Закройте его и повторите.':e instanceof Error&&e.message.startsWith('Камера доступна')?e.message:'Не удалось прочитать изображение камеры. Повторите или введите код вручную.');
   }
  }
  void start();return()=>controller.abort();
 },[attempt]);
 return <div className="scanner" role="dialog" aria-modal="true" aria-labelledby="scan-title"><div className="scanner-panel"><button className="close" aria-label="Закрыть камеру" onClick={onClose}>×</button><h2 id="scan-title">Наведите камеру на QR</h2><p>Нажмите на QR под меню основного сайта, чтобы увеличить его. Держите телефон неподвижно.</p><div className="camera"><video ref={video} autoPlay playsInline muted/><span className="scan-frame"/></div><p role="status">{error?'':ready?'Ищем QR-код…':'Разрешите доступ к камере…'}</p>{error&&<><p className="error" role="alert">{error}</p><button className="button outline" onClick={()=>setAttempt(v=>v+1)}>Повторить</button></>}<button className="button outline" onClick={onManual}>Ввести код вручную</button></div></div>;
}
