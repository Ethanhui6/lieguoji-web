import {beforeAll,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {War31Session} from './war31-session';
import type {War31Run} from './war31-model';
import {makeVassal31} from './war31-vassals';
import {saveRun,loadRun} from './war31-stores';
import {WAR31_DATABASE} from './war31-storage';
let seed:War31Run;
beforeAll(()=>{seed=new War31Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace'}).run as War31Run;makeVassal31(seed,seed.world.nations[1].id,seed.world.nations[0].id,()=>{});});
async function slots(factory:IDBFactory,write?:(s:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=factory.open(WAR31_DATABASE);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',write?'readwrite':'readonly'),s=t.objectStore('saves');write?.(s);const g=s.getAll();let values:unknown[]=[];g.onsuccess=()=>values=g.result;t.oncomplete=()=>{d.close();resolve(values);};t.onabort=()=>{d.close();reject(t.error);};};q.onerror=()=>reject(q.error);});}
it.each(['current','backup'])('locks future vassal fields in %s before fallback or save',async key=>{
 const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,s=>{const q=s.get(key);q.onsuccess=()=>{q.result.run.vassals.records[0].futureTax=1;s.put(q.result,key);};});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow(/未来/);await expect(saveRun(seed,2,db)).rejects.toThrow(/未来/);expect(await slots(db)).toEqual(before);
});
it.each(['missing','damaged'])('recovers %s primary vassal state and retains valid backup during two subsequent saves',async kind=>{
 const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,s=>{if(kind==='missing')s.delete('current');else{const q=s.get('current');q.onsuccess=()=>{q.result.run.vassals.records[0].overlordId='unknown';s.put(q.result,'current');};}});
 expect(await loadRun(db)).toEqual({run:seed,revision:2,recovered:true});await saveRun(seed,2,db);await saveRun(seed,3,db);expect(await loadRun(db)).toEqual({run:seed,revision:4,recovered:false});
});
it('captures vassals before asynchronous digest; caller mutation never reaches storage',async()=>{
 const db=new IDBFactory(),copy=structuredClone(seed),saving=saveRun(copy,null,db);copy.vassals.records[0].overlordId='mutated';await saving;expect((await loadRun(db))!.run).toEqual(seed);
});
it('refuses future casus IDs in either slot instead of silently falling back to an older save',async()=>{
 const db=new IDBFactory(),s=new War31Session(),r=structuredClone(seed),a=r.world.nations[0].id,c=r.world.nations[2].id;s.execute({type:'load',run:r});const n=s.execute({type:'declare-cb',nationId:a,targetNationId:c,casusBelliId:3,expected:{day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick}}).run;await saveRun(n,null,db);await saveRun(n,1,db);
 await slots(db,s=>{const q=s.get('backup');q.onsuccess=()=>{q.result.run.nativeDiplomacy.declarations[0].casusBelliId=99;s.put(q.result,'backup');};});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow(/未来/);await expect(saveRun(n,2,db)).rejects.toThrow(/未来/);expect(await slots(db)).toEqual(before);
});
