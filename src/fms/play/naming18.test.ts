import {beforeAll,describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {Naming18Session} from './naming18-session';
import {Culture17Session} from './culture17-session';
import {assertNaming18,court16View,type Naming18Run} from './naming18-model';
import {court16View as oldCourtView,type Culture17Run} from './culture17-model';
import {loadRun,saveRun} from './naming18-stores';
import {NAMING18_DATABASE} from './naming18-storage';
import {CULTURE17_DATABASE} from './culture17-storage';
import {originalNamingCulture,originalNamingCultureIds} from './native-culture/original-naming';
import {DEFAULT_CULTURES,nearestNamingCell,mapCultureId} from './naming18-names';
import {assertCulture} from './naming18-culture';
import {reconcileSovereignty} from './naming18-politics';
import {chronicleView} from './naming18-model';
import {fingerprintNaming18,verifyCulture17Compatibility} from '../../../scripts/fms-naming18-fingerprint';
import {grid} from './fixture.test-support';
const stamp=(r:Naming18Run|Culture17Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
const terrain=()=>grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0);
let seed:Naming18Run;
beforeAll(()=>{seed=new Naming18Session().execute({type:'create',terrain:terrain(),count:6,relations:'peace'}).run as Naming18Run;});
const fixture=()=>{const r=structuredClone(seed),s=new Naming18Session();s.execute({type:'load',run:r});return {r,s};};
async function slots(db:IDBFactory,name=NAMING18_DATABASE,write?:(s:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=db.open(name);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',write?'readwrite':'readonly'),s=t.objectStore('saves');write?.(s);const r=s.getAll();let result:unknown[]=[];r.onsuccess=()=>result=r.result;t.oncomplete=()=>{d.close();resolve(result);};t.onerror=()=>reject(t.error);};q.onerror=()=>reject(q.error);});}
async function mutate(db:IDBFactory,key:string,edit:(r:Naming18Run)=>void){await slots(db,NAMING18_DATABASE,s=>{const q=s.get(key);q.onsuccess=()=>{edit(q.result.run);s.put(q.result,key);};});}
describe('v18 original culture naming in real creation, politics and storage',()=>{
 it('nearest capital cell uses actual f32 mesh coordinates and stable ties',()=>{
  expect(nearestNamingCell({points:[[11.00000001,0],[10.00000002,0]],elevations:Int32Array.from([45,45])}, {x:10.5,y:0})).toEqual({x:11,y:0});
 });
 it('rejects coordinated secession culture replacement and ruler/nation mismatch',()=>{
  const {r,s}=fixture(),p=r.world.provinces.find(p=>!r.world.nations.some(n=>r.world.cities.find(c=>c.id===n.capitalId)?.provinceId===p.id)&&r.world.provinces.filter(v=>v.controller===p.controller).length>1)!,n=s.execute({type:'politics',action:{type:'independence',nationId:p.controller,provinceId:p.id},expected:stamp(r)}).run as Naming18Run,id=n.world.nations.at(-1)!.id,base=n.naming.enabled.find(v=>v!==n.naming.nations[id].baseCultureId)!;
  Object.assign(n.naming.nations[id],{baseCultureId:base,mapCultureId:mapCultureId(base),key:null,origin:'custom'});n.culture.nations[id].mapCultureId=mapCultureId(base);
  expect(()=>assertNaming18(n)).toThrow('命名记录损坏');expect(()=>assertCulture(n.culture,n)).toThrow('文化存档损坏');
 });
 it('freezes v17 and builds native four-culture countries/cities BEFORE muster and leaders',()=>{
  verifyCulture17Compatibility();expect(fingerprintNaming18()).toBe(__FMS_NAMING18_ENGINE__);const {r}=fixture();assertNaming18(r);expect(r.naming.enabled).toEqual(DEFAULT_CULTURES);expect(new Set(Object.values(r.naming.nations).map(n=>n.baseCultureId)).size).toBe(4);
  for(const nation of r.world.nations){const c=originalNamingCulture(r.naming.nations[nation.id].baseCultureId)!;expect(c.states.has(r.naming.nations[nation.id].key!)).toBe(true);expect(r.world.events.some(e=>e.text.startsWith(nation.name+'新编'))).toBe(true);const leader=r.chronicle.leaders[nation.id][0];expect(leader.name).toBe(r.naming.rulers[leader.id].name);expect(Object.values(r.people.persons).find(p=>p.rulerId===leader.id)?.name).toBe(leader.name);}
  for(const city of r.world.cities){expect(r.world.provinces.find(p=>p.id===city.provinceId)!.name).toBe(city.name);expect(r.naming.cities[city.id].name).toBe(city.name);}
 });
 it.each(originalNamingCultureIds)('supports an explicit %s world with matching places and actual ethnic weights',culture=>{
  const r=new Naming18Session().execute({type:'create',terrain:terrain(),count:2,relations:'peace',cultures:[culture]}).run as Naming18Run;assertNaming18(r);expect(new Set(Object.values(r.naming.nations).map(n=>n.baseCultureId))).toEqual(new Set([culture]));expect(Object.values(r.culture.maps)).toHaveLength(1);expect(Object.values(r.culture.maps)[0].baseCultureId).toBe(culture);expect(r.world.nations.every(n=>r.finance.nations[n.id].initializedDay===0)).toBe(true);
 });
 it('manual succession records the culture-specific name before history and personnel snapshots',()=>{
  const {r,s}=fixture(),nationId=r.world.nations[0].id,n=s.execute({type:'politics',action:{type:'succession',nationId},expected:stamp(r)}).run as Naming18Run,newRuler=n.chronicle.leaders[nationId].at(-1)!;expect(n.chronicle.entries.at(-1)!.people.at(-1)!.name).toBe(newRuler.name);expect(n.naming.rulers[newRuler.id].mapCultureId).toBe(n.naming.nations[nationId].mapCultureId);expect(newRuler.family).toBe(r.chronicle.leaders[nationId][0].family);assertNaming18(n);expect(r.chronicle.leaders[nationId]).toHaveLength(1);
 });
 it('independence names a real new nation and ruler before history and first income',()=>{
  const {r,s}=fixture(),p=r.world.provinces.find(p=>!r.world.nations.some(n=>r.world.cities.find(c=>c.id===n.capitalId)?.provinceId===p.id)&&r.world.provinces.filter(v=>v.controller===p.controller).length>1)!,n=s.execute({type:'politics',action:{type:'independence',nationId:p.controller,provinceId:p.id},expected:stamp(r)}).run as Naming18Run,id=n.world.nations.at(-1)!.id;
  expect(n.naming.nations[id].baseCultureId).toBe(r.naming.nations[p.controller].baseCultureId);expect(n.chronicle.entries.at(-1)!.text).toContain(n.world.nations.at(-1)!.name);expect(n.culture.nations[id].mapCultureId).toBe(n.naming.nations[id].mapCultureId);expect(n.finance.nations[id].ledger!.openingGold).toBe(0);assertNaming18(n);
 });
 it('explicit v17 copy preserves all live names, history, people and treasury without fabricated keys',async()=>{
  const old=new Culture17Session().execute({type:'create',terrain:terrain(),count:2,relations:'peace'}).run as Culture17Run,db=new IDBFactory();await saveRun(old,null,db);const before=await slots(db,CULTURE17_DATABASE),snapshot=structuredClone(old),s=new Naming18Session(),n=s.execute({type:'copy',run:old}).run as Naming18Run;
  const view=court16View(structuredClone(n));view.id=old.id;view.world.custom!.id=old.id;expect(view).toEqual(oldCourtView(old));expect(Object.values(n.naming.nations).every(n=>n.origin==='legacy'&&n.key===null)).toBe(true);await saveRun(n,null,db);expect(await slots(db,CULTURE17_DATABASE)).toEqual(before);expect(old).toEqual(snapshot);s.execute({type:'load',run:old});const oldSession=new Culture17Session();oldSession.execute({type:'load',run:old});const command={type:'tick' as const,ticks:2,expected:stamp(old)};expect(s.execute(command)).toEqual(oldSession.execute(command));
 });
 it('real ticks and save recovery preserve all new identity data without recomputing names',async()=>{
  const {r,s}=fixture(),n=s.execute({type:'tick',ticks:2,expected:stamp(r)}).run as Naming18Run;expect(n.naming).toEqual(r.naming);const db=new IDBFactory();await saveRun(r,null,db);await saveRun(n,1,db);expect((await loadRun(db))!.run).toEqual(n);await mutate(db,'current',r=>Object.assign(r,{naming:null}));expect(await loadRun(db)).toMatchObject({run:r,revision:2,recovered:true});await expect(saveRun(n,1,db)).rejects.toThrow('另一窗口');await saveRun(n,2,db);await mutate(db,'current',r=>Object.assign(r,{naming:null}));expect(await loadRun(db)).toMatchObject({run:r,revision:3,recovered:true});
 });
 it('custom names lose source-key claims while historic accession names stay immutable',()=>{
  const {r,s}=fixture(),nationId=r.world.nations[0].id,cityId=r.world.nations[0].capitalId,n=s.execute({type:'customize',runId:r.id,expected:stamp(r),edits:[{kind:'nation',id:nationId,name:'我的王国'},{kind:'city',id:cityId,name:'海湾城'}]}).run as Naming18Run;
  expect(n.naming.nations[nationId]).toMatchObject({key:null,name:'我的王国',origin:'custom'});expect(n.naming.cities[cityId]).toMatchObject({key:null,name:'海湾城',origin:'custom'});expect(n.chronicle.leaders).toEqual(r.chronicle.leaders);expect(n.naming.rulers).toEqual(r.naming.rulers);assertNaming18(n);
 });
 it('autonomous monthly uprising and due succession use the new names before first finance',()=>{
  const {r,s}=fixture(),p=r.world.provinces.find(p=>!r.world.nations.some(n=>r.world.cities.find(c=>c.id===n.capitalId)?.provinceId===p.id)&&r.world.provinces.filter(v=>v.controller===p.controller).length>1)!,parent=p.controller;p.legalOwner=r.world.nations.find(n=>n.id!==parent)!.id;r.chronicle.unrest[p.id].pressure=100;r.world.day=359;r.clock.tick=43199;r.chronicle.leaders[parent][0].termEndDay=360;s.execute({type:'load',run:r});const n=s.execute({type:'tick',ticks:1,expected:stamp(r)}).run as Naming18Run,newNation=n.world.nations.at(-1)!,next=n.chronicle.leaders[parent].at(-1)!;
  expect(n.world.nations).toHaveLength(r.world.nations.length+1);expect(n.chronicle.entries.some(e=>e.kind==='accession'&&e.people.some(p=>p.id===next.id&&p.name===n.naming.rulers[next.id].name))).toBe(true);expect(n.naming.nations[newNation.id].baseCultureId).toBe(r.naming.nations[parent].baseCultureId);expect(n.finance.nations[newNation.id].ledger!.openingGold).toBe(0);assertNaming18(n);
 });
 it('sovereignty restoration preserves culture and generates a new same-dynasty name before its snapshot',()=>{
  const {r}=fixture(),n={...structuredClone(chronicleView(r)),naming:structuredClone(r.naming)},id=n.world.nations[0].id,other=n.world.nations[1].id,owned=n.world.provinces.filter(p=>p.controller===id);for(const p of owned)p.controller=other;reconcileSovereignty(n);expect(n.chronicle.ended[id]).toBe(0);owned[0].controller=id;reconcileSovereignty(n);const ruler=n.chronicle.leaders[id].at(-1)!;expect(ruler.order).toBe(2);expect(n.chronicle.entries.at(-1)!.people[0].name).toBe(n.naming.rulers[ruler.id].name);expect(n.naming.rulers[ruler.id].familyId).toBe(n.naming.rulers[`ruler-${id}-1`].familyId);
 });
 it.each(['top','place','ruler','family','base','language'])('future naming %s locks both slots before recovery',async field=>{
  for(const key of ['current','backup']){const {r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);await mutate(db,key,v=>{const n=v.naming;if(field==='top')Object.assign(n,{future:1});if(field==='place')Object.assign(Object.values(n.cities)[0],{future:1});if(field==='ruler')Object.assign(Object.values(n.rulers)[0],{future:1});if(field==='family')Object.assign(Object.values(n.families)[0],{future:1});if(field==='base')Object.assign(Object.values(n.nations)[0],{baseCultureId:'FutureCulture'});if(field==='language')Object.assign(n,{language:'FutureLanguage'});});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow('未来');await expect(saveRun(r,2,db)).rejects.toThrow('未来');expect(await slots(db)).toEqual(before);}
 });
});
