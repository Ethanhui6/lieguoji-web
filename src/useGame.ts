import { useEffect, useRef, useState, useCallback } from 'react';
import type { World, Order, StateAction, StateVersion, WorkerRequest, WorkerResponse } from './sim/types';
import { readSave, writeSave, encodeSave, parseSaveFile } from './persistence';
type Request = WorkerRequest extends infer T ? T extends WorkerRequest ? Omit<T,'id'> : never : never;
export function useGame(scope='test-continent') {
 const [world,setWorld]=useState<World|null>(null),[error,setError]=useState<string|null>(null);
 const [running,setRunning]=useState(false),[speed,setSpeed]=useState(1),[busy,setBusy]=useState(false);
 const [saveStatus,setSaveStatus]=useState('尚未保存'),[restored,setRestored]=useState(false);
 const saveRevision=useRef(0),storageLocked=useRef(false),writing=useRef(false);
 const runningRef=useRef(false);
 const controlRunning=(value:boolean)=>{runningRef.current=value;setRunning(value);};
 const worker=useRef<Worker|null>(null),seq=useRef(0),pending=useRef(new Map<number,{resolve:(w:World)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>());
 const request=useCallback((message:Request):Promise<World>=>new Promise((resolve,reject)=>{
  if(!worker.current) {reject(new Error('模拟尚未就绪'));return;}
  const id=++seq.current;
  const timer=setTimeout(()=>{pending.current.delete(id);setBusy(pending.current.size>0);setRunning(false);setError('模拟响应超时，已暂停。请刷新后恢复最近存档。');reject(new Error('模拟响应超时'));},10000);
  pending.current.set(id,{resolve,reject,timer});setBusy(true);
  worker.current.postMessage({...message,id});
 }),[]);
 useEffect(()=>{
  const w=new Worker(new URL('./sim.worker.ts',import.meta.url),{type:'module'});worker.current=w;
  let disposed=false;
  w.onmessage=(e:MessageEvent<WorkerResponse>)=>{
   const p=pending.current.get(e.data.id);if(!p)return;
   clearTimeout(p.timer);pending.current.delete(e.data.id);setBusy(pending.current.size>0);
   setWorld(e.data.world);
   if(e.data.error) {setError(e.data.error);p.reject(new Error(e.data.error));} else p.resolve(e.data.world);
  };
  w.onerror=()=>{setError('模拟线程启动失败，请刷新重试；已有存档保留。');setRunning(false);};
  void (async()=>{
   let loaded:World|null=null;
   try {const result=await readSave(scope);if(disposed)return;loaded=result.world;saveRevision.current=result.revision;storageLocked.current=false;setRestored(!!loaded);setSaveStatus(loaded?(result.recovery?'已从备份恢复，请导出备份':'已恢复本地存档'):'尚未保存');}
   catch(err){if(!disposed){storageLocked.current=true;setSaveStatus('本地存档已锁定保护，可导出本局');setError(err instanceof Error?err.message:'读取存档失败');}}
   if(scope!=='test-continent'&&(!loaded||loaded.scenario!=='custom-world'||`custom-${loaded.custom?.id}`!==scope)){
    if(!disposed){storageLocked.current=true;setSaveStatus('未载入推演');setError('此推演存档不在当前浏览器或身份不匹配。请返回世界工坊，导入对应推演备份。');}return;
   }
   if(!disposed) await request({type:'init',...(loaded?{world:loaded}:{})});
  })().catch(err=>{if(!disposed)setError(String(err));});
  const queue=pending.current;
  return()=>{disposed=true;w.terminate();worker.current=null;for(const p of queue.values()){clearTimeout(p.timer);p.reject(new Error('模拟已关闭'));}queue.clear();};
 },[request,scope]);
 useEffect(()=>{
  if(!running || !world)return;
  const interval=setInterval(()=>{if(runningRef.current&&pending.current.size===0)void request({type:'step',days:1}).catch(()=>setRunning(false));},1000/Math.max(1,Math.min(12,speed)));
  return()=>clearInterval(interval);
 },[running,speed,!!world,request]);
 const snapshot=()=>request({type:'step',days:0});
 const persist=async(state:World)=>{
  if(storageLocked.current) throw new Error('原存档读取失败，已锁定写入。请先保留原档并使用兼容版本；本局仍可导出。');
  if(writing.current) throw new Error('已有保存操作正在进行，请稍候。');
  writing.current=true;
  try{saveRevision.current=await writeSave(state,saveRevision.current,scope);}finally{writing.current=false;}
 };
 const save=async()=>{
  try {const state=await snapshot();await persist(state);setSaveStatus(`已保存 · 第 ${state.day} 日`);setError(null);}
  catch(err){setError(err instanceof Error?err.message:'保存失败');throw err;}
 };
 return {world,ready:!!world,busy,error,running,speed,saveStatus,restored,setRunning:controlRunning,setSpeed,
  snapshot:async()=>{controlRunning(false);return snapshot();},
  stateCommand:async(action:StateAction,expected:StateVersion)=>{controlRunning(false);setError(null);await request({type:'state-action',action,expected});},
  step:()=>{controlRunning(false);void request({type:'step',days:1}).catch(()=>{});},
  command:async(order:Order)=>{setError(null);await request({type:'order',order});},save,
  newGame:async()=>{controlRunning(false);try {if(scope!=='test-continent')throw new Error('请回到世界工坊创建新的推演，当前历史已保留。');const current=await snapshot();await persist(current);await request({type:'init'});setRestored(false);setSaveStatus('新局尚未保存 · 旧局已保留');setError(null);}catch(err){setError(String(err));throw err;}},
  exportSave:async()=>{try {const envelope=await encodeSave(await snapshot());const url=URL.createObjectURL(new Blob([JSON.stringify(envelope)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`列国纪-${envelope.world.custom?.name??'测试大陆'}-第${envelope.world.day}日.save.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(err){setError(String(err));throw err;}},
  importSave:async(file:File)=>{controlRunning(false);try{const incoming=await parseSaveFile(file);if(scope==='test-continent'&&incoming.scenario!=='test-continent')throw new Error('自建世界存档请从世界工坊导入，战役样例原档未修改。');if(scope!=='test-continent'&&(incoming.scenario!=='custom-world'||`custom-${incoming.custom?.id}`!==scope))throw new Error('这份存档属于其他世界，请从世界工坊导入为独立推演。当前历史未修改。');await persist(incoming);await request({type:'init',world:incoming});setSaveStatus(`已导入 · 第 ${incoming.day} 日`);setRestored(true);setError(null);}catch(err){setError(err instanceof Error?err.message:'导入失败');throw err;}}
 };
}
