import {useState,useEffect} from 'react';
import type {SavedView} from '../domain/workspace';
import {restoreFilters} from '../domain/workspace';
const KEY='underctrl.workspace.preferences.v2';
interface Preferences {favorites:string[];compact:boolean;savedViews:SavedView[];}
function load():Preferences{
 try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');return {favorites:Array.isArray(raw?.favorites)?raw.favorites.filter((s:unknown)=>typeof s==='string'):[],compact:raw?.compact===true,savedViews:Array.isArray(raw?.savedViews)?raw.savedViews.filter((v:SavedView)=>typeof v?.id==='string'&&typeof v?.name==='string').slice(0,8).map((v:SavedView)=>({...v,filters:restoreFilters(v.filters)})):[]};}catch{return {favorites:[],compact:false,savedViews:[]};}
}
export function usePreferences(){
 const [preferences,setPreferences]=useState(load);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(preferences));}catch{}},[preferences]);
 return {preferences,toggleFavorite:(id:string)=>setPreferences(p=>({...p,favorites:p.favorites.includes(id)?p.favorites.filter(v=>v!==id):[...p.favorites,id]})),setCompact:(compact:boolean)=>setPreferences(p=>({...p,compact})),saveView:(view:SavedView)=>setPreferences(p=>({...p,savedViews:[...p.savedViews,view].slice(-8)})),deleteView:(id:string)=>setPreferences(p=>({...p,savedViews:p.savedViews.filter(v=>v.id!==id)}))};
}
