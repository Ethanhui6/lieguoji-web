import { Delaunay } from 'd3-delaunay';
import { describe, expect, it } from 'vitest';
import { deriveFmsClimateRivers, recoveredRiverMoisture } from './climate-rivers';
import { assertFmsDocument, type FmsDocument, type FmsPoint } from './model';
import { clipFmsRiverSegments } from './river-geometry';

function fixture(size=9):FmsDocument {
  const points:FmsPoint[]=[];for(let y=0;y<size;y++)for(let x=0;x<size;x++)points.push([x*10,y*10]);
  const d=Delaunay.from(points);
  return {format:'lieguoji-fms-world',version:1,worldId:'00000000-0000-4000-8000-000000000001',revision:0,width:(size-1)*10,height:(size-1)*10,points,triangles:Uint32Array.from(d.triangles),neighbors:points.map((_,i)=>[...d.neighbors(i)]),elevations:Int32Array.from(points,([x,y])=>x===0||y===0||x===(size-1)*10||y===(size-1)*10?0:40+y/10)};
}
describe('recovered rainfall-driven river graph',()=>{
  it('lets the later stronger branch take over, then removes the short earlier branch',()=>{
    const doc=fixture(3);
    doc.triangles=Uint32Array.of(0,1,4,0,4,3,1,2,5,1,5,4,3,4,6,4,7,6,4,5,8,4,8,7);
    doc.neighbors=[[1,4,3],[0,4,2,5],[1,5],[0,4,6],[0,1,3,5,6,7,8],[1,2,4,8],[3,4,7],[4,6,8],[4,5,7]];
    doc.elevations=Int32Array.of(100,90,100,70,30,100,100,0,100);assertFmsDocument(doc);
    const r=deriveFmsClimateRivers(doc,Uint8Array.of(0,80,0,160,0,0,0,0,0));
    // Independent arithmetic: 1 contributes floor(80/sqrt(2))=56 first;
    // 3 contributes floor(160/sqrt(2))=113 later and takes over at 4.
    // Path 1=[1,4] is discarded; path 2=[3,4,7] reaches sea and survives.
    expect([...r.flux]).toEqual([0,56,0,113,169,0,0,0,0]);
    expect([...r.receiver]).toEqual([4,4,1,4,7,4,7,-1,7]);
    expect([...r.riverIds]).toEqual([0,0,0,2,2,0,0,0,0]);
    expect(r.segments).toEqual([[3,4],[4,7]]);
  });
  it('dry land has no rivers; rain creates real adjacency paths terminating at the real shore',()=>{
    const doc=fixture();assertFmsDocument(doc);const before=structuredClone(doc);
    expect(deriveFmsClimateRivers(doc,new Uint8Array(doc.points.length)).stats.riverCount).toBe(0);
    const wet=deriveFmsClimateRivers(doc,new Uint8Array(doc.points.length).fill(80));
    expect(wet.stats.riverCount).toBeGreaterThan(0);expect(wet.stats.unreachedLand).toBe(0);
    expect(wet.segments.length).toBeGreaterThan(0);
    for(const[a,b]of wet.segments){expect(doc.neighbors[a]).toContain(b);expect(wet.routingHeight[a]).toBeGreaterThan(wet.routingHeight[b]);expect(wet.riverIds[a]).toBeGreaterThan(0);}
    expect(clipFmsRiverSegments(doc,wet.segments).some(s=>s.mouth)).toBe(true);
    expect(doc).toEqual(before);
  });
  it('sea-only and disconnected-from-water land do not invent river exits or rewrite heights',()=>{
    const doc=fixture(),rain=new Uint8Array(doc.points.length).fill(80);
    doc.elevations.fill(0);expect(deriveFmsClimateRivers(doc,rain).stats).toMatchObject({riverCount:0,unreachedLand:0});
    doc.elevations.fill(45);const closed=deriveFmsClimateRivers(doc,rain);
    expect(closed.stats).toMatchObject({riverCount:0,unreachedLand:doc.points.length});
    expect(closed.routingHeight.every(h=>h===100000)).toBe(true);
    expect(doc.elevations.every(h=>h===45)).toBe(true);
  });
  it('discards a single isolated source-to-sea path before assigning moisture ids',()=>{
    const doc=fixture(3);doc.elevations.fill(0);doc.elevations[4]=45;
    const river=deriveFmsClimateRivers(doc,new Uint8Array(9).fill(80));
    expect(river.flux[4]).toBe(56); // Uint16 trunc(80 / sqrt(2)).
    expect(river.stats.riverCount).toBe(0);expect(river.segments).toHaveLength(0);
    expect(river.riverIds.every(id=>id===0)).toBe(true);
  });
  it('keeps FIFO float32 routing separate from actual topography, with no receiver cycles',()=>{
    const doc=fixture();doc.elevations[40]=20;
    const r=deriveFmsClimateRivers(doc,new Uint8Array(doc.points.length).fill(160));
    expect(r.routingHeight[40]).toBeGreaterThan(20);expect(doc.elevations[40]).toBe(20);
    for(let i=0;i<doc.points.length;i++){
      const seen=new Set<number>();let j=i;
      while(j>=0){expect(seen.has(j)).toBe(false);seen.add(j);j=r.receiver[j];}
    }
    expect(deriveFmsClimateRivers(doc,new Uint8Array(doc.points.length).fill(160))).toEqual(r);
  });
  it('only adds original river bonus to the self sample, excluding sea neighbors',()=>{
    const h=Int32Array.of(45,45,0),n=[[1,2],[0],[0]],rain=Uint8Array.of(10,6,255),r={flux:Uint16Array.of(200,500,0),riverIds:Uint16Array.of(1,1,0)};
    expect(recoveredRiverMoisture(0,h,n,rain,r)).toBe(22);
    r.flux[0]=1;expect(recoveredRiverMoisture(0,h,n,rain,r)).toBe(13);
    r.riverIds[0]=0;expect(recoveredRiverMoisture(0,h,n,rain,r)).toBe(12);
  });
  it('rejects unmatched precipitation before routing',()=>{
    expect(()=>deriveFmsClimateRivers(fixture(),new Uint8Array(3))).toThrow();
  });
});
