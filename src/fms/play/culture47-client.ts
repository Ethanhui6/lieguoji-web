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
import old3d08 from '../../../compat/culture47/engine-3d08.js?url';
import old30fe from '../../../compat/culture47/engine-30fe.js?url';
import {Culture47DisplayDecoder} from './culture47-display';
const urls:Record<string,string>={'engine-42a3.js':old42,'engine-ce32.js':oldCe,'engine-b365.js':oldB365,'engine-9e23.js':old9e23,'engine-6f84.js':old6f84,'engine-f212.js':oldF212,'engine-30fe.js':old30fe,'engine-49f7.js':old49f7,'engine-8d16.js':old8d16,'engine-3d08.js':old3d08};
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
  async send(command:Exclude<Culture47Request,{type:'load'|'verify'}>|{type:'load';journal:Culture47Journal},options:Options={}):Promise<Culture47Snapshot>{
    const result=await this.request(command,options);
    let s=result.snapshot;
    try {if(result.display){if(this.engine!==__CULTURE47_ENGINE__&&frozenCulture47(this.engine)?.protocol!==2)throw Error('原引擎显示协议不匹配。');s=this.display.decode(result.display,{engine:this.engine,...('sequence'in command?{sequence:command.sequence,actions:command.type==='advance-batch'?Math.ceil(command.ticks/120):1}:{})});}}
    catch(e){this.close();throw new Culture47Unavailable(e instanceof Error?e.message:'显示进度无法确认。');}
    if(!s||s.journal.engine!==this.engine||('journal'in command&&s.journal.id!==command.journal.id)){this.close();throw new Culture47Unavailable('文化模拟返回不匹配的世界，原档保持。');}return s;
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
