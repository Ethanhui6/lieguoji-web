import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {actualForces47,advanceOwnedActualForces47} from '../fms/play/force-runtime47';
import {actualForceSpeed47} from '../fms/play/force-speed47';
import {waterRegions47} from '../fms/play/geography-content47';
import {forceKey47} from '../fms/play/force-motion47';
import {applyAccountedVolley47} from '../fms/play/force-accounting47';
import {combatReader47} from '../fms/play/civilization47-combat';
import {unitProfile} from '../fms/play/military-profile';
import {originalPaths47,originalReorganization47} from '../fms/play/civilization47-original-army';
import {forceStrength47} from '../fms/play/civilization47-monthly-muster';
import {locateTravelCell47} from '../fms/play/army-travel47-graph';
import {FRAME_TICKS47} from '../fms/play/frame-loop47';
import {economicEthnic47} from '../fms/play/civilization47-economy';
import type {FoundingForces47} from '../fms/play/civilization47-forces';

type Run=FoundingForces47;
const travel=(t:Run['armyPositions']['records'][string])=>({version:t.version,origin:t.origin,destination:t.version===2?t.destination:null,nodes:t.nodes,leg:t.leg,offset:t.offset,crossed:t.crossed,status:t.status});

/** Everything the shared motion phase and a volley read, at one moment of a web run. */
function forceSnapshot(r:Run){
  const w=r.world,nation=new Map(w.nations.map((n,i)=>[n.id,i])),index=new Map(w.provinces.map((p,i)=>[p.id,i]));
  const {forces}=actualForces47(r);
  return {
    tick:r.clock.tick,
    owners:w.provinces.map(p=>nation.get(p.controller)!),
    wars:w.statecraft!.relations.filter(p=>p.status==='war').map(p=>[nation.get(p.a)!,nation.get(p.b)!]),
    alliances:r.alliances.records.filter(a=>a.endedTick===null).map(a=>a.members.map(id=>nation.get(id)!)),
    vassals:r.vassals.records.filter(v=>v.endedTick===null).map(v=>[nation.get(v.overlordId)!,nation.get(v.vassalId)!]),
    forces:forces.map(f=>{const a=f.kind==='army'?w.armies.find(a=>a.id===f.id)!:null,fl=f.kind==='fleet'?r.navy.fleets.find(x=>x.id===f.id)!:null;
      return {key:forceKey47(f),kind:f.kind,id:f.id,nation:nation.get(f.nationId)!,withdrawing:f.withdrawing,travel:travel(f.travel),
        base:a?r.forceSpeed.armies[a.id].base:0,unitSpeed:a?unitProfile(r.units[a.id]).speed:1,elite:a?r.units[a.id]==='Elite':false,
        anchor:a&&originalPaths47(r)?index.get(a.provinceId)??-1:-1,status:a?a.status:fl!.status,allowSea:a?!r.reorganization.active[a.id]:true,
        troops:a?a.troops:0,morale:a?a.morale:0,hull:fl?r.maritime.hulls[fl.id]:0,crew:fl?fl.crew:0,ships:fl?fl.ships:0,
        carry:r.forceDamage.carry[forceKey47(f)]??0,losses:r.forceDamage.losses[forceKey47(f)]??0};}),
    contacts:r.forceContacts.pairs.map(c=>({a:c.a,b:c.b,cellA:c.cellA,cellB:c.cellB,pointA:c.pointA,pointB:c.pointB,area:c.area})),
  };
}
/** Volley inputs read through the web combat reader, and the original reorganization inputs. */
function volleyInputs(r:Run){
  const reader=combatReader47(r).volley,{forces}=actualForces47(r),g=actualForces47(r).spatial.graph;
  return {
    navyCountToHull:reader.navyCountToHull,reorganize:originalReorganization47(r),
    armies:forces.filter(f=>f.kind==='army').map(f=>{const v=reader.army(f),force=r.tactics.forces[f.id],home=force?r.world.provinces.find(p=>p.id===force.homeId):undefined;
      return {key:forceKey47(f),efficiency:v.efficiency,damageToArmy:v.damageToArmy,multiplier:v.multiplier,
        emergency:force?.kind==='emergency',home:home?r.world.provinces.indexOf(home):-1,homeCell:home?locateTravelCell47(g,home.center,home.id)?.id??-1:-1,homeX:home?.center.x??0,homeY:home?.center.y??0,
        full:home?forceStrength47(r,home.id):0};}),
    fleets:forces.filter(f=>f.kind==='fleet').map(f=>{const v=reader.navy(f);return {key:forceKey47(f),destiny:v.destiny,maritime:v.maritime,leader:v.livingLeaderModifier};}),
  };
}

/** Golden samples for the Swift combat port: a web world at war; every other day for 200 days, on
 * copies at the frame boundary: (1) one frame of the shared motion phase with contacts (as
 * force-tick47 calls it, stopping at each event); (2) one volley in which every engaged force is due.
 * Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports combat golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;
  const r0=x.run as Run,regions=waterRegions47(r0.diplomaticGeography);
  const statics={provinceIds:r0.world.provinces.map(p=>p.id),secondsPerTick:r0.forceClock.secondsPerTick,frameTicks:FRAME_TICKS47,seaRegions:[...regions].sort((a,b)=>a[0]-b[0])};
  const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
  const motion:unknown[]=[],volleys:unknown[]=[];
  for(let day=0;day<260;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day<60||day%4!==0)continue;
    // (1) motion
    {
      let r=structuredClone(x.run) as Run;const input=forceSnapshot(r);
      let now=r.clock.tick;const tick=now+FRAME_TICKS47,steps:{seconds:number;elapsed:number;unused:number}[]=[];
      while(now<tick){const moved=advanceOwnedActualForces47(r,tick-now,weights,actualForceSpeed47,true);steps.push({seconds:tick-now,elapsed:moved.elapsed,unused:moved.unusedSeconds});r=moved.run;now=moved.unusedSeconds===0?tick:now+moved.elapsed;}
      const out=forceSnapshot(r);
      motion.push({input,steps,output:{forces:out.forces.map(f=>({key:f.key,travel:f.travel,status:f.status})),contacts:out.contacts}});
    }
    // (2) a volley of every engaged force
    {
      const r=structuredClone(x.run) as Run;
      const due=new Set(r.forceContacts.pairs.flatMap(p=>[p.a,p.b]));if(!due.size)continue;
      const input=forceSnapshot(r),inputs=volleyInputs(r);
      const out=applyAccountedVolley47(r,due,combatReader47(r).volley,true);
      const after=forceSnapshot(out.run);
      volleys.push({input,inputs,due:[...due].sort(),output:{hits:out.nativeHits,casualties:out.casualties,
        forces:out.run.world.armies.map(a=>({key:forceKey47({kind:'army',id:a.id}),troops:a.troops,morale:a.morale,status:a.status as string,travel:travel(out.run.armyPositions.records[a.id])}))
          .concat(out.run.navy.fleets.map(f=>({key:forceKey47({kind:'fleet',id:f.id}),troops:out.run.maritime.hulls[f.id],morale:f.crew,status:f.status,travel:travel(out.run.fleetPositions.records[f.id])}))),
        carry:out.run.forceDamage.carry,losses:out.run.forceDamage.losses,contacts:after.contacts}});
    }
  }
  expect(motion.length).toBeGreaterThan(25);expect(volleys.length).toBeGreaterThan(10);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/combat.json',JSON.stringify({statics,motion,volleys}));
  void economicEthnic47;
},3600000);
