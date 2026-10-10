import {beforeAll,describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal} from './culture47-session';
import {CULTURE47_DATABASE,saveCulture47,loadCulture47} from './culture47-storage';
import {Culture47Unavailable,Culture47InvalidJournal} from './culture47-contract';
import {populationStamp47} from './civilization47-population-types';
let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese']}}).journal;},30000);
async function mutate(factory:IDBFactory,fn:(s:IDBObjectStore)=>void){const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=factory.open(CULTURE47_DATABASE,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{await new Promise<void>((resolve,reject)=>{const t=db.transaction('slots','readwrite');fn(t.objectStore('slots'));t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}finally{db.close();}}
describe('independent culture journal storage',()=>{
  it('retains a policy action and locks both slots if either policy stamp gains an unknown field',async()=>{
    const s=new Culture47Session(),initial=s.load(journal),withPolicy=s.execute({kind:'family-policy',nationId:'n-0',enabled:false,expected:populationStamp47(initial.run)},0).journal;
    for(const slot of ['current','backup']){
      const f=new IDBFactory();await saveCulture47(withPolicy,null,f);await saveCulture47(withPolicy,1,f);expect((await loadCulture47(f))?.journal).toEqual(withPolicy);
      await mutate(f,store=>{const q=store.get(slot);q.onsuccess=()=>{const row=q.result;row.journal.actions[0].expected.futurePolicy=1;store.put(row,slot);};});
      await expect(loadCulture47(f)).rejects.toThrow('未来');await expect(saveCulture47(withPolicy,2,f)).rejects.toThrow('未来');
    }
  },30000);
  it('keeps the second CAS check even when a slot changes without its revision',async()=>{
    const f=new IDBFactory();await saveCulture47(journal,null,f);let calls=0;
    await expect(saveCulture47(journal,1,f,undefined,async()=>{if(++calls===2)await mutate(f,s=>{const r=s.get('current');r.onsuccess=()=>s.put({...r.result,checksum:'concurrent-slot-write'},'current');});})).rejects.toThrow('另一个页面已修改');
    let rev=0,checksum='';await mutate(f,s=>{const a=s.get('revision'),b=s.get('current');a.onsuccess=()=>{rev=a.result;};b.onsuccess=()=>{checksum=b.result.checksum;};});expect(rev).toBe(1);expect(checksum).toBe('concurrent-slot-write');
  },30000);
  it('an unknown engine in the backup locks both slots before verifier selection',async()=>{
    const f=new IDBFactory();await saveCulture47(journal,null,f);await saveCulture47(journal,1,f);
    await mutate(f,s=>{const r=s.get('backup');r.onsuccess=()=>s.put({...r.result,journal:{...r.result.journal,engine:'0'.repeat(64)}},'backup');});
    await expect(loadCulture47(f)).rejects.toThrow('未来');await expect(saveCulture47(journal,2,f)).rejects.toThrow('未来');
  },30000);
  it('never falls back or writes after a verifier transport failure',async()=>{
    const f=new IDBFactory();await saveCulture47(journal,null,f);await saveCulture47(journal,1,f);
    const unavailable=()=>{throw new Culture47Unavailable('worker missing');};
    await expect(loadCulture47(f,unavailable)).rejects.toThrow('worker missing');
    let calls=0;await expect(saveCulture47(journal,2,f,undefined,()=>{if(++calls>1)unavailable();})).rejects.toThrow('worker missing');
    expect((await loadCulture47(f))?.revision).toBe(2);
  },30000);
  it('only a definitive invalid-journal result permits backup recovery',async()=>{
    const f=new IDBFactory();await saveCulture47(journal,null,f);const second=structuredClone(journal);second.actions=[{kind:'advance',ticks:1}];await saveCulture47(second,1,f);
    const loaded=await loadCulture47(f,j=>{if(j.actions.length)throw new Culture47InvalidJournal('definitive rejection');});expect(loaded?.recovered).toBe(true);expect(loaded?.journal).toEqual(journal);
    await expect(loadCulture47(f,()=>{throw Error('unknown runtime failure');})).rejects.toThrow('unknown runtime failure');
  },30000);
  it('cancelled cold reads do not return a late verified world',async()=>{
    const f=new IDBFactory();await saveCulture47(journal,null,f);const c=new AbortController();
    await expect(loadCulture47(f,()=>{c.abort();},c.signal)).rejects.toThrow();expect((await loadCulture47(f))?.revision).toBe(1);
  },30000);
  it('saves typed geography and all choices; rejects stale multi-tab CAS',async()=>{
    const f=new IDBFactory();expect(await loadCulture47(f)).toBeNull();expect(await saveCulture47(journal,null,f)).toBe(1);const loaded=await loadCulture47(f);expect(loaded?.journal).toEqual(journal);expect(loaded?.journal.opening.terrain.elevations).toBeInstanceOf(Int32Array);
    const outcomes=await Promise.allSettled([saveCulture47(journal,1,f),saveCulture47(journal,1,f)]);expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1);expect((await loadCulture47(f))?.revision).toBe(2);
  });
  it('preserves the chosen valid backup across corrupt-current recovery and the next two saves',async()=>{
    const f=new IDBFactory();await saveCulture47(journal,null,f);await saveCulture47(journal,1,f);
    await mutate(f,s=>{const r=s.get('current');r.onsuccess=()=>s.put({...r.result,checksum:'damaged'},'current');});expect((await loadCulture47(f))?.recovered).toBe(true);
    await saveCulture47(journal,2,f);expect((await loadCulture47(f))?.recovered).toBe(false);await saveCulture47(journal,3,f);expect((await loadCulture47(f))?.revision).toBe(4);
  });
  it('locks reads and writes if either slot carries a future schema',async()=>{
    const f=new IDBFactory();await saveCulture47(journal,null,f);await saveCulture47(journal,1,f);
    await mutate(f,s=>{const r=s.get('backup');r.onsuccess=()=>s.put({...r.result,version:2},'backup');});await expect(loadCulture47(f)).rejects.toThrow('未来');await expect(saveCulture47(journal,2,f)).rejects.toThrow('未来');
  });
  it('a cancelled save does not write later',async()=>{
    const f=new IDBFactory();await saveCulture47(journal,null,f);const controller=new AbortController(),saving=saveCulture47(journal,1,f,controller.signal);controller.abort();await expect(saving).rejects.toThrow();expect((await loadCulture47(f))?.revision).toBe(1);
  });
  it('recovers known damaged revision fields and ignores a stale current in favor of the newer backup',async()=>{
    const f=new IDBFactory();await saveCulture47(journal,null,f);
    let first:unknown;await mutate(f,s=>{const r=s.get('current');r.onsuccess=()=>{first=r.result;};});
    const second=structuredClone(journal);second.actions=[{kind:'identity',edit:{kind:'city',id:'c-0',customName:'第二城'}}];
    await saveCulture47(second,1,f);await saveCulture47(journal,2,f);
    await mutate(f,s=>{s.put(first,'current');});expect((await loadCulture47(f))?.journal).toEqual(second);expect((await loadCulture47(f))?.recovered).toBe(true);
    await mutate(f,s=>{const r=s.get('current');r.onsuccess=()=>s.put({...r.result,revision:0,checksum:null},'current');});expect((await loadCulture47(f))?.journal).toEqual(second);
    await saveCulture47(second,3,f);expect((await loadCulture47(f))?.recovered).toBe(false);
  },30000);
  it('does not accept a shape-valid journal whose commands cannot replay',async()=>{
    const f=new IDBFactory();await saveCulture47(journal,null,f);const bad=structuredClone(journal);bad.actions=[{kind:'identity',edit:{kind:'city',id:'missing',customName:'坏引用'}}];
    await expect(saveCulture47(bad,1,f)).rejects.toThrow();expect((await loadCulture47(f))?.revision).toBe(1);
  },30000);
  it('closes a late open success after blocked and aborts a late schema upgrade',async()=>{
    const f=new IDBFactory();await saveCulture47(journal,null,f);
    let closed=0,aborted=0;const request={onblocked:null as null|(()=>void),onupgradeneeded:null as null|(()=>void),onsuccess:null as null|(()=>void),result:{close:()=>{closed++;}},transaction:{abort:()=>{aborted++;}}};
    const delayed={open:()=>{queueMicrotask(()=>{request.onblocked?.();request.onupgradeneeded?.();request.onsuccess?.();});return request;}} as unknown as IDBFactory;
    await expect(loadCulture47(delayed)).rejects.toThrow('占用');expect(closed).toBe(1);expect(aborted).toBe(1);
  },30000);
});
