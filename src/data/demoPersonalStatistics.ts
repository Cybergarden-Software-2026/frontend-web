import type { CoordinatorProfile,CoordinatorTransfer } from '../domain/personalStatistics.ts';

export const DEMO_COORDINATOR:CoordinatorProfile={id:'demo-coordinator',name:'Тестовый координатор'};
const durations=[252,405,599,600,208,496,425,351,738,286,384,489];
const examples=[
 {title:'Ошибка подтверждения оплаты',team:'Платёжная платформа',priorityId:4},
 {title:'Задержка открытия личного кабинета',team:'Поддержка приложений',priorityId:3},
 {title:'Недоступен сервис уведомлений',team:'Инфраструктура',priorityId:2},
 {title:'Не загружается каталог услуг',team:'Поддержка приложений',priorityId:2},
];
/** Synthetic account activity. Never joins the incident snapshot or assignment API. */
export function createDemoCoordinatorHistory(reference:number):CoordinatorTransfer[]{
 const anchor=Math.floor(reference/60_000)*60_000;
 return Array.from({length:7*12},(_,index)=>{
  const day=Math.floor(index/12),slot=index%12,assignedAt=anchor-(day*24*60+slot*45+15)*60_000;
  return {id:`demo-transfer-${index+1}`,coordinatorId:DEMO_COORDINATOR.id,incidentId:`DEMO-${String(index+1).padStart(4,'0')}`,...examples[slot%examples.length],waitingStartedAt:assignedAt-durations[slot]*1000,assignedAt};
 });
}
