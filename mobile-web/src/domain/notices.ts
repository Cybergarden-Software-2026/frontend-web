import type {Notice} from '../data/api.ts';
export function mergeNotices(before:Notice[],incoming:Notice[]){const rows=new Map(before.map(n=>[String(n.id),n]));incoming.forEach(n=>rows.set(String(n.id),n));return [...rows.values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||String(b.id).localeCompare(String(a.id)));}
