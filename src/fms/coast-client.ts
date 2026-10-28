import { assertFmsDocument, type FmsDocument } from './model';
import { prepareFmsCoastPreview, validFmsCoastOptions, type FmsCoastOptions, type FmsCoastResult } from './coast-refinement';
import { prepareFmsCoastSmoothPreview, validFmsCoastSmoothOptions, type FmsCoastSmoothOptions, type FmsCoastSmoothResult } from './coast-smoothing';

export type FmsCoastRequest = { kind:'refine-coast'; requestId:number; document:FmsDocument; options:FmsCoastOptions }
  | {kind:'smooth-coast'; requestId:number; document:FmsDocument; options:FmsCoastSmoothOptions};
export type FmsCoastResponse = { kind:'refined-coast'; requestId:number; result:FmsCoastResult }
  | {kind:'smoothed-coast';requestId:number;result:FmsCoastSmoothResult}
  | {kind:'error';requestId:number;worldId:string;baseRevision:number;message:string};
export interface FmsCoastPreview { result:FmsCoastResult; document:FmsDocument }
export interface FmsCoastSmoothPreview {result:FmsCoastSmoothResult;document:FmsDocument}
const abortError=()=>new DOMException('海岸细化已取消，原地图未改变。','AbortError');
const failMessage=()=>new Error('海岸线程返回的数据不符合轮廓保护要求，原地图未改变。');
type Pending={id:number;kind:FmsCoastRequest['kind'];source:FmsDocument;options:FmsCoastOptions|FmsCoastSmoothOptions;resolve:(value:FmsCoastPreview|FmsCoastSmoothPreview)=>void;reject:(error:Error)=>void;
  timer:ReturnType<typeof setTimeout>;signal?:AbortSignal;abort:()=>void};

/** One isolated, cancellable computation. No persistence and no transferred input. */
export class FmsCoastClient {
  private worker?:Worker; private pending?:Pending; private requestId=0; private closed=false;
  constructor(private timeoutMs=120_000){if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>600_000)throw new Error('海岸线程时限无效。');}
  async refine(document:FmsDocument,options:FmsCoastOptions,control:{signal?:AbortSignal}={}):Promise<FmsCoastPreview>{
    return await this.start(document,options,'refine-coast',control) as FmsCoastPreview;
  }
  async smooth(document:FmsDocument,options:FmsCoastSmoothOptions,control:{signal?:AbortSignal}={}):Promise<FmsCoastSmoothPreview>{
    return await this.start(document,options,'smooth-coast',control) as FmsCoastSmoothPreview;
  }
  private async start(document:FmsDocument,options:FmsCoastOptions|FmsCoastSmoothOptions,kind:FmsCoastRequest['kind'],control:{signal?:AbortSignal}):Promise<FmsCoastPreview|FmsCoastSmoothPreview>{
    if(this.closed)throw new Error('海岸细化会话已关闭。');
    if(control.signal?.aborted)throw abortError();
    if(this.pending)throw new Error('海岸仍在细化，请等待或取消。');
    assertFmsDocument(document);if(!(kind==='refine-coast'?validFmsCoastOptions(options):validFmsCoastSmoothOptions(options)))throw failMessage();
    const source=structuredClone(document),chosen={...options},id=++this.requestId;
    if(!this.worker){
      // Classic worker: a module worker is a CORS fetch, which WebKit drops on capacitor://.
      this.worker=new Worker(new URL('./coast.worker.ts',import.meta.url));
      const worker=this.worker;
      worker.onmessage=event=>{if(this.worker===worker)this.receive(event.data);};
      worker.onerror=()=>{if(this.worker===worker)this.fail(new Error('海岸线程运行失败，原地图未改变。'));};
      worker.onmessageerror=()=>{if(this.worker===worker)this.fail(failMessage());};
    }
    return new Promise((resolve,reject)=>{
      const abort=()=>this.cancel(),timer=setTimeout(()=>this.fail(new Error('海岸细化超时，原地图未改变。')),this.timeoutMs);
      this.pending={id,kind,source,options:chosen,resolve,reject,timer,signal:control.signal,abort};
      control.signal?.addEventListener('abort',abort,{once:true});
      if(control.signal?.aborted){abort();return;}
      try{this.worker!.postMessage({kind,requestId:id,document:source,options:chosen} as FmsCoastRequest);}
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
      if(Object.keys(value).length!==3||!Object.hasOwn(value,'result'))throw failMessage();
      if(pending.kind==='smooth-coast'){
        if(value.kind!=='smoothed-coast')throw failMessage();
        const result=value.result as FmsCoastSmoothResult,document=prepareFmsCoastSmoothPreview(pending.source,result,pending.options);
        this.clear()?.resolve({result,document});
      }else{
        if(value.kind!=='refined-coast')throw failMessage();
        const result=value.result as FmsCoastResult,document=prepareFmsCoastPreview(pending.source,result,pending.options as FmsCoastOptions);
        this.clear()?.resolve({result,document});
      }
    }catch{this.fail(failMessage());}
  }
}
