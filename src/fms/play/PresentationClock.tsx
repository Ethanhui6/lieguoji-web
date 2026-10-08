import {useEffect,useRef} from 'react';

type ClockOptions={playing:()=>boolean;blocked:()=>boolean;tickMillis:number;maxBatch?:number;step:(ticks:number)=>Promise<void>};
/** Browser presentation scheduling only. Every requested integer tick still runs
 * through the unchanged authoritative Worker. Keep at most one day of credit;
 * never overlap requests or catch up time spent paused / hidden / in a dialog. */
export function startPresentationClock(options:ClockOptions){
 let cancelled=false,timer:ReturnType<typeof setTimeout>,anchor=performance.now(),credit=0;
 const tick=async()=>{
  if(cancelled||!options.playing())return;
  const now=performance.now(),elapsed=Math.max(0,now-anchor);anchor=now;
  if(options.blocked()){credit=0;timer=setTimeout(()=>void tick(),32);return;}
  credit=Math.min(120,credit+elapsed/options.tickMillis);
  const count=Math.min(options.maxBatch??120,Math.floor(credit));
  if(count){credit-=count;await options.step(count);}
  if(!cancelled&&options.playing())timer=setTimeout(()=>void tick(),32);
 };
 timer=setTimeout(()=>void tick(),32);
 return()=>{cancelled=true;credit=0;clearTimeout(timer);};
}

/** Re-read current UI handlers without restarting the cadence for each snapshot. */
export function usePresentationClock(options:ClockOptions&{enabled:boolean;policyKey:boolean}){
 const live=useRef(options);live.current=options;
 const {enabled,tickMillis,policyKey}=options;
 useEffect(()=>{if(!enabled)return;return startPresentationClock({tickMillis,get maxBatch(){return live.current.maxBatch;},playing:()=>live.current.playing(),blocked:()=>live.current.blocked(),step:ticks=>live.current.step(ticks)});},[enabled,tickMillis,policyKey]);
}
