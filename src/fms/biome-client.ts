import type { FmsDocument } from './model';
import type { FmsBiomeSurface } from './biome-surface';
import type { FmsBiomeRequest, FmsBiomeResponse } from './biome.worker';

export interface FmsBiomeResult {surface:FmsBiomeSurface;elapsedMs:number}
export interface FmsBiomeComputer {compute(doc:FmsDocument,signal:AbortSignal):Promise<FmsBiomeResult>;close():void}
const aborted=()=>new DOMException('气候计算已取消。','AbortError');
const invalid=()=>Error('气候线程返回的数据无效，已保留高度视图。');
/** Bounded shape/value validation only; never repeat climate/river derivation on the UI thread. */
function validSurface(s:FmsBiomeSurface|undefined,count:number):s is FmsBiomeSurface {
  if(!s||!(s.ids instanceof Uint8Array)||!(s.colors instanceof Float32Array)||!(s.temperatures instanceof Int8Array)||!(s.precipitation instanceof Uint8Array)
    ||s.ids.length!==count||s.colors.length!==count*3||s.temperatures.length!==count||s.precipitation.length!==count)return false;
  const r=s.rivers;
  if(!r||!(r.flux instanceof Uint16Array)||!(r.riverIds instanceof Uint16Array)||!(r.receiver instanceof Int32Array)||!(r.routingHeight instanceof Float32Array)
    ||[r.flux,r.riverIds,r.receiver,r.routingHeight].some(a=>a.length!==count)||!Array.isArray(r.segments)||r.segments.length>count)return false;
  if(!s.stats||s.stats.algorithm!=='recovered-climate-river-web-v2'||s.stats.riverMoisture!==true||!Array.isArray(s.stats.counts)||s.stats.counts.length!==13
    ||!r.stats||r.stats.algorithm!=='recovered-rainfall-flux-web-graph-v1'||!Number.isSafeInteger(s.stats.bytes)||s.stats.bytes<0||s.stats.bytes>count*64)return false;
  const counts=new Array<number>(13).fill(0);
  for(let i=0;i<count;i++){
    if(s.ids[i]>12||r.receiver[i]<-1||r.receiver[i]>=count||!Number.isFinite(r.routingHeight[i]))return false;
    counts[s.ids[i]]++;
  }
  if(counts.some((value,i)=>value!==s.stats.counts[i]))return false;
  for(const c of s.colors)if(!Number.isFinite(c)||c<0||c>1)return false;
  for(const pair of r.segments)if(!Array.isArray(pair)||pair.length!==2||!pair.every(n=>Number.isSafeInteger(n)&&n>=0&&n<count)||pair[0]===pair[1]||r.receiver[pair[0]]!==pair[1])return false;
  return true;
}

/** Owns one isolated Worker. Cancellation terminates computation, not only its UI callback. */
export class FmsBiomeClient implements FmsBiomeComputer {
  private worker?:Worker;
  private cancel?:()=>void;
  private nextId=0;
  private closed=false;
  constructor(private timeoutMs=120_000){}
  compute(doc:FmsDocument,signal:AbortSignal):Promise<FmsBiomeResult> {
    this.cancel?.();
    if(this.closed||signal.aborted)return Promise.reject(aborted());
    return new Promise((resolve,reject)=>{
      const requestId=++this.nextId,worldId=doc.worldId,baseRevision=doc.revision,count=doc.points.length;
      let worker:Worker|undefined,settled=false;
      const finish=(error?:Error,result?:FmsBiomeResult)=>{
        if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);this.cancel=undefined;
        if(worker){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;}
        if(error){worker?.terminate();if(this.worker===worker)this.worker=undefined;reject(error);}else resolve(result!);
      };
      const cancel=()=>finish(aborted()),timer=setTimeout(()=>finish(Error('气候计算超时，已保留高度视图；可以重新选择气候地貌重试。')),this.timeoutMs);
      this.cancel=cancel;signal.addEventListener('abort',cancel,{once:true});
      try{
        worker=this.worker??new Worker(new URL('./biome.worker.ts',import.meta.url),{type:'module'});this.worker=worker;
        worker.onmessage=event=>{
          if(settled)return;
          const raw=event.data as FmsBiomeResponse|undefined;
          if(!raw||raw.requestId!==requestId||raw.worldId!==worldId||raw.baseRevision!==baseRevision){finish(invalid());return;}
          if(raw.kind==='error'){finish(Error(typeof raw.message==='string'?raw.message.slice(0,300):'气候计算失败。'));return;}
          if(raw.kind!=='biome'||!Number.isFinite(raw.elapsedMs)||raw.elapsedMs<0||!validSurface(raw.surface,count)){finish(invalid());return;}
          finish(undefined,{surface:raw.surface,elapsedMs:raw.elapsedMs});
        };
        worker.onerror=event=>{event.preventDefault();finish(Error('气候计算线程未能运行，已保留高度视图。'));};
        worker.onmessageerror=()=>finish(invalid());
        // postMessage clones the input; do not transfer/detach history or live mesh arrays.
        worker.postMessage({requestId,document:doc} satisfies FmsBiomeRequest);
      }catch(error){finish(error instanceof Error?error:invalid());}
    });
  }
  close(){if(this.closed)return;this.closed=true;this.cancel?.();this.worker?.terminate();this.worker=undefined;}
}
