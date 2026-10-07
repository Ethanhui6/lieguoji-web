import {beforeAll,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {War32Session} from './war32-session';
import type {War32Run} from './war32-model';
import {makeVassal32} from './war32-vassals';
import {saveRun,loadRun} from './war32-stores';
import {WAR32_DATABASE} from './war32-storage';
import {tributeFixture32} from './war32.test-support';
let seed:War32Run;
beforeAll(()=>{seed=new War32Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace'}).run as War32Run;makeVassal32(seed,seed.world.nations[1].id,seed.world.nations[0].id,()=>{});});
async function slots(factory:IDBFactory,write?:(s:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=factory.open(WAR32_DATABASE);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',write?'readwrite':'readonly'),s=t.objectStore('saves');write?.(s);const g=s.getAll();let values:unknown[]=[];g.onsuccess=()=>values=g.result;t.oncomplete=()=>{d.close();resolve(values);};t.onabort=()=>{d.close();reject(t.error);};};q.onerror=()=>reject(q.error);});}
it.each(['current','backup'])('locks future vassal fields in %s before fallback or save',async key=>{
 const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,s=>{const q=s.get(key);q.onsuccess=()=>{q.result.run.tribute.futureTax=1;s.put(q.result,key);};});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow(/未来/);await expect(saveRun(seed,2,db)).rejects.toThrow(/未来/);expect(await slots(db)).toEqual(before);
});
it.each(['missing','damaged'])('recovers %s primary vassal state and retains valid backup during two subsequent saves',async kind=>{
 const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,s=>{if(kind==='missing')s.delete('current');else{const q=s.get('current');q.onsuccess=()=>{q.result.run.tribute.lastDay=-1;s.put(q.result,'current');};}});
 expect(await loadRun(db)).toEqual({run:seed,revision:2,recovered:true});await saveRun(seed,2,db);await saveRun(seed,3,db);expect(await loadRun(db)).toEqual({run:seed,revision:4,recovered:false});
});
it('captures vassals before asynchronous digest; caller mutation never reaches storage',async()=>{
 const db=new IDBFactory(),copy=structuredClone(seed),saving=saveRun(copy,null,db);copy.tribute.enabled=false;await saving;expect((await loadRun(db))!.run).toEqual(seed);
});
it('refuses future casus IDs in either slot instead of silently falling back to an older save',async()=>{
 const db=new IDBFactory(),s=new War32Session(),r=structuredClone(seed),a=r.world.nations[0].id,c=r.world.nations[2].id;s.execute({type:'load',run:r});const n=s.execute({type:'declare-cb',nationId:a,targetNationId:c,casusBelliId:3,expected:{day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick}}).run;await saveRun(n,null,db);await saveRun(n,1,db);
 await slots(db,s=>{const q=s.get('backup');q.onsuccess=()=>{q.result.run.nativeDiplomacy.declarations[0].casusBelliId=99;s.put(q.result,'backup');};});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow(/未来/);await expect(saveRun(n,2,db)).rejects.toThrow(/未来/);expect(await slots(db)).toEqual(before);
});
it.each(['current','backup'])('locks unknown receipt fields and future outcomes in %s',async key=>{
 const s=new War32Session();s.execute({type:'load',run:tributeFixture32()});const paid=s.execute({type:'step',days:1}).run;
 for(const field of ['futureFee','status']){const db=new IDBFactory();await saveRun(paid,null,db);await saveRun(paid,1,db);await slots(db,s=>{const q=s.get(key);q.onsuccess=()=>{q.result.run.tribute.receipts[0][field]=field==='status'?'future-outcome':1;s.put(q.result,key);};});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow(/未来/);await expect(saveRun(paid,2,db)).rejects.toThrow(/未来/);expect(await slots(db)).toEqual(before);}
});
