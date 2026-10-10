import {useEffect,useRef} from 'react';
import {isoPlusDays,type IsoDate} from './native-economy/iso-calendar';

/** The date follows the same committed presentation clock as moving armies.
 * It never jumps ahead to a multi-day Worker endpoint or invents future time. */
export function CultureCalendar47({worldId,startDate,tick}:{worldId:string;startDate:IsoDate;tick:()=>number}){
 const element=useRef<HTMLTimeElement>(null),source=useRef({startDate,tick});source.current={startDate,tick};
 useEffect(()=>{
  let raf=0,previous=-1;
  const paint=()=>{const value=Math.max(0,source.current.tick()),day=Math.floor(value/120),node=element.current;
   if(node){node.dataset.displayTick=String(value);if(day!==previous){const d=isoPlusDays(source.current.startDate,day);node.textContent=`公元${d.year}年${d.month}月${d.day}日`;node.dataset.day=String(day);previous=day;}}
   raf=requestAnimationFrame(paint);
  };paint();return()=>cancelAnimationFrame(raf);
 },[worldId]);
 return <time ref={element} aria-label="当前日期" className="c47-calendar"/>;
}
