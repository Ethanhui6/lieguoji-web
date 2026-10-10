import {beforeAll,describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal} from './culture47-session';
import {GENERATIONS_RULE47} from './civilization47-generations-ledger';
import {populationStamp47} from './civilization47-population-types';
import {CULTURE47_GENERATIONS_DATABASE as DB,CULTURE47_FRESH_DATABASE,saveCulture47,loadCulture47} from './culture47-storage';

let journal:Culture47Journal,plain:Culture47Journal;
beforeAll(()=>{const owner=new Culture47Session(),s=owner.create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:6,cityCount:24,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman','german']}});plain=s.journal;journal=owner.execute({kind:'enable-generations',rule:GENERATIONS_RULE47,expected:populationStamp47(s.run)},0).journal;},30000);
async function mutate(f:IDBFactory,fn:(s:IDBObjectStore)=>void){const db=await new Promise<IDBDatabase>((ok,no)=>{const q=f.open(DB,1);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});try{await new Promise<void>((ok,no)=>{const t=db.transaction('slots','readwrite');fn(t.objectStore('slots'));t.oncomplete=()=>ok();t.onerror=()=>no(t.error);});}finally{db.close();}}
describe('playable generation journal and isolated saving',()=>{
 it('replays actual monthly births through military/session batch, cold reconstruction and IndexedDB',async()=>{
  const owner=new Culture47Session();owner.load(journal);let sequence=journal.actions.length;
  for(let day=0;day<90;day++)owner.executeDisplay([{kind:'advance',ticks:120}],sequence++);
  const full=owner.snapshot();expect(full.run.generations!.births.length).toBeGreaterThan(0);expect(new Culture47Session().load(full.journal)).toEqual(full);
  const db=new IDBFactory();await saveCulture47(plain,null,db,undefined,undefined,CULTURE47_FRESH_DATABASE);
  expect(await saveCulture47(full.journal,null,db,undefined,j=>{owner.verify(j);},DB)).toBe(1);
  const loaded=await loadCulture47(db,j=>{owner.verify(j);},undefined,DB);expect(new Culture47Session().load(loaded!.journal)).toEqual(full);expect((await loadCulture47(db,undefined,undefined,CULTURE47_FRESH_DATABASE))!.journal).toEqual(plain);
  await expect(saveCulture47(full.journal,1,db,undefined,undefined,CULTURE47_FRESH_DATABASE)).rejects.toThrow('独立');await expect(saveCulture47(plain,1,db,undefined,undefined,DB)).rejects.toThrow('独立');
 },90000);
 it('keeps CAS, cancelled-save and known corrupt-current recovery in the generation database',async()=>{
  const f=new IDBFactory();await saveCulture47(journal,null,f,undefined,undefined,DB);await saveCulture47(journal,1,f,undefined,undefined,DB);
  await mutate(f,s=>{const q=s.get('current');q.onsuccess=()=>s.put({...q.result,checksum:'broken'},'current');});expect((await loadCulture47(f,undefined,undefined,DB))?.recovered).toBe(true);
  await saveCulture47(journal,2,f,undefined,undefined,DB);await expect(saveCulture47(journal,2,f,undefined,undefined,DB)).rejects.toThrow('另一个');
  const c=new AbortController();await expect(saveCulture47(journal,3,f,c.signal,()=>{c.abort();},DB)).rejects.toThrow();expect((await loadCulture47(f,undefined,undefined,DB))?.revision).toBe(3);
 },30000);
 it.each(['current','backup'])('future generation rule/stamp in %s locks both slots, never overwrites a readable history',async slot=>{
  for(const field of ['rule','stamp']){const f=new IDBFactory();await saveCulture47(journal,null,f,undefined,undefined,DB);await saveCulture47(journal,1,f,undefined,undefined,DB);
   await mutate(f,s=>{const q=s.get(slot);q.onsuccess=()=>{const row=q.result;if(field==='rule')row.journal.actions[0].rule='future-generations';else row.journal.actions[0].expected.future=1;s.put(row,slot);};});
   await expect(loadCulture47(f,undefined,undefined,DB)).rejects.toThrow('未来');await expect(saveCulture47(journal,2,f,undefined,undefined,DB)).rejects.toThrow('未来');
  }
 },30000);
 it('rejects a stale/duplicate enabling action without installing any partial state',()=>{const owner=new Culture47Session(),s=owner.load(journal);expect(()=>owner.execute({kind:'enable-generations',rule:GENERATIONS_RULE47,expected:populationStamp47(s.run)},1)).toThrow();expect(owner.snapshot()).toEqual(s);});
});
