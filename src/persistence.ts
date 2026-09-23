import { validateWorld } from './sim/core';
import type { World } from './sim/types';
export type SaveEnvelope = { format: 'lieguoji-save'; version: 1 | 2; rulesVersion: '0.1.0' | '0.2.0'; createdAt: string; checksum: string; world: World };
const DB_NAME = 'lieguoji-test-continent-v1';
async function checksum(world: World) {
 const bytes = new TextEncoder().encode(JSON.stringify(world));
 const digest = await crypto.subtle.digest('SHA-256', bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function encodeSave(world: World): Promise<SaveEnvelope> {
 if (!validateWorld(world)) throw new Error('世界状态校验失败，未写入存档。');
 const snapshot=structuredClone(world);
 return {format:'lieguoji-save',version:snapshot.schemaVersion,rulesVersion:snapshot.rulesVersion,createdAt:new Date().toISOString(),checksum:await checksum(snapshot),world:snapshot};
}
export async function decodeSave(raw: unknown): Promise<World> {
 if(!raw || typeof raw !== 'object') throw new Error('无法识别存档。');
 rejectFutureSave(raw);
 const e = structuredClone(raw) as Partial<SaveEnvelope>;
 if(e.format !== 'lieguoji-save' || !versionPair(e.version,e.rulesVersion)) throw new Error('存档版本不兼容，原存档未修改。');
 if(!validateWorld(e.world)) throw new Error('存档内容损坏，原存档未修改。');
 if(e.version!==e.world.schemaVersion || e.rulesVersion!==e.world.rulesVersion) throw new Error('存档内外版本不一致，原存档未修改。');
 if(e.checksum !== await checksum(e.world)) throw new Error('存档校验和不匹配，原存档未修改。');
 return e.world;
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
function versionPair(version:unknown,rules:unknown) {
 return version===1&&rules==='0.1.0'||version===2&&rules==='0.2.0';
}
function rejectFutureSave(raw:unknown) {
 if(!raw || typeof raw!=='object' || !('format'in raw) || raw.format!=='lieguoji-save')return;
 const outer=raw as Record<string,unknown>;
 const world=outer.world&&typeof outer.world==='object'?outer.world as Record<string,unknown>:null;
 const statecraft=world?.statecraft&&typeof world.statecraft==='object'?world.statecraft as Record<string,unknown>:null;
 const unknownOuter=('version'in outer && outer.version!==1 && outer.version!==2)||('rulesVersion'in outer && outer.rulesVersion!=='0.1.0' && outer.rulesVersion!=='0.2.0');
 const unknownInner=world&&(('schemaVersion'in world && world.schemaVersion!==1 && world.schemaVersion!==2)||('rulesVersion'in world && world.rulesVersion!=='0.1.0' && world.rulesVersion!=='0.2.0'));
 const mismatchedOuter='version'in outer&&'rulesVersion'in outer&&!versionPair(outer.version,outer.rulesVersion);
 const mismatchedInner=world&&'schemaVersion'in world&&'rulesVersion'in world&&!versionPair(world.schemaVersion,world.rulesVersion);
 const mismatchedLayers=world&&('version'in outer&&'schemaVersion'in world&&outer.version!==world.schemaVersion || 'rulesVersion'in outer&&'rulesVersion'in world&&outer.rulesVersion!==world.rulesVersion);
 if(unknownOuter||unknownInner||mismatchedOuter||mismatchedInner||mismatchedLayers||(statecraft&&'version'in statecraft&&statecraft.version!==1))throw new Error('存档版本不兼容，已锁定写入；请使用创建该存档的兼容游戏版本。');
}
function checkedRevision(value:unknown):number {
 const revision=value===undefined?0:value;
 if(typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<0)throw new Error('存档版本计数损坏，原存档已保留。');
 return revision;
}
export async function readSave(scope='test-continent'): Promise<{world:World|null; recovery:boolean; revision:number}> {
 const db=await openDB(scope);
 const raw=await new Promise<{current:unknown;backup:unknown;revision:unknown}>((resolve,reject)=>{
  const tx=db.transaction('saves','readonly'), store=tx.objectStore('saves');
  const c=store.get('current'), b=store.get('backup'), r=store.get('revision');
  tx.oncomplete=()=>resolve({current:c.result,backup:b.result,revision:r.result});
  tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('存档读取中断，原档保留。'));
 }).finally(()=>db.close());
 const revision=checkedRevision(raw.revision);
 rejectFutureSave(raw.current);
 if(raw.current === undefined) return {world:null,recovery:false,revision};
 try {return {world:await decodeSave(raw.current),recovery:false,revision};}
 catch (err) { if(raw.backup !== undefined) return {world:await decodeSave(raw.backup),recovery:true,revision}; throw err; }
}
export async function writeSave(world:World,expectedRevision:number,scope='test-continent'): Promise<number> {
 checkedRevision(expectedRevision);
 if(expectedRevision===undefined||expectedRevision>=Number.MAX_SAFE_INTEGER)throw new Error('存档版本计数无效或已达上限，原档保留。');
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
     if(checkedRevision(revision.result)!==expectedRevision || JSON.stringify(actual.result)!==JSON.stringify(current)) throw new Error('另一窗口已更新存档，本次未覆盖。请先导出当前进度，再刷新载入最新存档。');
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
