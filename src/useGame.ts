import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { World, Order, StateAction, StateVersion, WorkerRequest, WorkerResponse } from './sim/types';
import { readSave, writeSave, encodeSave, parseSaveFile } from './persistence';
import { readHistoryRun, writeHistoryRun, encodeHistoryFile } from './history/store';
import { resolveHistoryEngine, resolveWorldEngine, type EngineFacade } from './engine/registry';
import { readProtectedBackup } from './engine/protected-backup';
import { ReplaySession } from './history/replay';
import type { HistoryLog, HistoryParent } from './history/types';
type Request = WorkerRequest extends infer T ? T extends WorkerRequest ? Omit<T,'id'> : never : never;
type ReplayView = {world:World;seq:number;playing:boolean};
const messageOf=(error:unknown)=>error instanceof Error?error.message:String(error);
function download(value:unknown,name:string){
 const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function useGame(scope='test-continent') {
 const historyId=scope.startsWith('custom-run-h-')?scope.slice(7):null;
 const [world,setWorld]=useState<World|null>(null),[error,setError]=useState<string|null>(null);
 const [running,setRunning]=useState(false),[speed,setSpeed]=useState(1),[busy,setBusy]=useState(false);
 const [saveStatus,setSaveStatus]=useState('尚未保存'),[restored,setRestored]=useState(false);
 const [history,setHistory]=useState<HistoryLog|null>(null),[archive,setArchive]=useState(false),[historyCompatible,setHistoryCompatible]=useState(true);
 const [engine,setEngine]=useState<EngineFacade|undefined>();
 const [protectedStorage,setProtectedStorage]=useState(false);
 const [replay,setReplay]=useState<ReplayView|null>(null),[replayBusy,setReplayBusy]=useState(false);
 const saveRevision=useRef(0),storageLocked=useRef(false),fatal=useRef(false),runningRef=useRef(false);
 const committed=useRef<World|null>(null),historyRef=useRef<HistoryLog|null>(null),archiveRef=useRef(false),compatibleRef=useRef(true);
 const engineRef=useRef<EngineFacade|undefined>(undefined);
 const worker=useRef<Worker|null>(null),seq=useRef(0),generation=useRef(0);
 const pending=useRef(new Map<number,{resolve:(response:WorkerResponse)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>());
 const queue=useRef<Promise<unknown>>(Promise.resolve()),queueCount=useRef(0);
 const replaySession=useRef<ReplaySession|null>(null),replayRef=useRef<ReplayView|null>(null),replayMode=useRef(false),seekToken=useRef(0),replayWaiting=useRef(false);
 const controlRunning=useCallback((value:boolean)=>{
  if(value&&(replayMode.current||archiveRef.current||!compatibleRef.current||fatal.current))return;
  runningRef.current=value;setRunning(value);
 },[]);
 const report=useCallback((err:unknown)=>{controlRunning(false);setError(messageOf(err));},[controlRunning]);
 const publish=useCallback((state:World,log?:HistoryLog)=>{
  const resolved=log?(engineRef.current?.fingerprint===log.engineFingerprint?engineRef.current:resolveHistoryEngine(log)):resolveWorldEngine(state);
  engineRef.current=resolved;setEngine(resolved);
  committed.current=state;historyRef.current=log??null;setWorld(state);setHistory(log??null);
 },[]);
 const enqueue=useCallback(<T,>(operation:()=>Promise<T>):Promise<T>=>{
  const owner=generation.current;queueCount.current++;setBusy(true);
  const task=queue.current.then(()=>{if(owner!==generation.current)throw new Error('推演已关闭');return operation();});
  queue.current=task.catch(()=>{});
  return task.catch(err=>{if(owner===generation.current)report(err);throw err;}).finally(()=>{
   if(owner===generation.current){queueCount.current--;setBusy(queueCount.current>0);}
  });
 },[report]);
 const send=useCallback((message:Request):Promise<WorkerResponse>=>new Promise((resolve,reject)=>{
  if(!worker.current||fatal.current){reject(new Error('模拟尚未就绪，请刷新恢复最近存档。'));return;}
  const id=++seq.current;
  const timer=setTimeout(()=>{pending.current.delete(id);fatal.current=true;reject(new Error('模拟响应超时，已暂停。请刷新后恢复最近存档。'));},60000);
  pending.current.set(id,{resolve,reject,timer});worker.current.postMessage({...message,id});
 }),[]);
 const assertWritable=useCallback(()=>{
  if(replayMode.current||archiveRef.current||!compatibleRef.current)throw new Error('当前历史为只读，请退出回放或创建独立分支后继续。');
  if(historyId&&storageLocked.current)throw new Error('历史写入已锁定，请导出记录并刷新恢复；原局保留。');
 },[historyId]);
 const execute=useCallback((message:Request)=>enqueue(async()=>{
  const mutation=message.type!=='init'&&(message.type!=='step'||message.days!==0);
  if(mutation)assertWritable();
  const result=await send(message);
  if(mutation&&historyId){
   try{
    if(!result.history)throw new Error('模拟未返回完整历史，停止写入。');
    const saved=await writeHistoryRun(historyId,{world:result.world,history:result.history,readOnly:false},saveRevision.current);
    saveRevision.current=saved.revision;setSaveStatus(`已自动保存 · 第 ${result.world.day} 日 · 记录 ${result.history.entries.length}`);
   }catch(err){
    storageLocked.current=true;setProtectedStorage(true);controlRunning(false);
    // Restore the worker before another queued input. UI still holds the last committed pair.
    try{if(committed.current&&historyRef.current)await send({type:'init',world:committed.current,history:historyRef.current});}catch{fatal.current=true;}
    throw new Error(`历史保存失败，已保留上一条完整记录并暂停：${messageOf(err)}`,{cause:err});
   }
  }
  publish(result.world,result.history);if(!storageLocked.current)setError(null);return result.world;
 }),[enqueue,assertWritable,send,historyId,publish,controlRunning]);
 useEffect(()=>{
  const owner=++generation.current;queue.current=Promise.resolve();queueCount.current=0;fatal.current=false;
  const w=new Worker(new URL('./sim.worker.ts',import.meta.url),{type:'module'});worker.current=w;let disposed=false;
  w.onmessage=(event:MessageEvent<WorkerResponse>)=>{
   const item=pending.current.get(event.data.id);if(!item)return;
   clearTimeout(item.timer);pending.current.delete(event.data.id);
   if(event.data.error)item.reject(new Error(event.data.error));else item.resolve(event.data);
  };
  w.onerror=()=>{fatal.current=true;report('模拟线程启动失败，请刷新重试；已有存档保留。');for(const item of pending.current.values()){clearTimeout(item.timer);item.reject(new Error('模拟线程不可用'));}pending.current.clear();};
  void (async()=>{
   let loaded:World|null=null,log:HistoryLog|undefined;
   try{
    if(historyId){
     const result=await readHistoryRun(historyId);if(disposed)return;
     if(!result.record)throw new Error('历史记录不在当前浏览器，请导入历史备份。');
     loaded=result.record.world;log=result.record.history;saveRevision.current=result.revision;
     archiveRef.current=result.record.readOnly;setArchive(result.record.readOnly);
     const resolved=resolveHistoryEngine(log),compatible=!!resolved;engineRef.current=resolved;setEngine(resolved);compatibleRef.current=compatible;setHistoryCompatible(compatible);
     storageLocked.current=!compatible;setProtectedStorage(!compatible);setRestored(true);
     setSaveStatus(result.recovery?'已恢复整对历史备份，请导出备份':result.record.readOnly?'只读历史归档':'已恢复历史记录');
     if(!compatible){publish(loaded,log);setError('此历史的规则引擎尚未注册，原记录已锁定保护。可查看已有事实并导出；不能核验回放、计算规则账册或创建分支。');return;}
     if(result.record.readOnly){
      publish(loaded,log);replayMode.current=true;setReplayBusy(true);
      try{const session=new ReplaySession();replaySession.current=session;const view=await session.init(log);if(disposed)return;replayRef.current={...view,playing:false};setReplay(replayRef.current);}
      finally{if(!disposed)setReplayBusy(false);}return;
     }
    }else{
     const result=await readSave(scope);if(disposed)return;loaded=result.world;saveRevision.current=result.revision;
     storageLocked.current=false;setProtectedStorage(false);setRestored(!!loaded);setSaveStatus(loaded?(result.recovery?'已从备份恢复，请导出备份':'已恢复本地存档'):'尚未保存');
    }
   }catch(err){if(disposed)return;storageLocked.current=true;setProtectedStorage(true);setSaveStatus('原存档已锁定，可导出受保护原始备份');report(err);if(historyId)return;}
   if(scope!=='test-continent'&&(!loaded||loaded.scenario!=='custom-world'||`custom-${loaded.custom?.id}`!==scope)){
    if(!disposed){storageLocked.current=true;setProtectedStorage(true);setSaveStatus('未载入推演 · 原始数据受保护');report('此推演存档不在当前浏览器或身份不匹配。请返回世界工坊，导入对应推演备份。');}return;
   }
   if(!disposed)await execute({type:'init',...(loaded?{world:loaded}:{}),...(log?{history:log}:{})});
  })().catch(err=>{if(!disposed){storageLocked.current=true;setProtectedStorage(true);setSaveStatus('加载失败 · 原始数据受保护');report(err);}});
  const pendingRequests=pending.current;
  return()=>{
   disposed=true;if(generation.current===owner)generation.current++;
   w.terminate();worker.current=null;replaySession.current?.close();replaySession.current=null;
   for(const item of pendingRequests.values()){clearTimeout(item.timer);item.reject(new Error('模拟已关闭'));}pendingRequests.clear();
  };
 },[execute,scope,historyId,publish,report]);
 useEffect(()=>{
  if(!running||!world)return;
  const interval=setInterval(()=>{if(runningRef.current&&queueCount.current===0)void execute({type:'step',days:1}).catch(()=>{});},1000/Math.max(1,Math.min(12,speed)));
  return()=>clearInterval(interval);
 },[running,speed,!!world,execute]);
 const seekReplay=useCallback(async(position:number)=>{
  const session=replaySession.current;if(!session||!replayMode.current)throw new Error('请先进入历史回放');
  if(replayWaiting.current)throw new Error('正在定位上一条历史，请稍候。');
  const token=++seekToken.current;replayWaiting.current=true;setReplayBusy(true);
  try{
   const value=await session.seek(position);
   if(token!==seekToken.current||session!==replaySession.current)return;
   replayRef.current={...value,playing:replayRef.current?.playing??false};setReplay(replayRef.current);setError(null);
  }catch(err){if(token===seekToken.current){if(replayRef.current){replayRef.current={...replayRef.current,playing:false};setReplay(replayRef.current);}report(err);}throw err;}
  finally{if(token===seekToken.current){replayWaiting.current=false;setReplayBusy(false);}}
 },[report]);
 const setReplayPlaying=useCallback((playing:boolean)=>{
  if(!replayRef.current)return;replayRef.current={...replayRef.current,playing};setReplay(replayRef.current);
 },[]);
 useEffect(()=>{
  if(!replay?.playing)return;
  const timer=setInterval(()=>{
   if(replayWaiting.current||!replayRef.current?.playing)return;
   if(replayRef.current.seq>=(historyRef.current?.entries.length??0)){setReplayPlaying(false);return;}
   void seekReplay(replayRef.current.seq+1).catch(()=>{});
  },600);
  return()=>clearInterval(timer);
 },[replay?.playing,seekReplay,setReplayPlaying]);
 const enterReplay=()=>enqueue(async()=>{
  controlRunning(false);if(!historyRef.current||!compatibleRef.current)throw new Error('没有可兼容回放的历史');
  if(replaySession.current){if(replayRef.current)return;replaySession.current.close();}
  replayMode.current=true;setReplayBusy(true);let session:ReplaySession|undefined;
  try{session=new ReplaySession();replaySession.current=session;const value=await session.init(historyRef.current);replayRef.current={...value,playing:false};setReplay(replayRef.current);setError(null);}
  catch(err){session?.close();replaySession.current=null;replayMode.current=archiveRef.current;throw err;}
  finally{setReplayBusy(false);}
 });
 const exitReplay=()=>{
  setReplayPlaying(false);seekToken.current++;replayWaiting.current=false;setReplayBusy(false);
  replaySession.current?.close();replaySession.current=null;replayRef.current=null;setReplay(null);replayMode.current=archiveRef.current;
 };
 const snapshot=async()=>{controlRunning(false);assertWritable();return execute({type:'step',days:0});};
 const persist=async(state:World)=>{
  if(storageLocked.current)throw new Error('原存档已锁定写入。请导出受保护原始备份，并使用兼容版本恢复；当前地图不会覆盖原档。');
  if(historyId){if(!historyRef.current)throw new Error('历史尚未读取');const result=await writeHistoryRun(historyId,{world:state,history:historyRef.current,readOnly:false},saveRevision.current);saveRevision.current=result.revision;}
  else saveRevision.current=await writeSave(state,saveRevision.current,scope);
 };
 const save=()=>enqueue(async()=>{
  assertWritable();const result=await send({type:'step',days:0});await persist(result.world);publish(result.world,result.history);
  setSaveStatus(`已保存 · 第 ${result.world.day} 日`);setError(null);
 });
 const historyBytes=useMemo(()=>history?new TextEncoder().encode(JSON.stringify(history)).byteLength:0,[history]);
 return {world,ready:!!world,busy,error,running,speed,saveStatus,restored,setRunning:controlRunning,setSpeed,
  history,historyBytes,archive,historyCompatible,engine,protectedStorage,
  replay,replayBusy,readOnly:!!replay||archive||!historyCompatible||replayBusy,
  enterReplay,seekReplay,setReplayPlaying,exitReplay,
  branchPoint:async(position:number):Promise<{world:World;parent:HistoryParent;sourceEngineFingerprint:string}>=>{
   setReplayPlaying(false);const log=historyRef.current,view=replayRef.current;
   if(!log||!view||view.seq!==position||replayWaiting.current||!compatibleRef.current)throw new Error('回放位置已变化，请重新预览分支。');
   const sourceEngine=resolveHistoryEngine(log);if(!sourceEngine)throw new Error('此历史的规则引擎尚未注册，不能创建分支。');
   const token=seekToken.current,session=replaySession.current;if(!session)throw new Error('历史已关闭');
   const checked=await session.seek(position),worldHash=await sourceEngine.hashWorld(checked.world);
   if(token!==seekToken.current||replayRef.current?.seq!==position||session!==replaySession.current||historyRef.current?.engineFingerprint!==sourceEngine.fingerprint||historyRef.current?.runId!==log.runId)throw new Error('回放位置或规则引擎已变化，请重新预览分支。');
   return {world:checked.world,parent:{runId:log.runId,seq:position,worldHash},sourceEngineFingerprint:sourceEngine.fingerprint};
  },
  exportHistory:()=>enqueue(async()=>{
   controlRunning(false);setReplayPlaying(false);if(!historyRef.current)throw new Error('此局尚无历史记录');
   download(await encodeHistoryFile(historyRef.current),`列国纪-${historyRef.current.initial.world.custom?.name??'历史'}-记录${historyRef.current.entries.length}.history.json`);
  }),snapshot,
  exportProtectedBackup:()=>enqueue(async()=>{
   controlRunning(false);setReplayPlaying(false);
   if(!storageLocked.current)throw new Error('当前存储未处于保护状态，请使用正常存档或历史导出。');
   try{download(await readProtectedBackup(scope),'列国纪-受保护原始备份.protected.json');}
   catch(err){throw new Error(`受保护原始备份未导出：${messageOf(err)}。原始存储未修改。`,{cause:err});}
  }),
  stateCommand:async(action:StateAction,expected:StateVersion)=>{controlRunning(false);await execute({type:'state-action',action,expected});},
  step:()=>{controlRunning(false);void execute({type:'step',days:1}).catch(()=>{});},
  command:async(order:Order)=>{await execute({type:'order',order});},save,
  newGame:()=>enqueue(async()=>{
   controlRunning(false);assertWritable();if(scope!=='test-continent')throw new Error('请回到世界工坊创建新的推演，当前历史已保留。');
   const current=await send({type:'step',days:0});await persist(current.world);
   const result=await send({type:'init'});publish(result.world);setRestored(false);setSaveStatus('新局尚未保存 · 旧局已保留');setError(null);
  }),
  exportSave:()=>enqueue(async()=>{
   if(storageLocked.current)throw new Error('原存档已锁定，不能将当前地图作为原档导出。请使用“导出受保护原始备份”。');
   if(replayMode.current||archiveRef.current||!compatibleRef.current)throw new Error('只读历史请使用导出历史。');
   const result=await send({type:'step',days:0}),envelope=await encodeSave(result.world);
   download(envelope,`列国纪-${envelope.world.custom?.name??'测试大陆'}-第${envelope.world.day}日.save.json`);
  }),
  importSave:(file:File)=>enqueue(async()=>{
   controlRunning(false);assertWritable();if(historyId)throw new Error('记录中的世界不能替换快照，请从工坊导入为新局。');
   const incoming=await parseSaveFile(file);
   if(scope==='test-continent'&&incoming.scenario!=='test-continent')throw new Error('自建世界存档请从世界工坊导入，战役样例原档未修改。');
   if(scope!=='test-continent'&&(incoming.scenario!=='custom-world'||`custom-${incoming.custom?.id}`!==scope))throw new Error('这份存档属于其他世界，请从世界工坊导入为独立推演。当前历史未修改。');
   await persist(incoming);const result=await send({type:'init',world:incoming});publish(result.world);setSaveStatus(`已导入 · 第 ${incoming.day} 日`);setRestored(true);setError(null);
  })
 };
}
