import { createWorld } from './sim/demo';
import { advanceWorld, issueOrder, validateWorld, applyStateAction } from './sim/core';
import type { WorkerRequest, WorkerResponse, World } from './sim/types';
import type { HistoryLog } from './history/types';
import { appendHistory, hashWorld, seekHistory, verifyHistory } from './history/core';
import { ENGINE_FINGERPRINT } from './history/engine';
let world:World=createWorld();
let history:HistoryLog|null=null;
let queue=Promise.resolve();
self.onmessage=(event:MessageEvent<WorkerRequest>)=>{
 const request=event.data;
 queue=queue.then(async()=>{
 try {
  if(request.type==='init') {
   const candidate=request.world??createWorld();
   if(!validateWorld(candidate)) throw new Error('模拟状态无效');
   if(request.history){
    await verifyHistory(request.history,ENGINE_FINGERPRINT);
    const tail=await seekHistory(request.history,request.history.entries.length,ENGINE_FINGERPRINT);
    if(await hashWorld(tail)!==await hashWorld(candidate))throw new Error('记录尾与当前推演不一致');
   }
   world=structuredClone(candidate);
   history=request.history?structuredClone(request.history):null;
  } else if(history){
   if(request.type!=='step'||request.days!==0){
    if(request.type==='step'&&request.days!==1)throw new Error('历史按一日一步记录');
    const input=request.type==='step'?{type:'step' as const,days:1 as const}:request.type==='order'?{type:'order' as const,order:request.order}:{type:'state-action' as const,action:request.action,expected:request.expected};
    const result=await appendHistory(history,world,input,ENGINE_FINGERPRINT);
    world=result.world;history=result.history;
   }
  } else if(request.type==='step') world=advanceWorld(world,request.days);
  else if(request.type==='order') world=issueOrder(world,request.order);
  else if(request.type==='state-action') world=applyStateAction(world,request.action,request.expected);
  self.postMessage({id:request.id,world,...(history?{history}:{})} satisfies WorkerResponse);
 } catch(err) { self.postMessage({id:request.id,world,...(history?{history}:{}),error:err instanceof Error?err.message:'模拟出错，已保留上一状态'} satisfies WorkerResponse); }
 });
};
