import type {FoundingForces47} from '../fms/play/civilization47-forces';
import {originalCellProvinces} from '../fms/original/original-politics';
import {nativeFilterProvinceCells53} from '../fms/play/native-combat/province-cells53';
import {actualForces47} from '../fms/play/force-runtime47';
import {travelFeatures47} from '../fms/play/civilization47-army-ai';
import {locateTravelCell47} from '../fms/play/army-travel47-graph';
import {forceKey47} from '../fms/play/force-motion47';
import {originalPaths47} from '../fms/play/civilization47-original-army';

/** Static inputs of the army autonomy (civilization47-army-ai issueArmySelection47), by world
 * province index: land neighbours, centre (normalized units), whether any travel cell touches the
 * sea, the travel feature of the centre cell, harbour provinces, the displayed-map border contacts
 * (province-border54: owner province of each outside border cell, −1 sea), each army's home province
 * and legacy anchor province, the nation capitals and the world seed. */
export function armyAiStatic(r:FoundingForces47){
  const w=r.world,index=new Map(w.provinces.map((p,i)=>[p.id,i]));
  const g=actualForces47(r).spatial.graph,features=travelFeatures47(g);
  const featureIds=new Map<string,number>();const feature=(cell:number)=>{const f=features.get(cell)!;if(!featureIds.has(f))featureIds.set(f,featureIds.size);return featureIds.get(f)!;};
  const owners=originalCellProvinces(r.terrain,w.provinces,r.scale);
  const rows=nativeFilterProvinceCells53({province:Array.from(owners,i=>i+1),neighbor:r.terrain.neighbors,height:Array.from(r.terrain.elevations),feature:Array.from(owners,()=>0)},Array(w.provinces.length+1).fill(true));
  return {
    seed:w.custom!.seed,originalPaths:originalPaths47(r),
    provinces:w.provinces.map((p,i)=>{const cell=locateTravelCell47(g,p.center,p.id)!;
      return {neighbors:p.neighbors.map(id=>index.get(id)!),x:p.center.x,y:p.center.y,
        coast:(g.byProvince.get(p.id)??[]).some(id=>g.cells.get(id)!.links.some(l=>g.cells.get(l.to)!.surface==='sea')),
        feature:feature(cell.id),port:r.harbors.sites.some(s=>s.provinceId===p.id),border:rows[i+1]!.borderNeighborCells.map(c=>owners[c])};}),
    /** Travel feature of every travel cell id (same surface connectivity). */
    cellFeatures:[...g.cells.keys()].sort((a,b)=>a-b).map(id=>feature(id)),
    capitals:w.nations.map(n=>{const c=w.cities.find(c=>c.id===n.capitalId);return c?index.get(c.provinceId)!:-1;}),
  };
}

/** Dynamic inputs at one frame boundary. Travel records keep their exact version-1/2 fields. */
export function armyAiSnapshot(r:FoundingForces47){
  const w=r.world,index=new Map(w.provinces.map((p,i)=>[p.id,i])),nation=new Map(w.nations.map((n,i)=>[n.id,i]));
  const held=new Set(r.forceContacts.pairs.flatMap(p=>[p.a,p.b]));
  return {
    tick:r.clock.tick,day:w.day,cursor:r.armyBatch!.cursor,
    owners:w.provinces.map(p=>nation.get(p.controller)!),
    wars:w.statecraft!.relations.filter(p=>p.status==='war').map(p=>[nation.get(p.a)!,nation.get(p.b)!]),
    campaigns:r.nativeWars.campaigns.map(c=>({id:c.id,ended:c.endedTick!==null,internal:!!c.internal,participants:c.participants.map(p=>({nation:nation.get(r.nativeWars.nationIds.find(v=>v[0]===p.stateId)![1])!,side:p.side}))})),
    alliances:r.alliances.records.filter(a=>a.endedTick===null).map(a=>a.members.map(id=>nation.get(id)!)),
    vassals:r.vassals.records.filter(v=>v.endedTick===null).map(v=>[nation.get(v.overlordId)!,nation.get(v.vassalId)!]),
    armies:w.armies.map(a=>{const t=r.armyPositions.records[a.id],row=r.armyAutonomy.armies[a.id];
      return {id:a.id,nation:nation.get(a.nationId)!,troops:a.troops,status:a.status,home:index.get(r.tactics.forces[a.id].homeId)!,anchor:index.get(a.provinceId)??-1,
        manual:r.voyages.manualArmies.includes(a.id),busy:held.has(forceKey47({kind:'army',id:a.id}))||!!r.reorganization.active[a.id],
        engaged:a.status==='fighting'||r.battles.engagements.some(e=>e.armies.includes(a.id))||held.has(forceKey47({kind:'army',id:a.id})),
        travel:{version:t.version,origin:t.origin,destination:t.version===2?t.destination:null,nodes:t.nodes,leg:t.leg,offset:t.offset,crossed:t.crossed,status:t.status},
        row:{target:row.targetId===null?-1:index.get(row.targetId)!,garrison:row.garrisonId===null?-1:index.get(row.garrisonId)!,campaign:row.campaignId??-1,decision:row.decision,nextTick:row.nextTick,issuedTick:row.issuedTick??-1}};}),
  };
}
