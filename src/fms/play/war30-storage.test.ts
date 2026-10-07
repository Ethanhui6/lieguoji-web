import {beforeAll,describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {readFileSync} from 'node:fs';
import {grid} from './fixture.test-support';
import {War29Session} from './war29-session';
import type {War29Run} from './war29-model';
import {WAR29_DATABASE} from './war29-storage';
import {War29Session as OldSession} from './war29-session';
import {assertGameRun,copyWar30Candidate,war29View,type War30Run} from './war30-model';
import {loadRun,saveRun,runStore} from './war30-stores';
import {WAR30_DATABASE} from './war30-storage';
import {fingerprintWar30} from '../../../scripts/fms-war30-fingerprint';
import {verifyWar29Compatibility,FROZEN_WAR29_ENGINE} from '../../../scripts/fms-war30-compat';

async function slots(factory:IDBFactory,name:string,write?:(s:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=factory.open(name);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',write?'readwrite':'readonly'),s=t.objectStore('saves');write?.(s);const g=s.getAll();let values:unknown[]=[];g.onsuccess=()=>values=g.result;t.oncomplete=()=>{d.close();resolve(values);};t.onabort=()=>{d.close();reject(t.error);};};q.onerror=()=>reject(q.error);});}
let old:War29Run,candidate:War30Run;
beforeAll(()=>{old=new War29Session().execute({type:'create',terrain:grid((x,y)=>x>30&&x<220&&y>30&&y<220?45:0),count:4,cityCount:24,relations:'war'}).run as War29Run;candidate=copyWar30Candidate(old);});
describe('v30 geography candidate storage; production stays v29',()=>{
 it('freezes the actual v29 fingerprint, rejects changed source and binds all new geography sources',()=>{
  expect(old.engine).toBe(FROZEN_WAR29_ENGINE);expect(fingerprintWar30()).toBe(__FMS_WAR30_ENGINE__);
  expect(()=>verifyWar29Compatibility(path=>readFileSync(path,'utf8').replace(/\r\n/g,'\n')+(path==='src/fms/play/war29-model.ts'?'\nchanged':''))).toThrow(/execution changed/);
 },30000); // Same filesystem/AST verification budget as the v29 fingerprint check.
 it('uses an explicit new run and keeps old land IDs, war history, cities, units and terrain unchanged',()=>{
  const before=structuredClone(old),n=copyWar30Candidate(old);assertGameRun(n);expect(n.id).not.toBe(old.id);expect(runStore(n)).toBe(32);
  for(const key of ['nativeWars','terrain','warfare','people','kin','life','units','navy','transports'] as const)expect(n[key]).toEqual(old[key]);
  expect({...n.world,custom:old.world.custom}).toEqual(old.world);expect(old).toEqual(before);expect(n.diplomaticGeography.landIds).toEqual(old.nativeWars.provinceIds);
 });
 it('saves/reloads every actual water face and preserves the old database through two saves',async()=>{
  const db=new IDBFactory();await saveRun(old,null,db);const previous=await slots(db,WAR29_DATABASE);
  await saveRun(candidate,null,db);expect(await loadRun(db)).toEqual({run:candidate,revision:1,recovered:false});
  await saveRun(candidate,1,db);expect((await loadRun(db))!.run).toEqual(candidate);expect(await slots(db,WAR29_DATABASE)).toEqual(previous);
  expect(await loadRun(db,31)).toEqual({run:old,revision:1,recovered:false});
 });
 it('retains only one of two competing saves and refuses a stale third writer without altering slots',async()=>{
  const db=new IDBFactory();await saveRun(candidate,null,db);const [a,b]=await Promise.allSettled([saveRun(candidate,1,db),saveRun(candidate,1,db)]);
  expect([a,b].filter(r=>r.status==='fulfilled')).toHaveLength(1);expect([a,b].filter(r=>r.status==='rejected')).toHaveLength(1);
  const before=await slots(db,WAR30_DATABASE);await expect(saveRun(candidate,1,db)).rejects.toThrow(/另一窗口/);expect(await slots(db,WAR30_DATABASE)).toEqual(before);
 });
 it.each(['missing','damaged'] as const)('recovers from %s current geometry and protects the chosen backup during the next two saves',async kind=>{
  const db=new IDBFactory();await saveRun(candidate,null,db);await saveRun(candidate,1,db);
  await slots(db,WAR30_DATABASE,s=>{if(kind==='missing')s.delete('current');else{const q=s.get('current');q.onsuccess=()=>{q.result.run.diplomaticGeography.water[0].faces.pop();s.put(q.result,'current');};}});
  expect(await loadRun(db)).toEqual({run:candidate,revision:2,recovered:true});
  await saveRun(candidate,2,db);expect(await loadRun(db)).toEqual({run:candidate,revision:3,recovered:false});
  await saveRun(candidate,3,db);expect(await loadRun(db)).toEqual({run:candidate,revision:4,recovered:false});
  const values=await slots(db,WAR30_DATABASE);expect(values.filter(v=>v&&typeof v==='object'&&'run'in v)).toHaveLength(2);
 });
 it.each(['current','backup'])('locks future nested geography in %s before load or save, preserving both slots',async key=>{
  const db=new IDBFactory();await saveRun(candidate,null,db);await saveRun(candidate,1,db);
  await slots(db,WAR30_DATABASE,s=>{const q=s.get(key);q.onsuccess=()=>{q.result.run.diplomaticGeography.water[0].futureShape=1;s.put(q.result,key);};});
  const before=await slots(db,WAR30_DATABASE);await expect(loadRun(db)).rejects.toThrow(/未来/);await expect(saveRun(candidate,2,db)).rejects.toThrow(/未来/);expect(await slots(db,WAR30_DATABASE)).toEqual(before);
 });
 it('refuses invalid geography, new root fields or a wrong engine before opening/writing a database',async()=>{
  const db=new IDBFactory();for(const mutate of [(r:War30Run)=>r.diplomaticGeography.water[0].area++,(r:War30Run)=>Object.assign(r,{future:1}),(r:War30Run)=>r.engine='different']){const bad=structuredClone(candidate);mutate(bad);await expect(saveRun(bad,null,db)).rejects.toThrow();}
  expect(await db.databases()).toEqual([]);
 });
 it('snapshots geometry before asynchronous hashing so subsequent caller mutation cannot enter the save',async()=>{
  const db=new IDBFactory(),copy=structuredClone(candidate),pending=saveRun(copy,null,db);copy.diplomaticGeography.water[0].faces.pop();copy.world.nations[0].name='caller changed';await pending;
  expect((await loadRun(db))!.run).toEqual(candidate);
 });
 it('continues the retained v29 run in its frozen session without ever interpreting the new candidate as old rules',()=>{
  const a=new OldSession(),b=new War29Session();a.execute({type:'load',run:old});b.execute({type:'load',run:old});const command={type:'tick' as const,ticks:2,expected:{day:old.world.day,nextEventId:old.world.nextEventId,tick:old.clock.tick}};
  expect(a.execute(command)).toEqual(b.execute(command));expect(()=>a.execute({type:'load',run:candidate as unknown as War29Run})).toThrow();
  expect(war29View(candidate).diplomacy).toEqual(candidate.diplomacy);
 });
});
