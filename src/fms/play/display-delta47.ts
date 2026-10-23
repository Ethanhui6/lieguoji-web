/** Exact structural delta between two structured-clone values, so a live
 * display update carries only what changed since the previous packet.
 * Applying a delta to the previous value rebuilds a value equal to the new
 * one, including object key order; unchanged subtrees are shared by
 * reference. Marker objects use the key "\u0000", which game data never has. */
const MARK='\u0000';
type Patch={[MARK]:'object';set:Record<string,unknown>;keys?:string[]}|{[MARK]:'array';length:number;set:Record<number,unknown>};
export type DisplayDelta47={[MARK]:'same'}|Patch|unknown;
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype;
const marked=(v:unknown):v is Patch|{[MARK]:'same'}=>plain(v)&&Object.hasOwn(v,MARK);

/** Exact equality for structured-clone data (plain objects in key order,
 * arrays, Map/Set in entry order, typed arrays by bytes). */
export function sameDisplayValue47(a:unknown,b:unknown):boolean{
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 const proto=Object.getPrototypeOf(a);if(proto!==Object.getPrototypeOf(b))return false;
 if(Array.isArray(a)){const y=b as unknown[];if(a.length!==y.length)return false;for(let i=0;i<a.length;i++)if(!sameDisplayValue47(a[i],y[i]))return false;return true;}
 if(proto===Object.prototype){
  const x=a as Record<string,unknown>,y=b as Record<string,unknown>;let n=0;
  for(const k in x){if(!Object.hasOwn(x,k))continue;n++;if(!Object.hasOwn(y,k)||!sameDisplayValue47(x[k],y[k]))return false;}
  let m=0;for(const k in y)if(Object.hasOwn(y,k))m++;if(n!==m)return false;
  // Same keys; rebuilt objects must also keep the same key order.
  const kx=Object.keys(x),ky=Object.keys(y);for(let i=0;i<kx.length;i++)if(kx[i]!==ky[i])return false;
  return true;
 }
 if(a instanceof Map){const y=b as Map<unknown,unknown>;if(a.size!==y.size)return false;const ia=[...a],ib=[...y];return ia.every(([k,v],i)=>Object.is(k,ib[i][0])&&sameDisplayValue47(v,ib[i][1]));}
 if(a instanceof Set){const y=b as Set<unknown>;if(a.size!==y.size)return false;const ib=[...y];return [...a].every((v,i)=>sameDisplayValue47(v,ib[i]));}
 if(ArrayBuffer.isView(a)){const y=b as ArrayBufferView;if(a.byteLength!==y.byteLength)return false;const p=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),q=new Uint8Array(y.buffer,y.byteOffset,y.byteLength);for(let i=0;i<p.length;i++)if(p[i]!==q[i])return false;return true;}
 return false;
}
function diff(prev:unknown,next:unknown,depth:number):unknown{
 if(depth>0&&plain(prev)&&plain(next)){
  const set:Record<string,unknown>={},keys=Object.keys(next),old=Object.keys(prev);
  for(const k of keys)if(!Object.hasOwn(prev,k)||!sameDisplayValue47(prev[k],next[k]))set[k]=Object.hasOwn(prev,k)?diff(prev[k],next[k],depth-1):next[k];
  const reordered=keys.length!==old.length||keys.some((k,i)=>k!==old[i]);
  return reordered?{[MARK]:'object',set,keys}:{[MARK]:'object',set};
 }
 if(depth>0&&Array.isArray(prev)&&Array.isArray(next)){
  const set:Record<number,unknown>={};
  for(let i=0;i<next.length;i++)if(i>=prev.length)set[i]=next[i];else if(!sameDisplayValue47(prev[i],next[i]))set[i]=diff(prev[i],next[i],depth-1);
  return {[MARK]:'array',length:next.length,set};
 }
 // A raw replacement value is never itself a marker (see MARK).
 return next;
}
export function displayDelta47(prev:unknown,next:unknown,depth:number):DisplayDelta47{
 return sameDisplayValue47(prev,next)?{[MARK]:'same'}:diff(prev,next,depth);
}
export function applyDisplayDelta47<T>(prev:T,delta:DisplayDelta47):T{
 if(!marked(delta))return delta as T;
 if(delta[MARK]==='same')return prev;
 if(delta[MARK]==='object'){
  if(!plain(prev))throw Error('显示增量与上一份数据不一致。');
  const out:Record<string,unknown>={};
  for(const k of delta.keys??Object.keys(prev))out[k]=Object.hasOwn(delta.set,k)?applyDisplayDelta47(prev[k],delta.set[k]):Object.hasOwn(prev,k)?prev[k]:(()=>{throw Error('显示增量缺少字段。');})();
  return out as T;
 }
 if(!Array.isArray(prev))throw Error('显示增量与上一份数据不一致。');
 const out=new Array(delta.length);
 for(let i=0;i<delta.length;i++)out[i]=Object.hasOwn(delta.set,i)?applyDisplayDelta47(prev[i],delta.set[i]):i<prev.length?prev[i]:(()=>{throw Error('显示增量缺少元素。');})();
 return out as T;
}
