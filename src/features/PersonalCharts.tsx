import { useCallback,useEffect,useId,useMemo,useRef,useState } from 'react';
import type { FocusEvent,KeyboardEvent,MouseEvent,PointerEvent } from 'react';
import type { PersonalStatistics } from '../domain/personalStatistics';
import { personalChartData,reassignmentChartScale,reassignmentDurationLabel } from '../domain/personalCharts';
import { COORDINATION_KPI_MS,durationLabel } from '../domain/shiftStatistics';
import { Icon } from '../components/Icon';
import { ChartPopover } from '../components/ChartPopover';
import { ChartIncidentDetails } from './ChartIncidentDetails';

const width=520,height=190,left=35,right=12,top=16,bottom=30,plotWidth=width-left-right,plotHeight=height-top-bottom;
const time=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'});
const day=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit'});
const detailedDate=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
type Selection={kind:'point'|'reassignment';id:string}|{kind:'bucket';from:number};
type ActiveSelection=Selection&{anchor:SVGElement;reference:SVGElement;keyboard:boolean};
function NoChart({children}:{children:string}){return <div className="personal-chart-empty"><Icon name="chart" size={26}/><span>{children}</span></div>;}
export function PersonalCharts({stats}:{stats:PersonalStatistics}){
 const {buckets,points,reassignments}=useMemo(()=>personalChartData(stats),[stats]);
 const [active,setActive]=useState<ActiveSelection|null>(null),popoverId=useId();
 const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null),hoverTimer=useRef<ReturnType<typeof setTimeout>|null>(null),skipFocus=useRef(false);
 const cancelClose=useCallback(()=>{if(closeTimer.current){clearTimeout(closeTimer.current);closeTimer.current=null;}},[]);
 const cancelHover=useCallback(()=>{if(hoverTimer.current){clearTimeout(hoverTimer.current);hoverTimer.current=null;}},[]);
 const keepOpen=useCallback(()=>{cancelClose();cancelHover();},[cancelClose,cancelHover]);
 const scheduleClose=useCallback(()=>{keepOpen();closeTimer.current=setTimeout(()=>{if(!document.getElementById(popoverId)?.contains(document.activeElement))setActive(null);},240);},[keepOpen,popoverId]);
 useEffect(()=>{setActive(null);keepOpen();},[stats.start,stats.end,stats.coordinator.id,keepOpen]);
 useEffect(()=>()=>keepOpen(),[keepOpen]);
 const dismiss=useCallback((restoreFocus:boolean)=>{
  keepOpen();setActive(null);
  if(restoreFocus&&active?.anchor.isConnected&&document.activeElement!==active.anchor){skipFocus.current=true;active.anchor.focus({preventScroll:true});}
 },[active,keepOpen]);
 function show(anchor:SVGElement,selection:Selection,keyboard=false){keepOpen();const reference=anchor.previousElementSibling instanceof SVGElement?anchor.previousElementSibling:anchor;setActive({...selection,anchor,reference,keyboard});}
 function targetProps(selection:Selection,label:string){
  const selected=selection.kind==='bucket'
   ? active?.kind==='bucket'&&active.from===selection.from
   : active?.kind===selection.kind&&active.id===selection.id;
  return {role:'button',tabIndex:0,'aria-label':label,'aria-haspopup':'dialog' as const,'aria-expanded':selected,'aria-controls':selected?popoverId:undefined,
   onPointerEnter:(event:PointerEvent<SVGElement>)=>{if(event.pointerType==='touch')return;const anchor=event.currentTarget;keepOpen();if(active&&!selected)hoverTimer.current=setTimeout(()=>show(anchor,selection),180);else show(anchor,selection);},onPointerLeave:scheduleClose,
   onFocus:(event:FocusEvent<SVGElement>)=>{if(skipFocus.current){skipFocus.current=false;return;}show(event.currentTarget,selection);},
   onBlur:(event:FocusEvent<SVGElement>)=>{if(!(event.relatedTarget instanceof Node)||!document.getElementById(popoverId)?.contains(event.relatedTarget))scheduleClose();},
   onClick:(event:MouseEvent<SVGElement>)=>show(event.currentTarget,selection,event.detail===0),
   onKeyDown:(event:KeyboardEvent<SVGElement>)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();show(event.currentTarget,selection,true);}},
  };
 }
 const selectedBucket=active?.kind==='bucket'?buckets.find(row=>row.from===active.from):null;
 const selectedTransfers=active?.kind==='point'||active?.kind==='reassignment'
  ? stats.transfers.filter(row=>row.id===active.id) : selectedBucket?.transfers??[];
 const reassignmentScale=reassignmentChartScale(reassignments.reduce((maximum,row)=>Math.max(maximum,row.durationMs),0));
 const reassignmentY=(durationMs:number)=>top+plotHeight*(1-durationMs/reassignmentScale.maximumMs);
 const maxCount=Math.max(1,...buckets.map(row=>row.count)),maxMinutes=Math.max(15,Math.ceil(Math.max(0,...points.map(row=>row.minutes))/5)*5);
 const tick=(at:number)=>stats.end-stats.start>24*3600_000?day.format(at)+' '+time.format(at):time.format(at);
 const x=(at:number)=>left+(at-stats.start)/(stats.end-stats.start)*plotWidth;
 const y=(minutes:number)=>top+plotHeight*(1-minutes/maxMinutes);
 const threshold=COORDINATION_KPI_MS/60_000;
 const step=plotWidth/buckets.length;
 return <div className="personal-charts">
  <section className="surface shift-panel personal-chart"><div className="shift-section-heading"><h2>Темп распределений</h2></div><p>Сколько инцидентов передано командам по времени</p>
   {stats.transferred?<svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`Распределено ${stats.transferred} инцидентов. Наведите на столбец или выберите его клавишей Tab для подробностей.`}>
    {[0,1,2].map(level=>{const value=Math.ceil(maxCount/2)*level,axisMax=Math.ceil(maxCount/2)*2,py=top+plotHeight*(1-value/axisMax);return <g key={level}><line className="personal-chart-grid" x1={left} y1={py} x2={width-right} y2={py}/><text x={left-7} y={py+4} textAnchor="end">{value}</text></g>;})}
    {buckets.map((row,index)=>{const axisMax=Math.ceil(maxCount/2)*2,barHeight=row.count/axisMax*plotHeight,px=left+index*step+step*.23;return <g key={row.from}><rect className={`personal-chart-bar ${active?.kind==='bucket'&&active.from===row.from?'is-selected':''}`} x={px} y={top+plotHeight-barHeight} width={step*.54} height={barHeight} rx={3}/><rect className="personal-chart-target" x={left+index*step} y={top} width={step} height={plotHeight} fill="transparent" {...targetProps({kind:'bucket',from:row.from},`${tick(row.from)}–${tick(row.to)}: ${row.count} распределений. Показать инциденты.`)}/>{(index%Math.max(1,Math.ceil(buckets.length/5))===0)&&<text x={left+(index+.5)*step} y={height-10} textAnchor="middle">{tick(row.from)}</text>}</g>;})}
   </svg>:<NoChart>Нет распределений за выбранный период</NoChart>}
  </section>
  <section className="surface shift-panel personal-chart"><div className="shift-section-heading"><h2>Время координирования</h2></div><p>Ожидание назначения команды. KPI — меньше 10 минут.</p>
   {points.length?<svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${points.length} измерений длительности. Наведите на точку или выберите её клавишей Tab для подробностей инцидента.`}>
    {[0,1,2,3].map(level=>{const minutes=maxMinutes*level/3,py=y(minutes);return <g key={level}><line className="personal-chart-grid" x1={left} y1={py} x2={width-right} y2={py}/><text x={left-7} y={py+4} textAnchor="end">{Number(minutes.toFixed(1))}</text></g>;})}
    <text x={left-8} y={top-6} textAnchor="end">мин</text>
    <line className="personal-chart-kpi" x1={left} x2={width-right} y1={y(threshold)} y2={y(threshold)}/><text className="personal-chart-kpi-label" x={width-right} y={y(threshold)-6} textAnchor="end">KPI &lt; 10 мин</text>
    <polyline className="personal-chart-line" points={points.map(row=>`${x(row.at)},${y(row.minutes)}`).join(' ')}/>
    {points.map(row=><g key={row.id}><circle className={`${row.kpiMet?'personal-chart-point is-met':'personal-chart-point is-missed'} ${active?.kind==='point'&&active.id===row.id?'is-selected':''}`} cx={x(row.at)} cy={y(row.minutes)} r={active?.kind==='point'&&active.id===row.id?5.5:3.8}/><circle className="personal-chart-target" cx={x(row.at)} cy={y(row.minutes)} r={12} fill="transparent" {...targetProps({kind:'point',id:row.id},`${row.incidentId.replace(/^DEMO-/,"№ ")}, ${tick(row.at)}, ${durationLabel(row.minutes*60_000)}. Показать подробности.`)}/></g>)}
    {[0,.25,.5,.75,1].map(fraction=><text key={fraction} x={left+fraction*plotWidth} y={height-10} textAnchor={fraction===0?'start':fraction===1?'end':'middle'}>{tick(stats.start+fraction*(stats.end-stats.start))}</text>)}
   </svg>:<NoChart>{stats.transferred?'Нет измеренных передач из очереди координаторов':'Нет распределений за выбранный период'}</NoChart>}
   {points.length>0&&<div className="personal-chart-legend"><span><i className="is-met"/>KPI выполнен</span><span><i className="is-missed"/>10 минут и больше</span></div>}
  </section>
  <section className="surface shift-panel personal-chart personal-chart-reassignment">
   <div className="shift-section-heading"><h2>Время между назначениями</h2></div>
   <p>Интервал при переводе между командами решения.</p>
   {reassignments.length ? <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Интервалы между назначениями. Выберите точку для подробностей инцидента.">
    {reassignmentScale.ticks.map(value=>{
     const position=reassignmentY(value*reassignmentScale.unitMs);
     return <g key={value}>
      <line className="personal-chart-grid" x1={left} y1={position} x2={width-right} y2={position}/>
      <text x={left-7} y={position+4} textAnchor="end">{value}</text>
     </g>;
    })}
    <text x={left-8} y={top-6} textAnchor="end">{reassignmentScale.unit}</text>
    {reassignments.map(row=>{
     const selected=active?.kind==='reassignment'&&active.id===row.id;
     const cx=x(row.at),cy=reassignmentY(row.durationMs);
     return <g key={row.id}>
      <circle className={`personal-chart-point reassignment-chart-point${selected?' is-selected':''}`} cx={cx} cy={cy} r={selected?5.5:3.8}/>
      <circle className="personal-chart-target" cx={cx} cy={cy} r={12} fill="transparent"
       {...targetProps({kind:'reassignment',id:row.id},`${row.incidentId}, ${detailedDate.format(row.at)} МСК. Время между назначениями: ${reassignmentDurationLabel(row.durationMs)}. Показать подробности.`)}/>
     </g>;
    })}
    {[0,.25,.5,.75,1].map(fraction=><text key={fraction} x={left+fraction*plotWidth} y={height-10} textAnchor={fraction===0?'start':fraction===1?'end':'middle'}>{tick(stats.start+fraction*(stats.end-stats.start))}</text>)}
   </svg> : <NoChart>{stats.transferred ? 'Нет измеренных переназначений за выбранный период' : 'Нет распределений за выбранный период'}</NoChart>}
  </section>

  {active&&(active.kind==='bucket'||selectedTransfers.length>0)&&<ChartPopover id={popoverId} anchor={active.anchor} reference={active.reference} title={selectedBucket?`${detailedDate.format(selectedBucket.from)} — ${detailedDate.format(selectedBucket.to)} МСК`:'Инцидент на графике'} demo={false} focusOnOpen={active.keyboard} onDismiss={dismiss} onEnter={keepOpen} onLeave={scheduleClose}>
   {selectedBucket&&<p className="chart-popover-summary">Распределений за интервал: <strong>{selectedBucket.count}</strong></p>}
   {selectedTransfers.length?selectedTransfers.map(transfer=><ChartIncidentDetails key={transfer.id} transfer={transfer} mode={active.kind==='reassignment'?'reassignment':active.kind==='point'?'coordination':'summary'}/>):<p className="chart-popover-empty">В этом интервале инциденты не распределялись.</p>}
  </ChartPopover>}
 </div>;
}
