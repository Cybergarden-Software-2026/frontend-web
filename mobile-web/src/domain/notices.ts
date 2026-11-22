import type {Notice} from '../data/api.ts';
// Current backend pushes only critical.raised. Do not infer live incidents,
// remaining SLA, or 8-minute warnings from historic event titles.
export function importantNotices(items:Notice[]){return items.filter(n=>n.type==='critical.raised')}
export function mergeNotices(before:Notice[],incoming:Notice[]){const rows=new Map(before.map(n=>[String(n.id),n]));incoming.forEach(n=>rows.set(String(n.id),n));return [...rows.values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||String(b.id).localeCompare(String(a.id)));}
