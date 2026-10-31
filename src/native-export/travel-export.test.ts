import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {actualForces47,advanceOwnedActualForces47} from '../fms/play/force-runtime47';
import {actualForceSpeed47} from '../fms/play/force-speed47';
import {previewMilitary47} from '../fms/play/culture47-orders';
import {armyTravelLocation47} from '../fms/play/army-travel47-state';
import {unitProfile} from '../fms/play/military-profile';
import {nativeArmyCellDistance,nativeArmyRouteCost} from '../fms/play/native-war/army-path';
import {FRAME_TICKS47} from '../fms/play/frame-loop47';

/** The army travel graph (army-travel47-graph.ts buildArmyTravelGraph47) and a movement golden.
 *
 * travel.bin (little endian), all coordinates in the web's normalized 1000-long-side units:
 *   u32 magic 'LGTV', u32 version 1, u32 cells, u32 links, u32 provinces, u32 faces
 *   cells (ascending id): i32 id, i32 face, i32 province (−1 sea), f64 cx, f64 cy, u32 firstLink
 *   u32 link end sentinel
 *   links: i32 toIndex, f64 gx, f64 gy, f64 distance, f64 toGate, f64 plainCost
 *   provinces: u8 mountain, u8 plateau, f64 targetX, f64 targetY (city or centre, army-commands47 target point)
 *   faces: u8 biome (force-speed47 faceBiomes)
 *
 * movement.json: armies ordered to march to their nation's farthest own province through the web
 * session, then the actual force motion primitive (force-runtime47 advanceActualForces47 with
 * actualForceSpeed47, stopAtEvent like force-tick47) for 120 days of 6 frames; per frame each
 * ordered army's leg/offset/crossed/status. Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports the travel graph and movement golden',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;
  const w0=x.run.world,provinceIndex=new Map(w0.provinces.map((p,i)=>[p.id,i]));
  const g=actualForces47(x.run).spatial.graph;
  const ids=[...g.cells.keys()].sort((a,b)=>a-b),index=new Map(ids.map((id,i)=>[id,i]));
  const links=ids.reduce((n,id)=>n+g.cells.get(id)!.links.length,0),faces=x.run.forceSpeed.biomePolicy==='native-biome-face-v1'?x.run.forceSpeed.faceBiomes:[];
  expect(faces.length).toBeGreaterThan(0);
  const size=4*6+ids.length*(12+16+4)+4+links*(4+40)+w0.provinces.length*(2+16)+faces.length;
  const buf=new ArrayBuffer(size),v=new DataView(buf);let o=0;
  const u32=(n:number)=>{v.setUint32(o,n,true);o+=4;},i32=(n:number)=>{v.setInt32(o,n,true);o+=4;},f64=(n:number)=>{v.setFloat64(o,n,true);o+=8;},u8=(n:number)=>{v.setUint8(o,n);o+=1;};
  u32(0x5654474c);u32(1);u32(ids.length);u32(links);u32(w0.provinces.length);u32(faces.length);
  let k=0;
  for(const id of ids){const c=g.cells.get(id)!;i32(id);i32(c.face);i32(c.provinceId===null?-1:provinceIndex.get(c.provinceId)!);f64(c.center.x);f64(c.center.y);u32(k);k+=c.links.length;}
  u32(k);
  for(const id of ids){const a=g.cells.get(id)!;for(const l of a.links){const b=g.cells.get(l.to)!;
    const d=nativeArmyCellDistance({x:a.center.x/g.scale,y:a.center.y/g.scale},{x:b.center.x/g.scale,y:b.center.y/g.scale}),cost=nativeArmyRouteCost(d,false,false,a.surface!==b.surface,false);
    expect(Number.isFinite(cost)).toBe(true);
    i32(index.get(l.to)!);f64(l.gate.x);f64(l.gate.y);f64(l.distance);f64(l.toGate);f64(cost);}}
  for(const p of w0.provinces){const t=x.run.terrainContext.provinces[p.id],point=w0.cities.find(c=>c.provinceId===p.id)?.position??p.center;
    u8(t.mountain?1:0);u8(t.plateau?1:0);f64(point.x);f64(point.y);}
  for(const b of faces)u8(b);
  expect(o).toBe(size);
  await mkdir('ios-native/Resources/World',{recursive:true});
  await writeFile('ios-native/Resources/World/travel.bin',new Uint8Array(buf));

  // Day-0 army motion inputs, in world.armies order.
  const armiesIn=w0.armies.map(a=>{const t=x.run.armyPositions.records[a.id],at=armyTravelLocation47(t,g);
    return {id:a.id,base:x.run.forceSpeed.armies[a.id].base,unitSpeed:unitProfile(x.run.units[a.id]).speed,cell:at.cell.id,x:at.point.x,y:at.point.y,status:t.status};});

  // One march order per nation (its first army), issued through the real session.
  const orders:{army:number;province:number;nodes:number[]}[]=[];
  for(const n of w0.nations){
    const w=x.run.world,ai=w.armies.findIndex(a=>a.nationId===n.id&&a.troops>0);if(ai<0)continue;const a=w.armies[ai];
    const here=w.provinces.find(p=>p.id===a.provinceId)!,own=w.provinces.filter(p=>p.controller===n.id);
    const far=own.map(p=>({p,d:Math.hypot(p.center.x-here.center.x,p.center.y-here.center.y)})).sort((a,b)=>b.d-a.d||(a.p.id<b.p.id?-1:1))[0].p;
    const intent={force:'army' as const,command:{type:'army-move' as const,armyId:a.id,target:{kind:'province' as const,id:far.id},kind:'march' as const}};
    const pv=previewMilitary47(x.run as never,intent) as {valid:boolean;basedOn:unknown};if(!pv.valid)continue;
    x=session.execute({kind:'military',intent,expected:pv.basedOn} as never,x.journal.actions.length);
    orders.push({army:ai,province:provinceIndex.get(far.id)!,nodes:[...x.run.armyPositions.records[a.id].nodes]});
  }
  expect(orders.length).toBeGreaterThan(4);
  let run=structuredClone(x.run);
  const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
  const frames:number[][][]=[];
  for(let f=0;f<120*6;f++){
    const base=x.run.clock.tick+120*45;let now=base+f*FRAME_TICKS47;const tick=now+FRAME_TICKS47;
    while(now<tick){const moved=advanceOwnedActualForces47(run,tick-now,weights,actualForceSpeed47,true);run=moved.run;now=moved.unusedSeconds===0?tick:now+moved.elapsed;}
    frames.push(orders.map(o=>{const t=run.armyPositions.records[run.world.armies[o.army].id];return [t.leg,t.offset,t.crossed?1:0,t.status==='moving'?0:t.status==='arrived'?1:t.status==='blocked'?2:3];}));
  }
  expect(frames.at(-1)!.some((r,i)=>r[0]!==0||r[1]!==frames[0][i][1])).toBe(true);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/movement.json',JSON.stringify({startTick:x.run.clock.tick+120*45,secondsPerTick:run.forceClock.secondsPerTick,frameTicks:FRAME_TICKS47,
    nations:w0.armies.map(a=>w0.nations.findIndex(n=>n.id===a.nationId)),controllers:w0.provinces.map(p=>w0.nations.findIndex(n=>n.id===p.controller)),armies:armiesIn,orders,frames}));
},600000);
