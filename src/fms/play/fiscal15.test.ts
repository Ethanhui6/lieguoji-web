import {describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {Fiscal15Session} from './fiscal15-session';
import {Upper14Session} from './upper14-session';
import {assertFiscal15,upper14View,type Fiscal15Run} from './fiscal15-model';
import {initializeFiscal,monthlyArmyFees,chargeReorganizations,reorganizationFee,reconcileFiscal,settleFiscalMonth,provinceIncome} from './fiscal15-state';
import {nativeInitialPopulation} from './native-economy/population';
import {nativeGoldSettlement} from './native-economy/settlement';
import {defaultPoliticalCombat} from './native-combat/upper-efficiency';
import {combatEfficiency} from './fiscal15-rules';
import {combatEfficiency as oldEfficiency} from './upper14-rules';
import {loadRun,saveRun,runStore} from './fiscal15-stores';
import {FISCAL15_DATABASE} from './fiscal15-storage';
import {UPPER14_DATABASE} from './upper14-storage';
import {verifyUpper14Compatibility,fingerprintFiscal15} from '../../../scripts/fms-fiscal15-fingerprint';
import {grid} from './fixture.test-support';
const stamp=(r:Fiscal15Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
const fixture=()=>{const s=new Fiscal15Session(),r=s.execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,relations:'peace'}).run as Fiscal15Run;return{s,r};};
async function access(db:IDBFactory,name:string,write?:(s:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=db.open(name);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',write?'readwrite':'readonly'),s=t.objectStore('saves');write?.(s);const r=s.getAll();let value:unknown[]=[];r.onsuccess=()=>value=r.result;t.oncomplete=()=>{d.close();resolve(value);};t.onerror=()=>reject(t.error);};});}
async function change(db:IDBFactory,key:string,edit:(r:Fiscal15Run)=>void){await access(db,FISCAL15_DATABASE,s=>{const q=s.get(key);q.onsuccess=()=>{edit(q.result.run);s.put(q.result,key);};});}
describe('v15 native fiscal integration and isolated world',()=>{
 it('freezes v14 and binds the complete new numeric/data closure',()=>{verifyUpper14Compatibility();expect(fingerprintFiscal15()).toBe(__FMS_FISCAL15_ENGINE__);expect(__FMS_FISCAL15_ENGINE__).not.toBe(__FMS_UPPER14_ENGINE__);});
 it('uses one deterministic source cell list for actual population/capacity/resources, with initial regular recruitment charged',()=>{
  const {r}=fixture(),b=fixture().r;assertFiscal15(r);expect(r.finance).toEqual(b.finance);
  for(const p of r.world.provinces){const f=r.finance.provinces[p.id],data=r.world.statecraft!.provinces.find(v=>v.provinceId===p.id)!;const capacity=nativeInitialPopulation({cellBiomes:f.cellBiomes,perCellFactor:100,growthRate:1,statePercentage:1,provinceRandom:1,atWarInProvince:false,oldPopulation:0,oldMaxPopulation:0,maxLocked:false}).maxPopulation;expect(f.maxPopulation).toBe(capacity);expect(data.population).toBeLessThanOrEqual(capacity);expect(data.population).toBeGreaterThan(0);expect(data.grain).toBeGreaterThan(0);const recruitment=r.world.armies.filter(a=>r.tactics.forces[a.id].homeId===p.id&&r.tactics.forces[a.id].kind==='regular').reduce((s,a)=>s+Math.round(a.troops/10),0);expect(data.population+recruitment).toBe(data.grain/20);}
 });
 it('copies v14 without altering population, army/history/route or original store, and continues old rules identically',async()=>{
  const source=upper14View(fixture().r),old=new Upper14Session(),s=new Fiscal15Session(),db=new IDBFactory();old.execute({type:'load',run:source});s.execute({type:'load',run:source});const cmd={type:'tick' as const,ticks:3,expected:{day:0,nextEventId:source.world.nextEventId,tick:0}};expect(s.execute(cmd)).toEqual(old.execute(cmd));await saveRun(source,null,db);const slots=await access(db,UPPER14_DATABASE),before=structuredClone(source);const n=s.execute({type:'copy',run:source}).run as Fiscal15Run;expect(n.id).not.toBe(source.id);const view=upper14View(structuredClone(n));view.id=source.id;view.world.custom!.id=source.id;expect(view).toEqual(source);expect(source).toEqual(before);expect(runStore(n)).toBe(17);await saveRun(n,null,db);expect(await access(db,UPPER14_DATABASE)).toEqual(slots);expect((await loadRun(db,16))!.run).toEqual(source);
 });
 it('settles exactly once on day 30 before muster and retains the credit/cache across reload and following tick',async()=>{
  const {s,r}=fixture(),db=new IDBFactory();r.world.day=29;r.clock.tick=3599;const prior=structuredClone(r.finance);s.execute({type:'load',run:r});const n=s.execute({type:'tick',ticks:1,expected:stamp(r)}).run as Fiscal15Run;expect(n.world.day).toBe(30);
  for(const id of Object.keys(prior.nations)){const a=n.finance.nations[id];expect(a.lastMonth).toBe(1);expect(a.ledger!.openingGold).toBe(prior.nations[id].gold);expect(a.ledger!.day).toBe(30);const expected=nativeGoldSettlement({gold:a.ledger!.openingGold,provinceIncome:[a.ledger!.baseIncome],leaderTaxMultiplier:1,centralIncomeMultiplier:1,armyCostGold:a.armyCostGold,goldProductionModifier:defaultPoliticalCombat(n.upperCombat.nations[id].polity).goldProduction,ethnic:'Other'});expect(a.gold).toBe(expected.gold);expect(a.goldBattleModifier).toBe(expected.goldBattleModifier);}
  await saveRun(n,null,db);const saved=(await loadRun(db))!.run as Fiscal15Run;s.execute({type:'load',run:saved});const next=s.execute({type:'tick',ticks:1,expected:stamp(saved)}).run as Fiscal15Run;expect(next.finance).toEqual(saved.finance);const duplicate=structuredClone(next.finance);settleFiscalMonth(next,duplicate);expect(duplicate).toEqual(next.finance);
 });
 it('deducts completed reorganization once, current owner pays, canceled/dead active entries do not charge and cache stays unchanged',()=>{
  const {r}=fixture(),a=r.world.armies[0],owner=r.world.nations[1].id;a.nationId=owner;r.upperCombat.nations[owner].destiny=50;r.finance.nations[owner].gold=-801;r.finance.nations[owner].goldPerMonth=100;const cached=r.finance.nations[owner].goldBattleModifier,before=structuredClone(r.reorganization.completed);r.reorganization.completed[a.id]=1;chargeReorganizations(before,r,r.finance);expect(r.finance.nations[owner].gold).toBe(-826);expect(r.finance.nations[owner].goldBattleModifier).toBe(cached);chargeReorganizations({...r.reorganization.completed},r,r.finance);expect(r.finance.nations[owner].gold).toBe(-826);expect(reorganizationFee(-800,100,50)).toBe(250);expect(reorganizationFee(-2147483648,100,50)).toBe(250);
 });
 it('never treats unknown capital distance as negative fees, maps first province to a positive id, includes peaceful RTS transit',()=>{
  const {r}=fixture(),a=r.world.armies[0],p=r.world.provinces[0];for(const other of r.world.armies)other.status='idle';a.nationId=p.controller;a.provinceId=p.id;a.route=[p.neighbors[0]];a.progress=0;a.status='marching';r.upperCombat.provinces[p.id].distance=5;expect(monthlyArmyFees(r,p.controller).cost).toBe(12);r.upperCombat.provinces[p.id].distance=2147483647;expect(monthlyArmyFees(r,p.controller)).toEqual({cost:0,distanceSuspended:true});
 });
 it('preserves extinct treasury and initializes a truly new political identity only once',()=>{
  const {s,r}=fixture(),p=r.world.provinces.find(p=>!r.world.nations.some(n=>r.world.cities.find(c=>c.id===n.capitalId)?.provinceId===p.id))!;const n=s.execute({type:'politics',action:{type:'independence',nationId:p.controller,provinceId:p.id},expected:stamp(r)}).run as Fiscal15Run;assertFiscal15(n);expect(Object.keys(n.finance.nations)).toHaveLength(r.world.nations.length+1);const before=structuredClone(n.finance);reconcileFiscal(n,n.finance);expect(n.finance).toEqual(before);const victim=n.world.nations[0].id;for(const p of n.world.provinces)if(p.controller===victim)p.controller=n.world.nations[1].id;n.world.day=30;n.finance.nations[victim].gold=-700;const account=structuredClone(n.finance.nations[victim]);settleFiscalMonth(n,n.finance);expect(n.finance.nations[victim]).toEqual(account);
 });
 it('uses the saved fiscal cache in actual combat and preview, rather than recomputing from post-fee gold',()=>{
  const {r}=fixture(),a=r.world.armies[0],p=r.world.provinces.find(p=>p.id===a.provinceId)!,context={...r.terrainContext,upper:r.upperCombat,finance:r.finance};r.finance.nations[a.nationId].gold=-900;r.finance.nations[a.nationId].goldBattleModifier=1.1;const before=combatEfficiency(r.world,a,r.units,p,true,context),old=oldEfficiency(r.world,a,r.units,p,true,context);expect(before).toBeCloseTo(old*1.1,5);r.finance.nations[a.nationId].gold=90000;expect(combatEfficiency(r.world,a,r.units,p,true,context)).toBe(before);r.finance.nations[a.nationId].goldBattleModifier=.9;expect(combatEfficiency(r.world,a,r.units,p,true,context)).toBeLessThan(before);
 });
 it.each(['current','backup'])('locks future finance fields in %s without writing either slot',async key=>{const {r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);await change(db,key,v=>Object.assign(v.finance.nations[v.world.nations[0].id],{future:1}));const before=await access(db,FISCAL15_DATABASE);await expect(loadRun(db)).rejects.toThrow('未来');await expect(saveRun(r,2,db)).rejects.toThrow('未来');expect(await access(db,FISCAL15_DATABASE)).toEqual(before);});
 it('recovers a damaged finance table from backup, enforces CAS, and retains it through a second broken-current sequence',async()=>{const {s,r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);const n=s.execute({type:'tick',ticks:3,expected:stamp(r)}).run;await saveRun(n,1,db);await change(db,'current',v=>Object.assign(v,{finance:null}));expect(await loadRun(db)).toMatchObject({run:r,recovered:true,revision:2});await expect(saveRun(n,1,db)).rejects.toThrow('另一窗口');await saveRun(n,2,db);await change(db,'current',v=>Object.assign(v,{finance:null}));expect(await loadRun(db)).toMatchObject({run:r,recovered:true,revision:3});});
 it.each(['maritime','transports'] as const)('recovers known damaged %s in either slot through two successive saves without weakening CAS',async field=>{
  for(const key of ['current','backup'])for(const damage of ['null','missing','version'] as const){
   const {s,r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);const n=s.execute({type:'tick',ticks:3,expected:stamp(r)}).run;await saveRun(n,1,db);
   const corrupt=(v:Fiscal15Run)=>{const raw=v as unknown as Record<string,unknown>;if(damage==='null')raw[field]=null;else if(damage==='missing')delete raw[field];else delete (raw[field] as Record<string,unknown>).version;};
   await change(db,key,corrupt);const before=await access(db,FISCAL15_DATABASE),chosen=key==='current'?r:n;
   expect(await loadRun(db)).toMatchObject({run:chosen,recovered:key==='current',revision:2});expect(await access(db,FISCAL15_DATABASE)).toEqual(before);
   await expect(saveRun(n,1,db)).rejects.toThrow('另一窗口');expect(await access(db,FISCAL15_DATABASE)).toEqual(before);
   await saveRun(n,2,db);await change(db,'current',corrupt);expect(await loadRun(db)).toMatchObject({run:chosen,recovered:true,revision:3});
   await saveRun(chosen,3,db);await change(db,'current',corrupt);expect(await loadRun(db)).toMatchObject({run:chosen,recovered:true,revision:4});
  }
 });
 it.each(['maritime','transports'] as const)('still locks future %s in either slot when the other component is damaged',async field=>{
  for(const key of ['current','backup'])for(const mutation of ['version','field']){
   const {r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);
   await change(db,key,v=>{Object.assign(v,{[field==='maritime'?'transports':'maritime']:null});Object.assign(v[field],mutation==='version'?{version:2}:{future:true});});
   const before=await access(db,FISCAL15_DATABASE);await expect(loadRun(db)).rejects.toThrow('未知');await expect(saveRun(r,2,db)).rejects.toThrow('未知');expect(await access(db,FISCAL15_DATABASE)).toEqual(before);
  }
 });
 it('initial credits use zero pre-randomized destiny only for new worlds, while explicit copies use their current destiny',()=>{const {r}=fixture(),id=r.world.nations[0].id;expect(r.finance.nations[id].goldPerMonth).toBe(r.upperCombat.nations[id].provinceOrder.reduce((s,p)=>s+provinceIncome(r.world,r.upperCombat,r.finance,p,0),0));const source=upper14View(structuredClone(r)),f=initializeFiscal(source,true);expect(f.nations[id].goldPerMonth).toBe(source.upperCombat.nations[id].provinceOrder.reduce((s,p)=>s+provinceIncome(source.world,source.upperCombat,f,p),0));});
});
