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
