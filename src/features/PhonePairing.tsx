import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Icon } from '../components/Icon';
import { Dialog } from '../components/ui';
import { api, type MobilePairing } from '../data/api';

/** A real one-use sign-in code, bound to the signed-in desktop coordinator. */
export function PhonePairing() {
  const controller = useRef<AbortController | null>(null);
  const [pairing, setPairing] = useState<MobilePairing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  const issueCode = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    setPairing(null);
    setCopied(false);
    setCopyError('');
    try {
      const result = await api.createMobilePairing(request.signal);
      if (request.signal.aborted) return;
      if (typeof result.code !== 'string' || !result.code || !Number.isFinite(Date.parse(result.expiresAt))) {
        throw new Error('Не удалось получить QR-код.');
      }
      setNow(Date.now());
      setPairing(result);
    } catch {
      if (!request.signal.aborted) setError('Не удалось получить QR-код.');
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // React Strict Mode must not issue and immediately replace a second code.
    const start = window.setTimeout(() => void issueCode(), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const visible = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      controller.current?.abort();
    };
  }, [issueCode]);

  const seconds = pairing ? Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - now) / 1000)) : 0;
  const valid = Boolean(pairing && seconds > 0);
  const remaining = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  async function copyCode() {
    if (!valid || !pairing) return;
    try { await navigator.clipboard.writeText(pairing.code); setCopied(true); setCopyError(''); }
    catch { setCopyError('Выделите и скопируйте код из поля.'); }
  }
  const manualCode = valid && pairing && <section className="phone-manual"><h3>Код для ручного входа</h3><textarea aria-label="Одноразовый код для ручного входа" value={pairing.code} readOnly rows={3} spellCheck={false} autoComplete="off" onFocus={e=>e.currentTarget.select()}/><button type="button" onClick={()=>void copyCode()}><Icon name="copy" size={13}/>{copied?'Скопировано':'Копировать код'}</button>{copyError&&<small role="status">{copyError}</small>}</section>;
  return <><section className="sidebar-phone" aria-labelledby="sidebar-phone-title" aria-busy={loading}>
    <div className="sidebar-phone-heading"><Icon name="phone" size={16}/><h2 id="sidebar-phone-title">Вход на телефоне</h2></div>
    <div className="sidebar-phone-code">
      {loading ? <span className="sidebar-qr-loading" role="status"><i/>Получаем QR-код…</span>
        : valid && pairing ? <button type="button" className="phone-qr-enlarge" aria-label="Увеличить QR-код" onClick={()=>setExpanded(true)}><QRCodeSVG value={pairing.code} size={164} level="M" marginSize={4} title="Нажмите, чтобы увеличить QR-код"/></button>
        : <div className="sidebar-phone-empty"><Icon name="grid" size={30}/><span>{error || 'Срок QR-кода истёк'}</span><button type="button" onClick={() => void issueCode()}>Получить QR-код</button></div>}
    </div>
    {valid && <div className="sidebar-phone-expiry"><span>Действует ещё {remaining}</span><button type="button" onClick={() => void issueCode()} aria-label="Обновить одноразовый QR-код" title="Получить новый QR-код"><Icon name="refresh" size={13}/></button></div>}
    {valid&&<button type="button" className="phone-manual-trigger" onClick={()=>setExpanded(true)}>Код для ручного входа</button>}
  </section>{expanded&&<Dialog title="Вход на телефоне" onClose={()=>setExpanded(false)} className="phone-qr-dialog">{valid&&pairing?<><QRCodeSVG value={pairing.code} size={360} level="M" marginSize={4} title="Одноразовый QR-код для входа на телефоне"/><p>Действует ещё {remaining}</p>{manualCode}</>:<div className="sidebar-phone-empty"><p>{loading?'Получаем QR-код…':'Срок QR-кода истёк'}</p><button type="button" disabled={loading} onClick={()=>void issueCode()}>Получить новый код</button></div>}</Dialog>}</>;
}
