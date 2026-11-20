import type { QueueQuery,QueuePage } from '../domain/operations';
import type { Analysis, Snapshot } from '../domain/incidents';
export const API_BASE=(import.meta.env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'');
export async function request<T>(path:string,init?:RequestInit):Promise<T> {
 const response=await fetch(API_BASE+path,{...init,headers:{'Content-Type':'application/json',...init?.headers}});
 const body=await response.json();if(!response.ok)throw new Error(body.error??'Не удалось выполнить запрос');return body;
}
export const api={snapshot:()=>request<Snapshot>('/snapshot'),
 incidents:(query:QueueQuery)=>{const params=new URLSearchParams();for(const [key,value] of Object.entries(query))if(value!==undefined&&value!=='')params.set(key,String(value));return request<QueuePage>('/incidents?'+params);},
 teams:()=>request<{items:{name:string;activeCount:number}[]}>('/teams'),
 assign:(id:string,team:string,expectedRevision:number)=>request<Snapshot>(`/incidents/${encodeURIComponent(id)}/assignment`,{method:'POST',body:JSON.stringify({team,expectedRevision})}),
analysis:(id:string)=>request<Analysis>(`/incidents/${encodeURIComponent(id)}/analysis`),simulate:(action:string)=>request<Snapshot>('/demo',{method:'POST',body:JSON.stringify({action})}),import:(items:unknown)=>request<Snapshot>('/incidents',{method:'PUT',body:JSON.stringify(items)})};
