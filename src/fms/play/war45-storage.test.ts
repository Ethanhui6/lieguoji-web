import {beforeAll,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {War45Session} from './war45-session';
import type {War45Run} from './war45-model';
import {portFixture45,stamp45} from './war45.test-support';
import {saveRun,loadRun} from './war45-stores';
import {applyAlliance45} from './war45-alliance';
import {WAR45_DATABASE} from './war45-storage';
import {grid} from './fixture.test-support';
let seed:War45Run;
beforeAll(()=>{const s=new War45Session();const r=portFixture45();applyAlliance45(r,{type:'unite',nationId:'n-0',targetId:'n-1'});s.execute({type:'load',run:r});seed=s.execute({type:'action',action:{type:'declare-war',nationId:'n-0',targetNationId:'n-3'},expected:stamp45(r)}).run as War45Run;});
async function slots(factory:IDBFactory,write?:(s:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=factory.open(WAR45_DATABASE);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',write?'readwrite':'readonly'),s=t.objectStore('saves');write?.(s);const g=s.getAll();let values:unknown[]=[];g.onsuccess=()=>values=g.result;t.oncomplete=()=>{d.close();resolve(values);};t.onabort=()=>{d.close();reject(t.error);};};q.onerror=()=>reject(q.error);});}
it.each(['current','backup'])('locks unknown shipbuilding root/nation schemas in %s before fallback or overwrite',async key=>{
 for(const field of ['root','nation']){const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,s=>{const q=s.get(key);q.onsuccess=()=>{const state=q.result.run.shipbuilding;Object.assign(field==='root'?state:state.nations['n-0'],{future:true});s.put(q.result,key);};});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow(/未来/);await expect(saveRun(seed,2,db)).rejects.toThrow(/未来/);expect(await slots(db)).toEqual(before);}
});
it.each(['missing','damaged'])('restores a pending ship from backup after %s current and two writes without losing its months',async kind=>{
 const r=structuredClone(seed),q=r.shipbuilding.nations['n-0'];q.remaining=3;q.totalMonths=6;q.queued=1;const db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);
 await slots(db,s=>{if(kind==='missing')s.delete('current');else{const q=s.get('current');q.onsuccess=()=>{q.result.run.shipbuilding.nations['n-0'].remaining=-1;s.put(q.result,'current');};}});
 expect(await loadRun(db)).toEqual({run:r,revision:2,recovered:true});await saveRun(r,2,db);await saveRun(r,3,db);expect((await loadRun(db))!.run).toEqual(r);await expect(saveRun(r,3,db)).rejects.toThrow();expect((await loadRun(db))!.revision).toBe(4);
});
it.each(['current','backup'])('locks unknown port control root/fleet metadata in %s before fallback/CAS',async key=>{
 for(const field of ['member','departure']){const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,s=>{const q=s.get(key);q.onsuccess=()=>{if(field==='member')q.result.run.portControl.fleets[Object.keys(q.result.run.portControl.fleets)[0]].future=1;else q.result.run.portControl.future=1;s.put(q.result,key);};});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow(/未来/);await expect(saveRun(seed,2,db)).rejects.toThrow(/未来/);expect(await slots(db)).toEqual(before);}
});
it.each(['missing','damaged'])('recovers %s current slot through two writes, keeping port control history',async kind=>{const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,s=>{if(kind==='missing')s.delete('current');else{const q=s.get('current');q.onsuccess=()=>{q.result.run.portControl.revision=-1;s.put(q.result,'current');};}});expect(await loadRun(db)).toEqual({run:seed,revision:2,recovered:true});await saveRun(seed,2,db);await saveRun(seed,3,db);expect((await loadRun(db))!.run).toEqual(seed);});
it('captures a private snapshot before asynchronous digest so caller edits cannot arrive late',async()=>{const db=new IDBFactory(),r=structuredClone(seed),saving=saveRun(r,null,db);r.portControl.fleets={};await saving;expect((await loadRun(db))!.run).toEqual(seed);});
it.each(['current','backup'])('locks future harbor schemas in %s even when the other slot is valid',async key=>{
 for(const field of ['root','site','shore']){const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,s=>{const q=s.get(key);q.onsuccess=()=>{const h=q.result.run.harbors;const target=field==='root'?h:field==='site'?h.sites[0]:h.sites[0].shore;target.future=1;s.put(q.result,key);};});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow(/未来/);await expect(saveRun(seed,2,db)).rejects.toThrow(/未来/);expect(await slots(db)).toEqual(before);}
});
it.each(['missing','damaged'])('recovers native city harbor geometry from backup after %s current and two further saves',async kind=>{
 const r=new War45Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:5,cityCount:60,relations:'peace'}).run as War45Run,db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);
 await slots(db,s=>{if(kind==='missing')s.delete('current');else{const q=s.get('current');q.onsuccess=()=>{q.result.run.harbors.sites[0].anchor=-1;s.put(q.result,'current');};}});
 expect(await loadRun(db)).toEqual({run:r,revision:2,recovered:true});await saveRun(r,2,db);await saveRun(r,3,db);expect((await loadRun(db))!.run).toEqual(r);
});
