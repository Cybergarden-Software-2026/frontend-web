import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Icon } from '../components/Icon';
import { Dialog, dateTime } from '../components/ui';
import { api, ApiError, type MobileDevice, type MobilePairing } from '../data/api';
import './phone-pairing.css';

export function PhonePairing() {
  const controller = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [pairing, setPairing] = useState<MobilePairing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [deviceError, setDeviceError] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function issueCode(signal: AbortSignal) {
    setError('');
    setLoading(true);
    setPairing(null);
    try {
      const result = await api.createMobilePairing(signal);
      if (!signal.aborted) setPairing(result);
    } catch (err) {
      if (!signal.aborted) setError(err instanceof Error ? err.message : 'Не удалось получить код.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }

  function show() {
    controller.current = new AbortController();
    setDevices([]);
    setDeviceError('');
    setRemoveError('');
    setRemoving(null);
    setOpen(true);
    void issueCode(controller.current.signal);
  }

  function close() {
    controller.current?.abort();
    controller.current = null;
    setPairing(null);
    setOpen(false);
  }

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setTimeout(() => {
      setPairing(null);
      setError('Срок действия кода истёк.');
    }, Math.max(0, Date.parse(pairing.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pairing]);

  useEffect(() => {
    const signal = controller.current?.signal;
    if (!open || !signal || removing) return;
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    async function refresh(requestSignal: AbortSignal) {
      try {
        const result = await api.mobileDevices(requestSignal);
        if (active) { setDevices(result.items); setDeviceError(''); }
      } catch (err) {
        if (err instanceof ApiError && err.status === 503) return;
        if (active) setDeviceError('Не удалось обновить список устройств.');
      }
      if (active) timer = setTimeout(() => void refresh(requestSignal), 5000);
    }
    void refresh(signal);
    return () => { active = false; clearTimeout(timer); };
  }, [open, removing, pairing?.expiresAt]);

  async function remove(id: string) {
    const signal = controller.current?.signal;
    if (!signal) return;
    setRemoving(id);
    setRemoveError('');
    try {
      await api.removeMobileDevice(id, signal);
      if (!signal.aborted) setDevices(current => current.filter(device => device.deviceId !== id));
    } catch {
      if (!signal.aborted) setRemoveError('Не удалось отключить устройство.');
    } finally {
      if (!signal.aborted) setRemoving(null);
    }
  }

  return <>
    <button type="button" className="phone-pairing-trigger" onClick={show}>
      <Icon name="phone" size={16}/>Подключить телефон
    </button>
    {open && <Dialog title="Подключить телефон" onClose={close} className="phone-pairing-dialog">
      {loading && <p role="status">Загружаем QR-код…</p>}
      {pairing && <div className="phone-pairing-code">
        <p>Отсканируйте код в приложении UnderCtrl, чтобы получать уведомления о критических сбоях.</p>
        <QRCodeSVG value={pairing.code} size={224} level="M" marginSize={4} title="QR-код для подключения телефона"/>
        <small>Одноразовый код действует до {new Date(pairing.expiresAt).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})}.</small>
      </div>}
      {error && <div className="phone-pairing-retry"><p role="status">{error}</p>
        <button type="button" className="button" onClick={() => controller.current && void issueCode(controller.current.signal)}>Получить новый код</button>
      </div>}
      {devices.length > 0 && <section className="phone-pairing-devices"><h3>Подключённые устройства</h3>
        <ul>{devices.map(device => <li key={device.deviceId}>
          <span>{device.platform === 'android' ? 'Android' : 'Веб-приложение'}
            <small>{dateTime(device.createdAt)} · {device.pushEnabled ? 'Уведомления включены' : 'Ожидает регистрации'}</small>
          </span>
          <button type="button" className="button" disabled={removing !== null} onClick={() => void remove(device.deviceId)}>Отключить</button>
        </li>)}</ul>
      </section>}
      {deviceError && <p role="status">{deviceError}</p>}
      {removeError && <p role="status">{removeError}</p>}
    </Dialog>}
  </>;
}
