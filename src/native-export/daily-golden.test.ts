import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {patch,type Run} from './run-view';
import {advanceCivilizationMilitary47} from '../fms/play/civilization47-military';
import {settleCivilizationDay47} from '../fms/play/civilization47-daily';
import {recordPoliticalOccupation47,finishPoliticalTick47} from '../fms/play/civilization47-political-owner';
import {actualForces47} from '../fms/play/force-runtime47';
import {locateTravelCell47} from '../fms/play/army-travel47-graph';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';

/** Static geometry and the port/naval ledgers (ported separately) are left out. */
const SKIP=new Set(['terrain','terrainContext','portControl','harbors','navalAutonomy','navalOpening','governmentOpening']);
function runView(r:Run){
  const v:Record<string,unknown>={};for(const [k,x] of Object.entries(r))if(!SKIP.has(k))v[k]=x;
  v.diplomaticGeography={water:(r as unknown as PoliticalRun47).diplomaticGeography.water.map(p=>({id:p.id,faces:p.faces}))};
  const c=r.chronicle;v.chronicle={...c,entries:c.entries.slice(-4)};
  return structuredClone(v);
}

/** Golden samples for the Swift daily settlement (settleCivilizationDay47 without autonomous orders):
 * every seventh day for three years, the web world's pending day boundary is settled on a copy. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports daily golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null;const samples:unknown[]=[];let homeCells:Record<string,number>|null=null;
  const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
  for(let day=0;day<1100;day++){
    const before=x.run as Run&PoliticalRun47;
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%7!==3)continue;
    if(!homeCells){const g=actualForces47(before).spatial.graph;homeCells=Object.fromEntries(before.world.provinces.map(p=>[p.id,locateTravelCell47(g,p.center,p.id)!.id]));}
    const out=advanceCivilizationMilitary47(structuredClone(before),120-before.clock.tick%120,weights,recordPoliticalOccupation47,finishPoliticalTick47);
    if(!out.dailyPending)continue;
    const r=out.run,input=runView(r),settled=settleCivilizationDay47(r,()=>undefined);
    samples.push({inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,runView(settled))});previous=input;
  }
  expect(samples.length).toBeGreaterThan(50);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/daily.json',JSON.stringify({homeCells,samples:samples.slice(0,60)}));
},3600000);
