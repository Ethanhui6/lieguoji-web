import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {actualForces47} from '../fms/play/force-runtime47';
import {readArmySpace47} from '../fms/play/army-space47';
import {combatReader47} from '../fms/play/civilization47-combat';
import {livingCombatLeader47} from '../fms/play/civilization47-combat-state';
import {militaryLeaderSkill47,officeWars47,type OfficeRun47} from '../fms/play/civilization47-offices';
import {traitProjection,provinceDefense} from '../fms/play/upper14-state';
import {defaultPoliticalCombat} from '../fms/play/native-combat/upper-efficiency';
import {provinceBorderReader54} from '../fms/play/province-border54';
import {unitProfile} from '../fms/play/military-profile';
import type {FoundingForces47} from '../fms/play/civilization47-forces';

type Run=FoundingForces47;
/** The resolved inputs of Army.RecalCombatEfficiency for every living army (the same derivation as
 * civilization47-combat makeReader47), and the reader's own result. */
function efficiencySnapshot(r:Run){
  const w=r.world,{spatial}=actualForces47(r),space=readArmySpace47(w,{...spatial,positions:r.armyPositions}),reader=combatReader47(r),protruding=provinceBorderReader54(r,w);
  return w.armies.filter(a=>space.byArmy.has(a.id)).map(a=>{
    const p=space.byArmy.get(a.id)!.province,state=r.upperCombat.nations[a.nationId],snapshot=r.combatPersonnel.armies[a.id],base=r.upperCombat.armies[a.id];
    const owner=p?r.upperCombat.nations[p.controller]:undefined,defense=p?r.upperCombat.provinces[p.id]:undefined;
    const attacking=!p||p.controller!==a.nationId,traits=traitProjection(state.traits),politics=defaultPoliticalCombat(state.polity),land=p?r.terrainContext.provinces[p.id]:undefined;
    const leader=livingCombatLeader47(r,a.nationId),wars=officeWars47(r as unknown as OfficeRun47,a.nationId),enemy=p&&attacking?p.controller:wars.length===1?wars[0].enemy:undefined;
    const official=militaryLeaderSkill47(r as unknown as OfficeRun47,a.nationId,enemy)??leader?.skills.military??50;
    return {id:a.id,unit:unitProfile(r.units[a.id]).key,command:snapshot.command,official,base:base.base,destiny:state.destiny,leaderModifier:r.combatPersonnel.nations[a.nationId].leader.modifier,
      provinceDefense:p?provinceDefense(r.upperCombat,p.id):1,
      coreDefense:owner&&defense&&defense.distance!==2147483647&&defense.distance<=owner.coreThreshold?traitProjection(owner.traits).CoreDefenseEfficiencyBoost:1,
      politicalAttack:politics.attack,politicalDefense:politics.defense,goldBattleModifier:r.finance.nations[a.nationId].goldBattleModifier,
      attacking,sameNation:!!p&&p.controller===a.nationId,protruding:!!p&&protruding(p.id),wellTrained:!!traits.IsWellTrained,homelandDefense:!!traits.IsHomelandDefense,conqueror:!!traits.IsConqueror,
      biomes:land?.biomes??[],mountain:land?.mountain??false,
      efficiency:reader.army(a).efficiency};
  });
}

/** Golden samples for the Swift combat efficiency: every living army, every 5 days for 300 days. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports combat efficiency golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;const samples:unknown[]=[];
  for(let day=0;day<300;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%5!==0)continue;
    samples.push(...efficiencySnapshot(structuredClone(x.run) as Run));
  }
  expect(samples.length).toBeGreaterThan(500);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/efficiency.json',JSON.stringify({samples}));
},3600000);
