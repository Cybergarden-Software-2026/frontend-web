import {useState} from 'react';
import {Icon} from '../components/Icon.tsx';
import {QrScanner} from '../components/QrScanner.tsx';
import {Brand,Spinner,message} from '../components/ui.tsx';
export function Login({onLogin,notice}:{onLogin:(code:string)=>Promise<void>;notice:string}){
 const [code,setCode]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState(''),[camera,setCamera]=useState(false),[manual,setManual]=useState(false);
 async function enter(raw:string){if(pending)return;setCamera(false);setPending(true);setError('');try{await onLogin(raw)}catch(e){setError(message(e))}finally{setPending(false);setCode('')}}
 return <main className="login-shell"><section className="login-art"><div className="key-pattern" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i}>{['Ctrl','МТС','{ }','+'][i%4]}</i>)}</div><Brand/><div className="login-slogan"><span className="eyebrow">МТС · ЦЕНТР КООРДИНАЦИИ</span><h1>Важное.<br/>Всегда на связи.</h1><p>Нужная информация, когда она нужна.</p></div><div className="globe-scene" aria-hidden="true"><i/><i/><span><Icon name="globe" size={100}/></span><b><Icon name="check" size={22}/></b></div></section>
 <section className="login-form"><span className="eyebrow">МОБИЛЬНОЕ РАБОЧЕЕ ПРОСТРАНСТВО</span><h2>Подключите телефон</h2><p>Войдите в свой аккаунт по одноразовому QR-коду из веб-кабинета.</p><ol className="steps"><li><span>1</span><div><strong>Откройте underCtrl на компьютере</strong><small>Войдите в аккаунт координатора</small></div></li><li><span>2</span><div><strong>Найдите QR-код под меню</strong><small>В левой панели основного сайта</small></div></li><li><span>3</span><div><strong>Отсканируйте QR-код</strong><small>Код действует 5 минут и работает один раз</small></div></li></ol>
 {(error||notice)&&<p className="error" role="alert">{error||notice}</p>}
 <button className="button primary" disabled={pending} onClick={()=>setCamera(true)}>{pending?<Spinner/>:<Icon name="grid"/>}{pending?'Подключаем…':'Сканировать QR-код'}</button>
 <button className="text-button manual" disabled={pending} onClick={()=>setManual(v=>!v)}>{manual?'Скрыть ввод кода':'Ввести код вручную'}</button>
 {manual&&<form className="manual-form" onSubmit={e=>{e.preventDefault();void enter(code)}}><label htmlFor="pairing-code">Полный текст QR-кода</label><input id="pairing-code" type="password" autoComplete="off" spellCheck={false} value={code} onChange={e=>setCode(e.target.value)} disabled={pending} required/><button className="button outline" disabled={!code.trim()||pending}>Подключить</button></form>}
 <div className="login-security"><Icon name="phone" size={17}/><span>Повторный вход не нужен, пока устройство подключено к аккаунту.</span></div>
 </section>{camera&&<QrScanner onClose={()=>setCamera(false)} onCode={raw=>void enter(raw)}/>}</main>;
}
