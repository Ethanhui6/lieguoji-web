import 'fake-indexeddb/auto';
import { describe,it,expect } from 'vitest';
import { createWorld } from './sim/demo';
import { encodeSave,decodeSave,writeSave,readSave } from './persistence';
describe('版本化存档',()=>{
 it('完整往返保留模拟状态且不共享对象',async()=>{const world=createWorld();const saved=await encodeSave(world);const recovered=await decodeSave(saved);expect(recovered).toEqual(world);expect(recovered).not.toBe(world);});
 it('拒绝篡改与未来版本，不把校验失败变为成功',async()=>{const envelope=await encodeSave(createWorld());envelope.world.day+=1;await expect(decodeSave(envelope)).rejects.toThrow('校验和');await expect(decodeSave({...envelope,version:2})).rejects.toThrow('版本');});
 it('IndexedDB原子写入并从损坏主槽恢复上一备份',async()=>{
  const old=createWorld();const r=await writeSave(old,(await readSave()).revision);const next={...old,day:3};await writeSave(next,r);expect((await readSave()).world?.day).toBe(3);
  await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('lieguoji-test-continent-v1',1);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put({broken:true},'current');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
  const result=await readSave();expect(result.recovery).toBe(true);expect(result.world).toEqual(old);
 });
 it('拒绝旧标签覆盖较新存档及同时写入',async()=>{
  const before=await readSave();const state=createWorld();state.day=10;const revision=await writeSave(state,before.revision);
  await expect(writeSave({...state,day:5},before.revision)).rejects.toThrow('另一窗口');
  const settled=await Promise.allSettled([writeSave({...state,day:11},revision),writeSave({...state,day:12},revision)]);
  expect(settled.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  expect(settled.filter(result=>result.status==='rejected')).toHaveLength(1);
 });
 it('旧客户端不能回退或覆盖未来版本存档',async()=>{
  const saved=await readSave();const future={...await encodeSave(createWorld()),version:2};
  await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('lieguoji-test-continent-v1',1);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put(future,'current');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
  await expect(readSave()).rejects.toThrow('版本不兼容');await expect(writeSave(createWorld(),saved.revision)).rejects.toThrow('版本不兼容');
 });
});
