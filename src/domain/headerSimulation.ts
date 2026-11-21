import type {Incident,State} from './incidents.ts';
import {STATES} from './incidents.ts';
export interface HeaderTestInput {title:string;priority:number;state:State;team:string;waitingMinutes:number;waitingSeconds:number;registeredMinutes:number;deadlineMinutes:number;}
const stateIds:Record<State,number>={Assigned:0,WorkInProgress:2,Research:20,Resolved:7,Closed:10,Unknown:-1};
export function buildHeaderTestIncident(base:Incident,input:HeaderTestInput,now:number,unique:string):Incident{
 const elapsed=(Math.max(0,input.waitingMinutes)*60+Math.max(0,Math.min(59,input.waitingSeconds)))*1000;
 return {...base,sysId:'header-test-'+unique,id:'TEST-'+unique,header:input.title.trim()||'Тестовый инцидент',shortDescription:'Локальная проверка хедера, колокольчика и звука.',description:'Тестовый инцидент. Не записывается в очередь или на сервер.',priorityId:Math.max(1,Math.min(4,input.priority)),priority:({1:"Низкий",2:"Средний",3:"Высокий",4:"Наивысший"} as Record<number,string>)[input.priority]??"Средний",stateEnum:input.state,stateId:stateIds[input.state],state:STATES[input.state],assignedGroupName:input.team,assignedEmployee:'',assignedEmployeeLogin:'',submitDate:new Date(now-Math.max(elapsed,Math.max(0,input.registeredMinutes)*60_000)).toISOString(),lastAssignmentToTeamDateTime:new Date(now-elapsed).toISOString(),deadline:new Date(now+input.deadlineMinutes*60_000).toISOString(),completionDate:['Resolved','Closed'].includes(input.state)?new Date(now).toISOString():null,solution:''};
}
