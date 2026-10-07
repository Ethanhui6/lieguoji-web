import {beforeAll,describe,expect,it} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {War28Session} from './war28-session';
import {type War28Run,assertWar28Run} from './war28-model';
import {settleWar28} from './war28-settlement';
import {WAR28_LOSS_THRESHOLD} from './war28-policy';
import {provinceNumber,stateNumber} from './war28-state';
import {reconcileUpper} from './upper14-state';
import {grid} from './fixture.test-support';
import {loadRun,saveRun} from './war28-stores';
import {WAR28_DATABASE} from './war28-storage';
import {nativeReparationAmount} from './native-war/settlement-effects';
let seed:War28Run;
const stamp=(r:War28Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
beforeAll(()=>{seed=new War28Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace'}).run as War28Run;});
function fixture(){const s=new War28Session();s.execute({type:'load',run:seed});const [a,b,third]=seed.world.nations.map(n=>n.id);const r=s.execute({type:'action',action:{type:'declare-war',nationId:a,targetNationId:b},expected:stamp(seed)}).run as War28Run;return {s,r,a,b,third,c:r.nativeWars.campaigns[0]};}
function occupy(r:War28Run,a:string,b:string,count:number){const taken=r.world.provinces.filter(p=>p.controller===b).slice(0,count);for(const p of taken)p.controller=a;reconcileUpper(r,r.upperCombat);return taken;}
const stopArmies=(r:War28Run)=>{for(const a of r.world.armies)Object.assign(a,{troops:0,status:'destroyed',route:[],progress:0});};
describe('v28 real goals, settlements and candidate transactions',()=>{
 it('uses all six recovered polity thresholds',()=>expect(Object.values(WAR28_LOSS_THRESHOLD)).toEqual([.5,Math.fround(.45),Math.fround(.55),.5,Math.fround(.6),.5]));
 it('real declaration freezes nonempty goals with stable IDs and real attacker side',()=>{const {r,a,b,c}=fixture();expect(c.goals.length).toBeGreaterThan(0);for(const g of c.goals){expect(g.addedBy).toBe(stateNumber(r,a));expect(g.target).toBe(stateNumber(r,b));expect(g.scope?.provinceIds?.every(id=>c.initialOwners.some(([p,owner])=>p===id&&owner===stateNumber(r,b)))).toBe(true);}assertWar28Run(r);});
 it('rejects self-target and unknown-field peace without ending another war',()=>{const {s,r,a,b}=fixture();for(const action of [{type:'make-peace',nationId:a,targetNationId:a},{type:'make-peace',nationId:a,targetNationId:b,unexpected:true}])expect(()=>s.execute({type:'action',action:action as never,expected:stamp(r)})).toThrow();const n=s.execute({type:'voyage-auto',nationId:a,enabled:false,expected:stamp(r)}).run as War28Run;expect(n.nativeWars).toEqual(r.nativeWars);expect(n.world).toEqual(r.world);});
 it('manual peace records reason 11 without fees or cessions',()=>{const {s,r,a,b}=fixture();const before=structuredClone(r.finance),n=s.execute({type:'action',action:{type:'make-peace',nationId:a,targetNationId:b},expected:stamp(r)}).run as War28Run;expect(n.nativeWars.campaigns[0].settlement).toMatchObject({reason:11,transfers:[],effects:[],confirmedOwnership:[]});expect(n.finance).toEqual(before);assertWar28Run(n);});
 it('annexation at exact day boundary reconciles extinction before installing, independent of batches',()=>{
  const {r,a,b,c}=fixture();stopArmies(r);occupy(r,a,b,r.world.provinces.filter(p=>p.controller===b).length-1);c.goals=[{id:1,type:3,addedBy:stateNumber(r,a),target:stateNumber(r,b),beneficiary:stateNumber(r,a),scope:null}];
  const one=new War28Session(),split=new War28Session();one.execute({type:'load',run:r});split.execute({type:'load',run:r});const whole=one.execute({type:'tick',ticks:120,expected:stamp(r)}).run as War28Run;let parts=r;for(let i=0;i<3;i++)parts=split.execute({type:'tick',ticks:40,expected:stamp(parts)}).run as War28Run;
  expect(parts).toEqual(whole);expect(whole.world.provinces.some(p=>p.controller===b)).toBe(false);expect(whole.chronicle.ended[b]).toBe(1);expect(whole.people.nations[b].leaderId).toBeNull();expect(whole.nativeWars.campaigns[0].settlement?.reason).toBe(2);assertWar28Run(whole);
 });
 it('actual indemnity and already occupied legal ownership survive save/reload without double execution',async()=>{
  const {r,a,b,c}=fixture(),[p]=occupy(r,a,b,1),aid=stateNumber(r,a),bid=stateNumber(r,b);c.goals=[{id:1,type:6,addedBy:aid,target:bid,beneficiary:aid,scope:{provinceIds:[provinceNumber(r.nativeWars,p.id)],requiredCount:1}}];const amount=nativeReparationAmount(r.finance.nations[b].gold,r.finance.nations[b].goldPerMonth),before=r.finance.nations[a].gold;
  expect(settleWar28(r,c,0)).toBe(true);expect(r.finance.nations[a].gold).toBe((before+amount)|0);expect(p.legalOwner).toBe(a);expect(c.settlement?.effects[0].status).toBe(0);assertWar28Run(r);const db=new IDBFactory();await saveRun(r,null,db);const loaded=(await loadRun(db))!.run as War28Run;expect(settleWar28(loaded,loaded.nativeWars.campaigns[0],0)).toBe(false);expect(loaded).toEqual(r);await saveRun(loaded,1,db);expect((await loadRun(db))!.run).toEqual(r);
 });
 it.each([false,true])('preserves a third nation legal claim when target already occupied=%s',already=>{
  const {r,a,b,third,c}=fixture(),p=r.world.provinces.find(p=>p.controller===b)!;p.legalOwner=third;if(already)p.controller=a;reconcileUpper(r,r.upperCombat);c.goals=[{id:1,type:1,addedBy:stateNumber(r,a),target:stateNumber(r,b),beneficiary:stateNumber(r,a),scope:{provinceIds:[provinceNumber(r.nativeWars,p.id)],requiredCount:0}}];settleWar28(r,c,0);expect(r.world.provinces.find(x=>x.id===p.id)!.legalOwner).toBe(third);expect(r.world.provinces.find(x=>x.id===p.id)!.controller).toBe(a);
 });
 it('withdraws the correct governor after province array reorder',()=>{
  const {r,a,b,c}=fixture(),[p,other]=r.world.provinces.filter(p=>p.controller===b);r.world.provinces.reverse();const office=r.people.nations[b].offices,person=r.people.nations[b].leaderId!;const targetIndex=r.world.provinces.indexOf(p)+1,otherIndex=r.world.provinces.indexOf(other)+1;office.assignments=[targetIndex,otherIndex].map(scopeId=>({officeId:'Governor',scopeKind:1,scopeId,warSystemKind:0,holderCharacterId:person}));c.goals=[{id:1,type:1,addedBy:stateNumber(r,a),target:stateNumber(r,b),beneficiary:stateNumber(r,a),scope:{provinceIds:[provinceNumber(r.nativeWars,p.id)],requiredCount:0}}];settleWar28(r,c,0);expect(office.assignments?.map(x=>x?.scopeId)).toEqual([otherIndex]);
 });
 it.each(['current','backup'])('locks future settlement enums in %s without fallback or overwrite',async slot=>{
  const {r,c}=fixture();settleWar28(r,c,11);const db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);
  const read=()=>new Promise<unknown[]>((resolve,reject)=>{const q=db.open(WAR28_DATABASE);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves'),req=t.objectStore('saves').getAll();t.oncomplete=()=>{resolve(req.result);d.close();};};q.onerror=()=>reject(q.error);});
  await new Promise<void>((resolve,reject)=>{const q=db.open(WAR28_DATABASE);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves','readwrite'),s=t.objectStore('saves'),get=s.get(slot);get.onsuccess=()=>{get.result.run.nativeWars.campaigns[0].settlement.effects=[{sourceGoalId:1,type:12,beneficiary:1,target:2,status:0,reason:null}];s.put(get.result,slot);};t.oncomplete=()=>{d.close();resolve();};t.onabort=()=>reject(t.error);};});
  const before=await read();await expect(loadRun(db)).rejects.toThrow(/未来|未知/);await expect(saveRun(r,2,db)).rejects.toThrow(/未来|未知/);expect(await read()).toEqual(before);
 });
});
