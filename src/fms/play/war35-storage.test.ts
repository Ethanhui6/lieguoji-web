import {beforeAll,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {War35Session} from './war35-session';
import type {War35Run} from './war35-model';
import {allianceFixture35,stamp35} from './war35.test-support';
import {saveRun,loadRun} from './war35-stores';
import {applyAlliance35} from './war35-alliance';
import {WAR35_DATABASE} from './war35-storage';
let seed:War35Run;
beforeAll(()=>{const s=new War35Session();const r=allianceFixture35();applyAlliance35(r,{type:'unite',nationId:'n-0',targetId:'n-1'});s.execute({type:'load',run:r});seed=s.execute({type:'action',action:{type:'declare-war',nationId:'n-0',targetNationId:'n-3'},expected:stamp35(r)}).run as War35Run;});
async function slots(factory:IDBFactory,write?:(s:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=factory.open(WAR35_DATABASE);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',write?'readwrite':'readonly'),s=t.objectStore('saves');write?.(s);const g=s.getAll();let values:unknown[]=[];g.onsuccess=()=>values=g.result;t.oncomplete=()=>{d.close();resolve(values);};t.onabort=()=>{d.close();reject(t.error);};};q.onerror=()=>reject(q.error);});}
it.each(['current','backup'])('locks unknown alliance root/member metadata in %s before fallback/CAS',async key=>{
 for(const field of ['member','departure']){const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,s=>{const q=s.get(key);q.onsuccess=()=>{if(field==='member')q.result.run.alliances.records[0].future=1;else q.result.run.alliances.future=1;s.put(q.result,key);};});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow(/未来/);await expect(saveRun(seed,2,db)).rejects.toThrow(/未来/);expect(await slots(db)).toEqual(before);}
});
it.each(['missing','damaged'])('recovers %s current slot through two writes, keeping alliance history',async kind=>{const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,s=>{if(kind==='missing')s.delete('current');else{const q=s.get('current');q.onsuccess=()=>{q.result.run.alliances.lastAction={bad:-1};s.put(q.result,'current');};}});expect(await loadRun(db)).toEqual({run:seed,revision:2,recovered:true});await saveRun(seed,2,db);await saveRun(seed,3,db);expect((await loadRun(db))!.run).toEqual(seed);});
it('captures a private snapshot before asynchronous digest so caller edits cannot arrive late',async()=>{const db=new IDBFactory(),r=structuredClone(seed),saving=saveRun(r,null,db);r.alliances.records[0].members=[];await saving;expect((await loadRun(db))!.run).toEqual(seed);});
