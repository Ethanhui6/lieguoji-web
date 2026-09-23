import { validateWorld } from './sim/core';
import type { World } from './sim/types';
export type SaveEnvelope = { format: 'lieguoji-save'; version: 1; rulesVersion: '0.1.0'; createdAt: string; checksum: string; world: World };
const DB_NAME = 'lieguoji-test-continent-v1';
async function checksum(world: World) {
 const bytes = new TextEncoder().encode(JSON.stringify(world));
 const digest = await crypto.subtle.digest('SHA-256', bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function encodeSave(world: World): Promise<SaveEnvelope> {
 if (!validateWorld(world)) throw new Error('世界状态校验失败，未写入存档。');
 return {format:'lieguoji-save',version:1,rulesVersion:'0.1.0',createdAt:new Date().toISOString(),checksum:await checksum(world),world:structuredClone(world)};
}
export async function decodeSave(raw: unknown): Promise<World> {
 if(!raw || typeof raw !== 'object') throw new Error('无法识别存档。');
 const e = raw as Partial<SaveEnvelope>;
 if(e.format !== 'lieguoji-save' || e.version !== 1 || e.rulesVersion !== '0.1.0') throw new Error('存档版本不兼容，原存档未修改。');
 if(!validateWorld(e.world)) throw new Error('存档内容损坏，原存档未修改。');
 if(e.checksum !== await checksum(e.world)) throw new Error('存档校验和不匹配，原存档未修改。');
 return structuredClone(e.world);
}
function openDB(scope='test-continent'): Promise<IDBDatabase> {
 if(!/^[a-z][a-z0-9-]{0,90}$/.test(scope)) return Promise.reject(new Error('存档空间标识无效。'));
 const dbName=scope==='test-continent'?DB_NAME:`lieguoji-${scope}-v1`;
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(dbName,1);
  req.onupgradeneeded=()=>req.result.createObjectStore('saves');
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(new Error('无法打开本地存档，请检查浏览器存储权限。'));
  req.onblocked=()=>reject(new Error('另一窗口正在升级存档，请关闭旧窗口后再试。'));
 });
}
function rejectFutureSave(raw:unknown) {
 if(raw && typeof raw==='object' && 'format' in raw && raw.format==='lieguoji-save' && ('version' in raw && raw.version!==1 || 'rulesVersion' in raw && raw.rulesVersion!=='0.1.0')) throw new Error('存档版本不兼容，已锁定写入；请使用创建该存档的新版游戏。');
}
export async function readSave(scope='test-continent'): Promise<{world:World|null; recovery:boolean; revision:number}> {
 const db=await openDB(scope);
 const raw=await new Promise<{current:unknown;backup:unknown;revision:number}>((resolve,reject)=>{
  const tx=db.transaction('saves','readonly'), store=tx.objectStore('saves');
  const c=store.get('current'), b=store.get('backup'), r=store.get('revision');
  tx.oncomplete=()=>resolve({current:c.result,backup:b.result,revision:r.result??0});
  tx.onerror=()=>reject(tx.error);
 }).finally(()=>db.close());
 rejectFutureSave(raw.current);
 if(raw.current === undefined) return {world:null,recovery:false,revision:raw.revision};
 try {return {world:await decodeSave(raw.current),recovery:false,revision:raw.revision};}
 catch (err) { if(raw.backup !== undefined) return {world:await decodeSave(raw.backup),recovery:true,revision:raw.revision}; throw err; }
}
export async function writeSave(world:World,expectedRevision:number,scope='test-continent'): Promise<number> {
 const envelope=await encodeSave(world);
 const db=await openDB(scope);
 try {
  // Validate outside the write transaction; never promote a corrupt current slot to backup.
  const current:unknown=await new Promise((resolve,reject)=>{
   const request=db.transaction('saves','readonly').objectStore('saves').get('current');
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  let validCurrent:unknown;
  rejectFutureSave(current);
  try { if(current !== undefined) {await decodeSave(current); validCurrent=current;} } catch { /* Retain earlier valid backup. */ }
  return await new Promise<number>((resolve,reject)=>{
   const tx=db.transaction('saves','readwrite'), store=tx.objectStore('saves');
   const actual=store.get('current'), revision=store.get('revision');
   let failure:Error|null=null;
   revision.onsuccess=()=>{
    try {
     rejectFutureSave(actual.result);
     if((revision.result??0)!==expectedRevision || JSON.stringify(actual.result)!==JSON.stringify(current)) throw new Error('另一窗口已更新存档，本次未覆盖。请先导出当前进度，再刷新载入最新存档。');
     if(validCurrent !== undefined) store.put(validCurrent,'backup');
     store.put(envelope,'current');store.put(expectedRevision+1,'revision');
    } catch(err){failure=err instanceof Error?err:new Error('保存失败');tx.abort();}
   };
   tx.oncomplete=()=>resolve(expectedRevision+1);tx.onerror=()=>reject(failure??new Error('保存失败，原存档保留。请导出备份。'));tx.onabort=()=>reject(failure??new Error('保存中断，原存档保留。'));
  });
 } finally {db.close();}
}
export async function parseSaveFile(file:File):Promise<World> {
 if(file.size>2*1024*1024) throw new Error('存档超过 2 MB，未导入。');
 let raw:unknown;try {raw=JSON.parse(await file.text());} catch {throw new Error('文件不是有效的 JSON 存档。');}
 return decodeSave(raw);
}
