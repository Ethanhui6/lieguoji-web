/** Advance only after the previous visible route has finished. Re-read the
 * remaining duration after a busy retry: the pending Worker may have started
 * a new route since this loop was created (e.g. a speed change). */
export function startDayLoop(options:{playing:()=>boolean;blocked:()=>boolean;remaining:()=>number;step:()=>Promise<void>}){
  let cancelled=false,timer:ReturnType<typeof setTimeout>;
  const schedule=(delay:number)=>{timer=setTimeout(()=>void tick(),delay);};
  const tick=async()=>{
    if(cancelled||!options.playing())return;
    if(options.blocked()){schedule(100);return;}
    const remaining=options.remaining();if(remaining>1){schedule(remaining);return;}
    await options.step();
    if(!cancelled&&options.playing())schedule(Math.max(16,options.remaining()));
  };
  schedule(options.remaining());
  return()=>{cancelled=true;clearTimeout(timer);};
}

/** Presentation cadence is bounded; authoritative time advances only by the
 * integer ticks actually acknowledged by the Worker. No background catch-up. */
export function startRealtimeLoop(options:{playing:()=>boolean;blocked:()=>boolean;tickMillis:number;step:(ticks:number)=>Promise<void>}){
  let cancelled=false,timer:ReturnType<typeof setTimeout>,anchor=performance.now(),credit=0;
  const tick=async()=>{
    if(cancelled||!options.playing())return;
    const now=performance.now(),elapsed=Math.min(250,Math.max(0,now-anchor));anchor=now;
    if(options.blocked()){credit=0;timer=setTimeout(()=>void tick(),32);return;}
    credit+=elapsed/options.tickMillis;const count=Math.min(120,Math.floor(credit));
    if(count){credit-=count;await options.step(count);}
    if(!cancelled&&options.playing())timer=setTimeout(()=>void tick(),32);
  };
  timer=setTimeout(()=>void tick(),32);return()=>{cancelled=true;clearTimeout(timer);};
}
