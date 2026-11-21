import { useEffect,useLayoutEffect,useRef,useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export function ChartPopover({id,anchor,reference,title,demo,focusOnOpen,onDismiss,onEnter,onLeave,children}:{id:string;anchor:SVGElement;reference:SVGElement;title:string;demo:boolean;focusOnOpen:boolean;onDismiss:(restoreFocus:boolean)=>void;onEnter:()=>void;onLeave:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null),[position,setPosition]=useState<{left:number;top:number;maxHeight:number}|null>(null);
 useLayoutEffect(()=>{
  function place(){
   if(!ref.current||!anchor.isConnected)return;
   const target=reference.getBoundingClientRect(),popup=ref.current.getBoundingClientRect(),margin=12;
   const above=target.top-margin,below=window.innerHeight-target.bottom-margin;
   const placeAbove=above>=Math.min(280,popup.height)||above>=below;
   const maxHeight=Math.min(440,Math.max(140,placeAbove?above:below));
   const left=Math.max(margin,Math.min(target.left+target.width/2-popup.width/2,window.innerWidth-popup.width-margin));
   const top=Math.max(margin,Math.min(placeAbove?target.top-popup.height+2:target.bottom-2,window.innerHeight-popup.height-margin));
   setPosition(previous=>previous?.left===left&&previous.top===top&&previous.maxHeight===maxHeight?previous:{left,top,maxHeight});
  }
  place();const observer=new ResizeObserver(place);if(ref.current)observer.observe(ref.current);
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[anchor,reference]);
 useEffect(()=>{if(focusOnOpen)ref.current?.focus({preventScroll:true});},[focusOnOpen,anchor]);
 useEffect(()=>{
  function escape(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();onDismiss(true);}}
  function outside(event:PointerEvent){const target=event.target as Node;if(!ref.current?.contains(target)&&!anchor.contains(target))onDismiss(false);}
  document.addEventListener('keydown',escape);document.addEventListener('pointerdown',outside);
  return()=>{document.removeEventListener('keydown',escape);document.removeEventListener('pointerdown',outside);};
 },[anchor,onDismiss]);
 return createPortal(<div ref={ref} id={id} className="chart-popover" role="dialog" aria-modal="false" aria-label={title} tabIndex={-1} style={{left:position?.left??0,top:position?.top??0,maxHeight:position?`min(${position.maxHeight}px, calc(100dvh - 24px))`:undefined,visibility:position?'visible':'hidden'}} onPointerEnter={onEnter} onPointerLeave={onLeave} onBlur={event=>{if(!(event.relatedTarget instanceof Node)||!event.currentTarget.contains(event.relatedTarget))onLeave();}}>
  <header className="chart-popover-heading"><div><strong>{title}</strong>{demo&&<span>Демонстрационные данные</span>}</div><button type="button" aria-label="Закрыть подробности графика" onClick={()=>onDismiss(true)}><Icon name="close" size={16}/></button></header>
  <div className="chart-popover-content" tabIndex={0} role="region" aria-label="Подробности инцидентов">{children}</div>
 </div>,document.body);
}
