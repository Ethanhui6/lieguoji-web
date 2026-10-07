import {beforeAll,describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {Restoration19Session} from './restoration19-session';
import {Naming18Session} from './naming18-session';
import {assertRestoration19,chronicleView,type Restoration19Run} from './restoration19-model';
import type {Naming18Run} from './naming18-model';
import {previewPolitics,reconcileSovereignty} from './restoration19-politics';
import {previewRebelIdentity} from './restoration19-identity';
import {originalNamingCulture} from './native-culture/original-naming';
import {reconcilePeople,knownRestorationPerson} from './restoration19-people';
import {reconcileUpper} from './upper14-state';
import {loadRun,saveRun} from './restoration19-stores';
import {RESTORATION19_DATABASE} from './restoration19-storage';
import {NAMING18_DATABASE} from './naming18-storage';
import {fingerprintRestoration19,verifyNaming18Compatibility} from '../../../scripts/fms-restoration19-fingerprint';
import {grid} from './fixture.test-support';
import {transferEconomy} from '../../compat/v0_4/sim/statecraft';
const terrain=()=>grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0);
const stamp=(r:Restoration19Run|Naming18Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
let seed:Restoration19Run;
beforeAll(()=>{seed=new Restoration19Session().execute({type:'create',terrain:terrain(),count:6,relations:'peace'}).run as Restoration19Run;});
const fixture=()=>{const r=structuredClone(seed),s=new Restoration19Session();s.execute({type:'load',run:r});return {r,s};};
function sync(r:Restoration19Run){const v={...chronicleView(r),naming:r.naming,culture:r.culture,people:r.people,sovereignty:r.sovereignty,upperCombat:r.upperCombat};reconcileSovereignty(v);r.world=v.world;reconcilePeople(r,r.people,r.sovereignty);reconcileUpper(r,r.upperCombat);}
async function slots(db:IDBFactory,name=RESTORATION19_DATABASE,write?:(s:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=db.open(name);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',write?'readwrite':'readonly'),s=t.objectStore('saves');write?.(s);const r=s.getAll();let result:unknown[]=[];r.onsuccess=()=>result=r.result;t.oncomplete=()=>{d.close();resolve(result);};t.onerror=()=>reject(t.error);};q.onerror=()=>reject(q.error);});}
async function mutate(db:IDBFactory,key:string,edit:(r:Restoration19Run)=>void){await slots(db,RESTORATION19_DATABASE,s=>{const q=s.get(key);q.onsuccess=()=>{edit(q.result.run);s.put(q.result,key);};});}
describe('v19 province identity and real returning people',()=>{
 it('freezes all v18 rules and persists the actual source city culture',()=>{verifyNaming18Compatibility();expect(fingerprintRestoration19()).toBe(__FMS_RESTORATION19_ENGINE__);const {r}=fixture();assertRestoration19(r);for(const p of Object.values(r.sovereignty.provinces))expect(p.mapCultureId).toBe(r.naming.cities[p.sourceCityId].mapCultureId);});
 it('copies v18 without rewriting culture, naming, people, old storage or old execution',async()=>{
  const old=new Naming18Session().execute({type:'create',terrain:terrain(),count:2,relations:'peace'}).run as Naming18Run,s=new Restoration19Session(),db=new IDBFactory();await saveRun(old,null,db);const before=await slots(db,NAMING18_DATABASE),n=s.execute({type:'copy',run:old}).run as Restoration19Run;
  expect(n.naming).toEqual(old.naming);expect(n.culture).toEqual(old.culture);expect(n.people).toEqual(old.people);expect(n.finance).toEqual(old.finance);expect(n.chronicle).toEqual(old.chronicle);expect(n.id).not.toBe(old.id);await saveRun(n,null,db);expect(await slots(db,NAMING18_DATABASE)).toEqual(before);
  s.execute({type:'load',run:old});const baseline=new Naming18Session();baseline.execute({type:'load',run:old});expect(s.execute({type:'tick',ticks:1,expected:stamp(old)})).toEqual(baseline.execute({type:'tick',ticks:1,expected:stamp(old)}));
 });
 it('province culture survives foreign occupation and drives rebellion instead of the occupier culture',()=>{
  const {r,s}=fixture(),p=r.world.provinces[0],source=r.sovereignty.provinces[p.id],foreign=r.world.nations.find(n=>r.naming.nations[n.id].mapCultureId!==source.mapCultureId)!;p.controller=foreign.id;sync(r);s.execute({type:'load',run:r});const before=structuredClone(r),view={...chronicleView(r),...{naming:r.naming,culture:r.culture,people:r.people,sovereignty:r.sovereignty,upperCombat:r.upperCombat}},a={type:'uprising' as const,nationId:foreign.id,provinceId:p.id};expect(previewPolitics(view,a).valid).toBe(true);expect(r).toEqual(before);
  const n=s.execute({type:'politics',action:a,expected:stamp(r)}).run as Restoration19Run,id=n.world.provinces.find(v=>v.id===p.id)!.controller;expect(n.naming.nations[id].mapCultureId).toBe(source.mapCultureId);expect(n.culture.nations[id].mapCultureId).toBe(source.mapCultureId);expect(n.sovereignty.provinces).toEqual(r.sovereignty.provinces);assertRestoration19(n);
 });
 it('capital uprising assigns the province city, relocates its parent and clears only locally present parent troops',()=>{
  const {r,s}=fixture(),parent=r.world.nations.find(n=>r.world.provinces.filter(p=>p.controller===n.id).length>1)!,city=r.world.cities.find(c=>c.id===parent.capitalId)!,p=r.world.provinces.find(v=>v.id===city.provinceId)!,inside=r.world.armies.find(a=>a.nationId===parent.id)!,outside=r.world.armies.find(a=>a.id!==inside.id&&a.nationId===parent.id)!;expect(outside).toBeTruthy();inside.provinceId=p.id;inside.route=[];inside.progress=0;inside.status='idle';const elsewhere=r.world.provinces.find(v=>v.id!==p.id&&v.controller===parent.id)!;outside.provinceId=elsewhere.id;outside.originId=p.id;outside.route=[];outside.progress=0;outside.status='idle';s.execute({type:'load',run:r});const n=s.execute({type:'politics',action:{type:'uprising',nationId:parent.id,provinceId:p.id},expected:stamp(r)}).run as Restoration19Run,id=n.world.provinces.find(v=>v.id===p.id)!.controller;
  expect(n.world.nations.find(v=>v.id===id)!.capitalId).toBe(city.id);expect(n.world.nations.find(v=>v.id===parent.id)!.capitalId).not.toBe(city.id);expect(n.world.armies.find(v=>v.id===inside.id)!.status).toBe('destroyed');expect(n.world.armies.find(v=>v.id===outside.id)).toEqual(outside);assertRestoration19(n);
 });
 it('a returning observed person retains identity, skills, first observation, offices and closed history',()=>{
  const {r}=fixture(),id=r.world.nations[0].id,other=r.world.nations[1].id,owned=r.world.provinces.filter(p=>p.controller===id),person=r.people.persons[r.people.nations[id].leaderId!];r.people.nations[id].offices.assignments!.push({officeId:'Steward',scopeKind:0,scopeId:person.stateId,warSystemKind:0,holderCharacterId:person.id});for(const p of owned)p.controller=other;sync(r);const history=structuredClone(r.chronicle.leaders[id]),people=structuredClone(r.people),money=structuredClone(r.finance.nations[id]);owned[0].controller=id;sync(r);assertRestoration19(r);
  expect(r.people.persons).toEqual(people.persons);expect(r.people.nations[id].leaderId).toBe(person.id);expect(r.people.nations[id].offices).toEqual(people.nations[id].offices);expect(r.chronicle.leaders[id].slice(0,-1)).toEqual(history);expect(r.sovereignty.reigns[r.chronicle.leaders[id].at(-1)!.id]).toBe(person.id);expect(r.sovereignty.restorations[id]).toBe(1);expect(r.finance.nations[id]).toEqual(money);sync(r);expect(r.chronicle.leaders[id]).toHaveLength(2);
 });
 it('does not declare missing or dead people to be alive',()=>{const {r}=fixture(),id=r.world.nations[0].id,person=r.people.persons[r.people.nations[id].leaderId!];person.alive=false;expect(knownRestorationPerson(r,id)).toBeNull();delete r.people.persons[person.id];expect(knownRestorationPerson(r,id)).toBeNull();});
 it('exhausts a real original name pool, restores the historic ID and keeps commands/save usable',async()=>{
  const s=new Restoration19Session();let r=s.execute({type:'create',terrain:terrain(),count:2,relations:'peace',cultures:['Leffathou']}).run as Restoration19Run;
  const parent=r.world.nations[0].id;
  // Explicit stress-fixture population, not a claim that 45 rebellions arise
  // naturally in one day. Real naming, resource debit and commands still run.
  for(const e of r.world.statecraft!.provinces)e.population=100000;
  const culture=originalNamingCulture('Leffathou')!,distinctNames=new Set([...culture.states.values()].map(row=>row!.names![culture.languages.get('Chinese')!]).filter(Boolean)).size;
  while(r.world.nations.length<distinctNames){const p=r.world.provinces.find(p=>p.controller===parent&&r.world.statecraft!.provinces.find(v=>v.provinceId===p.id)!.population>=1000)!;expect(p).toBeTruthy();s.execute({type:'load',run:r});r=s.execute({type:'politics',action:{type:'uprising',nationId:parent,provinceId:p.id},expected:stamp(r)}).run as Restoration19Run;const id=r.world.nations.at(-1)!.id;
   // Controlled historical fixture: transfer its one province and retire its
   // troops. Creation/identity comes from real commands, not mocked name pools.
   transferEconomy(r.world,p.id,id,parent);r.world.provinces.find(v=>v.id===p.id)!.controller=parent;for(const a of r.world.armies)if(a.nationId===id){Object.assign(a,{troops:0,status:'destroyed',route:[],progress:0});delete r.tactics.rounds[a.id];delete r.battles.plans[a.id];}r.battles.engagements=[];sync(r);
  }
  expect(new Set(r.world.nations.map(n=>n.name)).size).toBe(distinctNames);
  const nextProvince=r.world.provinces.find(v=>v.controller===parent&&r.world.statecraft!.provinces.find(p=>p.provinceId===v.id)!.population>=1000)!,chosen=previewRebelIdentity(r,nextProvince.id),id=chosen.existingId!,target=r.world.nations.find(n=>n.id===id)!,rebel=r.world.armies.find(a=>a.id===`rebel-${id}`)!;expect(id).toBeTruthy();const historical=structuredClone(r.chronicle.leaders[id]),person=structuredClone(Object.values(r.people.persons).find(p=>p.nationId===id)!),identity=structuredClone(target),thirdRelations=structuredClone(r.world.statecraft!.relations.filter(v=>(v.a===id||v.b===id)&&v.a!==parent&&v.b!==parent)),money=structuredClone(r.finance.nations[id]);
  // Retain an earlier destroyed rebel record to exercise restoration collision.
  Object.assign(rebel,{troops:0,status:'destroyed',route:[],progress:0});delete r.tactics.rounds[rebel.id];delete r.battles.plans[rebel.id];r.battles.engagements=[];
  s.execute({type:'load',run:r});const before=r,preview={...chronicleView(r),naming:r.naming,culture:r.culture,people:r.people,sovereignty:r.sovereignty,upperCombat:r.upperCombat};expect(previewPolitics(preview,{type:'uprising',nationId:parent,provinceId:nextProvince.id}).reason).toContain(target.name);
  r=s.execute({type:'politics',action:{type:'uprising',nationId:parent,provinceId:nextProvince.id},expected:stamp(r)}).run as Restoration19Run;
  expect(r.world.nations).toHaveLength(distinctNames);expect(r.world.nations.find(n=>n.id===id)).toEqual({...identity,capitalId:r.world.cities.find(c=>c.provinceId===nextProvince.id)!.id});expect(r.people.persons[person.id]).toEqual(person);expect(Object.keys(r.people.persons)).toHaveLength(Object.keys(before.people.persons).length);expect(r.chronicle.leaders[id].slice(0,-1)).toEqual(historical);expect(r.finance.nations[id]).toEqual(money);expect(r.world.statecraft!.relations.filter(v=>(v.a===id||v.b===id)&&v.a!==parent&&v.b!==parent)).toEqual(thirdRelations);expect(r.world.armies.some(a=>a.id===`rebel-${id}-2`)).toBe(true);expect(r.sovereignty.restorations[id]).toBe(1);assertRestoration19(r);
  r=s.execute({type:'action',action:{type:'policy',nationId:id,priority:'civilian'},expected:stamp(r)}).run as Restoration19Run;
  r=s.execute({type:'customize',runId:r.id,edits:[{kind:'nation',id,name:'归来的王国'}],expected:stamp(r)}).run as Restoration19Run;
  const army=r.world.armies.find(a=>a.id===`rebel-${id}-2`)!,targetId=r.world.provinces.find(p=>p.id===army.provinceId)!.neighbors.find(p=>r.world.provinces.find(v=>v.id===p)!.controller===parent)!;
  expect(targetId).toBeTruthy();r=s.execute({type:'battle',action:{type:'attack-route',armyId:army.id,targets:[targetId]},expected:stamp(r)}).run as Restoration19Run;
  r=s.execute({type:'tick',ticks:2,expected:stamp(r)}).run as Restoration19Run;const db=new IDBFactory();await saveRun(r,null,db);expect((await loadRun(db))!.run).toEqual(r);
  expect(()=>s.execute({type:'politics',action:{type:'uprising',nationId:id,provinceId:'missing'},expected:stamp(r)})).toThrow();const baseline=new Restoration19Session();baseline.execute({type:'load',run:r});expect(s.execute({type:'tick',ticks:1,expected:stamp(r)})).toEqual(baseline.execute({type:'tick',ticks:1,expected:stamp(r)}));
 },60000);
 it('rejects wrong province source, corrupted reign mapping and excessive restoration counters',()=>{
  const {r}=fixture(),p=r.world.provinces[0];r.sovereignty.provinces[p.id].mapCultureId=Object.keys(r.culture.maps).find(k=>k!==r.sovereignty.provinces[p.id].mapCultureId)!;expect(()=>assertRestoration19(r)).toThrow();const a=fixture().r;a.sovereignty.restorations[a.world.nations[0].id]=2147483647;expect(()=>assertRestoration19(a)).toThrow();const b=fixture().r;b.sovereignty.reigns[b.chronicle.leaders[b.world.nations[0].id][0].id]=99999;expect(()=>assertRestoration19(b)).toThrow();
 });
 it('future sovereignty in either slot locks writes; damaged current recovers backup and CAS',async()=>{
  for(const key of ['current','backup']){const {r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);await mutate(db,key,v=>Object.assign(v.sovereignty,{future:1}));const before=await slots(db);await expect(loadRun(db)).rejects.toThrow('未来');await expect(saveRun(r,2,db)).rejects.toThrow('未来');expect(await slots(db)).toEqual(before);}
  const {r,s}=fixture(),n=s.execute({type:'tick',ticks:2,expected:stamp(r)}).run as Restoration19Run,db=new IDBFactory();await saveRun(r,null,db);await saveRun(n,1,db);await mutate(db,'current',v=>Object.assign(v,{sovereignty:null}));expect(await loadRun(db)).toMatchObject({run:r,revision:2,recovered:true});await expect(saveRun(n,1,db)).rejects.toThrow('另一窗口');await saveRun(n,2,db);expect((await loadRun(db))!.run).toEqual(n);
 });
 it.each(['top','version','province','rebel','origin','person','name'])('future %s still locks either slot beside unrelated known damage',async field=>{
  for(const key of ['current','backup']){const {r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);await mutate(db,key,v=>{Object.assign(v,{finance:null});if(field==='top')Object.assign(v,{future:1});if(field==='version')Object.assign(v.sovereignty,{version:2});if(field==='province')Object.assign(Object.values(v.sovereignty.provinces)[0],{future:1});if(field==='rebel')Object.assign(v.sovereignty.nativeRebels,{unknown:{future:1}});if(field==='origin')Object.assign(Object.values(v.sovereignty.provinces)[0],{origin:'future'});if(field==='person')Object.assign(Object.values(v.people.persons)[0],{future:1});if(field==='name')Object.assign(Object.values(v.naming.rulers)[0],{future:1});});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow('未来');await expect(saveRun(r,2,db)).rejects.toThrow('未来');expect(await slots(db)).toEqual(before);}
 });
});
