import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {patch,type Run} from './run-view';
import {musterMonth47} from '../fms/play/civilization47-monthly-muster';
import {actualForces47} from '../fms/play/force-runtime47';
import {locateTravelCell47} from '../fms/play/army-travel47-graph';

/** What the muster and new armies read and write on the run. */
function musterView(r:Run){
  const w=r.world,x=r as unknown as Record<string,unknown>;
  return structuredClone({clock:r.clock,life:{gameTime:r.life.gameTime},
    world:{day:w.day,nextEventId:w.nextEventId,events:w.events,custom:{seed:w.custom!.seed},nations:w.nations.map(n=>({id:n.id,name:n.name,capitalId:n.capitalId})),
      provinces:w.provinces.map(p=>({id:p.id,name:p.name,controller:p.controller,legalOwner:p.legalOwner,center:p.center,neighbors:p.neighbors})),cities:w.cities.map(c=>({id:c.id,name:c.name,provinceId:c.provinceId})),
      armies:w.armies,statecraft:{provinces:w.statecraft!.provinces.map(p=>({provinceId:p.provinceId,population:p.population})),relations:w.statecraft!.relations}},
    armyPositions:r.armyPositions,tactics:r.tactics,units:r.units,forceSpeed:{armies:r.forceSpeed.armies},combatPersonnel:r.combatPersonnel,armyAutonomy:{armies:r.armyAutonomy.armies},
    upperCombat:r.upperCombat,destiny:{nations:Object.fromEntries(Object.entries(r.destiny.nations).map(([k,d])=>[k,{destiny:d.destiny}]))},
    people:{nations:Object.fromEntries(Object.entries(r.people.nations).map(([k,v])=>[k,{leaderId:v.leaderId}])),persons:r.people.persons},
    dailyEconomy:r.dailyEconomy,battles:{plans:r.battles.plans},reorganization:{active:r.reorganization.active},stateTraits47:x.stateTraits47??null,
    chronicle:{nextEntryId:r.chronicle.nextEntryId,entries:r.chronicle.entries.slice(-3)}});
}

/** Golden samples for the Swift muster on the run (musterMonth47 with createForce47): every sixteen days
 * for three years, a copy moved to the next month boundary. Inputs are chained. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports run muster golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null;const samples:unknown[]=[];let homeCells:Record<string,number>|null=null;
  for(let day=0;day<1100;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%16!==5)continue;
    const r=structuredClone(x.run) as Run;
    if(r.transports.cargo.length)continue;
    if(!homeCells){const g=actualForces47(r).spatial.graph;homeCells=Object.fromEntries(r.world.provinces.map(p=>[p.id,locateTravelCell47(g,p.center,p.id)!.id]));}
    const month=Math.floor(r.world.day/30)+1;r.world.day=month*30;r.dailyEconomy.lastMusterMonth=month-1;
    const input=musterView(r);musterMonth47(r);
    samples.push({inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,musterView(r))});previous=input;
  }
  expect(samples.length).toBeGreaterThan(40);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/muster-run.json',JSON.stringify({homeCells,samples}));
},3600000);
