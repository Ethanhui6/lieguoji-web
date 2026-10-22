import oldDDC4 from '../../../compat/culture47/engine-ddc4.js?url';
import old87F0 from '../../../compat/culture47/engine-87f0.js?url';
import old5582 from '../../../compat/culture47/engine-5582.js?url';
import oldD217 from '../../../compat/culture47/engine-d217.js?url';
import old672E from '../../../compat/culture47/engine-672e.js?url';
import oldB618 from '../../../compat/culture47/engine-b618.js?url';
import old55D0 from '../../../compat/culture47/engine-55d0.js?url';
import oldA12C from '../../../compat/culture47/engine-a12c.js?url';
import old4929 from '../../../compat/culture47/engine-4929.js?url';
import oldA0A0 from '../../../compat/culture47/engine-a0a0.js?url';
import old11A9 from '../../../compat/culture47/engine-11a9.js?url';
import old8A8A from '../../../compat/culture47/engine-8a8a.js?url';
import old3d97 from '../../../compat/culture47/engine-3d97.js?url';
import oldAc46 from '../../../compat/culture47/engine-ac46.js?url';
import old486d from '../../../compat/culture47/engine-486d.js?url';
import old9d1d from '../../../compat/culture47/engine-9d1d.js?url';
import oldB0d1 from '../../../compat/culture47/engine-b0d1.js?url';
import oldD270 from '../../../compat/culture47/engine-d270.js?url';
import oldF98b from '../../../compat/culture47/engine-f98b.js?url';
import old4ba5 from '../../../compat/culture47/engine-4ba5.js?url';
import old10b0 from '../../../compat/culture47/engine-10b0.js?url';
import oldC7ca from '../../../compat/culture47/engine-c7ca.js?url';
import oldB283 from '../../../compat/culture47/engine-b283.js?url';
import type {Culture47Request,Culture47Response,Culture47Snapshot} from './culture47.worker';
import type {Culture47Journal,Culture47Progress} from './culture47-session';
import {Culture47InvalidJournal,Culture47Unavailable,frozenCulture47} from './culture47-contract';
import old42 from '../../../compat/culture47/engine-42a3.js?url';
import oldCe from '../../../compat/culture47/engine-ce32.js?url';
import oldB365 from '../../../compat/culture47/engine-b365.js?url';
import old9e23 from '../../../compat/culture47/engine-9e23.js?url';
import old6f84 from '../../../compat/culture47/engine-6f84.js?url';
import oldF212 from '../../../compat/culture47/engine-f212.js?url';
import old49f7 from '../../../compat/culture47/engine-49f7.js?url';
import old8d16 from '../../../compat/culture47/engine-8d16.js?url';
import oldFe7a from '../../../compat/culture47/engine-fe7a.js?url';
import oldC35e from '../../../compat/culture47/engine-c35e.js?url';
import old2af7 from '../../../compat/culture47/engine-2af7.js?url';
import rebuilt5718 from '../../../compat/culture47/engine-5718.js?url';
import oldD736 from '../../../compat/culture47/engine-d736.js?url';
import old3a65 from '../../../compat/culture47/engine-3a65.js?url';
import oldB489 from '../../../compat/culture47/engine-b489.js?url';
import oldB40d from '../../../compat/culture47/engine-b40d.js?url';
import old22db from '../../../compat/culture47/engine-22db.js?url';
import old1c7d from '../../../compat/culture47/engine-1c7d.js?url';
import old02c7 from '../../../compat/culture47/engine-02c7.js?url';
import oldD06f from '../../../compat/culture47/engine-d06f.js?url';
import old96c3 from '../../../compat/culture47/engine-96c3.js?url';
import oldD4f0 from '../../../compat/culture47/engine-d4f0.js?url';
import oldF2b7 from '../../../compat/culture47/engine-f2b7.js?url';
import old6c81 from '../../../compat/culture47/engine-6c81.js?url';
import oldF8e2 from '../../../compat/culture47/engine-f8e2.js?url';
import old417e from '../../../compat/culture47/engine-417e.js?url';
import oldD7e7 from '../../../compat/culture47/engine-d7e7.js?url';
import old2db0 from '../../../compat/culture47/engine-2db0.js?url';
import old6c6f from '../../../compat/culture47/engine-6c6f.js?url';
import old96d2 from '../../../compat/culture47/engine-96d2.js?url';
import old65b5 from '../../../compat/culture47/engine-65b5.js?url';
import old9c93 from '../../../compat/culture47/engine-9c93.js?url';
import oldDfd9 from '../../../compat/culture47/engine-dfd9.js?url';
import oldA78e from '../../../compat/culture47/engine-a78e.js?url';
import oldF940 from '../../../compat/culture47/engine-f940.js?url';
import old3c14 from '../../../compat/culture47/engine-3c14.js?url';
import olddbb1 from '../../../compat/culture47/engine-dbb1.js?url';
import oldbbff from '../../../compat/culture47/engine-bbff.js?url';
import oldd01d from '../../../compat/culture47/engine-d01d.js?url';
import old4c48 from '../../../compat/culture47/engine-4c48.js?url';
import old3d08 from '../../../compat/culture47/engine-3d08.js?url';
import old30fe from '../../../compat/culture47/engine-30fe.js?url';
import {Culture47DisplayDecoder,checkSiegeDisplay47} from './culture47-display';
const urls:Record<string,string>={'engine-42a3.js':old42,'engine-ce32.js':oldCe,'engine-b365.js':oldB365,'engine-9e23.js':old9e23,'engine-6f84.js':old6f84,'engine-f212.js':oldF212,'engine-30fe.js':old30fe,'engine-49f7.js':old49f7,'engine-8d16.js':old8d16,'engine-3d08.js':old3d08,'engine-4c48.js':old4c48,'engine-d01d.js':oldd01d,'engine-bbff.js':oldbbff,'engine-dbb1.js':olddbb1,'engine-3c14.js':old3c14,'engine-f940.js':oldF940,'engine-a78e.js':oldA78e,'engine-dfd9.js':oldDfd9,'engine-9c93.js':old9c93,'engine-fe7a.js':oldFe7a,'engine-c35e.js':oldC35e,'engine-2af7.js':old2af7,'engine-5718.js':rebuilt5718,'engine-d736.js':oldD736,'engine-3a65.js':old3a65,'engine-b489.js':oldB489,'engine-b40d.js':oldB40d,'engine-22db.js':old22db,'engine-1c7d.js':old1c7d,'engine-02c7.js':old02c7,'engine-d06f.js':oldD06f,'engine-96c3.js':old96c3,'engine-d4f0.js':oldD4f0,'engine-f2b7.js':oldF2b7,'engine-6c81.js':old6c81,'engine-f8e2.js':oldF8e2,'engine-417e.js':old417e,'engine-d7e7.js':oldD7e7,'engine-2db0.js':old2db0,'engine-6c6f.js':old6c6f,'engine-96d2.js':old96d2,'engine-65b5.js':old65b5,'engine-b283.js':oldB283,'engine-c7ca.js':oldC7ca,'engine-10b0.js':old10b0,'engine-4ba5.js':old4ba5,'engine-f98b.js':oldF98b,'engine-d270.js':oldD270,'engine-b0d1.js':oldB0d1,'engine-9d1d.js':old9d1d,'engine-486d.js':old486d,'engine-ac46.js':oldAc46,'engine-3d97.js':old3d97,'engine-8a8a.js':old8A8A,'engine-11a9.js':old11A9,'engine-a0a0.js':oldA0A0,'engine-4929.js':old4929,'engine-a12c.js':oldA12C,'engine-55d0.js':old55D0,'engine-b618.js':oldB618,'engine-672e.js':old672E,'engine-d217.js':oldD217,'engine-5582.js':old5582,'engine-87f0.js':old87F0,'engine-ddc4.js':oldDDC4};
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
    const entry=frozenCulture47(this.engine);if(!entry)throw Error('未登记的版本。');
    const response=await fetch(urls[entry.file],{signal:this.boot.signal});if(!response.ok)throw Error('原引擎下载失败。');
    const bytes=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(bytes.byteLength!==entry.bytes||hash!==entry.sha256)throw Error('原引擎完整性校验失败。');
    if(this.closed)throw Error('已取消。');
    this.blob=URL.createObjectURL(new Blob([bytes],{type:'text/javascript'}));return new Worker(this.blob,{type:'module'});
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
