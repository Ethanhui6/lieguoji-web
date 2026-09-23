import { createWorld } from './sim/demo';
import type { WorkerRequest, WorkerResponse, World } from './sim/types';
import type { HistoryLog } from './history/types';
import { resolveHistoryEngine, resolveWorldEngine, type EngineFacade } from './engine/registry';
let world:World=createWorld();
let history:HistoryLog|null=null;
let engine:EngineFacade|undefined;
let queue=Promise.resolve();
self.onmessage=(event:MessageEvent<WorkerRequest>)=>{
 const request=event.data;
 queue=queue.then(async()=>{
 try {
  if(request.type==='init') {
   const candidate=request.world??createWorld();
   const selected=request.history?resolveHistoryEngine(request.history):resolveWorldEngine(candidate);
   if(!selected||!selected.validateWorld(candidate)) throw new Error('模拟状态或引擎版本不兼容，原状态保留。');
   if(request.history){
    await selected.verifyHistory(request.history);
    const tail=await selected.seekHistory(request.history,request.history.entries.length);
    if(await selected.hashWorld(tail)!==await selected.hashWorld(candidate))throw new Error('记录尾与当前推演不一致');
   }
   world=structuredClone(candidate);
   history=request.history?structuredClone(request.history):null;
   engine=selected;
  } else {
   if(!engine)throw new Error('模拟尚未完成版本核验。');
   if(history){
   if(request.type!=='step'||request.days!==0){
    if(request.type==='step'&&request.days!==1)throw new Error('历史按一日一步记录');
    const input=request.type==='step'?{type:'step' as const,days:1 as const}:request.type==='order'?{type:'order' as const,order:request.order}:{type:'state-action' as const,action:request.action,expected:request.expected};
    const result=await engine.appendHistory(history,world,input);
    world=result.world;history=result.history;
   }
   } else if(request.type==='step') world=engine.advanceWorld(world,request.days);
   else if(request.type==='order') world=engine.issueOrder(world,request.order);
   else if(request.type==='state-action') world=engine.applyStateAction(world,request.action,request.expected);
  }
  self.postMessage({id:request.id,world,...(history?{history}:{})} satisfies WorkerResponse);
 } catch(err) { self.postMessage({id:request.id,world,...(history?{history}:{}),error:err instanceof Error?err.message:'模拟出错，已保留上一状态'} satisfies WorkerResponse); }
 });
};
