import {describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {readFileSync} from 'node:fs';
import {ChronicleSession} from './chronicle-session';
import {Chronicle2Session} from './chronicle2-session';
import {chronicleView,assertChronicle2,type Chronicle2Run} from './chronicle2-model';
import type {ChronicleRun} from './chronicle-model';
import {loadRun,saveRun,runStore} from './chronicle2-stores';
import {CHRONICLE_DATABASE} from './chronicle-storage';
import {CHRONICLE2_DATABASE} from './chronicle2-storage';
import {grid} from './fixture.test-support';
import {verifyChronicleCompatibility,fingerprintChronicle2} from '../../../scripts/fms-chronicle2-fingerprint';
import {fingerprintChronicle} from '../../../scripts/fms-chronicle-fingerprint';
const stamp=(r:ChronicleRun|Chronicle2Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
function fixture(){const s=new Chronicle2Session(),r=s.execute({type:'create',terrain:grid((x,y)=>x>30&&x<210&&y>30&&y<200?45:0),count:2,relations:'war'}).run as Chronicle2Run;return {s,r};}
async function slots(db:IDBFactory,name=CHRONICLE2_DATABASE){return new Promise<unknown[]>((resolve,reject)=>{const q=db.open(name);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves'),r=t.objectStore('saves').getAll();r.onsuccess=()=>resolve(r.result);t.oncomplete=()=>d.close();};});}
async function change(db:IDBFactory,key:string,edit:(v:{run:Chronicle2Run;checksum:string})=>void,name=CHRONICLE2_DATABASE){await new Promise<void>((resolve,reject)=>{const q=db.open(name);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves','readwrite'),s=t.objectStore('saves'),r=s.get(key);r.onsuccess=()=>{edit(r.result);s.put(r.result,key);};t.oncomplete=()=>{d.close();resolve();};t.onerror=()=>reject(t.error);};});}
describe('v12 performance adapter preserves published v11 progress',()=>{
 it('freezes the complete v11 execution closure and independently identifies v12',()=>{verifyChronicleCompatibility();expect(fingerprintChronicle()).toBe('f22268ac708380330dac94247a24c46a8fef2c2d716972049f9af9f124fd5884');expect(fingerprintChronicle2()).toBe(__FMS_CHRONICLE2_ENGINE__);expect(__FMS_CHRONICLE2_ENGINE__).not.toBe(__FMS_CHRONICLE_ENGINE__);});
 it.each(['src/fms/play/chronicle-runtime.ts','src/fms/play/compat/chronicle1/fms/play/chronicle-runtime.ts.source'])('rejects modified frozen source %s',path=>{expect(()=>verifyChronicleCompatibility(f=>readFileSync(f,'utf8').replaceAll('\r\n','\n')+(f===path?'\nchanged':''))).toThrow('Published v11');});
 it('continues v11 identically then explicitly copies all regnal history without changing any old database slot',async()=>{
  const {r}=fixture(),old=new ChronicleSession(),s=new Chronicle2Session();let source=chronicleView(r);old.execute({type:'load',run:source});
  for(let i=0;i<2;i++)source=old.execute({type:'politics',action:{type:'succession',nationId:source.world.nations[0].id,regnalName:'景明'},expected:stamp(source)}).run as ChronicleRun;
  const db=new IDBFactory();await saveRun(source,null,db);await saveRun(source,1,db);const before=await slots(db,CHRONICLE_DATABASE),input=structuredClone(source);
  s.execute({type:'load',run:source});const cmd={type:'tick' as const,ticks:3,expected:stamp(source)};expect(s.execute(cmd)).toEqual(old.execute(cmd));expect(runStore(source)).toBe(13);
  const copied=s.execute({type:'copy',run:source}).run as Chronicle2Run;expect(copied.id).not.toBe(source.id);expect(copied.chronicle).toEqual(source.chronicle);expect(copied.chronicle.leaders[source.world.nations[0].id].at(-1)).toMatchObject({regnalOrdinal:2,order:3});
  const normalized=chronicleView(structuredClone(copied));normalized.id=source.id;normalized.world.custom!.id=source.id;expect(normalized).toEqual(source);expect(source).toEqual(input);expect(runStore(copied)).toBe(14);
  await saveRun(copied,null,db);expect(await slots(db,CHRONICLE_DATABASE)).toEqual(before);expect((await loadRun(db,13))!.run).toEqual(source);expect((await loadRun(db))!.run).toEqual(copied);
  const resumed=new Chronicle2Session();resumed.execute({type:'load',run:(await loadRun(db))!.run});const n=resumed.execute({type:'politics',action:{type:'succession',nationId:copied.world.nations[0].id,regnalName:'景明'},expected:stamp(copied)}).run as Chronicle2Run;expect(n.chronicle.leaders[n.world.nations[0].id].at(-1)).toMatchObject({regnalOrdinal:3,order:4});
 });
 it('keeps v12 CAS and actual chosen backup through two damaged-current recovery cycles',async()=>{
  const {s,r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);const n=s.execute({type:'tick',ticks:3,expected:stamp(r)}).run;await saveRun(n,1,db);await change(db,'current',v=>Object.values(v.run.chronicle.unrest)[0].pressure=101);const recovered=(await loadRun(db))!;expect(recovered).toMatchObject({run:r,revision:2,recovered:true});await expect(saveRun(r,1,db)).rejects.toThrow('另一窗口');await saveRun(n,2,db);await change(db,'current',v=>{v.run.chronicle.nextEntryId=999;});expect((await loadRun(db))!.run).toEqual(r);
 });
 it.each(['current','backup'])('locks a future v12 field in %s without blocking or writing Store13',async key=>{
  const {r}=fixture(),db=new IDBFactory(),old=chronicleView(r);await saveRun(old,null,db);const oldSlots=await slots(db,CHRONICLE_DATABASE);await saveRun(r,null,db);await saveRun(r,1,db);await change(db,key,v=>Object.assign(Object.values(v.run.chronicle.leaders)[0][0],{future:true}));const before=await slots(db);await expect(loadRun(db)).rejects.toThrow('未知字段');await expect(saveRun(r,2,db)).rejects.toThrow('未知字段');expect(await slots(db)).toEqual(before);expect((await loadRun(db,13))!.run).toEqual(old);expect(await slots(db,CHRONICLE_DATABASE)).toEqual(oldSlots);
 });
 it('keeps a future Store13 isolated from valid Store14',async()=>{const {r}=fixture(),db=new IDBFactory();await saveRun(chronicleView(r),null,db);await change(db,'current',v=>Object.assign(v.run,{future:true}),CHRONICLE_DATABASE);const before=await slots(db,CHRONICLE_DATABASE);await saveRun(r,null,db);expect((await loadRun(db))!.run).toEqual(r);await expect(loadRun(db,13)).rejects.toThrow('未知字段');expect(await slots(db,CHRONICLE_DATABASE)).toEqual(before);});
 it('rejects unknown identity, extra schema and invalid copies without changing the installed v12',()=>{const {s,r}=fixture();for(const patch of [{engine:'unknown'},{future:true}]){const bad={...r,...patch};expect(()=>s.execute({type:'load',run:bad})).toThrow();expect(()=>assertChronicle2(bad)).toThrow();}expect(()=>s.execute({type:'copy',run:r})).toThrow('无需复制');const bad=chronicleView(structuredClone(r));bad.chronicle.nextEntryId=99;expect(()=>s.execute({type:'copy',run:bad})).toThrow();const n=s.execute({type:'tick',ticks:1,expected:stamp(r)}).run as Chronicle2Run;expect(n.id).toBe(r.id);expect(n.chronicle.entries).toEqual([]);expect(n.clock.tick).toBe(1);});
 it('matches the whole frozen v11 daily command including polity, navy and chronicle',()=>{const {s,r}=fixture(),old=new ChronicleSession();old.execute({type:'load',run:chronicleView(r)});const cmd={type:'step' as const,days:1};expect(chronicleView(s.execute(cmd).run as Chronicle2Run)).toEqual(old.execute(cmd).run);});
});
