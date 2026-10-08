import type {Culture47Request,Culture47Response,Culture47Snapshot} from './culture47.worker';
export class Culture47Client {
  private worker=new Worker(new URL('./culture47.worker.ts',import.meta.url),{type:'module'});
  private id=0;
  private pending?:{id:number;resolve:(s:Culture47Snapshot)=>void;reject:(e:Error)=>void};
  private closed=false;
  private timer?:ReturnType<typeof setTimeout>;
  get isClosed(){return this.closed;}
  constructor(){this.worker.onmessage=(e:MessageEvent<Culture47Response>)=>{const p=this.pending;if(!p||e.data.id!==p.id)return;this.pending=undefined;clearTimeout(this.timer);if(e.data.error)p.reject(Error(e.data.error));else if(e.data.snapshot)p.resolve(e.data.snapshot);else p.reject(Error('文化模拟未返回结果。'));};this.worker.onerror=()=>this.close();}
  send(command:Culture47Request):Promise<Culture47Snapshot>{
    if(this.closed||this.pending)return Promise.reject(Error('文化模拟仍在处理或已经关闭。'));
    return new Promise((resolve,reject)=>{const id=++this.id;this.pending={id,resolve,reject};this.timer=setTimeout(()=>this.close(),180000);this.worker.postMessage({id,command});});
  }
  close(){clearTimeout(this.timer);this.closed=true;this.worker.terminate();this.pending?.reject(Error('文化模拟已停止，未返回的候选不会写入存档。'));this.pending=undefined;}
}
