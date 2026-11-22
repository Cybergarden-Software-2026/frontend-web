import { useEffect,useId,useLayoutEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface Option {
 id: string;
 label: string;
 annotation?: { title: string; detail: string };
}

interface FilterSelectProps {
 label: string;
 value: string;
 options: readonly Option[];
 onChange: (value: string) => void;
 hideLabel?: boolean;
 searchLabel?: string;
 onOpenChange?: (open: boolean) => void;
 menuNotice?: string;
}

function searchOptions(options: readonly Option[], query: string) {
 const needle = query.trim().toLocaleLowerCase('ru');
 return needle ? options.filter(option => option.id && option.label.toLocaleLowerCase('ru').includes(needle)) : options;
}

export function FilterSelect({label,value,options,onChange,hideLabel=false,searchLabel,onOpenChange,menuNotice}: FilterSelectProps) {
 const id = useId();
 const trigger = useRef<HTMLButtonElement>(null);
 const menu = useRef<HTMLDivElement>(null);
 const searchInput = useRef<HTMLInputElement>(null);
 const search = useRef({text:'',at:0});
 const [open,setOpen] = useState(false);
 const [activeId,setActiveId] = useState<string>();
 const [query,setQuery] = useState('');
 const [box,setBox] = useState({top:0,left:0,width:0,maxHeight:320});
 const visibleOptions = searchLabel ? searchOptions(options,query) : options;
 const selected = options.find(option => option.id === value) ?? options[0];
 const activeIndex = Math.max(0,visibleOptions.findIndex(option => option.id === activeId));
 const activeOption = visibleOptions[activeIndex];

 function show(option = selected) {
  setQuery('');
  setActiveId(option?.id);
  setOpen(true);
 }
 function updateQuery(value: string) {
  setQuery(value);
  setActiveId(searchOptions(options,value)[0]?.id);
 }
 function choose(option: Option | undefined) {
  if (!option) return;
  onChange(option.id);
  close();
 }
 function close() {
  setOpen(false);
  trigger.current?.focus({preventScroll:true});
 }
 function move(direction: number) {
  if (!visibleOptions.length) return;
  const index = (activeIndex+direction+visibleOptions.length)%visibleOptions.length;
  setActiveId(visibleOptions[index].id);
 }

 useEffect(() => { onOpenChange?.(open); },[open,onOpenChange]);
 useLayoutEffect(() => { if (open && searchLabel) searchInput.current?.focus({preventScroll:true}); },[open,searchLabel]);
 useLayoutEffect(() => {
  if (!open) return;
  function place() {
   const rect = trigger.current!.getBoundingClientRect(),gap = 9,margin = 12;
   const below = window.innerHeight-rect.bottom-gap-margin,above = rect.top-gap-margin;
   const flip = below<160&&above>below,maxHeight = Math.min(320,Math.max(80,flip?above:below));
   const width = Math.min(rect.width,window.innerWidth-margin*2);
   const height = Math.min(maxHeight,menu.current?.scrollHeight??maxHeight);
   setBox({top:flip?Math.max(margin,rect.top-gap-height):rect.bottom+gap,left:Math.max(margin,Math.min(rect.left,window.innerWidth-width-margin)),width,maxHeight});
  }
  place();
  window.addEventListener('resize',place);
  window.addEventListener('scroll',place,true);
  return () => { window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true); };
 },[open,query,menuNotice,options.length]);
 useLayoutEffect(() => {
  if (open) menu.current?.querySelector<HTMLElement>('.journal-filter-option.is-focused')?.scrollIntoView({block:'nearest'});
 },[open,activeId,query]);
 useEffect(() => {
  if (!open) return;
  const outside = (event: PointerEvent) => {
   const target = event.target as Node;
   if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
  };
  document.addEventListener('pointerdown',outside);
  return () => document.removeEventListener('pointerdown',outside);
 },[open]);
 return <div className="journal-select journal-filter-select">
  <button ref={trigger} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?`${id}-list`:undefined} aria-activedescendant={open&&activeOption?`${id}-option-${activeIndex}`:undefined} onClick={()=>open?setOpen(false):show()} onKeyDown={event=>{
   if(event.key==='Escape'){if(open){event.preventDefault();setOpen(false);}return;}
   if(event.key==='Tab'){setOpen(false);return;}
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();
    if(open)move(event.key==='ArrowDown'?1:-1);else show();
   }else if(open&&(event.key==='Home'||event.key==='End')){
    event.preventDefault();
    setActiveId((event.key==='Home'?visibleOptions[0]:visibleOptions.at(-1))?.id);
   }else if(event.key==='Enter'||event.key===' '){
    event.preventDefault();
    if(open)choose(activeOption);else show();
   }else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
    event.preventDefault();
    if(searchLabel){updateQuery(event.key);setOpen(true);return;}
    const now=Date.now();
    search.current={text:(now-search.current.at<700?search.current.text:'')+event.key.toLocaleLowerCase('ru'),at:now};
    const match=options.find(option=>option.label.toLocaleLowerCase('ru').startsWith(search.current.text));
    if(match){if(open)setActiveId(match.id);else show(match);}
   }
  }}><span>{hideLabel?'':label+' / '}{selected?.label??'Все'}</span><Icon name="down" size={16}/></button>
  {open&&createPortal(<div ref={menu} className={`journal-filter-menu ${searchLabel?'journal-filter-search-menu':''}`} style={{top:box.top,left:box.left,width:box.width,maxHeight:box.maxHeight}}>
   {searchLabel&&<label className="journal-team-search"><Icon name="search" size={15}/><input ref={searchInput} role="combobox" aria-label={searchLabel} aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={activeOption?`${id}-option-${activeIndex}`:undefined} placeholder={searchLabel} value={query} onChange={event=>updateQuery(event.target.value)} onKeyDown={event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();move(event.key==='ArrowDown'?1:-1);}
    else if(event.key==='Enter'){event.preventDefault();choose(activeOption);}
    else if(event.key==='Escape'){event.preventDefault();close();}
    else if(event.key==='Tab'){close();}
   }}/></label>}
   {menuNotice&&<p className="journal-team-notice" role="status">{menuNotice}</p>}
   <div id={`${id}-list`} role="listbox" aria-label={label} className={searchLabel?'journal-team-results':undefined}>
    {visibleOptions.map((option,index)=><div key={option.id} id={`${id}-option-${index}`} role="option" aria-selected={option.id===value} className={`journal-filter-option ${index===activeIndex?'is-focused':''} ${option.id===value?'is-selected':''}`} onPointerMove={()=>setActiveId(option.id)} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(option)}>
     {option.annotation?<span className="journal-filter-option-copy"><span>{option.label}</span><small className="journal-filter-option-note"><Icon name="spark" size={13}/><strong>{option.annotation.title}</strong><span>{option.annotation.detail}</span></small></span>:<span>{option.label}</span>}
     {option.id===value&&<Icon name="check" size={16}/>}
    </div>)}
   </div>
   {!visibleOptions.length&&<p className="journal-team-empty" role="status">Команды не найдены</p>}
  </div>,document.body)}
 </div>;
}
