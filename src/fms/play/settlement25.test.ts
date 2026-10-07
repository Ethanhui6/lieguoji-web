import {beforeAll,describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {settlementRegions} from './settlement25-regions';
import {landFaces,polygonArea,edgeKey,type Vertex} from './settlement25-mesh';
import {createSettlement25Base} from './settlement25-world';
import {Settlement25Session} from './settlement25-session';
import {Voyage24Session} from './voyage24-session';
import {assertSettlement25,voyage24View,presentationOf,type Settlement25Run} from './settlement25-model';
import {saveRun,loadRun,runStore} from './settlement25-stores';
import {SETTLEMENT25_DATABASE} from './settlement25-storage';
import {VOYAGE24_DATABASE} from './voyage24-storage';
import {graphFor} from './naval-rules';
import {seaGraph} from './sea-path';
import {buildTerrainContext} from './terrain13-context';
import {buildTerrainContext as dataTerrain} from './settlement25-terrain';
import {buildProvinceCombat as dataCombat} from './settlement25-combat';
import {buildProvinceCombat} from './upper14-geography';
import {buildProvinceCells as dataCells} from './settlement25-cells';
import {buildProvinceCells} from './fiscal15-geography';
import {deriveFmsBiomeSurface} from './terrain13-climate/biome-surface';
import {settlementBiomeData} from './settlement25-biomes';
import {verifyVoyage24Compatibility,fingerprintSettlement25} from '../../../scripts/fms-settlement25-fingerprint';
const stamp=(r:Settlement25Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
const continent=()=>grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0);
async function slots(factory:IDBFactory,name:string,write?:(s:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=factory.open(name);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',write?'readwrite':'readonly'),s=t.objectStore('saves');write?.(s);const g=s.getAll();let values:unknown[]=[];g.onsuccess=()=>values=g.result;t.oncomplete=()=>{d.close();resolve(values);};t.onabort=()=>reject(t.error);};q.onerror=()=>reject(q.error);});}
describe('terrain-connected city regions',()=>{
 it('keeps biome, drainage and all gameplay terrain fields identical while omitting GPU river geometry',()=>{
  const doc=grid((x,y)=>x<30||x>220||y<30||y>220?0:35+Math.round(x/10)),a=deriveFmsBiomeSurface(doc),b=settlementBiomeData(doc);
  expect(b.ids).toEqual(a.ids);expect(b.temperatures).toEqual(a.temperatures);expect(b.precipitation).toEqual(a.precipitation);for(const key of ['flux','riverIds','receiver','routingHeight','segments'] as const)expect(b.rivers[key]).toEqual(a.rivers[key]);
  const {base:r}=createSettlement25Base(doc,2,24,'peace'),land=dataTerrain(doc,r.world,r.scale);expect(land).toEqual(buildTerrainContext(doc,r.world,r.scale));expect(dataCombat(doc,r.world,r.scale,land)).toEqual(buildProvinceCombat(doc,r.world,r.scale,land));expect(dataCells(doc,r.world,r.scale)).toEqual(buildProvinceCells(doc,r.world,r.scale));
 });
 it.each([24,60,120,240,480])('creates exactly %s city regions without changing the drawn coast',count=>{
  const doc=continent(),before=structuredClone(doc),faces=landFaces(doc),regions=settlementRegions(doc,count),members=regions.flatMap(r=>r.members);
  expect(regions).toHaveLength(count);expect(new Set(members).size).toBe(faces.length);expect(members).toHaveLength(faces.length);expect(doc).toEqual(before);
  expect(regions.reduce((s,r)=>s+polygonArea(r.ring),0)).toBeCloseTo(faces.reduce((s,f)=>s+polygonArea(f.ring),0),7);
  const boundary=(rings:{ring:Vertex[]}[])=>{const e=new Set<string>();for(const f of rings)for(let k=0;k<f.ring.length;k++){const key=edgeKey(f.ring[k],f.ring[(k+1)%f.ring.length]);if(e.has(key))e.delete(key);else e.add(key);}return [...e].sort();};
  expect(boundary(regions)).toEqual(boundary(faces));
  for(const [id,r]of regions.entries()){expect(r.ring.length).toBeLessThanOrEqual(200);expect(new Set(r.ring.map(p=>p.key)).size).toBe(r.ring.length);for(const next of r.neighbors)expect(regions[next].neighbors.has(id)).toBe(true);
   const allowed=new Set(r.members),seen=new Set([r.members[0]]),q=[r.members[0]];for(let h=0;h<q.length;h++)for(const j of faces[q[h]].neighbors)if(allowed.has(j)&&!seen.has(j)){seen.add(j);q.push(j);}expect(seen.size).toBe(r.members.length);
  }
 });
 it.each(['islands','lake','ridge','h20'] as const)('maps all %s faces into valid new city, terrain and port references',kind=>{
  const doc=grid((x,y)=>kind==='islands'?(((x>=30&&x<=80)||(x>=150&&x<=220))&&y>=30&&y<=210?45:0):kind==='lake'?(x>80&&x<160&&y>80&&y<160?0:45):kind==='ridge'?(x>20&&x<230&&y>20&&y<230?(x>115&&x<140?85:40):0):(x<60?0:x===60?20:x<160?45:85));
  const {base}=createSettlement25Base(doc,10,60,'peace'),land=buildTerrainContext(base.terrain,base.world,base.scale);expect(base.world.nations).toHaveLength(10);expect(new Set(base.world.nations.map(n=>n.color)).size).toBe(10);expect(base.world.cities).toHaveLength(60);expect(Object.keys(land.provinces)).toHaveLength(60);
  for(const n of base.world.nations){const c=base.world.cities.find(c=>c.id===n.capitalId)!;expect(base.world.provinces.find(p=>p.id===c.provinceId)!.controller).toBe(n.id);}
  if(kind==='islands')expect(seaGraph(base.terrain,base.world).ports.length).toBeGreaterThanOrEqual(2);
 });
 it('rejects impossible cities and nations without dropping islands or changing the draft',()=>{const d=grid((x,y)=>x%40===0&&y%40===0?45:0),before=structuredClone(d);expect(()=>settlementRegions(d,24)).toThrow(/不相连/);expect(d).toEqual(before);expect(()=>createSettlement25Base(continent(),24,20,'peace')).toThrow(/不能超过/);expect(()=>settlementRegions(grid(()=>0),24)).toThrow(/无法放置/);});
});
let seed:Settlement25Run;
beforeAll(()=>{seed=new Settlement25Session().execute({type:'create',terrain:continent(),count:10,cityCount:60,relations:'peace'}).run as Settlement25Run;});
describe('v25 playable initialization, save and old-world isolation',()=>{
 it('freezes v24, binds geometry sources and builds every derived system from the chosen counts',()=>{verifyVoyage24Compatibility();expect(fingerprintSettlement25()).toBe(__FMS_SETTLEMENT25_ENGINE__);assertSettlement25(seed);expect(seed.world.cities).toHaveLength(60);expect(seed.world.nations).toHaveLength(10);expect(seed.generation).toEqual({version:1,method:'terrain-connected-unions-v1',cityCount:60,countryCount:10});expect(seed.world.statecraft!.relations).toHaveLength(45);expect(Object.keys(seed.terrainContext.provinces)).toHaveLength(60);expect(seed.world.armies.length).toBeGreaterThan(10);expect(Object.keys(seed.voyages.enabled)).toHaveLength(10);expect(graphFor(presentationOf(seed)).ports.length).toBeGreaterThan(0);});
 it('continues actual simulation identically after independent save/restore with CAS',async()=>{const s=new Settlement25Session();s.execute({type:'load',run:seed});const n=s.execute({type:'tick',ticks:12,expected:stamp(seed)}).run as Settlement25Run,db=new IDBFactory();expect(n.clock.tick).toBe(12);expect(runStore(n)).toBe(27);await saveRun(n,null,db);const r=(await loadRun(db))!.run as Settlement25Run;expect(r).toEqual(n);const fresh=new Settlement25Session();fresh.execute({type:'load',run:r});const c={type:'tick' as const,ticks:12,expected:stamp(n)};expect(fresh.execute(c)).toEqual(s.execute(c));await expect(saveRun(r,null,db)).rejects.toThrow(/另一窗口/);});
 it('loads old v24 under its exact rules and copies without repartitioning or overwriting its DB',async()=>{const old=voyage24View(seed),db=new IDBFactory();await saveRun(old,null,db);const original=await slots(db,VOYAGE24_DATABASE),a=new Settlement25Session(),b=new Voyage24Session();a.execute({type:'load',run:old});b.execute({type:'load',run:old});const c={type:'tick' as const,ticks:12,expected:stamp(seed)};expect(a.execute(c)).toEqual(b.execute(c));const copied=a.execute({type:'copy',run:old}).run as Settlement25Run;expect(copied.id).not.toBe(old.id);expect(copied.world.provinces).toEqual(old.world.provinces);expect(copied.world.cities).toEqual(old.world.cities);expect(copied.kin).toEqual(old.kin);expect(copied.generation.method).toBe('preserved-world');await saveRun(copied,null,db);expect(await slots(db,VOYAGE24_DATABASE)).toEqual(original);});
 it.each(['current','backup'])('locks future generation fields in %s before writes',async slot=>{const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,SETTLEMENT25_DATABASE,s=>{const q=s.get(slot);q.onsuccess=()=>{q.result.run.generation.future=1;s.put(q.result,slot);};});const before=await slots(db,SETTLEMENT25_DATABASE);await expect(loadRun(db)).rejects.toThrow(/未来/);await expect(saveRun(seed,2,db)).rejects.toThrow(/未来/);expect(await slots(db,SETTLEMENT25_DATABASE)).toEqual(before);});
 it('recovers a damaged current generation from valid backup, then saves twice without losing it',async()=>{const db=new IDBFactory();await saveRun(seed,null,db);await saveRun(seed,1,db);await slots(db,SETTLEMENT25_DATABASE,s=>{const q=s.get('current');q.onsuccess=()=>{delete q.result.run.generation;s.put(q.result,'current');};});expect((await loadRun(db))!.recovered).toBe(true);expect((await loadRun(db))!.run).toEqual(seed);await saveRun(seed,2,db);await saveRun(seed,3,db);expect((await loadRun(db))!.run).toEqual(seed);});
 it('failed creation leaves the previously loaded world available',()=>{const s=new Settlement25Session();s.execute({type:'load',run:seed});expect(()=>s.execute({type:'create',terrain:grid(()=>0),count:10,cityCount:60,relations:'peace'})).toThrow();const n=s.execute({type:'tick',ticks:1,expected:stamp(seed)}).run as Settlement25Run;expect(n.id).toBe(seed.id);expect(n.generation).toEqual(seed.generation);});
});
