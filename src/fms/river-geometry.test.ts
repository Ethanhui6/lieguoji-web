import {describe,it,expect} from 'vitest';
import {coastFixture,linearCoastMetrics} from '../../tests/helpers/fms-coast-metrics';
import {deriveFmsDrainage} from './hydrology';
import {clipFmsRiverSegments} from './river-geometry';
import {prepareFmsCoastPreview,refineFmsCoast} from './coast-refinement';
import {prepareFmsCoastSmoothPreview,smoothFmsCoast} from './coast-smoothing';
import {naturalizeFmsTerrain} from './naturalize';
import type {FmsDocument} from './model';

describe('real river outlets meet the interpolated coastline',()=>{
  it('clips 45-to-0 at h20 and omits zero-length h20-to-sea and entirely sea edges',()=>{
    const doc={...coastFixture('island'),points:[[0,0],[100,0],[0,50],[0,80]] as [number,number][],elevations:new Int32Array([45,0,20,0])};
    const lines=clipFmsRiverSegments(doc,[[0,1],[2,3],[1,3],[0,2]]);
    expect(lines).toHaveLength(2);expect(lines[0]).toEqual({from:0,to:1,a:[0,0],b:[100*25/45,0],mouth:true});
    expect(lines[1]).toEqual({from:0,to:2,a:[0,0],b:[0,50],mouth:true});
  });
  it.each([false,true])('meets actual edge crossings after geometry moves (%s) without changing drainage',smoothed=>{
    let doc=coastFixture('asymmetric');const relief=naturalizeFmsTerrain(doc,{seed:1337,strength:1});doc={...doc,elevations:relief.elevations};
    doc=prepareFmsCoastPreview(doc,refineFmsCoast(doc,{seed:1337,maxOffset:4}),{seed:1337,maxOffset:4});
    if(smoothed)doc=prepareFmsCoastSmoothPreview(doc,smoothFmsCoast(doc,{maxOffset:4}),{maxOffset:4});
    const before=structuredClone(doc),drainage=deriveFmsDrainage(doc,{minCatchment:1}),original=structuredClone(drainage),lines=clipFmsRiverSegments(doc,drainage.riverSegments);
    const crossings=linearCoastMetrics(doc).crossings;
    expect(lines.some(line=>line.mouth)).toBe(true);expect(lines.length).toBeLessThan(drainage.riverSegments.length);
    for(const line of lines){expect(Math.hypot(line.b[0]-line.a[0],line.b[1]-line.a[1])).toBeGreaterThan(0);
      if(line.mouth){const p=doc.elevations[line.to]===20?doc.points[line.to].map(Math.fround):crossings.get(`${Math.min(line.from,line.to)}:${Math.max(line.from,line.to)}`)!;expect(line.b[0]).toBeCloseTo(p[0],8);expect(line.b[1]).toBeCloseTo(p[1],8);}}
    expect(doc).toEqual(before);expect(drainage).toEqual(original);
  });
  it('uses renderer float32 positions rather than a separate high-precision coastline',()=>{
    const doc={points:[[8191.333333333,8191.88888888],[8190.11111111,8190.22222222]],elevations:new Int32Array([21,19])} as FmsDocument;
    const[line]=clipFmsRiverSegments(doc,[[0,1]]);expect(line.b).toEqual([0,1].map(axis=>(Math.fround(doc.points[0][axis])+Math.fround(doc.points[1][axis]))/2));
  });
});
