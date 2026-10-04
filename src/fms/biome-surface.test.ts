import { describe, expect, it } from 'vitest';
import { deriveFmsBiomeSurface, FmsBiomeFields, sampleFmsClimateHeights } from './biome-surface';
import type { FmsDocument } from './model';

function fixture():FmsDocument{return {
  format:'lieguoji-fms-world',version:1,worldId:'00000000-0000-4000-8000-000000000001',revision:0,width:20,height:10,
  points:[[0,0],[20,0],[20,10],[0,10]],triangles:Uint32Array.of(0,1,2,0,2,3),neighbors:[[1,2,3],[0,2],[0,1,3],[0,2]],elevations:Int32Array.of(0,80,80,0),
};}
describe('read-only climate display on the current continuous geometry',()=>{
  it('samples a known linear ramp across both triangles, without modifying its coast',()=>{
    const doc=fixture(),before=structuredClone(doc);
    expect([...sampleFmsClimateHeights(doc,4,2)]).toEqual([10,30,50,70,10,30,50,70]);
    const surface=deriveFmsBiomeSurface(doc);
    expect(doc).toEqual(before);
    expect(surface.stats).toMatchObject({columns:192,rows:96,riverMoisture:true});
    expect(surface.ids[0]).toBe(0);expect(surface.ids[3]).toBe(0);
    expect(surface.stats.counts.reduce((s,n)=>s+n,0)).toBe(4);
    expect([...surface.colors].every(Number.isFinite)).toBe(true);
  });
  it('keeps sea-only maps marine, with no invented land temperatures or wetlands',()=>{
    const doc=fixture();doc.elevations.fill(0);
    const surface=deriveFmsBiomeSurface(doc);
    expect([...surface.ids]).toEqual([0,0,0,0]);
    expect(surface.stats).toMatchObject({minTemperature:null,maxTemperature:null});
    expect(surface.stats.counts[12]).toBe(0);
  });
  it('uses the actual height of a summit too small for any climate-grid sample',()=>{
    const doc=fixture();doc.width=8192;doc.height=8192;
    doc.points=[[1,1],[2,1],[2,2],[1,2]];doc.elevations=Int32Array.of(100,0,0,0);
    expect(sampleFmsClimateHeights(doc,192,192).every(h=>h===0)).toBe(true);
    const surface=deriveFmsBiomeSurface(doc);
    expect(surface.temperatures[0]).toBe(-17);
    expect(surface.ids[0]).toBe(11);
  });
  it('uses float32 triangle positions and skips triangles collapsed on the GPU',()=>{
    const doc=fixture();doc.points=[[10,0],[10+1e-8,0],[10,10],[0,10]];
    doc.elevations.fill(45);
    // First triangle collapses in float32; empty right half remains sea.
    const heights=sampleFmsClimateHeights(doc,4,2);
    expect(heights[2]).toBe(0);expect(heights[3]).toBe(0);
    expect([...heights].every(h=>h===0||h===45)).toBe(true);
  });
  it('reuses immutable snapshots and invalidates geometry, elevations and aspect ratio',()=>{
    const fields=new FmsBiomeFields(),doc=fixture(),a=fields.get(doc);
    expect(fields.get({...doc,revision:1})).toBe(a);
    const raised={...doc,elevations:Int32Array.of(0,100,100,0)};
    expect(fields.get(raised)).not.toBe(a);
    expect(fields.get({...doc,points:doc.points.map(p=>[...p])})).not.toBe(a);
    expect(fields.get({...doc,width:40})).not.toBe(a);
    expect(fields.metrics()).toMatchObject({builds:4,entries:3});
    expect(fields.metrics().bytes).toBeLessThanOrEqual(3*doc.points.length*(15+12+16));
    fields.clear();expect(fields.metrics()).toMatchObject({entries:0,bytes:0});
  });
  it('rejects malformed documents before storing a new cached entry',()=>{
    const fields=new FmsBiomeFields();fields.get(fixture());
    expect(()=>fields.get({...fixture(),width:0})).toThrow();
    expect(fields.metrics()).toMatchObject({builds:1,entries:1});
  });
});
