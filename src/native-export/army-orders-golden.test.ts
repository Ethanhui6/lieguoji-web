import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {patch,type Run} from './run-view';
import {actualForces47} from '../fms/play/force-runtime47';
import {locateTravelCell47} from '../fms/play/army-travel47-graph';
import {actualForceSpeed47} from '../fms/play/force-speed47';
import {advanceMilitaryWindow47} from '../fms/play/force-tick47';
import {combatReader47,ownedOccupationCombatReader47} from '../fms/play/civilization47-combat';
import {recordPoliticalOccupation47} from '../fms/play/civilization47-political-owner';
import {FRAME_TICKS47} from '../fms/play/frame-loop47';
import {issueArmyBatchOrders47} from '../fms/play/civilization47-army-ai';
import {originalCellProvinces} from '../fms/original/original-politics';
import {nativeFilterProvinceCells53} from '../fms/play/native-combat/province-cells53';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';
import type {FoundingForces47} from '../fms/play/civilization47-forces';

/** Static geometry and the port/naval ledgers (ported separately) are left out; the combat reader's
 * terrain and port rows stay. */
const SKIP=new Set(['terrain','terrainContext','portControl','navalAutonomy','navalOpening','governmentOpening']);
function runView(r:Run){
  const v:Record<string,unknown>={};for(const [k,x] of Object.entries(r))if(!SKIP.has(k))v[k]=x;
  const q=r as unknown as FoundingForces47&PoliticalRun47;
  v.diplomaticGeography={water:q.diplomaticGeography.water.map(p=>({id:p.id,faces:p.faces}))};
  v.terrainContext={provinces:q.terrainContext.provinces};v.portControl={ports:q.portControl.ports};
  const c=r.chronicle;v.chronicle={...c,entries:c.entries.slice(-4)};
  return structuredClone(v);
}

/** Golden samples for the Swift per-frame army orders (issueArmyBatchOrders47) on the run: the
 * frame boundaries of every fourth day (reached by the military window without hooks), each
 * frame's five orders applied on a copy. Inputs are chained. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports army orders golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null,homeCells:Record<string,number>|null=null,borders:number[][]|null=null;
  const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
  const samples:unknown[]=[];
  for(let day=0;day<220;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day<40||day%4!==0)continue;
    let r=structuredClone(x.run) as FoundingForces47;
    if(r.navy.fleets.length)throw Error('fleets are not covered by this sample');
    if(!homeCells){const g=actualForces47(r).spatial.graph;homeCells=Object.fromEntries(r.world.provinces.map(p=>[p.id,locateTravelCell47(g,p.center,p.id)!.id]));
      const q=r as unknown as {terrain:Parameters<typeof originalCellProvinces>[0];scale:number},owners=originalCellProvinces(q.terrain,r.world.provinces,q.scale);
      const rows=nativeFilterProvinceCells53({province:Array.from(owners,i=>i+1),neighbor:q.terrain.neighbors,height:Array.from(q.terrain.elevations),feature:Array.from(owners,()=>0)},Array(r.world.provinces.length+1).fill(true));
      borders=r.world.provinces.map((_,i)=>rows[i+1]!.borderNeighborCells.map(c=>owners[c]));}
    for(let f=0;f<6;f++){
      r=advanceMilitaryWindow47(r,FRAME_TICKS47,weights,{speed:actualForceSpeed47,combat:q=>combatReader47(q).volley,occupation:(q,_w,space)=>ownedOccupationCombatReader47(q,space),afterOwnership:recordPoliticalOccupation47,frameTicks:FRAME_TICKS47}).run;
      if(r.clock.tick%120===0)break;
      const input=runView(r as unknown as Run),issued=issueArmyBatchOrders47(r,weights);
      samples.push({issued,inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,runView(r as unknown as Run))});previous=input;
    }
  }
  expect(samples.length).toBeGreaterThan(50);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/army-orders.json',JSON.stringify({homeCells,borders,samples:samples.slice(0,120)}));
},3600000);
