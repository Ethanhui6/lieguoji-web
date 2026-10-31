import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {patch,type Run} from './run-view';
import {tryRebel47} from '../fms/play/civilization47-rebellion';
import {actualForces47} from '../fms/play/force-runtime47';
import {locateTravelCell47} from '../fms/play/army-travel47-graph';
import {CULTURES47} from '../fms/play/civilization47-catalog';
import {ROMAN_HOUSES_FEMALE47} from '../fms/play/civilization47-chinese-catalog';
import type {FoundingRun47} from '../fms/play/civilization47-founding';

/** Static geometry and the naval/port ledgers (ported separately) are left out. */
const SKIP=new Set(['terrain','diplomaticGeography','terrainContext','portControl','harbors','maritime','fleetPositions','voyages','navalAutonomy','navalOpening','forceClock','forceContacts','governmentOpening']);
function runView(r:Run){
  const v:Record<string,unknown>={};for(const [k,x] of Object.entries(r))if(!SKIP.has(k))v[k]=x;
  const c=r.chronicle;v.chronicle={...c,entries:c.entries.slice(-4)};
  return structuredClone(v);
}

/** Golden samples for the Swift rebellion success path (tryRebel47 forced): every forty days for
 * three years, a non-capital province of a state in turn rebels on a copy. Inputs are chained. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports uprising golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null,turn=0;const samples:unknown[]=[];let homeCells:Record<string,number>|null=null;
  for(let day=0;day<1100;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%40!==10)continue;
    const r=structuredClone(x.run) as Run&FoundingRun47;
    if(!homeCells){const g=actualForces47(r).spatial.graph;homeCells=Object.fromEntries(r.world.provinces.map(p=>[p.id,locateTravelCell47(g,p.center,p.id)!.id]));}
    const living=r.world.nations.filter(n=>r.world.provinces.filter(p=>p.controller===n.id).length>2),n=living[turn++%living.length];
    const capital=r.world.cities.find(c=>c.id===n.capitalId)?.provinceId,p=r.world.provinces.filter(p=>p.controller===n.id&&p.id!==capital&&r.world.cities.some(c=>c.provinceId===p.id))[turn%3];
    if(!p)continue;
    const input=runView(r);const rebelled=tryRebel47(r,p.id,true);
    samples.push({province:p.id,rebelled,inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,runView(r))});previous=input;
  }
  expect(samples.length).toBeGreaterThan(20);
  const cultures=Object.fromEntries(Object.entries(CULTURES47).map(([id,c])=>[id,{givenMale:c.givenMale,givenFemale:c.givenFemale,houses:c.houses,familyFirst:c.familyFirst,join:c.join,romanFemale:id==='roman'?ROMAN_HOUSES_FEMALE47:null}]));
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/uprising.json',JSON.stringify({homeCells,cultures,samples}));
},3600000);
