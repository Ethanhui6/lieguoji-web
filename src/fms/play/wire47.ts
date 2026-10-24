/** Text wire format for the remote compute host (phone ⇄ PC over WebSocket).
 * Carries what structured clone carries in this game's messages: plain
 * objects/arrays, typed arrays, Map, Set, undefined, NaN, ±Infinity and -0.
 * Tags use a "$" key that no game record uses. */
type Tagged={$t:string;b:string}|{$m:[unknown,unknown][]}|{$s:unknown[]}|{$u:1}|{$n:'NaN'|'Inf'|'-Inf'|'-0'};
const TYPED:Record<string,{new(buffer:ArrayBuffer):ArrayBufferView}>={Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array};

function toBase64(bytes:Uint8Array){
  let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(s);
}
function fromBase64(text:string){const s=atob(text),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}

function pack(value:unknown):unknown{
  if(value===undefined)return {$u:1};
  if(typeof value==='number'){if(Number.isNaN(value))return {$n:'NaN'};if(value===Infinity)return {$n:'Inf'};if(value===-Infinity)return {$n:'-Inf'};if(Object.is(value,-0))return {$n:'-0'};return value;}
  if(value===null||typeof value!=='object')return value;
  if(ArrayBuffer.isView(value)){const name=value.constructor.name;if(!TYPED[name])throw Error('无法传输的数据类型：'+name);return {$t:name,b:toBase64(new Uint8Array(value.buffer,value.byteOffset,value.byteLength))};}
  if(value instanceof Map)return {$m:[...value].map(([k,v])=>[pack(k),pack(v)])};
  if(value instanceof Set)return {$s:[...value].map(pack)};
  if(Array.isArray(value))return value.map(pack);
  const out:Record<string,unknown>={};for(const k of Object.keys(value))out[k]=pack((value as Record<string,unknown>)[k]);return out;
}
function unpack(value:unknown):unknown{
  if(value===null||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(unpack);
  const v=value as Partial<Record<'$t'|'b'|'$m'|'$s'|'$u'|'$n',unknown>>,keys=Object.keys(value);
  if(keys.length===1&&v.$u===1)return undefined;
  if(keys.length===1&&typeof v.$n==='string')return v.$n==='NaN'?NaN:v.$n==='Inf'?Infinity:v.$n==='-Inf'?-Infinity:-0;
  if(keys.length===2&&typeof v.$t==='string'&&typeof v.b==='string'){const Type=TYPED[v.$t];if(!Type)throw Error('未知的数组类型：'+v.$t);const bytes=fromBase64(v.b);return new Type(bytes.buffer);}
  if(keys.length===1&&Array.isArray(v.$m))return new Map((v.$m as [unknown,unknown][]).map(([a,b])=>[unpack(a),unpack(b)]));
  if(keys.length===1&&Array.isArray(v.$s))return new Set((v.$s as unknown[]).map(unpack));
  const out:Record<string,unknown>={};for(const k of keys)out[k]=unpack((value as Record<string,unknown>)[k]);return out;
}
export const encodeWire47=(value:unknown)=>JSON.stringify(pack(value));
export const decodeWire47=(text:string)=>unpack(JSON.parse(text));
export type {Tagged as Wire47Tag};
