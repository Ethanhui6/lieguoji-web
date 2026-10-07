import {beforeAll,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {War33Session} from './war33-session';
import type {War33Run} from './war33-model';
import {rebellionFixture33} from './war33.test-support';
import {saveRun,loadRun} from './war33-stores';
import {WAR33_DATABASE} from './war33-storage';
let seed:War33Run;
beforeAll(()=>{const s=new War33Session();s.execute({type:'load',run:rebellionFixture33()});seed=s.execute({type:'step',days:1}).run as War33Run;});
async function slots(factory:IDBFactory,write?:(s:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=factory.open(WAR33_DATABASE);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',write?'readwrite':'readonly'),s=t.objectStore('saves');write?.(s);const g=s.getAll();let values:unknown[]=[];g.onsuccess=()=>values=g.result;t.oncomplete=()=>{d.close();resolve(values);};t.onabort=()=>{d.close();reject(t.error);};};q.onerror=()=>reject(q.error);});}
it.each(['current','backup'])('locks unknown rebellion and internal-war metadata in %s before fallback/CAS',async key=>{
 for(const field of ['reason','internal']){const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,s=>{const q=s.get(key);q.onsuccess=()=>{if(field==='reason')q.result.run.rebellion.records[0].reason='future';else q.result.run.nativeWars.campaigns[0].internal.future=1;s.put(q.result,key);};});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow(/未来/);await expect(saveRun(seed,2,db)).rejects.toThrow(/未来/);expect(await slots(db)).toEqual(before);}
});
it.each(['missing','damaged'])('recovers %s current slot through two writes, keeping internal history',async kind=>{const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,s=>{if(kind==='missing')s.delete('current');else{const q=s.get('current');q.onsuccess=()=>{q.result.run.rebellion.lastDay=-1;s.put(q.result,'current');};}});expect(await loadRun(db)).toEqual({run:seed,revision:2,recovered:true});await saveRun(seed,2,db);await saveRun(seed,3,db);expect((await loadRun(db))!.run).toEqual(seed);});
it('captures a private snapshot before asynchronous digest so caller edits cannot arrive late',async()=>{const db=new IDBFactory(),r=structuredClone(seed),saving=saveRun(r,null,db);r.rebellion.records=[];await saving;expect((await loadRun(db))!.run).toEqual(seed);});
