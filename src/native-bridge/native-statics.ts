import {actualForces47} from '../fms/play/force-runtime47';
import {locateTravelCell47} from '../fms/play/army-travel47-graph';
import {nativeArmyCellDistance,nativeArmyRouteCost} from '../fms/play/native-war/army-path';
import {originalCellProvinces} from '../fms/original/original-politics';
import {nativeFilterProvinceCells53} from '../fms/play/native-combat/province-cells53';
import {graphFor47} from '../fms/play/sea-geography47';
import {diplomacyStatic} from '../native-export/diplomacy-state';
import type {FoundingForces47} from '../fms/play/civilization47-forces';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';

/** The static geometry the Swift engine reads beside the run, for one world:
 * - travel: the army travel graph in the travel.bin layout (see native-export/travel-export.test.ts);
 * - borders: owner province of each outside border cell of every province (province-border54);
 * - homeCells: the travel cell under each province centre (locateTravelCell47);
 * - diplomacy: the diplomatic geography (native-export/diplomacy-state diplomacyStatic);
 * - seaPorts: harbour ports of the sea graph, [land province id, water component];
 * - sea: water component of every sea face (-1 on land) and each harbour port's anchor (seaStatic). */
export function nativeStatics(input:unknown){
  const r=input as FoundingForces47&PoliticalRun47&{terrain:Parameters<typeof originalCellProvinces>[0];scale:number};
  const w=r.world,provinceIndex=new Map(w.provinces.map((p,i)=>[p.id,i])),g=actualForces47(r).spatial.graph;
  const ids=[...g.cells.keys()].sort((a,b)=>a-b),index=new Map(ids.map((id,i)=>[id,i]));
  const links=ids.reduce((n,id)=>n+g.cells.get(id)!.links.length,0),faces=r.forceSpeed.biomePolicy==='native-biome-face-v1'?r.forceSpeed.faceBiomes:[];
  const size=4*6+ids.length*(12+16+4)+4+links*(4+40)+w.provinces.length*(2+16)+faces.length;
  const buf=new ArrayBuffer(size),v=new DataView(buf);let o=0;
  const u32=(n:number)=>{v.setUint32(o,n,true);o+=4;},i32=(n:number)=>{v.setInt32(o,n,true);o+=4;},f64=(n:number)=>{v.setFloat64(o,n,true);o+=8;},u8=(n:number)=>{v.setUint8(o,n);o+=1;};
  u32(0x5654474c);u32(1);u32(ids.length);u32(links);u32(w.provinces.length);u32(faces.length);
  let k=0;
  for(const id of ids){const c=g.cells.get(id)!;i32(id);i32(c.face);i32(c.provinceId===null?-1:provinceIndex.get(c.provinceId)!);f64(c.center.x);f64(c.center.y);u32(k);k+=c.links.length;}
  u32(k);
  for(const id of ids){const a=g.cells.get(id)!;for(const l of a.links){const b=g.cells.get(l.to)!;
    const d=nativeArmyCellDistance({x:a.center.x/g.scale,y:a.center.y/g.scale},{x:b.center.x/g.scale,y:b.center.y/g.scale}),cost=nativeArmyRouteCost(d,false,false,a.surface!==b.surface,false);
    i32(index.get(l.to)!);f64(l.gate.x);f64(l.gate.y);f64(l.distance);f64(l.toGate);f64(cost);}}
  for(const p of w.provinces){const t=r.terrainContext.provinces[p.id],point=w.cities.find(c=>c.provinceId===p.id)?.position??p.center;
    u8(t.mountain?1:0);u8(t.plateau?1:0);f64(point.x);f64(point.y);}
  for(const b of faces)u8(b);
  const bytes=new Uint8Array(buf);let travel='';for(let i=0;i<bytes.length;i+=0x8000)travel+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  const owners=originalCellProvinces(r.terrain,w.provinces,r.scale);
  const rows=nativeFilterProvinceCells53({province:Array.from(owners,i=>i+1),neighbor:r.terrain.neighbors,height:Array.from(r.terrain.elevations),feature:Array.from(owners,()=>0)},Array(w.provinces.length+1).fill(true));
  const sea=graphFor47(r as never);
  return {
    travel:btoa(travel),
    borders:w.provinces.map((_,i)=>rows[i+1]!.borderNeighborCells.map(c=>owners[c])),
    homeCells:Object.fromEntries(w.provinces.map(p=>[p.id,locateTravelCell47(g,p.center,p.id)!.id])),
    diplomacy:diplomacyStatic(r),
    seaPorts:sea.ports.map(p=>[p.provinceId,sea.nodes.get(p.node)!.component]),
    sea:seaStatic(r),
  };
}
/** Sea-graph facts the Swift naval rules read: components[face] (-1 for a land face) and the ports
 * [id, land province id, anchor face, anchor centre x, y] in sea-graph order. */
export function seaStatic(input:unknown){
  const r=input as FoundingForces47,sea=graphFor47(r as never),components=Array<number>(r.terrain.triangles.length/3).fill(-1);
  for(const n of sea.nodes.values())components[n.id]=n.component;
  return {components,ports:sea.ports.map(p=>{const c=sea.nodes.get(p.node)!.center;return [p.id,p.provinceId,p.node,c.x,c.y];})};
}
