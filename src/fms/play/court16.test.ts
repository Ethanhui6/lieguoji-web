import {describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {Court16Session} from './court16-session';
import {Fiscal15Session} from './fiscal15-session';
import {assertCourt16,fiscal15View,gameStamp,type Court16Run} from './court16-model';
import {courtIncome,courtHolder,personSkills,previewAppointment} from './court16-people';
import {settleFiscalMonth,provinceIncome} from './court16-state';
import {nativeGoldSettlement} from './native-economy/settlement';
import {defaultPoliticalCombat} from './native-combat/upper-efficiency';
import {fingerprintCourt16,verifyFiscal15Compatibility} from '../../../scripts/fms-court16-fingerprint';
import {loadRun,saveRun} from './court16-stores';
import {COURT16_DATABASE} from './court16-storage';
import {FISCAL15_DATABASE} from './fiscal15-storage';
import {grid} from './fixture.test-support';
const stamp=(r:Court16Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
const fixture=()=>{const s=new Court16Session(),r=s.execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,relations:'peace'}).run as Court16Run;return{s,r};};
async function slots(db:IDBFactory,name=COURT16_DATABASE,write?:(s:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=db.open(name);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',write?'readwrite':'readonly'),s=t.objectStore('saves');write?.(s);const r=s.getAll();let result:unknown[]=[];r.onsuccess=()=>result=r.result;t.oncomplete=()=>{d.close();resolve(result);};t.onerror=()=>reject(t.error);};q.onerror=()=>reject(q.error);});}
async function mutate(db:IDBFactory,key:string,edit:(r:Court16Run)=>void){await slots(db,COURT16_DATABASE,s=>{const q=s.get(key);q.onsuccess=()=>{edit(q.result.run);s.put(q.result,key);};});}
describe('v16 persistent people and fiscal office loop',()=>{
 it('freezes final v15 and creates stable individual skills/traits before first tax credit',()=>{
  verifyFiscal15Compatibility();expect(fingerprintCourt16()).toBe(__FMS_COURT16_ENGINE__);const {r}=fixture(),b=fixture().r;assertCourt16(r);expect(r.people).toEqual(b.people);expect(r.finance).toEqual(b.finance);expect(Object.keys(r.people.persons)).toHaveLength(2);
  for(const n of r.world.nations){const p=r.people.persons[r.people.nations[n.id].leaderId!],input=courtIncome(r.people,r.world,n.id),account=r.finance.nations[n.id];expect(p.name).toBe(r.chronicle.leaders[n.id][0].name);expect(p.traits.length).toBeGreaterThan(0);expect(new Set(Object.values(p.base)).size).toBeGreaterThan(1);const expected=nativeGoldSettlement({gold:0,provinceIncome:r.upperCombat.nations[n.id].provinceOrder.map(id=>provinceIncome(r.world,r.upperCombat,r.finance,id,r.people,0)),leaderTaxMultiplier:input.tax,centralIncomeMultiplier:1,armyCostGold:account.armyCostGold,goldProductionModifier:defaultPoliticalCombat(r.upperCombat.nations[n.id].polity).goldProduction,ethnic:'Other'});expect(account.gold).toBe(expected.gold);}
 });
 it('explicit v15 copy preserves gold/cache/world/history and old database; old loads retain identical rules',async()=>{
  const source=fiscal15View(fixture().r),db=new IDBFactory(),s=new Court16Session(),old=new Fiscal15Session();await saveRun(source,null,db);const before=await slots(db,FISCAL15_DATABASE),snapshot=structuredClone(source);const n=s.execute({type:'copy',run:source}).run as Court16Run;expect(n.id).not.toBe(source.id);expect(n.finance).toEqual(source.finance);const view=fiscal15View(structuredClone(n));view.id=source.id;view.world.custom!.id=source.id;expect(view).toEqual(source);await saveRun(n,null,db);expect(await slots(db,FISCAL15_DATABASE)).toEqual(before);expect(source).toEqual(snapshot);
  s.execute({type:'load',run:source});old.execute({type:'load',run:source});const c={type:'tick' as const,ticks:2,expected:stamp({...n,world:source.world,clock:source.clock})};expect(s.execute(c)).toEqual(old.execute(c));
 });
 it('previews and commits appointment with a changed stamp, no immediate money or retroactive cache change',()=>{
  const {s,r}=fixture(),nationId=r.world.nations[0].id,personId=r.people.nations[nationId].leaderId!,action={nationId,personId,office:'Steward' as const,provinceId:null},before=structuredClone(r);expect(previewAppointment(r,action).valid).toBe(true);expect(r).toEqual(before);const n=s.execute({type:'appointment',action,expected:stamp(r)}).run as Court16Run;expect(courtHolder(n.people,n.world,action)?.id).toBe(personId);expect(n.finance).toEqual(r.finance);expect(gameStamp(n)).not.toBe(gameStamp(r));expect(()=>s.execute({type:'appointment',action,expected:stamp(r)})).toThrow('时刻');const revoked=s.execute({type:'appointment',action:{...action,personId:null},expected:stamp(n)}).run as Court16Run;expect(courtHolder(revoked.people,revoked.world,action)).toBeNull();
 });
 it('rejects foreign/dead people and foreign governor scope without mutating the live transaction',()=>{
  const {s,r}=fixture(),n=r.world.nations[0].id,foreign=r.world.nations[1].id,a={nationId:n,office:'Governor' as const,provinceId:r.world.provinces.find(p=>p.controller===n)!.id,personId:r.people.nations[foreign].leaderId};expect(()=>s.execute({type:'appointment',action:a,expected:stamp(r)})).toThrow('本国');a.personId=r.people.nations[n].leaderId;a.provinceId=r.world.provinces.find(p=>p.controller===foreign)!.id;expect(()=>s.execute({type:'appointment',action:a,expected:stamp(r)})).toThrow('范围');expect(s.execute({type:'load',run:r}).run).toEqual(r);
 });
 it('uses actual person traits and valid central/local holder skills in the next settlement',()=>{
  const {s,r}=fixture(),id=r.world.nations[0].id,pid=r.people.nations[id].leaderId!,p=r.people.persons[pid];p.base={administrative:100,military:100,diplomatic:100,charisma:100};p.traits=['Administrator'];s.execute({type:'load',run:r});let n=r;
  for(const office of ['Chancellor','Steward','Governor'] as const)n=s.execute({type:'appointment',action:{nationId:id,personId:pid,office,provinceId:office==='Governor'?r.upperCombat.nations[id].provinceOrder[0]:null},expected:stamp(n)}).run as Court16Run;
  expect(courtIncome(n.people,n.world,id,r.upperCombat.nations[id].provinceOrder[0])).toEqual({tax:Math.fround(1.15),central:Math.fround(1.12),local:Math.fround(1.08)});const old=n.finance.nations[id].gold;n.world.day=30;n.clock.tick=3600;settleFiscalMonth(n,n.finance);const a=n.finance.nations[id],income=n.upperCombat.nations[id].provinceOrder.map(p=>provinceIncome(n.world,n.upperCombat,n.finance,p,n.people));const expected=nativeGoldSettlement({gold:old,provinceIncome:income,leaderTaxMultiplier:Math.fround(1.15),centralIncomeMultiplier:Math.fround(1.12),armyCostGold:a.armyCostGold,goldProductionModifier:defaultPoliticalCombat(n.upperCombat.nations[id].polity).goldProduction,ethnic:'Other'});expect(a.gold).toBe(expected.gold);expect(a.goldPerMonth).toBe(expected.goldPerMonth);const once=structuredClone(n.finance);settleFiscalMonth(n,n.finance);expect(n.finance).toEqual(once);
 });
 it('retains the living predecessor, assigned office and skills through succession, persistence and exact reload',async()=>{
  const {s,r}=fixture(),id=r.world.nations[0].id,old=r.people.nations[id].leaderId!,a=s.execute({type:'appointment',action:{nationId:id,personId:old,office:'Chancellor',provinceId:null},expected:stamp(r)}).run as Court16Run,n=s.execute({type:'politics',action:{type:'succession',nationId:id,regnalName:'景明'},expected:stamp(a)}).run as Court16Run;
  expect(n.people.nations[id].leaderId).not.toBe(old);expect(n.people.persons[old]).toEqual(r.people.persons[old]);expect(n.people.persons[old].alive).toBe(true);expect(n.finance).toEqual(r.finance);expect(courtHolder(n.people,n.world,{nationId:id,office:'Chancellor',provinceId:null})?.id).toBe(old);expect(personSkills(n.people.persons[old])).toEqual(personSkills(r.people.persons[old]));const db=new IDBFactory();await saveRun(n,null,db);const loaded=(await loadRun(db))!.run;expect(loaded).toEqual(n);expect(new Court16Session().execute({type:'load',run:loaded}).run).toEqual(n);
 });
 it('handles automatic succession at month end in the documented month-before-politics order',()=>{
  const {s,r}=fixture(),id=r.world.nations[0].id,old=r.people.nations[id].leaderId!;r.world.day=29;r.clock.tick=3599;r.chronicle.leaders[id][0].termEndDay=30;s.execute({type:'load',run:r});const n=s.execute({type:'tick',ticks:1,expected:stamp(r)}).run as Court16Run;expect(n.world.day).toBe(30);expect(n.people.nations[id].leaderId).not.toBe(old);expect(n.people.persons[old].alive).toBe(true);expect(n.finance.nations[id].ledger!.day).toBe(30);assertCourt16(n);
 });
 it('new independent identities get one current person and one treasury, without changing old people',()=>{
  const {s,r}=fixture(),p=r.world.provinces.find(p=>!r.world.nations.some(n=>r.world.cities.find(c=>c.id===n.capitalId)?.provinceId===p.id))!,n=s.execute({type:'politics',action:{type:'independence',nationId:p.controller,provinceId:p.id},expected:stamp(r)}).run as Court16Run;assertCourt16(n);expect(Object.keys(n.people.nations)).toHaveLength(3);expect(Object.keys(n.people.persons)).toHaveLength(3);for(const [id,p]of Object.entries(r.people.persons))expect(n.people.persons[id]).toEqual(p);const added=n.world.nations.at(-1)!.id;expect(n.people.nations[added].leaderId).toBeTruthy();expect(n.finance.nations[added].ledger!.openingGold).toBe(0);
 });
 it.each(['current','backup'])('locks future people in %s and does not alter either slot',async key=>{
  const {r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);await mutate(db,key,r=>Object.assign(r.people,{future:true}));const before=await slots(db);await expect(loadRun(db)).rejects.toThrow('未来');await expect(saveRun(r,2,db)).rejects.toThrow('未来');expect(await slots(db)).toEqual(before);
 });
 it('recovers damaged people via chosen backup twice and enforces the revision CAS',async()=>{
  const {s,r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);const n=s.execute({type:'tick',ticks:1,expected:stamp(r)}).run;await saveRun(n,1,db);await mutate(db,'current',r=>Object.assign(r,{people:null}));expect(await loadRun(db)).toMatchObject({run:r,revision:2,recovered:true});await expect(saveRun(n,1,db)).rejects.toThrow('另一窗口');await saveRun(n,2,db);await mutate(db,'current',r=>Object.assign(r,{people:null}));expect(await loadRun(db)).toMatchObject({run:r,revision:3,recovered:true});
 });
 it.each(['officeId','scopeKind','warSystemKind'])('locks unknown appointment %s in both slots rather than recovering over it',async field=>{
  for(const key of ['current','backup']){const {s,r}=fixture(),id=r.world.nations[0].id,n=s.execute({type:'appointment',action:{nationId:id,office:'Steward',personId:r.people.nations[id].leaderId,provinceId:null},expected:stamp(r)}).run as Court16Run,db=new IDBFactory();await saveRun(n,null,db);await saveRun(n,1,db);await mutate(db,key,r=>Object.assign(r.people.nations[id].offices.assignments![0]!,{[field]:field==='officeId'?'DistrictGovernor':99}));const before=await slots(db);await expect(loadRun(db)).rejects.toThrow('未来');await expect(saveRun(n,2,db)).rejects.toThrow('未来');expect(await slots(db)).toEqual(before);}
 });
 it.each(['leaderId','name','family','recordedDay'])('rejects damaged person identity %s without rewriting the matching ruler',field=>{
  const {r}=fixture(),id=r.world.nations[0].id,pid=r.people.nations[id].leaderId!,person=r.people.persons[pid],history=structuredClone(r.chronicle);
  if(field==='leaderId')Object.assign(r.people.nations[id],{leaderId:String(pid)});else Object.assign(person,{[field]:field==='recordedDay'?-1:''});expect(()=>assertCourt16(r)).toThrow('损坏');expect(r.chronicle).toEqual(history);
 });
});
