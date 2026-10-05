import { deriveFmsBiomeSurface, type FmsBiomeSurface } from './biome-surface';
import type { FmsDocument } from './model';

export interface FmsBiomeRequest { requestId:number; document:FmsDocument }
export type FmsBiomeResponse = {requestId:number;worldId:string;baseRevision:number} &
  ({kind:'biome';surface:FmsBiomeSurface;elapsedMs:number}|{kind:'error';message:string});
export function runFmsBiomeRequest(raw:unknown):FmsBiomeResponse {
  const request=raw as Partial<FmsBiomeRequest>|null;
  const requestId=request?.requestId??0,doc=request?.document;
  const identity={requestId,worldId:doc?.worldId??'',baseRevision:doc?.revision??-1};
  try {
    if(!request||Object.keys(request).length!==2||!Number.isSafeInteger(requestId)||requestId<=0||!doc)throw Error('气候计算请求无效。');
    const start=performance.now(),surface=deriveFmsBiomeSurface(doc);
    return {...identity,kind:'biome',surface,elapsedMs:performance.now()-start};
  }catch(error){return {...identity,kind:'error',message:error instanceof Error?error.message.slice(0,300):'气候计算未完成。'};}
}
export function fmsBiomeTransfer(surface:FmsBiomeSurface):ArrayBuffer[] {
  return [surface.ids,surface.colors,surface.temperatures,surface.precipitation,surface.rivers.flux,surface.rivers.riverIds,surface.rivers.receiver,surface.rivers.routingHeight,surface.rivers.shape.positions].map(a=>a.buffer as ArrayBuffer);
}
if(typeof self!=='undefined'&&typeof document==='undefined')self.onmessage=event=>{
  const response=runFmsBiomeRequest(event.data);
  self.postMessage(response,{transfer:response.kind==='biome'?fmsBiomeTransfer(response.surface):[]});
};
