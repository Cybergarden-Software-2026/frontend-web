import { useEffect,useId,useLayoutEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface Option {id:string;label:string;}
export function FilterSelect({label,value,options,onChange,hideLabel=false,searchLabel}:{label:string;value:string;options:readonly Option[];onChange:(value:string)=>void;hideLabel?:boolean;searchLabel?:string}) {
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),searchInput=useRef<HTMLInputElement>(null);
 const [open,setOpen]=useState(false),[active,setActive]=useState(0),[box,setBox]=useState({top:0,left:0,width:0,maxHeight:320});
 const [query,setQuery]=useState('');
 const needle=query.trim().toLocaleLowerCase('ru');
 const visibleOptions=searchLabel&&needle?options.filter(option=>option.id&&option.label.toLocaleLowerCase('ru').includes(needle)):options;
 const selected=Math.max(0,options.findIndex(option=>option.id===value));
 const search=useRef({text:'',at:0});
 function show(index=selected){setQuery('');setActive(index);setOpen(true);}
 function choose(index:number){const option=visibleOptions[index];if(!option)return;onChange(option.id);setOpen(false);trigger.current?.focus({preventScroll:true});}
 function close(){setOpen(false);trigger.current?.focus({preventScroll:true});}
 function move(direction:number){if(visibleOptions.length)setActive(index=>(index+direction+visibleOptions.length)%visibleOptions.length);}
 useLayoutEffect(()=>{if(open&&searchLabel)searchInput.current?.focus({preventScroll:true});},[open,searchLabel]);
 useLayoutEffect(()=>{
  if(!open)return;
  function place(){
   const rect=trigger.current!.getBoundingClientRect(),gap=9,margin=12;
   const below=window.innerHeight-rect.bottom-gap-margin,above=rect.top-gap-margin;
   const flip=below<160&&above>below,maxHeight=Math.min(320,Math.max(80,flip?above:below));
   const width=Math.min(rect.width,window.innerWidth-margin*2);
   const height=Math.min(maxHeight,menu.current?.scrollHeight??maxHeight);
   setBox({top:flip?Math.max(margin,rect.top-gap-height):rect.bottom+gap,left:Math.max(margin,Math.min(rect.left,window.innerWidth-width-margin)),width,maxHeight});
  }
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open,query]);
 useLayoutEffect(()=>{if(open)menu.current?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)?.scrollIntoView({block:'nearest'});},[open,active,query]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{const target=event.target as Node;if(!trigger.current?.contains(target)&&!menu.current?.contains(target))setOpen(false);};
  document.addEventListener('pointerdown',outside);
  return()=>document.removeEventListener('pointerdown',outside);
 },[open]);
 return <div className="journal-select journal-filter-select">
  <button ref={trigger} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?`${id}-list`:undefined} aria-activedescendant={open&&visibleOptions[active]?`${id}-option-${active}`:undefined} onClick={()=>open?setOpen(false):show()} onKeyDown={event=>{
   if(event.key==='Escape'){if(open){event.preventDefault();setOpen(false);}return;}
   if(event.key==='Tab'){setOpen(false);return;}
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();const direction=event.key==='ArrowDown'?1:-1;
    if(open)move(direction);else show(selected);
   }else if(open&&(event.key==='Home'||event.key==='End')){event.preventDefault();setActive(event.key==='Home'?0:visibleOptions.length-1);}
   else if(event.key==='Enter'||event.key===' '){event.preventDefault();if(open)choose(active);else show();}
   else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
    event.preventDefault();if(searchLabel){setQuery(event.key);setActive(0);setOpen(true);return;}const now=Date.now();search.current={text:(now-search.current.at<700?search.current.text:'')+event.key.toLocaleLowerCase('ru'),at:now};
    const index=options.findIndex(option=>option.label.toLocaleLowerCase('ru').startsWith(search.current.text));
    if(index>=0){if(open)setActive(index);else show(index);}
   }
  }}><span>{hideLabel?'':label+' / '}{options[selected]?.label??'Все'}</span><Icon name="down" size={16}/></button>
  {open&&createPortal(<div ref={menu} className={`journal-filter-menu ${searchLabel?'journal-filter-search-menu':''}`} style={{top:box.top,left:box.left,width:box.width,maxHeight:box.maxHeight}}>
   {searchLabel&&<label className="journal-team-search"><Icon name="search" size={15}/><input ref={searchInput} role="combobox" aria-label={searchLabel} aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={visibleOptions[active]?`${id}-option-${active}`:undefined} placeholder={searchLabel} value={query} onChange={event=>{setQuery(event.target.value);setActive(0);}} onKeyDown={event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();move(event.key==='ArrowDown'?1:-1);}
    else if(event.key==='Enter'){event.preventDefault();choose(active);}
    else if(event.key==='Escape'){event.preventDefault();close();}
    else if(event.key==='Tab'){close();}
   }}/></label>}
   <div id={`${id}-list`} role="listbox" aria-label={label} className={searchLabel?'journal-team-results':undefined}>{visibleOptions.map((option,index)=><div key={option.id} id={`${id}-option-${index}`} role="option" aria-selected={option.id===value} className={`journal-filter-option ${index===active?'is-focused':''} ${option.id===value?'is-selected':''}`} data-option-index={index} onPointerMove={()=>setActive(index)} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(index)}><span>{option.label}</span>{option.id===value&&<Icon name="check" size={16}/>}</div>)}</div>
   {!visibleOptions.length&&<p className="journal-team-empty" role="status">Команды не найдены</p>}
  </div>,document.body)}
 </div>;
}
