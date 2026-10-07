import {beforeAll,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {War32Session} from './war32-session';
import {War31Session} from './war31-session';
import {war31Wrap} from './war31-model';
import {assertWar32Run,war29View,type War32Run} from './war32-model';
import {initialTribute32,advanceTribute32,quoteTribute32,assertTribute32} from './war32-tribute';
import {releaseVassal32,makeVassal32} from './war32-vassals';
import {nativeTributeAmount,nativeTributePayment} from './native-war/vassal-tribute';
import {tributeFixture32,fixtureDate32} from './war32.test-support';
import {saveRun,loadRun} from './war32-stores';
import {verifyWar31Compatibility,FROZEN_WAR31_ENGINE} from '../../../scripts/fms-war32-compat';
let seed:War32Run;
beforeAll(()=>{seed=tributeFixture32();assertWar32Run(seed);});
const world=()=>structuredClone(seed);
const stamp=(r:War32Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
function step(r:War32Run,days=1){const s=new War32Session();s.execute({type:'load',run:r});return s.execute({type:'step',days}).run as War32Run;}
it('preserves the frozen playable v31 engine',()=>expect(verifyWar31Compatibility()).toBe(FROZEN_WAR31_ENGINE),30000);
it('uses f32 multiplication, half-even rounding and signed integer balances',()=>{
 expect(nativeTributeAmount(100,Math.fround(.3))).toBe(360);expect(nativeTributeAmount(1,.375)).toBe(4);expect(nativeTributeAmount(1,.625)).toBe(8);
 expect(nativeTributePayment({gold:1000,overlordGold:2147483600,goldPerMonth:100,rate:Math.fround(.3),atWar:false})).toEqual({status:'paid',amount:360,gold:640,overlordGold:-2147483336});
 expect(()=>nativeTributeAmount(2147483647,1)).toThrow();
});
it('checks war before out-of-range rounding, and insufficient funds never partially pay',()=>{
 expect(nativeTributePayment({gold:100,overlordGold:50,goldPerMonth:2147483647,rate:1,atWar:true})).toEqual({status:'at-war',amount:null,gold:100,overlordGold:50});
 expect(nativeTributePayment({gold:359,overlordGold:50,goldPerMonth:100,rate:Math.fround(.3),atWar:false})).toEqual({status:'insufficient',amount:360,gold:359,overlordGold:50});
});
it('quotes without mutation and transfers actual treasury balances once on the ISO December date',()=>{
 const r=world(),before=structuredClone(r),v=r.vassals.records[0];expect(quoteTribute32(r,v.vassalId)).toEqual({amount:360,next:{year:1,month:12,day:10}});expect(r).toEqual(before);
 const n=step(r);expect(n.tribute.receipts).toMatchObject([{year:1,dateDay:10,status:'paid',amount:360,openingGold:10000,closingGold:9640,openingOverlordGold:5000,closingOverlordGold:5360}]);expect(n.finance.nations[v.vassalId].gold).toBe(9640);expect(n.finance.nations[v.overlordId].gold).toBe(5360);const same=structuredClone(n);advanceTribute32(n);expect(n).toEqual(same);expect(step(n).tribute.receipts).toEqual(n.tribute.receipts);assertWar32Run(n);
});
it('has one yearly settlement rather than monthly charging',()=>{
 const r=world();fixtureDate32(r,311);const nov=step(r);expect(nov.life.currentDate).toMatchObject({month:11,day:9});expect(nov.tribute.receipts).toHaveLength(0);
 const paid=step(world());fixtureDate32(paid,707);const next=step(paid);expect(next.tribute.receipts.map(e=>e.year)).toEqual([1,2]);expect(next.tribute.nextId).toBe(3);assertWar32Run(next);
});
it.each(['insufficient','at-war'] as const)('records %s instead of a transfer',kind=>{
 const r=world(),v=r.vassals.records[0];if(kind==='insufficient')r.finance.nations[v.vassalId].gold=359;else r.world.statecraft!.relations.find(p=>[p.a,p.b].includes(v.vassalId)&&[p.a,p.b].includes(v.overlordId))!.status='war';
 // Isolated periodic adapter keeps unrelated battle damage out of this test.
 fixtureDate32(r,343);r.tribute.lastDay=342;const a=r.finance.nations[v.vassalId].gold,b=r.finance.nations[v.overlordId].gold;advanceTribute32(r);expect(r.tribute.receipts[0].status).toBe(kind);expect(r.finance.nations[v.vassalId].gold).toBe(a);expect(r.finance.nations[v.overlordId].gold).toBe(b);assertTribute32(r.tribute,r);
});
it('preview cancellation leaves state unchanged; confirmation is revision guarded and disabled years are not backcharged',()=>{
 const r=world(),s=new War32Session();s.execute({type:'load',run:r});const c={type:'tribute-settings' as const,runId:r.id,enabled:false,revision:r.tribute.revision,expected:stamp(r)};
 const off=s.execute(c).run as War32Run;expect(off.finance).toEqual(r.finance);expect(()=>s.execute(c)).toThrow(/变化/);const passed=s.execute({type:'step',days:1}).run as War32Run;expect(passed.tribute.receipts).toHaveLength(0);
 const on=s.execute({...c,enabled:true,revision:passed.tribute.revision,expected:stamp(passed)}).run as War32Run;expect(step(on).tribute.receipts).toHaveLength(0);
});
it('release before due date prevents collection; historical receipts survive later release',()=>{
 const r=world();releaseVassal32(r,r.vassals.records[0].vassalId);expect(step(r).tribute.receipts).toHaveLength(0);
 const paid=step(world());releaseVassal32(paid,paid.vassals.records[0].vassalId);assertWar32Run(paid);expect(paid.tribute.receipts).toHaveLength(1);
});
it('ties the receipt to the correct relation when release and re-vassalization occur on the same tick',()=>{
 const r=world(),v=r.vassals.records[0];releaseVassal32(r,v.vassalId);makeVassal32(r,v.vassalId,v.overlordId,()=>{});r.vassals.records[1].updateDay=10;const n=step(r);expect(n.tribute.receipts[0].relationIndex).toBe(1);assertWar32Run(n);
});
it('aborts failed payment arithmetic without installing a partial treasury or clock',()=>{
 const r=world(),v=r.vassals.records[0];r.finance.nations[v.vassalId].goldPerMonth=2147483647;const s=new War32Session();s.execute({type:'load',run:r});expect(()=>s.execute({type:'step',days:1})).toThrow(/int32/);
 const off=s.execute({type:'tribute-settings',runId:r.id,enabled:false,revision:r.tribute.revision,expected:stamp(r)}).run as War32Run;expect(off.clock).toEqual(r.clock);expect(off.finance).toEqual(r.finance);expect(off.tribute.receipts).toHaveLength(0);
});
it('rejects impossible receipt dates, money and unknown fields',()=>{
 const r=step(world());for(const edit of [(n:War32Run)=>n.tribute.receipts[0].closingGold++,(n:War32Run)=>n.tribute.receipts[0].day--,(n:War32Run)=>Object.assign(n.tribute,{future:1})]){const n=structuredClone(r);edit(n);expect(()=>assertWar32Run(n)).toThrow();}
});
it('explicit copy preserves known v31 history and old execution while starting a separate store without back-tax',async()=>{
 const r=world(),old=war31Wrap(war29View(r),r.diplomaticGeography,r.nativeDiplomacy,r.vassals),before=structuredClone(old),db=new IDBFactory();await saveRun(old,null,db);
 const s=new War32Session();s.execute({type:'load',run:old});const legacy=new War31Session();legacy.execute({type:'load',run:old});expect(s.execute({type:'step',days:1})).toEqual(legacy.execute({type:'step',days:1}));
 const copy=s.execute({type:'copy',run:old}).run as War32Run;expect(copy.id).not.toBe(old.id);expect(copy.vassals).toEqual(old.vassals);expect(copy.nativeDiplomacy).toEqual(old.nativeDiplomacy);expect(copy.tribute).toEqual(initialTribute32(old.world.day));await saveRun(copy,null,db);expect((await loadRun(db,33))!.run).toEqual(before);expect(old).toEqual(before);
});
it('save/reload and competing tabs cannot double-charge or silently overwrite a receipt',async()=>{
 const r=step(world()),db=new IDBFactory();await saveRun(r,null,db);const saved=(await loadRun(db))!;expect(saved.run).toEqual(r);const n=step(saved.run as War32Run);expect(n.tribute.receipts).toEqual(r.tribute.receipts);
 const outcomes=await Promise.allSettled([saveRun(n,1,db),saveRun(r,1,db)]);expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect((await loadRun(db))!.revision).toBe(2);
});
