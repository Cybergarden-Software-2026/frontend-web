import {Icon} from './Icon.tsx';
const base=import.meta.env.BASE_URL;
export function Brand(){return <a className="brand" href="#alerts" aria-label="underCtrl — главная"><img src={base+'mark.svg'} alt=""/><span>Under<b>Ctrl</b><small>Координация IT</small></span></a>}
export function Spinner(){return <span className="spinner" aria-label="Загрузка"/>}
export function message(e:unknown){return e instanceof Error?e.message:'Не удалось выполнить действие. Попробуйте снова.'}
