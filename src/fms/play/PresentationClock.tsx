import {useEffect,useRef} from 'react';

type ClockOptions={playing:()=>boolean;blocked:()=>boolean;tickMillis:number;maxBatch?:number;batchBoundary?:()=>number;acknowledgedContinuation?:boolean;step:(ticks:number)=>Promise<void>};
/** Browser presentation scheduling only. Every requested integer tick still runs
 * through the authoritative Worker. Keep bounded elapsed credit;
 * never overlap requests or catch up time spent paused / hidden / in a dialog. */
export function startPresentationClock(options:ClockOptions){
 let cancelled=false,timer:ReturnType<typeof setTimeout>,anchor=performance.now(),credit=0;
 const tick=async()=>{
  if(cancelled||!options.playing())return;
  const now=performance.now(),elapsed=Math.max(0,now-anchor);anchor=now;
  if(options.blocked()){credit=0;timer=setTimeout(()=>void tick(),32);return;}
  credit=Math.min((options.maxBatch??120)*2,credit+elapsed/options.tickMillis);
  // Optional live-world boundary: wait for earned credit, then stop on an
  // authoritative day boundary. This does not create or discard game ticks.
  const available=Math.min(options.maxBatch??120,Math.floor(credit)),boundary=options.batchBoundary?.()??1;
  const requested=options.batchBoundary?(available<boundary?0:boundary+Math.floor((available-boundary)/120)*120):available;
  if(requested){credit-=requested;await options.step(requested);}
  // A live Worker response already yielded to the browser. Its owner may
  // start the next credited request before React's queued map redraw, then
  // immediately yield again while the Worker computes. Never use this path
  // for idle/blocked polling; tick rechecks pause, cancellation and ownership.
  if(!cancelled&&options.playing()){
   if(requested&&options.acknowledgedContinuation)queueMicrotask(()=>void tick());
   else timer=setTimeout(()=>void tick(),requested?0:Math.min(options.batchBoundary?32:16,Math.max(1,options.tickMillis*(boundary-credit))));
  }
 };
 timer=setTimeout(()=>void tick(),32);
 return()=>{cancelled=true;credit=0;clearTimeout(timer);};
}

/** Re-read current UI handlers without restarting the cadence for each snapshot. */
export function usePresentationClock(options:ClockOptions&{enabled:boolean;policyKey:boolean}){
 const live=useRef(options);live.current=options;
 const {enabled,tickMillis,policyKey}=options;
  useEffect(()=>{if(!enabled)return;return startPresentationClock({tickMillis,get maxBatch(){return live.current.maxBatch;},get batchBoundary(){return live.current.batchBoundary;},get acknowledgedContinuation(){return live.current.acknowledgedContinuation;},playing:()=>live.current.playing(),blocked:()=>live.current.blocked(),step:ticks=>live.current.step(ticks)});},[enabled,tickMillis,policyKey]);
}
