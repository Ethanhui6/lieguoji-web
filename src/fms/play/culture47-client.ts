import type {Culture47Request,Culture47Response,Culture47Snapshot} from './culture47.worker';
import type {Culture47Journal,Culture47Progress} from './culture47-session';
import {Culture47InvalidJournal,Culture47Unavailable,frozenCulture47} from './culture47-contract';
import {Culture47DisplayDecoder,checkSiegeDisplay47} from './culture47-display';
type Options={signal?:AbortSignal;progress?:(p:Culture47Progress)=>void;longReplay?:boolean};

export class Culture47Client {
  private worker?:Worker;
  private ready:Promise<void>;
  private boot=new AbortController();
  private startupError?:Error;
  private blob?:string;
  private id=0;
  private pending?:{id:number;resolve:(s:Culture47Response)=>void;reject:(e:Error)=>void;cleanup:()=>void;progress?:Options['progress']};
  private closed=false;
  private timer?:ReturnType<typeof setTimeout>;
  private display=new Culture47DisplayDecoder();
  get isClosed(){return this.closed;}
  constructor(readonly engine=__CULTURE47_ENGINE__){
    this.ready=this.start().then(worker=>{
      if(this.closed){worker.terminate();return;}this.worker=worker;
      worker.onmessage=(e:MessageEvent<Culture47Response>)=>{
        const p=this.pending;if(!p||e.data.id!==p.id)return;
        if(e.data.progress){this.watchdog();p.progress?.(e.data.progress);return;}
        this.pending=undefined;clearTimeout(this.timer);p.cleanup();
        if(e.data.error){if(e.data.unavailable){this.close();p.reject(new Culture47Unavailable('推演响应未确认，请恢复最后确认的进度。'));}else p.reject(new Culture47InvalidJournal(e.data.error));}else p.resolve(e.data);
      };
      worker.onerror=()=>this.close();worker.onmessageerror=()=>this.close();
    }).catch(e=>{this.startupError=new Culture47Unavailable('无法启动此世界的原模拟引擎，存档保持。'+(e instanceof Error?e.message:''));});
  }
  private async start(){
    if(this.engine===__CULTURE47_ENGINE__)return new Worker(new URL('./culture47.worker.ts',import.meta.url),{type:'module'});
    throw Error('此存档来自旧版本，新版本不再支持，请新建世界。');
  }
  private watchdog(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.close(),180000);}
  private request(command:Culture47Request,options:Options={}):Promise<Culture47Response>{
    if(this.closed||this.pending)return Promise.reject(new Culture47Unavailable('文化模拟仍在处理或已经关闭。'));
    if(('journal'in command)&&command.journal.engine!==this.engine)return Promise.reject(new Culture47Unavailable('存档与模拟引擎不匹配，原档保持。'));
    return new Promise((resolve,reject)=>{
      const id=++this.id,abort=()=>this.close(),cleanup=()=>options.signal?.removeEventListener('abort',abort);
      this.pending={id,resolve,reject,cleanup,progress:options.progress};options.signal?.addEventListener('abort',abort,{once:true});this.watchdog();
      if(options.signal?.aborted){this.close();return;}
      void this.ready.then(()=>{if(this.pending?.id!==id)return;if(this.startupError){this.close(this.startupError);return;}
        // Original protocol 1 has no progress messages. When the caller has
        // explicitly provided cancellation, silence does not prove a stall.
        if(frozenCulture47(this.engine)&&options.longReplay&&options.signal&&(command.type==='load'||command.type==='verify'))clearTimeout(this.timer);
        try{this.worker!.postMessage({id,command});}catch{this.close();}});
    });
  }
  /** Diagnostics only: the last advance batch (worker compute, round trip, decode). */
  lastTiming:{compute:number;roundTrip:number;decode:number}|null=null;
  async send(command:Exclude<Culture47Request,{type:'load'|'verify'}>|{type:'load';journal:Culture47Journal},options:Options={}):Promise<Culture47Snapshot>{
    const sent=performance.now(),result=await this.request(command,options),received=performance.now();
    let s=result.snapshot;
    try {if(result.display){if(this.engine!==__CULTURE47_ENGINE__&&frozenCulture47(this.engine)?.protocol!==2)throw Error('原引擎显示协议不匹配。');s=this.display.decode(result.display,{engine:this.engine,...('sequence'in command?{sequence:command.sequence,actions:command.type==='advance-batch'?Math.ceil(command.ticks/120):1}:{})});}}
    catch(e){this.close();throw new Culture47Unavailable(e instanceof Error?e.message:'显示进度无法确认。');}
    if(result.snapshot)try{checkSiegeDisplay47(result.snapshot);}catch(e){this.close();throw new Culture47Unavailable(e instanceof Error?e.message:'显示证据无法确认。');}
    if(!s||s.journal.engine!==this.engine||('journal'in command&&s.journal.id!==command.journal.id)){this.close();throw new Culture47Unavailable('文化模拟返回不匹配的世界，原档保持。');}
    if(result.timing)this.lastTiming={compute:result.timing.compute,roundTrip:received-sent,decode:performance.now()-received};
    return s;
  }
  async verify(journal:Culture47Journal,options:Options={}):Promise<'witness'|'replay'>{
    const r=await this.request({type:'verify',journal},options);
    if(r.verified?.engine===this.engine&&r.verified.worldId===journal.id&&r.verified.actions===journal.actions.length)return r.verified.source;
    if(frozenCulture47(this.engine)&&r.snapshot?.journal.engine===this.engine&&r.snapshot.journal.id===journal.id)return 'replay';
    this.close();throw new Culture47Unavailable('存档校验未返回确认，原档保持。');
  }
  close(reason:Error=new Culture47Unavailable('文化模拟已停止，未返回的候选不会写入存档。')){
    clearTimeout(this.timer);this.closed=true;this.boot.abort();this.worker?.terminate();if(this.blob)URL.revokeObjectURL(this.blob);
    const p=this.pending;this.pending=undefined;p?.cleanup();p?.reject(reason);
  }
}
