import {describe,it,expect,beforeAll} from 'vitest';
import {nativeLeadership47,nativeNavalCharacter47,nativeLeaderEnemies47,nativeDamageSnapshot47} from './native-combat/personnel47';
import {grid} from './fixture.test-support';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {combatReader47,ownedOccupationCombatReader47} from './civilization47-combat';
import {assertCombatPersonnel47,militaryEnemyIds47,refreshLeaderCombat47,initializedArmyCombat47} from './civilization47-combat-state';
import {actualForces47} from './force-runtime47';
import {beginArmyTravel47} from './army-travel47-state';
import {locateTravelCell47} from './army-travel47-graph';
import {forceKey47} from './force-motion47';
import {advanceCivilizationMilitary47} from './civilization47-military';
import {advanceTacticsOccupation47,advanceOwnedTacticsOccupation47} from './war47-occupation';
import {finishDailyForces47} from './civilization47-upkeep';
import {advanceFamilyCalendar47} from './civilization47-calendar';
import {settleCivilizationDay47} from './civilization47-daily';
import {appointFamilyRuler47,familyHeir47} from './civilization47-succession';
import {populationStamp47} from './civilization47-population-types';
import {personSkills} from './court16-people';

let base:FoundingForces47;
const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()},f=Math.fround;
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),5,60,'war',{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman']});},30000);
function leader(r:FoundingForces47,id:string,skill:number,traits:string[]=[]){const n=r.people.nations[id],p=r.people.persons[n.leaderId!];p.base.military=skill;p.traits=[...traits];r.kin.persons[p.id].base.military=skill;r.kin.persons[p.id].traits=[...traits];}
function neutral(){const r=structuredClone(base);for(const n of r.world.nations){leader(r,n.id,50);r.upperCombat.nations[n.id].polity='Kingdom';r.civilization.nations[n.id].polity='Kingdom';r.upperCombat.nations[n.id].destiny=30;r.destiny.nations[n.id].destiny=30;r.finance.nations[n.id].goldBattleModifier=1;}refreshLeaderCombat47(r,r.combatPersonnel);return r;}
function seaArmy(r:FoundingForces47){const a=r.world.armies[0],g=actualForces47(r).spatial.graph,c=[...g.cells.values()].find(c=>c.surface==='sea')!;r.units={...r.units,[a.id]:'Infantry'};r.armyPositions.records[a.id]=beginArmyTravel47(a.id,[c.id],g);return a;}

describe('recovered character combat kernels',()=>{
  it('keeps central, local, missing family and dead-head branches distinct',()=>{
    expect(nativeLeadership47(100,{kind:'central'})).toBe(f(1+f(50/150)));expect(nativeLeadership47(100,{kind:'local'})).toBe(f(1+f(50/300)));
    expect(nativeLeadership47(100,{kind:'family',exists:false,livingHeadSkill:null,polity:'Kingdom'})).toBe(1);expect(nativeLeadership47(100,{kind:'family',exists:true,livingHeadSkill:null,polity:'Kingdom'})).toBe(f(1+f(50/300)));
    expect(nativeLeadership47(0,{kind:'family',exists:true,livingHeadSkill:100,polity:'Kingdom'})).toBe(f(1+f(f(f(100*f(.6))-50)/150)));expect(nativeLeadership47(0,{kind:'family',exists:true,livingHeadSkill:100,polity:'Empire'})).toBe(f(.8));
  });
  it('adds naval traits in source order, retaining duplicates and negative values without clamp',()=>{
    const t={navalCombatModifier:.3};expect(nativeNavalCharacter47([t,t])).toBe(f(f(.3)+f(.3)));expect(nativeNavalCharacter47([{navalCombatModifier:16777216},{navalCombatModifier:1},{navalCombatModifier:-16777216}])).toBe(0);
    expect(nativeNavalCharacter47([{navalCombatModifier:-2}])).toBe(-2);expect(nativeNavalCharacter47(null)).toBe(0);expect(()=>nativeNavalCharacter47([null])).toThrow();expect(()=>nativeNavalCharacter47([{navalCombatModifier:NaN}])).toThrow();
  });
  it('uses the first nonzero per-enemy trait and clamps only its computed product',()=>{
    expect(nativeLeaderEnemies47([{combatModifierPerEnemy:0},{combatModifierPerEnemy:.05},{combatModifierPerEnemy:-.05}],3)).toBe(f(f(.05)*3));expect(nativeLeaderEnemies47([{combatModifierPerEnemy:-.05},{combatModifierPerEnemy:.05}],20)).toBe(-.5);expect(nativeLeaderEnemies47(null,4)).toBe(0);
  });
  it('separates field and siege base damage without multiplying the 1.25 efficiency twice',()=>{
    expect(nativeDamageSnapshot47([])).toEqual({damageToArmy:40,damageToProvince:10});expect(nativeDamageSnapshot47(['FieldCombatElite'])).toEqual({damageToArmy:60,damageToProvince:10});expect(nativeDamageSnapshot47(['SiegeCapture'])).toEqual({damageToArmy:40,damageToProvince:15});expect(nativeDamageSnapshot47(['FieldCombatElite','SiegeCapture','SiegeCapture'])).toEqual({damageToArmy:60,damageToProvince:15});
  });
});
describe('real47 common personnel combat reader',()=>{
  it('owned occupation matches copied captures and rejects a stale force view or damaged personnel',()=>{
    const r=neutral(),graph=actualForces47(r).spatial.graph,invader=r.world.nations[0].id;
    for(const a of r.world.armies){a.troops=0;a.status='destroyed';}
    const targets=r.world.provinces.filter(p=>p.controller!==invader).slice(0,2);
    const armies=r.world.armies.filter(a=>a.nationId===invader).slice(0,2);expect(armies).toHaveLength(2);
    for(let i=0;i<2;i++){const a=armies[i],p=targets[i],cell=locateTravelCell47(graph,p.center,p.id)!;a.troops=100;a.status='idle';r.armyPositions.records[a.id]=beginArmyTravel47(a.id,[cell.id],graph,p.center);}
    const expected=structuredClone(r),actual=structuredClone(r),terrain=(v:FoundingForces47)=>({...v.terrainContext,upper:v.upperCombat,finance:v.finance});
    const copy=advanceTacticsOccupation47(expected.world,expected.occupation,expected.units,0,new Set(),'takeover',terrain(expected),{...actualForces47(expected).spatial,positions:expected.armyPositions},expected.portControl,w=>combatReader47(expected,w).province);
    const spatial=actualForces47(actual).spatial;
    const owned=advanceOwnedTacticsOccupation47(actual.world,actual.occupation,actual.units,0,new Set(),'takeover',terrain(actual),{...spatial,positions:actual.armyPositions},actual.portControl,()=>ownedOccupationCombatReader47(actual,spatial.space));
    expect(owned).toEqual(copy);expect(actual.upperCombat).toEqual(expected.upperCombat);
    expect(owned.world.provinces.filter(p=>targets.some(t=>t.id===p.id)).every(p=>p.controller===invader)).toBe(true);
    const a=actual.world.armies.find(a=>a.id===armies[0].id)!,p=actual.world.provinces.find(p=>p.id===targets[0].id)!;
    expect(()=>ownedOccupationCombatReader47(actual,actualForces47(r).spatial.space)(a,p)).toThrow(/当前候选/);
    actual.people.persons[actual.people.nations[invader].leaderId!].base.military++;
    expect(()=>ownedOccupationCombatReader47(actual,spatial.space)).toThrow();
  });
  it('reads actual sea geography and the living leader skill without old-anchor terrain',()=>{
    const r=neutral(),a=seaArmy(r),first=combatReader47(r).army(a);expect(first.efficiency).toBe(1.125);expect(first.multiplier).toBe(1);
    const old=r.terrainContext.provinces[a.provinceId];old.mountain=true;old.biomes.fill(0);old.biomes[10]=1;expect(combatReader47(r).army(a)).toEqual(first);
    leader(r,a.nationId,100);expect(combatReader47(r).army(a).efficiency).toBe(1.5);expect(combatReader47(r).army(a).damageToArmy).toBe(40);
  });
  it('uses current alive naval leader traits and independent Maritime economy',()=>{
    const r=neutral(),fleet=r.navy.fleets[0],force=actualForces47(r).forces.find(v=>v.kind==='fleet'&&v.id===fleet.id)!;leader(r,fleet.nationId,0,['NavalMastery']);const value=combatReader47(r).volley.navy(force);expect(value.livingLeaderModifier).toBe(f(.3));
    leader(r,fleet.nationId,100,['NavalMastery']);expect(combatReader47(r).volley.navy(force)).toEqual(value);
    r.civilization.nations[fleet.nationId].cultureId='japanese';r.civilization.nations[fleet.nationId].religionId='catholic';expect(combatReader47(r).volley.navy(force)).toEqual(value);
    r.people.nations[fleet.nationId].leaderId=null;expect(combatReader47(r).volley.navy(force).livingLeaderModifier).toBeNull();
  });
  it('does not recalculate the treasury cache or damage snapshots on each attack or JSON reload',()=>{
    const r=neutral(),a=seaArmy(r),before=combatReader47(r).army(a);r.finance.nations[a.nationId].gold=-99999;r.combatPersonnel.nations[a.nationId].damageTraits=['FieldCombatElite','SiegeCapture'];expect(combatReader47(r).army(a)).toEqual(before);
    const {terrain,...state}=r,reload={...JSON.parse(JSON.stringify(state)),terrain};expect(combatReader47(reload).army(a)).toEqual(before);
    r.combatPersonnel.armies[a.id]=initializedArmyCombat47(a.nationId,0,r.combatPersonnel.nations[a.nationId].damageTraits);expect(combatReader47(r).army(a)).toMatchObject({damageToArmy:60,damageToProvince:15,efficiency:before.efficiency});
  });
  it('deduplicates current opposite participants across wars without reviving historical coalition members',()=>{
    const r=structuredClone(base),war=r.nativeWars.campaigns[0],self=war.participants[0],enemy=war.participants.find(p=>p.side!==self.side)!,ids=new Map(r.nativeWars.nationIds),id=ids.get(self.stateId)!,other=ids.get(enemy.stateId)!;
    r.nativeWars.campaigns=[structuredClone(war),structuredClone(war)];expect(militaryEnemyIds47(r,id)).toEqual([other]);
    r.nativeWars.campaigns[0].participants=r.nativeWars.campaigns[0].participants.filter(p=>p.stateId!==enemy.stateId);r.nativeWars.campaigns[0].coalition={version:1,members:[{...self,role:0,joinedAt:0,isPrimary:true},{...enemy,role:1,joinedAt:0,isPrimary:true}],departures:[{stateId:enemy.stateId,side:enemy.side,tick:0}]};r.nativeWars.campaigns[1].endedTick=0;expect(militaryEnemyIds47(r,id)).toEqual([]);
    r.nativeWars.campaigns[0].participants=[enemy];expect(militaryEnemyIds47(r,id)).toEqual([]);
  });
  it('keeps the cached enemy bonus until explicit state-data refresh, including saved trait provenance',()=>{
    const r=neutral(),a=seaArmy(r);leader(r,a.nationId,50,['BattleHardened']);refreshLeaderCombat47(r,r.combatPersonnel);const snapshot=structuredClone(r.combatPersonnel.nations[a.nationId].leader);expect(snapshot.modifier).toBeGreaterThan(0);const power=combatReader47(r).army(a).efficiency;
    leader(r,a.nationId,50,['WarWeary']);r.nativeWars.campaigns=[];expect(combatReader47(r).army(a).efficiency).toBe(power);expect(r.combatPersonnel.nations[a.nationId].leader).toEqual(snapshot);
    refreshLeaderCombat47(r,r.combatPersonnel);expect(r.combatPersonnel.nations[a.nationId].leader.modifier).toBe(-0);expect(combatReader47(r).army(a).efficiency).toBeLessThan(power);
  });
  it('known-heir appointment changes leadership without re-rolling an army, age, skill or trait',()=>{
    const r=structuredClone(base),nation=r.world.nations[0].id,heir=familyHeir47(r,nation)!,saved=structuredClone(heir),army=r.world.armies.find(a=>a.nationId===nation)!,snapshot=structuredClone(r.combatPersonnel.armies[army.id]);
    const next=appointFamilyRuler47(r,nation,populationStamp47(r));expect(next.people.nations[nation].leaderId).toBe(heir.id);expect(next.kin.persons[heir.id].base).toEqual(saved.base);expect(next.kin.persons[heir.id].birthTime).toBe(saved.birthTime);expect(next.kin.persons[heir.id].traits).toEqual(saved.traits);expect(next.combatPersonnel.armies[army.id]).toEqual(snapshot);
    const projected=next.people.persons[heir.id];expect(personSkills(projected).military).toBeGreaterThanOrEqual(0);expect(combatReader47(next).army(next.world.armies.find(a=>a.id===army.id)!)).toBeDefined();
  });
  it.each(['dead','foreign','projection','cache','selfEnemy','fakePerson','nonRuler','sparseEnemy','sparseTraits','sparseDamage','future'] as const)('rejects %s personnel corruption before military writes',fault=>{
    const r=neutral(),a=r.world.armies[0],id=r.people.nations[a.nationId].leaderId!,cache=r.combatPersonnel.nations[a.nationId].leader;
    if(fault==='dead'){r.kin.persons[id].isAlive=false;r.people.persons[id].alive=false;}if(fault==='foreign')r.kin.persons[id].stateId++;if(fault==='projection')r.people.persons[id].base.military++;if(fault==='cache'){cache.leaderId=null;cache.traitNames=[];cache.enemyIds=[];cache.modifier=.5;}if(fault==='selfEnemy')cache.enemyIds=[a.nationId];if(fault==='fakePerson')cache.leaderId=999999;if(fault==='future')Object.assign(r.combatPersonnel,{future:true});
    if(fault==='nonRuler')cache.leaderId=Object.values(r.kin.persons).find(p=>p.stateId===r.people.nations[a.nationId].id&&!r.people.persons[p.id])!.id;
    if(fault==='sparseEnemy'){cache.traitNames=['BattleHardened'];cache.enemyIds=Array(1);cache.modifier=f(.05);}if(fault==='sparseTraits')cache.traitNames=Array(1);if(fault==='sparseDamage')r.combatPersonnel.nations[a.nationId].damageTraits=Array(1);
    const before=structuredClone(r);expect(()=>advanceCivilizationMilitary47(r,1,weights)).toThrow();expect(r).toEqual(before);
  });
  it('refreshes the cached monthly modifier before autonomous orders and initializes later recruits',()=>{
    const r=structuredClone(base),a=r.world.armies[0];leader(r,a.nationId,50,['BattleHardened']);const old=structuredClone(r.combatPersonnel.nations[a.nationId].leader);r.combatPersonnel.nations[a.nationId].damageTraits=['SiegeCapture'];a.status='destroyed';a.troops=0;
    for(let tick=1;tick<=3600;tick++){r.clock.tick=tick;r.world.day=Math.floor(tick/120)-(tick===3600?1:0);advanceFamilyCalendar47(r,tick,tick===3600);}r.forceClock.now=3600;r.dailyEconomy.lastDay=29;
    const ids=new Set(r.world.armies.map(a=>a.id)),out=settleCivilizationDay47(r,owned=>{expect(owned.combatPersonnel.nations[a.nationId].leader.refreshedTick).toBe(3600);expect(owned.combatPersonnel.nations[a.nationId].leader).not.toEqual(old);return undefined;});
    const newArmies=out.world.armies.filter(b=>b.nationId===a.nationId&&!ids.has(b.id));expect(newArmies.length).toBeGreaterThan(0);expect(newArmies.every(b=>out.combatPersonnel.armies[b.id].damageToProvince===15)).toBe(true);assertCombatPersonnel47(out.combatPersonnel,out.world,3600,out);
  });
  it('uses the same actual-person efficiency for field volleys, resistance attack and defender repair',()=>{
    const r=neutral(),a=r.world.armies[0],b=r.world.armies.find(b=>b.nationId!==a.nationId&&r.world.statecraft!.relations.some(rel=>rel.status==='war'&&[a.nationId,b.nationId].includes(rel.a)&&[a.nationId,b.nationId].includes(rel.b)))!,p=r.world.provinces.find(p=>p.id===b.provinceId)!,graph=actualForces47(r).spatial.graph,cell=locateTravelCell47(graph,p.center,p.id)!;
    for(const army of r.world.armies)if(army.id!==a.id&&army.id!==b.id){army.troops=0;army.status='destroyed';}a.troops=b.troops=50000;r.units={...r.units,[a.id]:'Infantry',[b.id]:'Infantry'};r.armyPositions.records[a.id]=beginArmyTravel47(a.id,[cell.id],graph,p.center);r.tactics.unopposed='resistance';
    const terrain={...r.terrainContext,upper:r.upperCombat,finance:r.finance},spatial={...actualForces47(r).spatial,positions:r.armyPositions};
    const start=advanceTacticsOccupation47(r.world,r.occupation,r.units,0,new Set(),'resistance',terrain,spatial,r.portControl,w=>combatReader47(r,w).province);r.world=start.world;r.occupation=start.occupation;r.occupation.sieges.find(s=>s.provinceId===p.id)!.resistance/=2;finishDailyForces47(r);for(const key of Object.keys(r.forceClock.deadlines))r.forceClock.deadlines[key]=1;
    const lower=advanceCivilizationMilitary47(r,1,weights).run;leader(r,a.nationId,100);const higher=advanceCivilizationMilitary47(r,1,weights).run;
    expect(higher.world.armies.find(v=>v.id===b.id)!.troops).toBeLessThan(lower.world.armies.find(v=>v.id===b.id)!.troops);expect(higher.occupation.sieges.find(s=>s.provinceId===p.id)!.resistance).toBeLessThan(lower.occupation.sieges.find(s=>s.provinceId===p.id)!.resistance);
    const repair=(skill:number)=>{const candidate=structuredClone(r);leader(candidate,b.nationId,skill);return advanceTacticsOccupation47(candidate.world,candidate.occupation,candidate.units,1,new Set([b.id]),'resistance',{...candidate.terrainContext,upper:candidate.upperCombat,finance:candidate.finance},{...actualForces47(candidate).spatial,positions:candidate.armyPositions},candidate.portControl,w=>combatReader47(candidate,w).province).occupation.sieges.find(s=>s.provinceId===p.id)!.resistance;};expect(repair(100)).toBeGreaterThan(repair(50));expect(higher.forceClock.deadlines[forceKey47({kind:'army',id:a.id})]).toBeGreaterThan(1);
  });
});
