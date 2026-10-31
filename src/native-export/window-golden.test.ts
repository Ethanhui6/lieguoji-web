import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {actualForces47} from '../fms/play/force-runtime47';
import {readArmySpace47} from '../fms/play/army-space47';
import {actualForceSpeed47} from '../fms/play/force-speed47';
import {advanceMilitaryWindow47} from '../fms/play/force-tick47';
import {combatReader47,ownedOccupationCombatReader47} from '../fms/play/civilization47-combat';
import {livingCombatLeader47} from '../fms/play/civilization47-combat-state';
import {militaryLeaderSkill47,officeWars47,type OfficeRun47} from '../fms/play/civilization47-offices';
import {traitProjection,provinceDefense} from '../fms/play/upper14-state';
import {defaultPoliticalCombat} from '../fms/play/native-combat/upper-efficiency';
import {provinceBorderReader54} from '../fms/play/province-border54';
import {unitProfile} from '../fms/play/military-profile';
import {landAttackMultiplier46} from '../fms/play/war46-blockade';
import {forceKey47} from '../fms/play/force-motion47';
import {resistanceCapacity} from '../fms/play/occupation';
import {originalPaths47,originalReorganization47} from '../fms/play/civilization47-original-army';
import {forceStrength47} from '../fms/play/civilization47-monthly-muster';
import {locateTravelCell47} from '../fms/play/army-travel47-graph';
import {waterRegions47} from '../fms/play/geography-content47';
import {FRAME_TICKS47} from '../fms/play/frame-loop47';
import type {FoundingForces47} from '../fms/play/civilization47-forces';
import type {Province} from '../sim/types';

type Run=FoundingForces47;
const travel=(t:Run['armyPositions']['records'][string])=>({version:t.version,origin:t.origin,destination:t.version===2?t.destination:null,nodes:t.nodes,leg:t.leg,offset:t.offset,crossed:t.crossed,status:t.status});

/** Resolved efficiency inputs of an army as if it stood in province p (null: at sea), the same
 * derivation as civilization47-combat makeReader47, plus the blockade multiplier there. */
function inputsAt(r:Run,a:Run['world']['armies'][number],p:Province|null,protruding:(id:string)=>boolean){
  const state=r.upperCombat.nations[a.nationId],snapshot=r.combatPersonnel.armies[a.id],base=r.upperCombat.armies[a.id];
  const owner=p?r.upperCombat.nations[p.controller]:undefined,defense=p?r.upperCombat.provinces[p.id]:undefined;
  const attacking=!p||p.controller!==a.nationId,traits=traitProjection(state.traits),politics=defaultPoliticalCombat(state.polity),land=p?r.terrainContext.provinces[p.id]:undefined;
  const leader=livingCombatLeader47(r,a.nationId),wars=officeWars47(r as unknown as OfficeRun47,a.nationId),enemy=p&&attacking?p.controller:wars.length===1?wars[0].enemy:undefined;
  const official=militaryLeaderSkill47(r as unknown as OfficeRun47,a.nationId,enemy)??leader?.skills.military??50;
  return {unit:unitProfile(r.units[a.id]).key,command:snapshot.command,official,base:base.base,destiny:state.destiny,leaderModifier:r.combatPersonnel.nations[a.nationId].leader.modifier,
    provinceDefense:p?provinceDefense(r.upperCombat,p.id):1,
    coreDefense:owner&&defense&&defense.distance!==2147483647&&defense.distance<=owner.coreThreshold?traitProjection(owner.traits).CoreDefenseEfficiencyBoost:1,
    politicalAttack:politics.attack,politicalDefense:politics.defense,goldBattleModifier:r.finance.nations[a.nationId].goldBattleModifier,
    attacking,sameNation:!!p&&p.controller===a.nationId,protruding:!!p&&protruding(p.id),wellTrained:!!traits.IsWellTrained,homelandDefense:!!traits.IsHomelandDefense,conqueror:!!traits.IsConqueror,
    biomes:land?.biomes??[],mountain:land?.mountain??false,
    damageToArmy:snapshot.damageToArmy,damageToProvince:snapshot.damageToProvince,multiplier:p?landAttackMultiplier46(r.world,r.portControl,p.id,a.nationId):1};
}

function windowSnapshot(r:Run){
  const w=r.world,nation=new Map(w.nations.map((n,i)=>[n.id,i])),index=new Map(w.provinces.map((p,i)=>[p.id,i]));
  const {forces,spatial}=actualForces47(r),g=spatial.graph,space=readArmySpace47(w,{...spatial,positions:r.armyPositions}),protruding=provinceBorderReader54(r,w);
  const efficiency:Record<string,unknown>={};
  for(const v of space.byArmy.values()){
    const here=v.province,places=here?[here,...here.neighbors.map(id=>w.provinces.find(p=>p.id===id)!)]:[];
    efficiency[`${v.army.id}|-1`]=inputsAt(r,v.army,null,protruding);
    for(const p of places)efficiency[`${v.army.id}|${index.get(p.id)}`]=inputsAt(r,v.army,p,protruding);
  }
  return {
    world:{tick:r.clock.tick,owners:w.provinces.map(p=>nation.get(p.controller)!),
      wars:w.statecraft!.relations.filter(p=>p.status==='war').map(p=>[nation.get(p.a)!,nation.get(p.b)!]),
      alliances:r.alliances.records.filter(a=>a.endedTick===null).map(a=>a.members.map(id=>nation.get(id)!)),
      vassals:r.vassals.records.filter(v=>v.endedTick===null).map(v=>[nation.get(v.overlordId)!,nation.get(v.vassalId)!]),
      forces:forces.map(f=>{const a=w.armies.find(a=>a.id===f.id)!;
        return {key:forceKey47(f),kind:f.kind,id:f.id,nation:nation.get(f.nationId)!,withdrawing:f.withdrawing,travel:travel(f.travel),
          base:r.forceSpeed.armies[a.id].base,unitSpeed:unitProfile(r.units[a.id]).speed,elite:r.units[a.id]==='Elite',
          anchor:originalPaths47(r)?index.get(a.provinceId)??-1:-1,status:a.status,allowSea:!r.reorganization.active[a.id],
          troops:a.troops,morale:a.morale,hull:0,crew:0,ships:0,carry:r.forceDamage.carry[forceKey47(f)]??0,losses:r.forceDamage.losses[forceKey47(f)]??0};}),
      contacts:r.forceContacts.pairs.map(c=>({a:c.a,b:c.b,cellA:c.cellA,cellB:c.cellB,pointA:c.pointA,pointB:c.pointB,area:c.area}))},
    clock:{secondsPerTick:r.forceClock.secondsPerTick,now:r.forceClock.now,rng:r.forceClock.rng,draws:r.forceClock.draws,deadlines:Object.entries(r.forceClock.deadlines).sort((a,b)=>a[0]<b[0]?-1:1)},
    sieges:r.occupation.sieges.map(s=>({province:index.get(s.provinceId)!,controller:nation.get(s.controller)!,attacker:nation.get(s.attacker)!,maximum:s.maximum,resistance:s.resistance,started:s.started,pulse:s.pulse})),
    reorganize:originalReorganization47(r),
    homes:w.armies.filter(a=>space.byArmy.has(a.id)).map(a=>{const force=r.tactics.forces[a.id],home=force?w.provinces.find(p=>p.id===force.homeId):undefined;
      return {key:forceKey47({kind:'army',id:a.id}),emergency:force?.kind==='emergency',home:home?index.get(home.id)!:-1,homeCell:home?locateTravelCell47(g,home.center,home.id)?.id??-1:-1,homeX:home?.center.x??0,homeY:home?.center.y??0,full:home?forceStrength47(r,home.id):0};}),
    efficiency,
  };
}

/** Golden samples for the Swift military window (force-tick47 advanceMilitaryWindow47 with the real
 * speed, combat and occupation readers, no daily hooks): one frame from a frame boundary, every
 * other day of a war. Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports military window golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;
  const r0=x.run as Run,regions=waterRegions47(r0.diplomaticGeography);
  const statics={provinceIds:r0.world.provinces.map(p=>p.id),nationIds:r0.world.nations.map(n=>n.id),secondsPerTick:r0.forceClock.secondsPerTick,frameTicks:FRAME_TICKS47,
    seaRegions:[...regions].sort((a,b)=>a[0]-b[0]),capacity:r0.world.provinces.map(p=>resistanceCapacity(r0.world,p)),neighbors:r0.world.provinces.map(p=>p.neighbors.map(id=>r0.world.provinces.findIndex(q=>q.id===id))),unopposed:r0.tactics.unopposed};
  const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
  const samples:unknown[]=[];
  for(let day=0;day<220;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day<60||day%8!==0)continue;
    const r=structuredClone(x.run) as Run;
    if(r.navy.fleets.length)throw Error('fleets are not covered by this sample');
    const input=windowSnapshot(r);
    const out=advanceMilitaryWindow47(r,FRAME_TICKS47,weights,{speed:actualForceSpeed47,combat:q=>combatReader47(q).volley,occupation:(q,_w,space)=>ownedOccupationCombatReader47(q,space),frameTicks:FRAME_TICKS47});
    const after=windowSnapshot(out.run);
    samples.push({input,output:{world:after.world,clock:after.clock,sieges:after.sieges,volleys:out.volleys}});
  }
  expect(samples.length).toBeGreaterThan(10);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/window.json',JSON.stringify({statics,samples}));
},3600000);
