import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {patch,type Run} from './run-view';
import {diplomacyStatic} from './diplomacy-state';
import {actualForces47} from '../fms/play/force-runtime47';
import {locateTravelCell47} from '../fms/play/army-travel47-graph';
import {originalCellProvinces} from '../fms/original/original-politics';
import {nativeFilterProvinceCells53} from '../fms/play/native-combat/province-cells53';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';
import type {FoundingForces47} from '../fms/play/civilization47-forces';

/** Static geometry and the naval ledgers (ported separately) are left out; the combat reader's
 * terrain rows, the harbour sites and the port ledger stay (the port ledger is not compared). */
const SKIP=new Set(['terrain','terrainContext','portControl','navalAutonomy','navalOpening','governmentOpening']);
function runView(r:Run){
  const v:Record<string,unknown>={};for(const [k,x] of Object.entries(r))if(!SKIP.has(k))v[k]=x;
  const q=r as unknown as FoundingForces47&PoliticalRun47;
  v.diplomaticGeography={water:q.diplomaticGeography.water.map(p=>({id:p.id,faces:p.faces}))};
  v.terrainContext={provinces:q.terrainContext.provinces};v.portControl={ports:q.portControl.ports};
  const c=r.chronicle;v.chronicle={...c,entries:c.entries.slice(-4)};
  return structuredClone(v);
}

/** Golden whole days for the Swift session (the culture47 session advance of 120 ticks: military
 * frames with calendar, political tick and army orders, the daily settlement and the political
 * step): every other day for 180 days, from the web state at the day boundary. Inputs are chained. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports whole day golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null,homeCells:Record<string,number>|null=null,borders:number[][]|null=null,statics:unknown=null;
  const samples:unknown[]=[];
  for(let day=0;day<190;day++){
    const before=x.run as unknown as FoundingForces47;
    if(!homeCells){const g=actualForces47(before).spatial.graph;homeCells=Object.fromEntries(before.world.provinces.map(p=>[p.id,locateTravelCell47(g,p.center,p.id)!.id]));
      const q=before as unknown as {terrain:Parameters<typeof originalCellProvinces>[0];scale:number},owners=originalCellProvinces(q.terrain,before.world.provinces,q.scale);
      const rows=nativeFilterProvinceCells53({province:Array.from(owners,i=>i+1),neighbor:q.terrain.neighbors,height:Array.from(q.terrain.elevations),feature:Array.from(owners,()=>0)},Array(before.world.provinces.length+1).fill(true));
      borders=before.world.provinces.map((_,i)=>rows[i+1]!.borderNeighborCells.map(c=>owners[c]));}
    const input=day%2===0?runView(before as unknown as Run):null;
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    statics??=diplomacyStatic(x.run as never);
    if(!input)continue;
    if((x.run as unknown as FoundingForces47).navy.fleets.length)throw Error('fleets are not covered by this sample');
    samples.push({inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,runView(x.run as unknown as Run))});previous=input;
  }
  expect(samples.length).toBeGreaterThan(80);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/day.json',JSON.stringify({homeCells,borders,statics,samples:samples.slice(0,90)}));
},3600000);
