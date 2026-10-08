import { cloneElement, useEffect, useRef, useState, type ReactElement } from 'react';

/** Keep the outgoing sheet for its short exit, but disable input immediately. */
export function Presence({show,children}:{show:boolean;children:ReactElement<{inert?:boolean;'aria-hidden'?:boolean;'data-leaving'?:boolean}>|false|null}){
  const last=useRef(children),[retained,setRetained]=useState(show);
  if(show&&children)last.current=children;
  useEffect(()=>{
    if(show){setRetained(true);return;}
    const timer=setTimeout(()=>setRetained(false),matchMedia('(prefers-reduced-motion: reduce)').matches?0:220);
    return()=>clearTimeout(timer);
  },[show]);
  return (show||retained)&&last.current?cloneElement(last.current,{'data-leaving':!show,inert:!show,'aria-hidden':!show}):null;
}
