import {beforeAll,describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {Culture17Session} from './culture17-session';
import {Court16Session} from './court16-session';
import {assertCulture17,court16View,gameStamp,type Culture17Run} from './culture17-model';
import {type Court16Run} from './court16-model';
import {previewCultureEdit,reconcileCultures,assertCulture} from './culture17-culture';
import {NATIVE_ETHNIC_NAMES} from './native-economy/ethnic-generation';
import {originalCultureWeights} from './native-economy/original-cultures';
import {courtIncome} from './court16-people';
import {settleFiscalMonth,provinceIncome} from './culture17-state';
import {nativeGoldSettlement} from './native-economy/settlement';
import {defaultPoliticalCombat} from './native-combat/upper-efficiency';
import {fingerprintCulture17,verifyCourt16Compatibility} from '../../../scripts/fms-culture17-fingerprint';
import {loadRun,saveRun} from './culture17-stores';
import {CULTURE17_DATABASE} from './culture17-storage';
import {COURT16_DATABASE} from './court16-storage';
import {grid} from './fixture.test-support';
const stamp=(r:Culture17Run|Court16Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
let seed:Culture17Run;
beforeAll(()=>{seed=new Culture17Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,relations:'peace'}).run as Culture17Run;});
const fixture=()=>{const r=structuredClone(seed),s=new Culture17Session();s.execute({type:'load',run:r});return {r,s};};
async function slots(db:IDBFactory,name=CULTURE17_DATABASE,write?:(s:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=db.open(name);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',write?'readwrite':'readonly'),s=t.objectStore('saves');write?.(s);const r=s.getAll();let result:unknown[]=[];r.onsuccess=()=>result=r.result;t.oncomplete=()=>{d.close();resolve(result);};t.onerror=()=>reject(t.error);};q.onerror=()=>reject(q.error);});}
async function mutate(db:IDBFactory,key:string,edit:(r:Culture17Run)=>void){await slots(db,CULTURE17_DATABASE,s=>{const q=s.get(key);q.onsuccess=()=>{edit(q.result.run);s.put(q.result,key);};});}
function expectedCredit(r:Culture17Run,id:string,gold:number,initial=false){const input=courtIncome(r.people,r.world,id),account=r.finance.nations[id];return nativeGoldSettlement({gold,provinceIncome:r.upperCombat.nations[id].provinceOrder.map(p=>provinceIncome(r.world,r.upperCombat,r.finance,p,r.people,r.culture,initial?0:undefined)),leaderTaxMultiplier:input.tax,centralIncomeMultiplier:input.central,armyCostGold:account.armyCostGold,goldProductionModifier:defaultPoliticalCombat(r.upperCombat.nations[id].polity).goldProduction,ethnic:r.culture.nations[id].ethnic});}
describe('v17 persistent culture in production settlement and storage',()=>{
 it('freezes final v16 and chooses a persistent original-weight ethnic before initial credit',()=>{
  verifyCourt16Compatibility();expect(fingerprintCulture17()).toBe(__FMS_CULTURE17_ENGINE__);const {r}=fixture();assertCulture17(r);expect(r.culture.maps['map-eastern'].weights).toEqual([...originalCultureWeights('EasternFantasy')!]);expect(r.culture.initialization).toBe('explicit-eastern-naming-v1');
  for(const n of r.world.nations){expect(NATIVE_ETHNIC_NAMES).toContain(r.culture.nations[n.id].ethnic);expect(r.finance.nations[n.id].gold).toBe(expectedCredit(r,n.id,0,true).gold);}
 });
 it('v16 explicit copy preserves names, people, treasury and old database; old loads keep identical rules',async()=>{
  const source=court16View(fixture().r),db=new IDBFactory(),s=new Culture17Session(),old=new Court16Session();source.world.day=4;source.clock.tick=480;await saveRun(source,null,db);const before=await slots(db,COURT16_DATABASE),snapshot=structuredClone(source),n=s.execute({type:'copy',run:source}).run as Culture17Run;
  expect(n.id).not.toBe(source.id);expect(n.finance).toEqual(source.finance);for(const c of Object.values(n.culture.nations))expect(c).toMatchObject({origin:'explicit-copy',recordedDay:4});const view=court16View(structuredClone(n));view.id=source.id;view.world.custom!.id=source.id;expect(view).toEqual(source);await saveRun(n,null,db);expect(await slots(db,COURT16_DATABASE)).toEqual(before);expect(source).toEqual(snapshot);
  s.execute({type:'load',run:source});old.execute({type:'load',run:source});const c={type:'tick' as const,ticks:2,expected:stamp(source)};expect(s.execute(c)).toEqual(old.execute(c));
 });
 it('preview does not mutate, commit changes dirty stamp but not accrued accounts, and stale confirmation is rejected',()=>{
  const {s,r}=fixture(),nationId=r.world.nations[0].id,ethnic=NATIVE_ETHNIC_NAMES.find(n=>n!==r.culture.nations[nationId].ethnic)!,edit={nationId,ethnic},before=structuredClone(r);expect(previewCultureEdit(r,edit).valid).toBe(true);expect(r).toEqual(before);
  const n=s.execute({type:'culture-edit',edit,expected:stamp(r)}).run as Culture17Run;expect(n.culture.nations[nationId].ethnic).toBe(ethnic);expect(n.finance).toEqual(r.finance);expect(n.people).toEqual(r.people);expect(n.world.nations).toEqual(r.world.nations);expect(n.world.cities).toEqual(r.world.cities);expect(gameStamp(n)).not.toBe(gameStamp(r));expect(()=>s.execute({type:'culture-edit',edit,expected:stamp(r)})).toThrow('时刻');expect(previewCultureEdit(n,edit).valid).toBe(false);
 });
 it.each(NATIVE_ETHNIC_NAMES)('uses real %s resource and treasury rules at next month, exactly once',ethnic=>{
  const {r}=fixture(),id=r.world.nations[0].id;r.culture.nations[id].ethnic=ethnic;for(const pid of r.upperCombat.nations[id].provinceOrder)r.finance.provinces[pid].resources=[{name:'controlled-test-resource',baseValue:400,probability:1,affectedBy:[ethnic]}];
  const base=structuredClone(r);base.culture.nations[id].ethnic=NATIVE_ETHNIC_NAMES.find(n=>n!==ethnic)!;const pid=r.upperCombat.nations[id].provinceOrder[0];expect(provinceIncome(r.world,r.upperCombat,r.finance,pid,r.people,r.culture)).toBeGreaterThan(provinceIncome(base.world,base.upperCombat,base.finance,pid,base.people,base.culture));
  const opening=r.finance.nations[id].gold;r.world.day=30;r.clock.tick=3600;settleFiscalMonth(r,r.finance);const expected=expectedCredit(r,id,opening);expect(r.finance.nations[id].ledger).toMatchObject(expected);expect(r.finance.nations[id]).toMatchObject({gold:expected.gold,goldPerMonth:expected.goldPerMonth,armyCostGold:expected.armyCostGold,goldBattleModifier:expected.goldBattleModifier});const once=structuredClone(r.finance);settleFiscalMonth(r,r.finance);expect(r.finance).toEqual(once);
 });
 it('manual independence establishes culture and one treasury before publication and remains stable on reload',async()=>{
  const {s,r}=fixture(),p=r.world.provinces.find(p=>!r.world.nations.some(n=>r.world.cities.find(c=>c.id===n.capitalId)?.provinceId===p.id))!,n=s.execute({type:'politics',action:{type:'independence',nationId:p.controller,provinceId:p.id},expected:stamp(r)}).run as Culture17Run,id=n.world.nations.at(-1)!.id;assertCulture17(n);expect(n.culture.nations[id]).toMatchObject({origin:'secession',parentId:p.controller,mapCultureId:r.culture.nations[p.controller].mapCultureId});expect(n.finance.nations[id].ledger!.openingGold).toBe(0);expect(n.finance.nations[id].gold).toBe(expectedCredit(n,id,0,true).gold);const db=new IDBFactory();await saveRun(n,null,db);expect((await loadRun(db))!.run).toEqual(n);
 });
 it('extinction and same-ID restoration keep the original ethnic, while unexplained new IDs fail closed',()=>{
  const {r}=fixture(),id=r.world.nations[0].id,other=r.world.nations[1].id,before=structuredClone(r.culture),owned=r.world.provinces.filter(p=>p.controller===id);for(const p of owned)p.controller=other;reconcileCultures(r,r.culture);expect(r.culture).toEqual(before);for(const p of owned)p.controller=id;reconcileCultures(r,r.culture);expect(r.culture).toEqual(before);assertCulture(r.culture,r);r.world.nations.push({...r.world.nations[0],id:'unexplained-new'});expect(()=>reconcileCultures(r,r.culture)).toThrow('可信文化');
 });
 it('monthly autonomous uprising receives culture before its first credit inside the real tick transaction',()=>{
  const {s,r}=fixture(),p=r.world.provinces.find(p=>!r.world.nations.some(n=>r.world.cities.find(c=>c.id===n.capitalId)?.provinceId===p.id))!,parent=p.controller;p.legalOwner=r.world.nations.find(n=>n.id!==parent)!.id;r.chronicle.unrest[p.id].pressure=100;r.world.day=359;r.clock.tick=43199;s.execute({type:'load',run:r});const n=s.execute({type:'tick',ticks:1,expected:stamp(r)}).run as Culture17Run,id=n.world.nations.at(-1)!.id;
  expect(n.world.nations.length).toBe(r.world.nations.length+1);expect(n.culture.nations[id]).toMatchObject({origin:'secession',parentId:parent,recordedDay:360});expect(n.chronicle.entries.some(e=>e.kind==='uprising'&&e.nationIds[1]===id)).toBe(true);expect(n.finance.nations[id].gold).toBe(expectedCredit(n,id,0,true).gold);assertCulture17(n);
 });
 it.each(['top','nation','map','ethnic','base','origin'])('locks future %s in either slot rather than recovering over it',async field=>{
  const {r}=fixture();for(const key of ['current','backup']){const db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);await mutate(db,key,v=>{const c=v.culture,n=c.nations[v.world.nations[0].id],m=c.maps['map-eastern'];if(field==='top')Object.assign(c,{future:1});if(field==='nation')Object.assign(n,{future:1});if(field==='map')Object.assign(m,{future:1});if(field==='ethnic')Object.assign(n,{ethnic:'FutureEthnic'});if(field==='base')Object.assign(m,{baseCultureId:'FutureCulture'});if(field==='origin')Object.assign(n,{origin:'assimilation'});});const before=await slots(db);await expect(loadRun(db)).rejects.toThrow('未来');await expect(saveRun(r,2,db)).rejects.toThrow('未来');expect(await slots(db)).toEqual(before);}
 });
 it('recovers damaged culture through chosen backup twice and enforces revision CAS',async()=>{
  const {s,r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);const n=s.execute({type:'tick',ticks:1,expected:stamp(r)}).run;await saveRun(n,1,db);await mutate(db,'current',r=>Object.assign(r,{culture:null}));expect(await loadRun(db)).toMatchObject({run:r,revision:2,recovered:true});await expect(saveRun(n,1,db)).rejects.toThrow('另一窗口');await saveRun(n,2,db);await mutate(db,'current',r=>Object.assign(r,{culture:null}));expect(await loadRun(db)).toMatchObject({run:r,revision:3,recovered:true});
 });
});
