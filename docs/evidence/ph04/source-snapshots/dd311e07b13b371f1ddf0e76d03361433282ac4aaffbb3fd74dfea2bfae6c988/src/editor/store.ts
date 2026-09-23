import {validateDraft} from '../worldgen/engine';
import type {EditorDraft} from '../worldgen/types';
export type RunInfo={id:string;name:string;createdAt:string};
export type Workspace={schemaVersion:1;draft:EditorDraft;runs:RunInfo[]};
type Envelope={format:'lieguoji-studio';version:1;checksum:string;data:Workspace};
const DB='lieguoji-world-studio-v1';
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('无法打开工坊存档，请检查浏览器存储权限。'));r.onblocked=()=>reject(new Error('另一窗口正在使用旧版工坊，请关闭后重试。'));});}
async function digest(data:Workspace){const bytes=new TextEncoder().encode(JSON.stringify(data));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function isWorkspace(raw:unknown):raw is Workspace{
 if(!raw||typeof raw!=='object')return false;
 const v=raw as Partial<Workspace>;
 return v.schemaVersion===1&&validateDraft(v.draft)&&Array.isArray(v.runs)&&v.runs.length<=100&&v.runs.every(r=>r&&typeof r.id==='string'&&/^run-[a-z0-9-]{1,55}$/.test(r.id)&&typeof r.name==='string'&&r.name.length<=120&&typeof r.createdAt==='string'&&Number.isFinite(Date.parse(r.createdAt)))&&new Set(v.runs.map(r=>r.id)).size===v.runs.length;
}
function guardVersion(raw:unknown){
 if(!raw||typeof raw!=='object'||!('format'in raw)||raw.format!=='lieguoji-studio')return;
 const data='data'in raw&&raw.data&&typeof raw.data==='object'?raw.data:null;
 const draft=data&&'draft'in data&&data.draft&&typeof data.draft==='object'?data.draft:null;
 if(('version'in raw&&raw.version!==1)||(data&&'schemaVersion'in data&&data.schemaVersion!==1)||(draft&&'schemaVersion'in draft&&draft.schemaVersion!==1))throw new Error('工坊存档来自更新版本，已锁定写入，原文件保留。');
}
export async function encodeWorkspace(data:Workspace):Promise<Envelope>{if(!isWorkspace(data))throw new Error('工坊数据校验失败，尚未保存。');return {format:'lieguoji-studio',version:1,checksum:await digest(data),data:structuredClone(data)};}
export async function decodeWorkspace(raw:unknown):Promise<Workspace>{
 guardVersion(raw);if(!raw||typeof raw!=='object')throw new Error('无法识别工坊文件。');
 const e=raw as Partial<Envelope>;if(e.format!=='lieguoji-studio'||e.version!==1||!isWorkspace(e.data))throw new Error('工坊文件损坏或版本不支持，当前世界未修改。');
 if(e.checksum!==await digest(e.data))throw new Error('工坊文件校验和不匹配，当前世界未修改。');return structuredClone(e.data);
}
export async function loadWorkspace():Promise<{data:Workspace|null;revision:number;recovered:boolean}>{
 const db=await open();try{
 const raw=await new Promise<{current:unknown;backup:unknown;revision:number}>((resolve,reject)=>{const tx=db.transaction('records','readonly'),s=tx.objectStore('records');const c=s.get('current'),b=s.get('backup'),r=s.get('revision');tx.oncomplete=()=>resolve({current:c.result,backup:b.result,revision:r.result??0});tx.onerror=()=>reject(tx.error);});
 if(!Number.isSafeInteger(raw.revision)||raw.revision<0)throw new Error('工坊存档版本计数损坏，已保留原档。');guardVersion(raw.current);
 if(raw.current===undefined)return{data:null,revision:raw.revision,recovered:false};
 try{return{data:await decodeWorkspace(raw.current),revision:raw.revision,recovered:false};}catch(error){if(raw.backup!==undefined)return{data:await decodeWorkspace(raw.backup),revision:raw.revision,recovered:true};throw error;}
 }finally{db.close();}
}
export async function saveWorkspace(data:Workspace,expectedRevision:number):Promise<number>{
 const encoded=await encodeWorkspace(data);const db=await open();try{
 const before:unknown=await new Promise((resolve,reject)=>{const r=db.transaction('records','readonly').objectStore('records').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});guardVersion(before);
 let valid:unknown;try{if(before!==undefined){await decodeWorkspace(before);valid=before;}}catch{/* A damaged current never replaces a valid backup. */}
 return await new Promise<number>((resolve,reject)=>{const tx=db.transaction('records','readwrite'),s=tx.objectStore('records');const c=s.get('current'),r=s.get('revision');let failure:Error|null=null;
 r.onsuccess=()=>{try{guardVersion(c.result);if((r.result??0)!==expectedRevision||JSON.stringify(c.result)!==JSON.stringify(before))throw new Error('另一窗口已经更新工坊。本次未覆盖，请导出当前草稿再刷新。');if(valid!==undefined)s.put(valid,'backup');s.put(encoded,'current');s.put(expectedRevision+1,'revision');}catch(error){failure=error instanceof Error?error:new Error('保存失败');tx.abort();}};
 tx.oncomplete=()=>resolve(expectedRevision+1);tx.onabort=()=>reject(failure??new Error('工坊保存中断，原档保留。'));tx.onerror=()=>reject(failure??new Error('工坊保存失败，原档保留。'));
 });
 }finally{db.close();}
}
