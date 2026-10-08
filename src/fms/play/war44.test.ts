import {beforeAll,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {War44Session} from './war44-session';
import {War43Session} from './war43-session';
import {assertWar44Run,type War44Run} from './war44-model';
import {blockadedPort44,landAttackMultiplier44,provinceDamage44} from './war44-blockade';
import {advanceCombat,initialBattles} from './war44-battle';
import {advanceTacticsOccupation} from './war44-occupation';
import {combatEfficiency} from './fiscal15-rules';
import {nativeArmyHit} from './native-war/battle-damage';
import {nativePortAttack} from './native-war/port-occupation';
import {settlePorts44,reconcilePorts44} from './war44-ports';
import {combinedFixture44,context44,stamp44,graph44} from './war44.test-support';
import {grid} from './fixture.test-support';
import {saveRun,loadRun} from './war44-stores';
import {verifyWar43Compatibility,FROZEN_WAR43_ENGINE} from '../../../scripts/fms-war44-compat';
let fixture:ReturnType<typeof combinedFixture44>;
beforeAll(()=>{fixture=combinedFixture44();});
const fresh=()=>structuredClone(fixture);
function captured(r:War44Run,id:string){r.portControl.ports[id].occupierId='n-0';r.portControl.ports[id].value=100;}
it('ports require actual distinct valid owners, but not 100% control, fleet presence or matching attacker',()=>{
 const {run:r,provinceId:id}=fresh(),s=r.portControl;expect(blockadedPort44(r.world,s,id)).toBe(false);captured(r,id);s.ports[id].value=0;expect(blockadedPort44(r.world,s,id)).toBe(true);expect(landAttackMultiplier44(r.world,s,id,'n-0')).toBe(2);expect(landAttackMultiplier44(r.world,s,id,'n-3')).toBe(1);expect(landAttackMultiplier44(r.world,s,id,'n-0',false)).toBe(1);
 s.ports[id].occupierId='n-1';expect(landAttackMultiplier44(r.world,s,id,'n-0')).toBe(2);s.ports[id].occupierId='missing';expect(blockadedPort44(r.world,s,id)).toBe(false);expect(blockadedPort44(r.world,s,'missing')).toBe(false);s.ports[id].occupierId='n-0';s.ports[id].landOwnerId='n-2';expect(blockadedPort44(r.world,s,id)).toBe(false);
});
it('on-province attacker deals doubled native raw damage; defenders and road encounters remain unchanged',()=>{
 const {run:r,provinceId:id,attackerId,defenderId}=fresh();captured(r,id);r.world.armies=r.world.armies.filter(a=>[attackerId,defenderId].includes(a.id));
 function battle(ports:boolean,road=false){const w=structuredClone(r.world),p=w.provinces.find(p=>p.id===id)!,q=w.provinces.find(q=>p.neighbors.includes(q.id))!;if(road)for(const a of w.armies){a.route=[q.id];a.progress=.5;a.status='fighting';}const raw:{attacker:string;victim:string;value:number}[]=[];const result=advanceCombat(w,initialBattles(),r.units,1,()=>new Set(w.armies.map(a=>a.id)),context44(r),undefined,(attacker,victim,value)=>raw.push({attacker,victim,value}),undefined,ports?r.portControl:undefined);return {raw,result};}
 const plain=battle(false),boost=battle(true),by=(data:typeof plain,n:string)=>data.raw.find(x=>x.attacker===n)!.value;expect(by(boost,'n-0')).toBe(2*by(plain,'n-0'));expect(by(boost,'n-3')).toBe(by(plain,'n-3'));expect(battle(true,true)).toEqual(battle(false,true));
 const p=r.world.provinces.find(p=>p.id===id)!,a=r.world.armies.find(a=>a.id===attackerId)!;expect(by(boost,'n-0')).toBe(nativeArmyHit(combatEfficiency(r.world,a,r.units,p,true,context44(r)),1,r.units[defenderId]==='Elite',40,2));
 expect(boost.result.world.armies.find(a=>a.id===defenderId)!.troops).toBeLessThan(plain.result.world.armies.find(a=>a.id===defenderId)!.troops);
});
it('siege reductions use the same multiplier, defense repair and empty-city takeover keep their rules',()=>{
 const {run:r,provinceId:id,attackerId,defenderId}=fresh();captured(r,id);r.world.armies=r.world.armies.filter(a=>[attackerId,defenderId].includes(a.id));const p=r.world.provinces.find(p=>p.id===id)!,state={version:1 as const,sieges:[{provinceId:id,controller:'n-3',attacker:'n-0',maximum:100000,resistance:50000,started:0,pulse:0}]};
 const step=(ports:boolean,due:string[])=>advanceTacticsOccupation(r.world,state,r.units,1,new Set(due),'resistance',context44(r),ports?r.portControl:undefined);
 const unblocked=step(false,[attackerId]).occupation.sieges[0].resistance,blocked=step(true,[attackerId]).occupation.sieges[0].resistance,base=10*combatEfficiency(r.world,r.world.armies.find(a=>a.id===attackerId)!,r.units,p,true,context44(r));expect(blocked).toBe(50000-provinceDamage44(base,2));expect(50000-blocked).toBeCloseTo((50000-unblocked)*2,3);expect(step(true,[defenderId])).toEqual(step(false,[defenderId]));
 r.world.armies=r.world.armies.filter(a=>a.id===attackerId);const before=r.world.provinces.filter(p=>p.id!==id).map(p=>p.controller),out=advanceTacticsOccupation(r.world,state,r.units,1,new Set(),'takeover',context44(r),r.portControl);expect(out.world.provinces.find(p=>p.id===id)!.controller).toBe('n-0');expect(out.world.provinces.filter(p=>p.id!==id).map(p=>p.controller)).toEqual(before);
});
it('real capture transition enables the effect; land capture, recapture and peace clear it without an extra saved flag',()=>{
 const {run:r,provinceId:id}=fresh(),p=r.portControl.ports[id];p.value=.01;expect(nativePortAttack(p,'n-0',1,1/40,()=>true)).toBe(true);expect(blockadedPort44(r.world,r.portControl,id)).toBe(true);
 const peace=structuredClone(r);for(const rel of peace.world.statecraft!.relations)if([rel.a,rel.b].includes('n-0')&&[rel.a,rel.b].includes('n-3'))rel.status='peace';settlePorts44(peace,peace.portControl,()=>true);expect(blockadedPort44(peace.world,peace.portControl,id)).toBe(false);
 p.value=.01;expect(nativePortAttack(p,'n-3',1,1/40,()=>true)).toBe(true);expect(blockadedPort44(r.world,r.portControl,id)).toBe(false);captured(r,id);r.world.provinces.find(p=>p.id===id)!.controller='n-0';expect(blockadedPort44(r.world,r.portControl,id)).toBe(false);reconcilePorts44(r,r.portControl,graph44(r));expect(p.occupierId).toBe(p.landOwnerId);
});
it('complete session uses actual saved control for both battle and siege; save/load and CAS resume same next tick',async()=>{
 const {run:r,provinceId:id,defenderId}=fresh(),db=new IDBFactory();captured(r,id);const session=new War44Session();session.execute({type:'load',run:r});const tick=session.execute({type:'tick',ticks:1,expected:stamp44(r)}).run as War44Run;assertWar44Run(tick);expect(tick.world.armies.find(a=>a.id===defenderId)!.troops).toBeLessThan(5000);expect(tick.occupation.sieges.find(s=>s.provinceId===id)).toBeDefined();await saveRun(tick,null,db);const restored=(await loadRun(db))!;expect(restored.run).toEqual(tick);const other=new War44Session();other.execute({type:'load',run:restored.run});expect(other.execute({type:'tick',ticks:12,expected:stamp44(tick)})).toEqual(session.execute({type:'tick',ticks:12,expected:stamp44(tick)}));await saveRun(tick,1,db);await expect(saveRun(tick,1,db)).rejects.toThrow(/另一窗口/);
 const plain=structuredClone(r);plain.portControl.ports[id].occupierId='n-3';const base=new War44Session();base.execute({type:'load',run:plain});const b=base.execute({type:'tick',ticks:1,expected:stamp44(plain)}).run as War44Run;expect(tick.world.armies.find(a=>a.id===defenderId)!.troops).toBeLessThan(b.world.armies.find(a=>a.id===defenderId)!.troops);expect(tick.occupation.sieges.find(s=>s.provinceId===id)!.resistance).toBeLessThan(b.occupation.sieges.find(s=>s.provinceId===id)!.resistance);
});
it('freezes v43, preserves native harbor layout and every ship, leaves its DB unchanged and runs old rules on old loads',async()=>{
 expect(verifyWar43Compatibility()).toBe(FROZEN_WAR43_ENGINE);const previous=new War43Session(),old=previous.execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:5,cityCount:60,relations:'peace'}).run;if(old.version!==43)throw Error('wrong version');const db=new IDBFactory(),s=new War44Session();await saveRun(old,null,db);s.execute({type:'load',run:old});expect(s.execute({type:'step',days:1})).toEqual(previous.execute({type:'step',days:1}));const copy=s.execute({type:'copy',run:old}).run as War44Run;expect(copy.harbors).toEqual(old.harbors);expect(copy.harbors.method).toBe('capital-neighbor-v1');expect(copy.navy).toEqual(old.navy);expect(copy.world.statecraft).toEqual(old.world.statecraft);await saveRun(copy,null,db);expect((await loadRun(db,45))!.run).toEqual(old);expect(copy.id).not.toBe(old.id);
},30000);
