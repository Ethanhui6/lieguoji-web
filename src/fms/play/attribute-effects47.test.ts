import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {beforeAll,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {recordStateTraits47,stateTraitsFor47,type StateTrait47} from './state-traits47';
import {createForce47} from './civilization47-monthly-muster';
import {actualForces47} from './force-runtime47';
import {actualForceSpeed47} from './force-speed47';
import {armyTravelLocation47} from './army-travel47-state';
import {combatReader47} from './civilization47-combat';
import {diplomaticContext46} from './civilization47-declaration';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {settleFiscalMonth47} from './civilization47-fiscal';
import {OFFICE_RULE47,centralIncome47,officeHolder47,type OfficeRun47} from './civilization47-offices';
import {populationStamp47} from './civilization47-population-types';

let base:PoliticalRun47&{stateTraits47:Record<string,StateTrait47[]>};
beforeAll(()=>{base=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:4,cityCount:24,settlementAlgorithm:SETTLEMENT47_ALGORITHM,relations:'peace',families:'original',setup:{mode:'culture-generated',enabled:['chinese','japanese','english','arab']}}).run as typeof base;},30000);

it('initial armies consume their own national traits before the first day',()=>{
 for(const a of base.world.armies){const t=stateTraitsFor47(base,a.nationId);
  expect(base.forceSpeed.armies[a.id].cavalryTradition).toBe(t.includes('CavalryTradition'));
  expect(base.combatPersonnel.armies[a.id].damageToArmy).toBe(t.includes('FieldCombatElite')?60:40);
  expect(base.combatPersonnel.armies[a.id].damageToProvince).toBe(t.includes('SiegeCapture')?15:10);
 }
 for(const n of base.world.nations)expect(base.destiny.nations[n.id].manifest).toBe(base.stateTraits47[n.id].includes('ManifestDestiny'));
});

it('national traits change newly recruited army damage and actual travel speed without rewriting old snapshots',()=>{
 const plain=structuredClone(base),boosted=structuredClone(base),id=base.world.nations[0].id,home=base.world.provinces.find(p=>p.controller===id)!.id;
 plain.stateTraits47[id]=[];boosted.stateTraits47[id]=['CavalryTradition','FieldCombatElite','SiegeCapture'];
 const old=structuredClone(boosted.combatPersonnel.armies);
 for(const r of [plain,boosted]){recordStateTraits47(r);createForce47(r,actualForces47(r).spatial,id,home,'regular');}
 const a=plain.world.armies.at(-1)!,b=boosted.world.armies.at(-1)!;
 expect(combatReader47(plain).army(a).damageToArmy).toBe(40);expect(combatReader47(boosted).army(b).damageToArmy).toBe(60);
 expect(combatReader47(plain).army(a).damageToProvince).toBe(10);expect(combatReader47(boosted).army(b).damageToProvince).toBe(15);
 const speed=(r:typeof base)=>{const f=actualForces47(r),a=f.forces.find(f=>f.id===b.id&&f.kind==='army')!;return actualForceSpeed47(r,a,armyTravelLocation47(a.travel,f.spatial.graph).cell);};
 expect(speed(boosted)).toBeGreaterThan(speed(plain));
 for(const [id,row] of Object.entries(old))expect(boosted.combatPersonnel.armies[id]).toEqual(row);
});

it('manifest refresh is an edge transition, not a daily reroll of its remaining allowance',()=>{
 const r=structuredClone(base),id=r.world.nations[0].id;r.stateTraits47[id]=[];recordStateTraits47(r);
 r.stateTraits47[id]=['ManifestDestiny'];recordStateTraits47(r);const once=structuredClone(r.destiny);
 recordStateTraits47(r);recordStateTraits47(r);expect(r.destiny).toEqual(once);expect(r.destiny.nations[id].manifest).toBe(true);
});

it('declaration context reads Ambitious from the current ruler and clears it after trait removal',()=>{
 const r=structuredClone(base),id=r.world.nations[0].id,pid=r.people.nations[id].leaderId!;
 for(const traits of [['Ambitious'],[]]){r.people.persons[pid].traits=[...traits];r.kin.persons[pid].traits=[...traits];const c=diplomaticContext46(r);expect(c.ambitious(c.states.find(n=>n.nationId===id)!)).toBe(traits.length===1);}
});

// In the original a ruler's administrative skill reaches the treasury only through officials
// (GovernmentOfficeEffects: Chancellor/Steward suitability → central income multiplier) and the
// governance factor of office selection; the tax multiplier itself reads leader traits only.
it('the Steward administrative ability changes the actual monthly treasury credit',()=>{
 const s=new Culture47Session();
 let x=s.create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:4,cityCount:24,settlementAlgorithm:SETTLEMENT47_ALGORITHM,relations:'peace',families:'original',setup:{mode:'culture-generated',enabled:['chinese','japanese','english','arab']}});
 x=s.execute({kind:'enable-offices',rule:OFFICE_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
 const id=x.run.world.nations[0].id;
 x=s.execute({kind:'office-manage',edit:{type:'fill',nationId:id},expected:populationStamp47(x.run)},x.journal.actions.length);
 const run=x.run as unknown as PoliticalRun47&OfficeRun47,stateId=run.people.nations[id].id,steward=officeHolder47(run,id,'Steward',stateId)!;
 expect(steward).not.toBeNull();
 const settle=(skill:number)=>{const r=structuredClone(run);const p=r.kin.persons[steward.id];p.base.administrative=skill;p.traits=[];
  if(r.people.persons[steward.id]){r.people.persons[steward.id].base.administrative=skill;r.people.persons[steward.id].traits=[];}
  r.world.day=30;settleFiscalMonth47(r);return {gold:r.finance.nations[id].gold,central:centralIncome47(r,id)};
 };
 const high=settle(100),low=settle(0);
 expect(high.central).toBeGreaterThan(low.central);
 expect(high.gold).toBeGreaterThan(low.gold);
});
