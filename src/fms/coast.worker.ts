import { refineFmsCoast } from './coast-refinement';
import type { FmsCoastRequest, FmsCoastResponse } from './coast-client';

export function runFmsCoastRequest(raw:unknown):FmsCoastResponse{
  const value=raw&&typeof raw==='object'?raw as Partial<FmsCoastRequest>:{};
  const requestId=typeof value.requestId==='number'&&Number.isSafeInteger(value.requestId)?value.requestId:0;
  const worldId=typeof value.document?.worldId==='string'?value.document.worldId:'';
  const baseRevision=typeof value.document?.revision==='number'?value.document.revision:-1;
  try{
    if(Object.keys(value).length!==4||!['kind','requestId','document','options'].every(key=>Object.hasOwn(value,key))
      ||value.kind!=='refine-coast'||requestId<=0||!value.document||!value.options)throw new Error('海岸细化请求无效。');
    return {kind:'refined-coast',requestId,result:refineFmsCoast(value.document,value.options)};
  }catch(error){return {kind:'error',requestId,worldId,baseRevision,message:error instanceof Error?error.message.slice(0,500):'海岸细化失败，原地图未改变。'};}
}
if(typeof self!=='undefined'&&typeof document==='undefined')self.onmessage=event=>self.postMessage(runFmsCoastRequest(event.data));
