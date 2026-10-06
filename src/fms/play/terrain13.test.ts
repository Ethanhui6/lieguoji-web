import {describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {readFileSync} from 'node:fs';
import {Chronicle2Session} from './chronicle2-session';
import {Terrain13Session} from './terrain13-session';
import {chronicle2View,assertTerrain13,type Terrain13Run} from './terrain13-model';
import type {Chronicle2Run} from './chronicle2-model';
import {loadRun,saveRun,runStore} from './terrain13-stores';
import {CHRONICLE2_DATABASE} from './chronicle2-storage';
import {TERRAIN13_DATABASE} from './terrain13-storage';
import {grid} from './fixture.test-support';
import {verifyChronicle2Compatibility,fingerprintTerrain13} from '../../../scripts/fms-terrain13-fingerprint';
import {fingerprintChronicle2} from '../../../scripts/fms-chronicle2-fingerprint';
const stamp=(r:Chronicle2Run|Terrain13Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
function fixture(){const s=new Terrain13Session(),r=s.execute({type:'create',terrain:grid((x,y)=>x>30&&x<210&&y>30&&y<200?45:0),count:2,relations:'war'}).run as Terrain13Run;return {s,r};}
async function slots(db:IDBFactory,name=TERRAIN13_DATABASE){return new Promise<unknown[]>((resolve,reject)=>{const q=db.open(name);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves'),r=t.objectStore('saves').getAll();r.onsuccess=()=>resolve(r.result);t.oncomplete=()=>d.close();};});}
async function change(db:IDBFactory,key:string,edit:(v:{run:Terrain13Run;checksum:string})=>void,name=TERRAIN13_DATABASE){await new Promise<void>((resolve,reject)=>{const q=db.open(name);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves','readwrite'),s=t.objectStore('saves'),r=s.get(key);r.onsuccess=()=>{edit(r.result);s.put(r.result,key);};t.oncomplete=()=>{d.close();resolve();};t.onerror=()=>reject(t.error);};});}
describe('v13 terrain combat preserves published v12 progress',()=>{
 it('freezes the complete v12 execution closure and independently identifies v13',()=>{verifyChronicle2Compatibility();expect(fingerprintChronicle2()).toBe('4f3d955e7a3e3626d2392fd46dce89e221b0935d89aac5a998f22771a67595ea');expect(fingerprintTerrain13()).toBe(__FMS_TERRAIN13_ENGINE__);expect(__FMS_TERRAIN13_ENGINE__).not.toBe(__FMS_CHRONICLE2_ENGINE__);});
 it.each(['src/fms/play/chronicle2-runtime.ts','src/fms/play/compat/chronicle2/fms/play/chronicle2-runtime.ts.source'])('rejects modified frozen source %s',path=>{expect(()=>verifyChronicle2Compatibility(f=>readFileSync(f,'utf8').replaceAll('\r\n','\n')+(f===path?'\nchanged':''))).toThrow('Published v12');});
 it('continues v12 identically then explicitly copies all regnal history without changing any old database slot',async()=>{
  const {r}=fixture(),old=new Chronicle2Session(),s=new Terrain13Session();let source=chronicle2View(r);old.execute({type:'load',run:source});
  for(let i=0;i<2;i++)source=old.execute({type:'politics',action:{type:'succession',nationId:source.world.nations[0].id,regnalName:'景明'},expected:stamp(source)}).run as Chronicle2Run;
  const db=new IDBFactory();await saveRun(source,null,db);await saveRun(source,1,db);const before=await slots(db,CHRONICLE2_DATABASE),input=structuredClone(source);
  s.execute({type:'load',run:source});const cmd={type:'tick' as const,ticks:3,expected:stamp(source)};expect(s.execute(cmd)).toEqual(old.execute(cmd));expect(runStore(source)).toBe(14);
  const copied=s.execute({type:'copy',run:source}).run as Terrain13Run;expect(copied.id).not.toBe(source.id);expect(copied.chronicle).toEqual(source.chronicle);expect(copied.chronicle.leaders[source.world.nations[0].id].at(-1)).toMatchObject({regnalOrdinal:2,order:3});
  const normalized=chronicle2View(structuredClone(copied));normalized.id=source.id;normalized.world.custom!.id=source.id;expect(normalized).toEqual(source);expect(source).toEqual(input);expect(runStore(copied)).toBe(15);
  await saveRun(copied,null,db);expect(await slots(db,CHRONICLE2_DATABASE)).toEqual(before);expect((await loadRun(db,14))!.run).toEqual(source);expect((await loadRun(db))!.run).toEqual(copied);
  const resumed=new Terrain13Session();resumed.execute({type:'load',run:(await loadRun(db))!.run});const n=resumed.execute({type:'politics',action:{type:'succession',nationId:copied.world.nations[0].id,regnalName:'景明'},expected:stamp(copied)}).run as Terrain13Run;expect(n.chronicle.leaders[n.world.nations[0].id].at(-1)).toMatchObject({regnalOrdinal:3,order:4});
 });
 it('keeps v13 CAS and actual chosen backup through two damaged-current recovery cycles',async()=>{
  const {s,r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);const n=s.execute({type:'tick',ticks:3,expected:stamp(r)}).run;await saveRun(n,1,db);await change(db,'current',v=>Object.values(v.run.chronicle.unrest)[0].pressure=101);const recovered=(await loadRun(db))!;expect(recovered).toMatchObject({run:r,revision:2,recovered:true});await expect(saveRun(r,1,db)).rejects.toThrow('另一窗口');await saveRun(n,2,db);await change(db,'current',v=>{v.run.chronicle.nextEntryId=999;});expect((await loadRun(db))!.run).toEqual(r);
 });
 it.each(['current','backup'])('locks a future v13 field in %s without blocking or writing Store14',async key=>{
  const {r}=fixture(),db=new IDBFactory(),old=chronicle2View(r);await saveRun(old,null,db);const oldSlots=await slots(db,CHRONICLE2_DATABASE);await saveRun(r,null,db);await saveRun(r,1,db);await change(db,key,v=>Object.assign(Object.values(v.run.terrainContext.provinces)[0],{future:true}));const before=await slots(db);await expect(loadRun(db)).rejects.toThrow('未知字段');await expect(saveRun(r,2,db)).rejects.toThrow('未知字段');expect(await slots(db)).toEqual(before);expect((await loadRun(db,14))!.run).toEqual(old);expect(await slots(db,CHRONICLE2_DATABASE)).toEqual(oldSlots);
 });
 it('keeps a future Store14 isolated from valid Store15',async()=>{const {r}=fixture(),db=new IDBFactory();await saveRun(chronicle2View(r),null,db);await change(db,'current',v=>Object.assign(v.run,{future:true}),CHRONICLE2_DATABASE);const before=await slots(db,CHRONICLE2_DATABASE);await saveRun(r,null,db);expect((await loadRun(db))!.run).toEqual(r);await expect(loadRun(db,14)).rejects.toThrow('未知字段');expect(await slots(db,CHRONICLE2_DATABASE)).toEqual(before);});
 it('recovers null known terrain values twice while preserving the actual chosen backup',async()=>{const {s,r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);const n=s.execute({type:'tick',ticks:3,expected:stamp(r)}).run;await saveRun(n,1,db);await change(db,'current',v=>Object.assign(v.run.terrainContext.provinces,{[Object.keys(v.run.terrainContext.provinces)[0]]:null}));expect(await loadRun(db)).toMatchObject({run:r,recovered:true,revision:2});await saveRun(n,2,db);await change(db,'current',v=>Object.assign(v.run,{terrainContext:null}));expect(await loadRun(db)).toMatchObject({run:r,recovered:true,revision:3});});
 it('rejects unknown identity, extra schema and invalid copies without changing the installed v13',()=>{const {s,r}=fixture();for(const patch of [{engine:'unknown'},{future:true}]){const bad={...r,...patch};expect(()=>s.execute({type:'load',run:bad})).toThrow();expect(()=>assertTerrain13(bad)).toThrow();}expect(()=>s.execute({type:'copy',run:r})).toThrow('无需复制');const bad=chronicle2View(structuredClone(r));bad.chronicle.nextEntryId=99;expect(()=>s.execute({type:'copy',run:bad})).toThrow();const n=s.execute({type:'tick',ticks:1,expected:stamp(r)}).run as Terrain13Run;expect(n.id).toBe(r.id);expect(n.chronicle.entries).toEqual([]);expect(n.clock.tick).toBe(1);});
 it('persists the saved terrain context instead of regenerating on read or elapsed time',async()=>{const {s,r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);const loaded=(await loadRun(db))!.run as Terrain13Run;expect(loaded.terrainContext).toEqual(r.terrainContext);const n=s.execute({type:'tick',ticks:3,expected:stamp(r)}).run as Terrain13Run;expect(n.terrainContext).toBe(r.terrainContext);});
});
