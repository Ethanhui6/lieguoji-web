import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {actualForces47} from '../fms/play/force-runtime47';
import {readArmySpace47} from '../fms/play/army-space47';
import {advanceOwnedTacticsOccupation47} from '../fms/play/war47-occupation';
import {ownedOccupationCombatReader47} from '../fms/play/civilization47-combat';
import {resistanceCapacity} from '../fms/play/occupation';
import {landAttackMultiplier46} from '../fms/play/war46-blockade';
import type {FoundingForces47} from '../fms/play/civilization47-forces';

type Run=FoundingForces47;
/** Occupation inputs at one moment: controllers, the armies on land with their province combat
 * values (civilization47-combat province reader), sieges and resistance capacities. */
function occupationSnapshot(r:Run){
  const w=r.world,nation=new Map(w.nations.map((n,i)=>[n.id,i])),index=new Map(w.provinces.map((p,i)=>[p.id,i]));
  const {spatial}=actualForces47(r),space=readArmySpace47(w,{...spatial,positions:r.armyPositions}),reader=ownedOccupationCombatReader47(r,space);
  return {
    tick:r.clock.tick,nationIds:w.nations.map(n=>n.id),
    owners:w.provinces.map(p=>nation.get(p.controller)!),
    wars:w.statecraft!.relations.filter(p=>p.status==='war').map(p=>[nation.get(p.a)!,nation.get(p.b)!]),
    armies:[...space.byArmy.values()].map(v=>{const c=v.province?reader(v.army,v.province):null;
      return {id:v.army.id,nation:nation.get(v.army.nationId)!,province:v.province?index.get(v.province.id)!:-1,status:v.army.status,
        efficiency:c?.efficiency??0,damageToProvince:c?.damageToProvince??0,multiplier:v.province?landAttackMultiplier46(w,r.portControl,v.province.id,v.army.nationId):1};}),
    sieges:r.occupation.sieges.map(s=>({province:index.get(s.provinceId)!,controller:nation.get(s.controller)!,attacker:nation.get(s.attacker)!,maximum:s.maximum,resistance:s.resistance,started:s.started,pulse:s.pulse})),
    capacity:w.provinces.map(p=>resistanceCapacity(w,p)),
    unopposed:r.tactics.unopposed,
  };
}

/** Golden samples for the Swift occupation port: a web world at war; every other day for 200 days,
 * one occupation pass (advanceOwnedTacticsOccupation47) on a copy, with every army due. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports occupation golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;
  const samples:unknown[]=[];
  for(let day=0;day<260;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day<40||day%2!==0)continue;
    const r=structuredClone(x.run) as Run;
    const input=occupationSnapshot(r);
    if(!input.sieges.length&&!input.armies.some(a=>a.province>=0&&a.status!=='retreating'&&input.wars.some(p=>p.includes(a.nation)&&p.includes(input.owners[a.province])&&a.nation!==input.owners[a.province])))continue;
    const {spatial}=actualForces47(r),space=readArmySpace47(r.world,{...spatial,positions:r.armyPositions});
    const due=new Set(r.world.armies.filter(a=>a.troops>0&&a.status!=='destroyed').map(a=>a.id)),captures:[number,string|null][]=[];
    const index=new Map(r.world.provinces.map((p,i)=>[p.id,i]));
    const out=advanceOwnedTacticsOccupation47(r.world,r.occupation,r.units,r.clock.tick,due,r.tactics.unopposed,{...r.terrainContext,upper:r.upperCombat,finance:r.finance} as never,{...spatial,positions:r.armyPositions},r.portControl,()=>ownedOccupationCombatReader47(r,space),(p,a)=>captures.push([index.get(p)!,a]));
    r.world=out.world;r.occupation=out.occupation;
    const nation=new Map(r.world.nations.map((n,i)=>[n.id,i]));
    samples.push({input,due:[...due],output:{owners:r.world.provinces.map(p=>nation.get(p.controller)!),captures,
      sieges:r.occupation.sieges.map(s=>({province:index.get(s.provinceId)!,controller:nation.get(s.controller)!,attacker:nation.get(s.attacker)!,maximum:s.maximum,resistance:s.resistance,started:s.started,pulse:s.pulse}))}});
  }
  expect(samples.length).toBeGreaterThan(20);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/occupation.json',JSON.stringify({samples}));
},3600000);
