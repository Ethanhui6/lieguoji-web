import { assertFmsDocument, type FmsDocument } from './model';
import { prepareFmsCoastPreview, validFmsCoastOptions, type FmsCoastOptions, type FmsCoastResult } from './coast-refinement';

export interface FmsCoastRequest { kind:'refine-coast'; requestId:number; document:FmsDocument; options:FmsCoastOptions }
export type FmsCoastResponse = { kind:'refined-coast'; requestId:number; result:FmsCoastResult }
  | {kind:'error';requestId:number;worldId:string;baseRevision:number;message:string};
export interface FmsCoastPreview { result:FmsCoastResult; document:FmsDocument }
const abortError=()=>new DOMException('海岸细化已取消，原地图未改变。','AbortError');
const failMessage=()=>new Error('海岸线程返回的数据不符合轮廓保护要求，原地图未改变。');
type Pending={id:number;source:FmsDocument;options:FmsCoastOptions;resolve:(value:FmsCoastPreview)=>void;reject:(error:Error)=>void;
  timer:ReturnType<typeof setTimeout>;signal?:AbortSignal;abort:()=>void};

/** One isolated, cancellable computation. No persistence and no transferred input. */
export class FmsCoastClient {
  private worker?:Worker; private pending?:Pending; private requestId=0; private closed=false;
  constructor(private timeoutMs=120_000){if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>600_000)throw new Error('海岸线程时限无效。');}
  async refine(document:FmsDocument,options:FmsCoastOptions,control:{signal?:AbortSignal}={}):Promise<FmsCoastPreview>{
    if(this.closed)throw new Error('海岸细化会话已关闭。');
    if(control.signal?.aborted)throw abortError();
    if(this.pending)throw new Error('海岸仍在细化，请等待或取消。');
    assertFmsDocument(document);if(!validFmsCoastOptions(options))throw failMessage();
    const source=structuredClone(document),chosen={...options},id=++this.requestId;
    if(!this.worker){
      this.worker=new Worker(new URL('./coast.worker.ts',import.meta.url),{type:'module'});
      const worker=this.worker;
      worker.onmessage=event=>{if(this.worker===worker)this.receive(event.data);};
      worker.onerror=()=>{if(this.worker===worker)this.fail(new Error('海岸线程运行失败，原地图未改变。'));};
      worker.onmessageerror=()=>{if(this.worker===worker)this.fail(failMessage());};
    }
    return new Promise((resolve,reject)=>{
      const abort=()=>this.cancel(),timer=setTimeout(()=>this.fail(new Error('海岸细化超时，原地图未改变。')),this.timeoutMs);
      this.pending={id,source,options:chosen,resolve,reject,timer,signal:control.signal,abort};
      control.signal?.addEventListener('abort',abort,{once:true});
      if(control.signal?.aborted){abort();return;}
      try{this.worker!.postMessage({kind:'refine-coast',requestId:id,document:source,options:chosen} satisfies FmsCoastRequest);}
      catch{this.fail(new Error('无法发送海岸数据，原地图未改变。'));}
    });
  }
  cancel(){this.fail(abortError());}
  close(){this.closed=true;this.cancel();}
  private clear(){const p=this.pending;this.pending=undefined;if(p){clearTimeout(p.timer);p.signal?.removeEventListener('abort',p.abort);}return p;}
  private fail(error:Error){const worker=this.worker;this.worker=undefined;if(worker){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();}this.clear()?.reject(error);}
  private receive(raw:unknown){
    const pending=this.pending;if(!pending)return;
    try{
      if(!raw||typeof raw!=='object')throw failMessage();
      const value=raw as Record<string,unknown>;
      if(value.requestId!==pending.id)throw failMessage();
      if(value.kind==='error'){
        if(Object.keys(value).length!==5||value.worldId!==pending.source.worldId||value.baseRevision!==pending.source.revision
          ||typeof value.message!=='string'||!value.message||value.message.length>500)throw failMessage();
        this.fail(new Error(value.message));return;
      }
      if(value.kind!=='refined-coast'||Object.keys(value).length!==3||!Object.hasOwn(value,'result'))throw failMessage();
      const result=value.result as FmsCoastResult,document=prepareFmsCoastPreview(pending.source,result,pending.options);
      this.clear()?.resolve({result,document});
    }catch{this.fail(failMessage());}
  }
}
