import { createWorld } from './sim/demo';
import { advanceWorld, issueOrder, validateWorld, applyStateAction } from './sim/core';
import type { WorkerRequest, WorkerResponse, World } from './sim/types';
let world:World=createWorld();
self.onmessage=(event:MessageEvent<WorkerRequest>)=>{
 const request=event.data;
 try {
  if(request.type==='init') {
   const candidate=request.world??createWorld();
   if(!validateWorld(candidate)) throw new Error('模拟状态无效');
   world=structuredClone(candidate);
  } else if(request.type==='step') world=advanceWorld(world,request.days);
  else if(request.type==='order') world=issueOrder(world,request.order);
  else if(request.type==='state-action') world=applyStateAction(world,request.action,request.expected);
  self.postMessage({id:request.id,world} satisfies WorkerResponse);
 } catch(err) { self.postMessage({id:request.id,world,error:err instanceof Error?err.message:'模拟出错，已保留上一状态'} satisfies WorkerResponse); }
};
