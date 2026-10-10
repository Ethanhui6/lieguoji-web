import {beforeAll,describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {Culture47Session,CULTURE47_CONTINUATION_SOURCE,assertCulture47Journal,type Culture47Journal} from './culture47-session';
import {continuationJournal47,assertContinuationMatch47} from './culture47-continuation';
import {populationStamp47} from './civilization47-population-types';
import {grid} from './fixture.test-support';
import {CULTURE47_DATABASE,CULTURE47_LONGPLAY_DATABASE,loadCulture47,saveCulture47} from './culture47-storage';
import {sameCulture47Value} from './culture47-equal';
let initial:Culture47Journal;
beforeAll(()=>{const j=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:6,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese']}}).journal;const {fork:_,...v1}=j;void _;initial={...v1,version:1};},30000);
function source(){const s=new Culture47Session(),r=s.load(initial);s.execute({kind:'family-policy',nationId:'n-0',enabled:false,expected:populationStamp47(r.run)},0);const snap=s.execute({kind:'advance',ticks:120},1);snap.journal.engine=CULTURE47_CONTINUATION_SOURCE;return snap;}
const verify=(j:Culture47Journal)=>{new Culture47Session().load(j.engine===CULTURE47_CONTINUATION_SOURCE?{...j,engine:__CULTURE47_ENGINE__}:j);};
async function slots(f:IDBFactory,name:string,mutate?:(s:IDBObjectStore)=>void){const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=f.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise<unknown[]>((resolve,reject)=>{const tx=db.transaction('slots',mutate?'readwrite':'readonly'),s=tx.objectStore('slots');mutate?.(s);const r=s.getAll();tx.oncomplete=()=>resolve(r.result);tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
describe('open-ended continuation keeps the executed source history',()=>{
 it('replays old stamps before the fork, uses the new ID afterward and cold restores the exact tail',()=>{
  const old=source(),j=continuationJournal47(old.journal),s=new Culture47Session(),copy=s.load(j);
  expect(copy.run.id).not.toBe(old.run.id);assertContinuationMatch47(old,copy,j);
  expect(copy.run.clock).toEqual(old.run.clock);expect(copy.journal.actions).toEqual(old.journal.actions);
  const next=s.execute({kind:'family-policy',nationId:'n-0',enabled:true,expected:populationStamp47(copy.run)},j.actions.length);
  const final=s.execute({kind:'advance',ticks:120},next.journal.actions.length);expect(new Culture47Session().load(final.journal)).toEqual(final);
  expect(()=>s.execute({kind:'family-policy',nationId:'n-0',enabled:false,expected:populationStamp47(old.run)},final.journal.actions.length)).toThrow();expect(s.snapshot()).toEqual(final);
 },30000);
 it('does not accept another source engine, moved stamp boundary, future fork fields or changed state',()=>{
  const old=source(),j=continuationJournal47(old.journal),s=new Culture47Session(),copy=s.load(j);
  expect(()=>continuationJournal47({...old.journal,engine:'unknown'})).toThrow();
  expect(()=>assertCulture47Journal({...j,fork:{...j.fork,unknown:1}})).toThrow();
  expect(()=>new Culture47Session().load({...j,fork:{...j.fork!,sequence:0}})).toThrow();
  const damaged=structuredClone(copy);damaged.run.clock.tick++;expect(()=>assertContinuationMatch47(old,damaged,j)).toThrow();
  const wrongId=structuredClone(copy);wrongId.run.id=old.run.id;expect(()=>assertContinuationMatch47(old,wrongId,j)).toThrow();
  const badFrame=structuredClone(copy);badFrame.frame.armies.set('forged',{x:1,y:2});expect(()=>assertContinuationMatch47(old,badFrame,j)).toThrow();
  expect(sameCulture47Value(new Map([['a',1]]),new Map([['a',2]]))).toBe(false);
  expect(s.snapshot()).toEqual(copy);
 },30000);
 it('atomically archives the source separately and keeps it through repeated saves and backup recovery',async()=>{
  const f=new IDBFactory(),old=source(),j=continuationJournal47(old.journal),s=new Culture47Session();s.load(j);
  await saveCulture47(old.journal,null,f,undefined,verify);const original=await slots(f,CULTURE47_DATABASE);
  await saveCulture47(j,null,f,undefined,verify,CULTURE47_LONGPLAY_DATABASE,old.journal);
  await expect(saveCulture47({...initial,version:2,fork:null},1,f,undefined,verify,CULTURE47_LONGPLAY_DATABASE)).rejects.toThrow('分开保存');
  const first=await slots(f,CULTURE47_LONGPLAY_DATABASE);const next=s.execute({kind:'advance',ticks:120},j.actions.length);
  await saveCulture47(next.journal,1,f,undefined,verify,CULTURE47_LONGPLAY_DATABASE);
  await slots(f,CULTURE47_LONGPLAY_DATABASE,store=>{const q=store.get('current');q.onsuccess=()=>store.put({...q.result,checksum:'damaged'},'current');});
  expect((await loadCulture47(f,verify,undefined,CULTURE47_LONGPLAY_DATABASE))?.recovered).toBe(true);
  await saveCulture47(next.journal,2,f,undefined,verify,CULTURE47_LONGPLAY_DATABASE);await saveCulture47(next.journal,3,f,undefined,verify,CULTURE47_LONGPLAY_DATABASE);
  expect(await slots(f,CULTURE47_DATABASE)).toEqual(original);
  const final=await slots(f,CULTURE47_LONGPLAY_DATABASE);expect(final).toContainEqual(first.find((row)=>!!row&&typeof row==='object'&&'journal'in row&&(row.journal as Culture47Journal).engine===CULTURE47_CONTINUATION_SOURCE));
  const loaded=await loadCulture47(f,verify,undefined,CULTURE47_LONGPLAY_DATABASE);expect(loaded?.revision).toBe(4);expect(new Culture47Session().load(loaded!.journal)).toEqual(next);
 },30000);
 it('cancel and concurrent creation never overwrite the original or split source from current',async()=>{
  const f=new IDBFactory(),old=source(),j=continuationJournal47(old.journal),c=new AbortController();
  await saveCulture47(old.journal,null,f,undefined,verify);const before=await slots(f,CULTURE47_DATABASE);
  await expect(saveCulture47(j,null,f,c.signal,v=>{verify(v);if(v.engine===CULTURE47_CONTINUATION_SOURCE)c.abort();},CULTURE47_LONGPLAY_DATABASE,old.journal)).rejects.toThrow();
  expect(await loadCulture47(f,verify,undefined,CULTURE47_LONGPLAY_DATABASE)).toBeNull();
  const attempts=await Promise.allSettled([saveCulture47(j,null,f,undefined,verify,CULTURE47_LONGPLAY_DATABASE,old.journal),saveCulture47(j,null,f,undefined,verify,CULTURE47_LONGPLAY_DATABASE,old.journal)]);
  expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1);expect((await loadCulture47(f,verify,undefined,CULTURE47_LONGPLAY_DATABASE))?.revision).toBe(1);expect(await slots(f,CULTURE47_DATABASE)).toEqual(before);
 },30000);
 it('future source metadata locks both slots; replacing the fork prefix cannot inherit the source receipt',async()=>{
  const f=new IDBFactory(),old=source(),j=continuationJournal47(old.journal);await saveCulture47(j,null,f,undefined,verify,CULTURE47_LONGPLAY_DATABASE,old.journal);
  const changed=structuredClone(j);changed.actions[1]={kind:'advance',ticks:1};await expect(saveCulture47(changed,1,f,undefined,verify,CULTURE47_LONGPLAY_DATABASE)).rejects.toThrow('前史');
  const originalRows=await slots(f,CULTURE47_LONGPLAY_DATABASE);
  await slots(f,CULTURE47_LONGPLAY_DATABASE,s=>{const q=s.get('current');q.onsuccess=()=>s.put({...q.result,journal:{...q.result.journal,fork:{...q.result.journal.fork,engine:'future'}}},'current');});
  await expect(loadCulture47(f,verify,undefined,CULTURE47_LONGPLAY_DATABASE)).rejects.toThrow('未来');
  await slots(f,CULTURE47_LONGPLAY_DATABASE,s=>{s.put(originalRows.find(v=>!!v&&typeof v==='object'&&'journal'in v&&(v.journal as Culture47Journal).engine===__CULTURE47_ENGINE__),'current');const q=s.get('origin');q.onsuccess=()=>s.put({...q.result,future:1},'origin');});
  await expect(loadCulture47(f,verify,undefined,CULTURE47_LONGPLAY_DATABASE)).rejects.toThrow('未来');await expect(saveCulture47(j,1,f,undefined,verify,CULTURE47_LONGPLAY_DATABASE)).rejects.toThrow('未来');
 },30000);
 it('validates separate v1/v2 budgets without weakening individual advance commands',()=>{
  const old={...initial,actions:Array.from({length:1001},()=>({kind:'advance' as const,ticks:120}))};expect(()=>assertCulture47Journal(old)).toThrow('1000');
  const fresh={...old,version:2 as const,fork:null};expect(()=>assertCulture47Journal(fresh)).not.toThrow();
  expect(()=>assertCulture47Journal({...fresh,actions:[{kind:'advance',ticks:121}]})).toThrow();
  for(const days of [2001,40001])expect(()=>assertCulture47Journal({...fresh,actions:Array.from({length:days},()=>({kind:'advance',ticks:120}))})).not.toThrow();
 });
});
