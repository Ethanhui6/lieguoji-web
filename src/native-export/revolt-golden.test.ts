import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {patch,type Run} from './run-view';
import {startFamilyRebellion47} from '../fms/play/civilization47-nobility-rebellion';
import {startCivilWar47} from '../fms/play/civilization47-nobility-civil-war';
import type {NobilityRun47} from '../fms/play/civilization47-nobility';
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

/** Golden samples for the Swift family rebellions and civil wars (startFamilyRebellion47 / startCivilWar47
 * forced): every forty days for three years on a copy, alternating. Inputs are chained. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports noble revolt golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null,turn=0;const samples:unknown[]=[];let homeCells:Record<string,number>|null=null;
  for(let day=0;day<1100;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%40!==10)continue;
    const r=structuredClone(x.run) as Run&FoundingRun47;
    if(!homeCells){const g=actualForces47(r).spatial.graph;homeCells=Object.fromEntries(r.world.provinces.map(p=>[p.id,locateTravelCell47(g,p.center,p.id)!.id]));}
    const n=(r as unknown as NobilityRun47).nobility!,civil=turn++%2===1;
    const landed=Object.keys(n.families).filter(id=>!n.families[id].ruling&&n.families[id].controlledProvinces.length>0&&r.world.provinces.some(p=>p.controller===n.families[id].nationId));
    if(!landed.length)continue;
    const input=runView(r);let result:string|null;let args:unknown;
    if(civil){const state=n.families[landed[turn%landed.length]].nationId,list=landed.filter(id=>n.families[id].nationId===state);args={state,list};result=startCivilWar47(r as never,state,list);}
    else{const id=landed[turn%landed.length];args={family:id};result=startFamilyRebellion47(r as never,id);}
    samples.push({civil,args,result,inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,runView(r))});previous=input;
  }
  expect(samples.length).toBeGreaterThan(20);
  const cultures=Object.fromEntries(Object.entries(CULTURES47).map(([id,c])=>[id,{givenMale:c.givenMale,givenFemale:c.givenFemale,houses:c.houses,familyFirst:c.familyFirst,join:c.join,romanFemale:id==='roman'?ROMAN_HOUSES_FEMALE47:null}]));
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/revolt.json',JSON.stringify({homeCells,cultures,samples}));
},3600000);
