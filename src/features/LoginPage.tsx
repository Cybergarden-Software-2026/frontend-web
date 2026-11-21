import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Icon } from '../components/Icon';

export function LoginPage({ notice, onLogin }: { notice: string | null; onLogin: (key: string, remember: boolean) => void }) {
 const [key, setKey] = useState(''), [visible, setVisible] = useState(false), [remember, setRemember] = useState(true);
 const [error, setError] = useState<string | null>(null);
 function submit(event: FormEvent) {
  event.preventDefault(); setError(null);
  if (!key.trim()) { setError('Введите ключ координатора.'); return; }
  try { onLogin(key, remember); } catch { setError('Не удалось выполнить вход. Попробуйте ещё раз.'); }
 }
 return <main className="login-page">
  <div className="login-card">
   <section className="login-brand-panel" aria-label="underCtrl — координация IT">
    <div className="login-key-pattern" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <span key={index} style={{ '--key-angle': `${index % 2 ? 13 : -11}deg` } as CSSProperties}>{['Ctrl', '{ }', '+', 'МТС', '↵', 'Shift'][index % 6]}</span>)}</div>
    <div className="login-brand"><img src="/mark.svg" width="38" height="38" alt=""/><span>Under<b>Ctrl</b><small>Координация IT</small></span></div>
    <h2>Приближая<br/>будущее</h2>
    <div className="login-orbit-scene" aria-hidden="true"><i className="login-orbit orbit-one"/><i className="login-orbit orbit-two"/><span className="login-signal-key"><Icon name="globe" size={67}/></span><span className="login-orbit-chip"><Icon name="check" size={21}/></span><span className="login-orbit-dot"/></div>
   </section>
   <section className="login-form-panel" aria-labelledby="login-title">
    <form className="login-form" onSubmit={submit}>
     <h1 id="login-title">Вход</h1><p className="login-intro">Введите ключ координатора, чтобы продолжить работу.</p>
     {(notice || error) && <p className="login-error" role="alert">{error || notice}</p>}
     <label className="login-field" htmlFor="coordinator-key">Ключ координатора</label>
     <div className="login-password"><input id="coordinator-key" name="coordinator-key" type={visible ? 'text' : 'password'} value={key} onChange={event => setKey(event.target.value)} placeholder="Введите ключ" autoComplete="off" spellCheck={false} autoCapitalize="none" required aria-invalid={Boolean(error)}/><button type="button" className="icon-button" aria-label={visible ? 'Скрыть ключ' : 'Показать ключ'} aria-pressed={visible} onClick={() => setVisible(value => !value)}><Icon name={visible ? 'eyeOff' : 'eye'} size={19}/></button></div>
     <label className="login-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)}/><span>Запомнить на этом устройстве</span></label>
     <button type="submit" className="button login-submit" disabled={!key.trim()}>Войти</button>
     <p className="login-note">Ключ выдаёт администратор. Он используется для назначения команд.</p>
    </form>
   </section>
  </div>
 </main>;
}
