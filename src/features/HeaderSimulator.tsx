import {useState} from 'react';
import type {Incident,State} from '../domain/incidents';
import {COORDINATOR_TEAM,STATES} from '../domain/incidents';
import {headerAlerts} from '../domain/operations';
import {buildHeaderTestIncident} from '../domain/headerSimulation';
import {Icon} from '../components/Icon';

export function HeaderSimulator({items,now,preview,onAdd,onClear,onRemove,onLive}:{items:Incident[];now:number;preview:Incident[]|null;onAdd:(item:Incident)=>void;onClear:()=>void;onRemove:(id:string)=>void;onLive:()=>void}){
 const [baseId,setBaseId]=useState(items[0]?.sysId??''),[title,setTitle]=useState('Проверка ожидания команды'),[priority,setPriority]=useState(2),[state,setState]=useState<State>('Assigned'),[team,setTeam]=useState(COORDINATOR_TEAM),[waitingMinutes,setWaitingMinutes]=useState(8),[waitingSeconds,setWaitingSeconds]=useState(10),[registeredMinutes,setRegisteredMinutes]=useState(60),[deadlineMinutes,setDeadlineMinutes]=useState(60);
 const base=items.find(row=>row.sysId===baseId)??items[0],input={title,priority,state,team,waitingMinutes,waitingSeconds,registeredMinutes,deadlineMinutes};
 const expected=base?headerAlerts([buildHeaderTestIncident(base,input,now,'preview')],now)[0]:null;
 const names=[...new Set([COORDINATOR_TEAM,...items.map(row=>row.assignedGroupName).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'ru'));
 const tests=(preview??[]).filter(item=>item.sysId.startsWith('header-test-'));
 return <section className="header-simulator"><h3>Управление тестовым инцидентом</h3><p>Меняет только локальный хедер. Задачи и назначения на сервере сохраняются.</p><form onSubmit={event=>{event.preventDefault();if(base)onAdd(buildHeaderTestIncident(base,input,now,Date.now()+'-'+Math.random().toString(36).slice(2,6)));}}>
  <label className="sim-wide">На основе инцидента<select value={base?.sysId??''} onChange={event=>setBaseId(event.target.value)}>{items.map(item=><option key={item.sysId} value={item.sysId}>{item.id} · {item.header}</option>)}</select></label>
  <label className="sim-wide">Название<input value={title} onChange={event=>setTitle(event.target.value)} maxLength={200} required/></label>
  <label>Приоритет<select value={priority} onChange={event=>setPriority(Number(event.target.value))}><option value={4}>P1 · Критический</option><option value={3}>P2 · Высокий</option><option value={2}>P3 · Средний</option><option value={1}>P4 · Низкий</option></select></label>
  <label>Статус<select value={state} onChange={event=>setState(event.target.value as State)}>{(['Assigned','WorkInProgress','Research','Resolved','Closed'] as State[]).map(value=><option key={value} value={value}>{STATES[value]}</option>)}</select></label>
  <label className="sim-wide">Текущая команда<select value={team} onChange={event=>setTeam(event.target.value)}><option value="">Команда не назначена</option>{names.map(name=><option key={name}>{name}</option>)}</select></label>
  <label>Ожидание у команды, мин<input type="number" min="0" max="100000" step="1" required value={waitingMinutes} onChange={event=>setWaitingMinutes(Number(event.target.value))}/></label>
  <label>Дополнительно, сек<input type="number" min="0" max="59" step="1" required value={waitingSeconds} onChange={event=>setWaitingSeconds(Number(event.target.value))}/></label>
  <label>Зарегистрирован минут назад<input type="number" min="0" max="100000" step="1" required value={registeredMinutes} onChange={event=>setRegisteredMinutes(Number(event.target.value))}/></label>
  <label>До дедлайна, мин<input type="number" min="-100000" max="100000" step="1" required value={deadlineMinutes} onChange={event=>setDeadlineMinutes(Number(event.target.value))}/></label>
  <p className="sim-prediction sim-wide" role="status">{expected?`Появится в хедере: ${expected.reason}. Сработают звук и колокольчик.`:'В хедер не попадёт. Звука и колокольчика не будет.'}</p>
  <button type="submit" className="button primary sim-wide" disabled={!base}><Icon name="plus" size={16}/>Добавить тестовый инцидент</button>
 </form><div className="header-test-actions"><button className="button secondary" onClick={onClear}>Очистить хедер</button><button className="text-button" onClick={onLive}>Вернуть данные сервера</button></div>
 {tests.length>0&&<ul className="sim-test-list">{tests.map(item=><li key={item.sysId}><span><strong>{item.header}</strong><small>{headerAlerts([item],now)[0]?.reason??'Не соответствует условиям хедера'}</small></span><button className="icon-button" aria-label={`Убрать тест ${item.header}`} onClick={()=>onRemove(item.sysId)}><Icon name="close" size={15}/></button></li>)}</ul>}
 <p className="sim-hint">Для проверки порога задайте 7 минут 55 секунд и подождите больше 5 секунд. Для проверки 20% задайте регистрацию 90 минут назад и дедлайн через 10 минут. Для просрочки укажите отрицательное время до дедлайна. Звук доступен после клика по странице.</p></section>;
}
