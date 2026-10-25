import {decodeWire47,encodeWire47} from './wire47';
import type {Culture47Journal} from './culture47-session';

/** Browser side of the cloud saves (src/server/cloud47.ts). A world travels as its journal
 * in the wire format (typed arrays kept), gzip-compressed with the browser's
 * CompressionStream. The session token is kept per browser. */
export type CloudSession47={token:string;name:string};
export type CloudSave47={name:string;savedAt:string;size:number;day:string};
const KEY='lieguoji-cloud-session-v1';
export function readCloudSession47():CloudSession47|null{
  try{const v=JSON.parse(localStorage.getItem(KEY)??'null') as CloudSession47|null;return v&&typeof v.token==='string'&&/^[0-9a-f]{64}$/.test(v.token)&&typeof v.name==='string'?v:null;}catch{return null;}
}
function writeSession(s:CloudSession47|null){try{if(s)localStorage.setItem(KEY,JSON.stringify(s));else localStorage.removeItem(KEY);}catch{/* per-browser convenience */}}

export class CloudError47 extends Error{constructor(message:string,readonly status:number){super(message);}}
async function api(path:string,init:RequestInit={},session?:CloudSession47|null):Promise<Response>{
  let r:Response;
  try{r=await fetch('/api/cloud/'+path,{...init,headers:{...(init.headers as Record<string,string>|undefined),...(session?{authorization:'Bearer '+session.token}:{})}});}
  catch{throw new CloudError47('连接服务器失败，请检查网络。',0);}
  if(r.ok)return r;
  let message=r.status===404?'云存档服务尚未开通。':'服务器出错，请稍后再试。';
  try{const v=await r.json() as {error?:string};if(v.error)message=v.error;}catch{/* not JSON */}
  if(r.status===401&&session)writeSession(null);
  throw new CloudError47(message,r.status);
}
async function account(kind:'register'|'login',name:string,password:string){
  const r=await api(kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,password})});
  const s=await r.json() as CloudSession47;writeSession(s);return s;
}
export const registerCloud47=(name:string,password:string)=>account('register',name,password);
export const loginCloud47=(name:string,password:string)=>account('login',name,password);
export async function logoutCloud47(s:CloudSession47){try{await api('logout',{method:'POST'},s);}finally{writeSession(null);}}
export async function listCloudSaves47(s:CloudSession47):Promise<CloudSave47[]>{return (await (await api('saves',{},s)).json() as {saves:CloudSave47[]}).saves;}

async function gzip(text:string){const stream=new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));return new Uint8Array(await new Response(stream).arrayBuffer());}
async function gunzip(bytes:ArrayBuffer){const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));return await new Response(stream).text();}
export async function uploadCloud47(s:CloudSession47,name:string,journal:Culture47Journal,day:string){
  const body=await gzip(encodeWire47(journal));
  return await (await api('saves/'+encodeURIComponent(name),{method:'PUT',headers:{'content-type':'application/gzip','x-save-day':encodeURIComponent(day)},body},s)).json() as CloudSave47;
}
/** The journal as stored; the caller replays it (verifyJournal) before it enters the library. */
export async function downloadCloud47(s:CloudSession47,name:string):Promise<Culture47Journal>{
  const bytes=await (await api('saves/'+encodeURIComponent(name),{},s)).arrayBuffer();
  try{return decodeWire47(await gunzip(bytes)) as Culture47Journal;}catch{throw new CloudError47('云存档数据损坏。',0);}
}
export async function deleteCloud47(s:CloudSession47,name:string){await api('saves/'+encodeURIComponent(name),{method:'DELETE'},s);}
