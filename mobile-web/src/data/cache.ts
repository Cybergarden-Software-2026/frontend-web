import type {Notice} from './api.ts';
const KEY='underctrl-mobile-notices-v1';
export function readCache(owner:string):Notice[]{try{const value=JSON.parse(localStorage.getItem(KEY)||'null');return value?.owner===owner&&Array.isArray(value.items)?value.items:[];}catch{return []}}
export function writeCache(owner:string,items:Notice[]){try{localStorage.setItem(KEY,JSON.stringify({owner,items}))}catch{}}
export function clearCache(){try{localStorage.removeItem(KEY)}catch{}}
