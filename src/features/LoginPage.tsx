import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { ApiError } from '../data/api';
import type { CoordinatorCredentials } from '../data/api';

type LoginMethod = 'password' | 'key';

interface LoginProps {
 notice: string | null;
 check: 'pending' | 'failed' | 'complete';
 accounts: boolean;
 onRetry: () => void;
 onLogin: (credentials: CoordinatorCredentials) => Promise<void>;
}

export function LoginPage({ notice, check, accounts, onRetry, onLogin }: LoginProps) {
 const [method, setMethod] = useState<LoginMethod>('password');
 const [login, setLogin] = useState('');
 const [secret, setSecret] = useState('');
 const [visible, setVisible] = useState(false);
 const [remember, setRemember] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [pending, setPending] = useState(false);
 const byPassword = accounts && method === 'password';
 const credentialId = byPassword ? 'coordinator-password' : 'coordinator-key';
 const credentialName = byPassword ? 'пароль' : 'ключ';
 const ready = byPassword ? Boolean(login.trim() && secret) : Boolean(secret.trim());
 const errorDescription = error || notice ? 'login-error' : undefined;

 function select(next: LoginMethod) {
  setMethod(next);
  setSecret('');
  setVisible(false);
  setError(null);
 }

 async function submit(event: FormEvent) {
  event.preventDefault();
  if (!ready || pending || check !== 'complete') return;
  setError(null);
  setPending(true);
  const credentials = byPassword
   ? { login: login.trim(), password: secret, remember }
   : { key: secret.trim(), remember };
  try { await onLogin(credentials); }
  catch (error) {
   if (error instanceof ApiError && error.status === 401) {
    setError(accounts ? 'Неверные данные для входа.' : 'Неверный ключ координатора.');
   } else {
    setError('Не удалось выполнить вход. Попробуйте ещё раз.');
   }
  } finally { setPending(false); }
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
    <form className="login-form" onSubmit={submit} aria-busy={pending || check === 'pending'}>
     <h1 id="login-title">Вход</h1>
     {check === 'pending' && <p className="login-intro" role="status">Проверяем сессию…</p>}
     {check === 'failed' && <>
      <p className="login-error" role="alert">Не удалось проверить вход. Проверьте подключение к серверу.</p>
      <button type="button" className="button login-submit" onClick={onRetry}>Повторить</button>
     </>}
     {check === 'complete' && <>
      <p className="login-intro">{accounts ? 'Войдите в рабочее пространство координатора.' : 'Введите ключ координатора, чтобы продолжить работу.'}</p>
      {errorDescription && <p className="login-error" role="alert" id={errorDescription}>{error || notice}</p>}
      {accounts && <fieldset className="login-methods" disabled={pending}>
       <legend className="sr-only">Способ входа</legend>
       <label>
        <input className="sr-only" type="radio" name="login-method" value="password" checked={method === 'password'} onChange={() => select('password')} />
        <span>Логин и пароль</span>
       </label>
       <label>
        <input className="sr-only" type="radio" name="login-method" value="key" checked={method === 'key'} onChange={() => select('key')} />
        <span>Ключ доступа</span>
       </label>
      </fieldset>}
      {byPassword && <label className="login-user">
       <span className="login-field">Логин</span>
       <input
        id="coordinator-login"
        name="username"
        autoComplete="username"
        value={login}
        onChange={event => setLogin(event.target.value)}
        spellCheck={false}
        autoCapitalize="none"
        required
        disabled={pending}
        aria-invalid={Boolean(error)}
        aria-describedby={errorDescription}
       />
      </label>}
      <label className="login-field" htmlFor={credentialId}>{byPassword ? 'Пароль' : 'Ключ координатора'}</label>
      <div className="login-password">
       <input
        key={credentialId}
        id={credentialId}
        name={byPassword ? 'password' : 'coordinator-key'}
        type={visible ? 'text' : 'password'}
        autoComplete={byPassword ? 'current-password' : 'off'}
        value={secret}
        onChange={event => setSecret(event.target.value)}
        placeholder={byPassword ? undefined : 'Введите ключ'}
        spellCheck={false}
        autoCapitalize="none"
        required
        disabled={pending}
        aria-invalid={Boolean(error)}
        aria-describedby={errorDescription}
       />
       <button type="button" className="icon-button" aria-label={`${visible ? 'Скрыть' : 'Показать'} ${credentialName}`} aria-pressed={visible} disabled={pending} onClick={() => setVisible(value => !value)}>
        <Icon name={visible ? 'eyeOff' : 'eye'} size={19}/>
       </button>
      </div>
      <label className="login-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={pending}/><span>Запомнить на этом устройстве</span></label>
      <button type="submit" className="button login-submit" disabled={!ready || pending}>{pending ? 'Входим…' : 'Войти'}</button>
      <p className="login-note">{accounts ? 'Данные для входа выдаёт администратор.' : 'Ключ выдаёт администратор.'}</p>
     </>}
    </form>
   </section>
  </div>
 </main>;
}
