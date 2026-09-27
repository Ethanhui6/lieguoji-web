/** Worker-only cooperative boundary. A posted task, or the existing timer
 * fallback, lets pending input run; a resolved Promise would not do that.
 * Cancellation belongs to each caller's existing before/after guards. In
 * particular, a late abort must not cancel already durable verification. */
export async function yieldAtlasWorkerTask() {
    const scheduler = globalThis.scheduler;
    if (typeof scheduler?.postTask === 'function') {
        // Invoke as a method: native postTask requires its scheduler receiver.
        // A scheduling failure is a real failure, never a silent timer retry.
        await scheduler.postTask(() => { }, { priority: 'background' });
    }
    else {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

let cancelled=false,cancelReceivedAt=null,startedAt=0;
self.onmessage=event=>{
  if(event.data.type==='cancel'){cancelled=true;cancelReceivedAt=performance.now()-startedAt;return;}
  if(event.data.type==='start')void run(event.data).catch(error=>self.postMessage({type:'error',message:String(error),stack:error?.stack}));
};
async function run({mode,cancelAt}){
  const support=typeof globalThis.scheduler?.postTask==='function',spans=[];let completed=0;
  startedAt=performance.now();
  for(let index=0;index<256;index++){
    if(cancelled)break;
    if(cancelAt!==null&&completed===cancelAt)self.postMessage({type:'checkpoint',completed});
    const begin=performance.now();
    if(mode==='timer')await new Promise(resolve=>setTimeout(resolve,0));else await yieldAtlasWorkerTask();
    spans.push(performance.now()-begin);completed++;
    if(cancelled)break;
  }
  self.postMessage({type:'complete',mode,actualMechanism:mode==='timer'||!support?'setTimeout(0)':'scheduler.postTask(background)',support,completed,cancelled,cancelReceivedAt,elapsedMs:performance.now()-startedAt,spans});
}
