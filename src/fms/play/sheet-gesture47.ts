import {useEffect,type RefObject} from 'react';

/** Phone bottom sheets (country / province details): a swipe up on the short sheet expands
 * it, a pull down while the expanded sheet is scrolled to its top collapses it — like an iOS
 * sheet. Native scrolling is never cancelled; the sheet only changes its detent. */
export const SHEET_EXPAND_PX=18,SHEET_COLLAPSE_PX=56;
export function sheetDetent47(expanded:boolean,dy:number,scrollTop:number):boolean|null{
  if(!expanded&&dy<=-SHEET_EXPAND_PX)return true;
  if(expanded&&scrollTop<=0&&dy>=SHEET_COLLAPSE_PX)return false;
  return null;
}
export function useSheetGesture47(ref:RefObject<HTMLElement|null>,expanded:boolean,setExpanded:(v:boolean)=>void,enabled:boolean){
  useEffect(()=>{
    const el=ref.current;if(!el||!enabled)return;
    let start:{y:number;top:number}|null=null;
    const down=(e:TouchEvent)=>{start=e.touches.length===1?{y:e.touches[0].clientY,top:el.scrollTop}:null;};
    const move=(e:TouchEvent)=>{
      if(!start||e.touches.length!==1||!window.matchMedia('(max-width:600px)').matches)return;
      const next=sheetDetent47(expanded,e.touches[0].clientY-start.y,Math.min(start.top,el.scrollTop));
      if(next!==null){start=null;setExpanded(next);}
    };
    const up=()=>{start=null;};
    el.addEventListener('touchstart',down,{passive:true});el.addEventListener('touchmove',move,{passive:true});el.addEventListener('touchend',up,{passive:true});el.addEventListener('touchcancel',up,{passive:true});
    return()=>{el.removeEventListener('touchstart',down);el.removeEventListener('touchmove',move);el.removeEventListener('touchend',up);el.removeEventListener('touchcancel',up);};
  },[ref,expanded,setExpanded,enabled]);
}
