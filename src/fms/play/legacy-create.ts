import type {GameCommand} from './war46-session';
import type {GameRun} from './war46-model';
export const LEGACY_RULES=[18,19,20,21,22,23,24,25,26,27,46] as const;
export type LegacyRule=typeof LEGACY_RULES[number];
export type LegacyCreate=Extract<GameCommand,{type:'create'}>;
/** Explicit creation of frozen rules; no version rewriting or save migration. */
export class LegacyCreator {
 private worker:Worker|null=null;
 private reject:((e:Error)=>void)|null=null;
 create(version:LegacyRule,command:LegacyCreate):Promise<GameRun>{
  this.close();
  return new Promise((resolve,reject)=>{
   const worker=new Worker(new URL('./legacy-create.worker.ts',import.meta.url),{type:'module'});this.worker=worker;
   const finish=()=>{clearTimeout(timer);worker.terminate();if(this.worker===worker){this.worker=null;this.reject=null;}};
   const timer=setTimeout(()=>{finish();reject(new Error('旧规则创建超时，已停止且没有写入存档。'));},90000);
   this.reject=e=>{finish();reject(e);};
   worker.onmessage=(e:MessageEvent<{run?:GameRun;error?:string}>)=>{finish();if(e.data.run)resolve(e.data.run);else reject(new Error(e.data.error??'旧规则创建失败。'));};
   worker.onerror=()=>{finish();reject(new Error('旧规则创建线程无法继续。'));};
   worker.postMessage({version,command});
  });
 }
 close(){this.reject?.(new Error('已取消旧规则创建。'));this.worker?.terminate();this.worker=null;this.reject=null;}
}
