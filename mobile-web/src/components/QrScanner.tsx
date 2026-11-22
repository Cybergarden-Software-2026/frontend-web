import {useEffect, useRef, useState, type ChangeEvent} from 'react';
import {Spinner} from './ui.tsx';
import {decodeQrPhoto, startQrCamera} from './qr-camera.ts';

export function QrScanner({onCode, onClose, onManual}: {onCode: (code: string) => void; onClose: () => void; onManual: () => void}) {
 const video = useRef<HTMLVideoElement>(null), photo = useRef<HTMLInputElement>(null);
 const controller = useRef<AbortController | null>(null), running = useRef<Promise<void> | null>(null);
 const alive = useRef(true), code = useRef(onCode); code.current = onCode;
 const [error, setError] = useState(''), [ready, setReady] = useState(false), [attempt, setAttempt] = useState(0);
 const [resumePlayback, setResumePlayback] = useState<(() => void) | null>(null);
 const [active, setActive] = useState(true), [visible, setVisible] = useState(!document.hidden), [readingPhoto, setReadingPhoto] = useState(false);
 useEffect(() => {
  alive.current = true;
  const visibility = () => setVisible(!document.hidden);
  document.addEventListener('visibilitychange', visibility);
  return () => { alive.current = false; document.removeEventListener('visibilitychange', visibility); };
 }, []);
 useEffect(() => {
  if (!active || !visible) return;
  const request = new AbortController(); controller.current = request;
  setError(''); setReady(false); setResumePlayback(null);
  // A permission prompt cannot be cancelled. Do not acquire another stream until
  // the previous request has returned and released its camera.
  const task = (running.current ?? Promise.resolve()).catch(() => {}).then(async () => {
   if (request.signal.aborted) return;
   try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Камера доступна только по HTTPS.');
    await startQrCamera(video.current!, request.signal, raw => code.current(raw), () => setReady(true), resume => {
     if (!request.signal.aborted) setResumePlayback(() => resume);
    });
   } catch (e) {
    if (request.signal.aborted) return;
    setReady(false);
    const name = e instanceof Error ? e.name : '';
    setError(e instanceof Error && e.message === 'CAMERA_PREVIEW_UNAVAILABLE'
     ? 'Камера не передаёт изображение. Перезапустите просмотр или введите код с основного сайта.'
     : name === 'NotAllowedError' ? 'Разрешите доступ к камере в настройках приложения и повторите.'
     : name === 'NotFoundError' ? 'Камера не найдена. Введите код с основного сайта вручную.'
     : name === 'NotReadableError' ? 'Камера занята. Закройте её в других приложениях и повторите.'
     : 'Не удалось запустить просмотр. Используйте «Снять QR камерой» или введите код вручную.');
   }
  });
  running.current = task;
  return () => request.abort();
 }, [attempt, active, visible]);
 function stop() { controller.current?.abort(); }
 function takePhoto() {
  stop(); setActive(false); setReady(false); setError(''); setResumePlayback(null);
  // Keep this call in the tap handler so iOS can open its system camera.
  photo.current?.click();
 }
 async function readPhoto(event: ChangeEvent<HTMLInputElement>) {
  const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
  if (!file) return;
  setReadingPhoto(true); setError('');
  try { const value = await decodeQrPhoto(file); if (alive.current) code.current(value); }
  catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Не удалось прочитать QR на снимке.'); }
  finally { if (alive.current) setReadingPhoto(false); }
 }
 return <div className="scanner" role="dialog" aria-modal="true" aria-labelledby="scan-title"><div className="scanner-panel">
  <button className="close" aria-label="Закрыть камеру" onClick={() => { stop(); onClose(); }}>×</button>
  <h2 id="scan-title">Наведите камеру на QR</h2>
  <p>Увеличьте QR под меню основного сайта и поместите его в рамку.</p>
  <div className="camera" hidden={!active}><video ref={video} width={640} height={480} autoPlay playsInline muted/>
   {ready && <span className="scan-frame"/>}
  </div>
  {!error && <p className="camera-status" role="status">
   {!ready && !resumePlayback && (active || readingPhoto) && <Spinner/>}
   <span>{readingPhoto ? 'Читаем QR со снимка…' : ready ? 'Ищем QR-код…' : resumePlayback ? 'Нажмите, чтобы включить изображение камеры.' : active ? 'Запускаем камеру…' : 'Снимите QR целиком системной камерой'}</span>
  </p>}
  {error && <p className="error" role="alert">{error}</p>}
  <input ref={photo} type="file" accept="image/*" capture="environment" hidden aria-label="Снимок QR-кода" onChange={event => void readPhoto(event)}/>
  {resumePlayback && <button className="button primary" onClick={resumePlayback}>Запустить видео</button>}
  {(error || !active) && <button className="button primary" disabled={readingPhoto} onClick={() => { stop(); setActive(true); setAttempt(value => value + 1); }}>Перезапустить просмотр</button>}
  {(error || !active || resumePlayback) && <button className="button outline" disabled={readingPhoto} onClick={takePhoto}>Снять QR камерой</button>}
  <button className="button outline" disabled={readingPhoto} onClick={() => { stop(); onManual(); }}>Ввести код вручную</button>
 </div></div>;
}
