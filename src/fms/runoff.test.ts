import { describe, expect, it } from 'vitest';
import { deriveFmsRunoff } from './runoff';
import { deriveFmsDrainage } from './hydrology';
import { resolveFmsCoast } from './coast-resolution';
import { coastFixture, linearCoastMetrics } from '../../tests/helpers/fms-coast-metrics';
import type { FmsDocument, FmsPoint } from './model';

function triangle(heights: number[]): FmsDocument {
  return { format: 'lieguoji-fms-world', version: 1, worldId: '00000000-0000-4000-8000-000000000001', revision: 0,
    width: 100, height: 100, points: [[0, 0], [100, 0], [0, 100]], triangles: Uint32Array.of(0, 1, 2),
    neighbors: [[1, 2], [0, 2], [0, 1]], elevations: Int32Array.from(heights) };
}
describe('land area runoff contract', () => {
  it.each([[0, 0, 0], [20, 0, 0], [20, 20, 0], [20, 20, 20], [45, 0, 0], [45, 45, 0], [21, 19, 100]])('agrees with independent polygon clipping for %j', (...heights) => {
      const doc = triangle(heights), before = structuredClone(doc), runoff = deriveFmsRunoff(doc), drainage = deriveFmsDrainage(doc);
      const area = linearCoastMetrics(doc).landArea;
      expect(runoff.reduce((a,b) => a+b, 0)).toBeCloseTo(area, 8);
      expect(drainage.stats.landArea).toBeCloseTo(area, 8);
      expect(drainage.stats.seaDischarge + drainage.stats.endorheicDischarge).toBeCloseTo(area, 8);
      heights.forEach((h,i) => { if (h<20) expect(runoff[i]).toBe(0); });
      if (area===0) { expect(drainage.stats.maxAccumulation).toBe(0); expect(drainage.riverSegments).toEqual([]); }
      expect(doc).toEqual(before);
    });
  it.each(['neck', 'asymmetric', 'island'] as const)('conserves area through actual coast subdivision of %s', kind => {
    const doc=coastFixture(kind), subdivided=resolveFmsCoast(doc,new Uint8Array(doc.points.length)).document;
    const a=deriveFmsDrainage(doc),b=deriveFmsDrainage(subdivided);
    expect(subdivided.points.length).toBeGreaterThan(doc.points.length);
    for(const [geometry,result]of [[doc,a],[subdivided,b]] as const){
      expect(result.stats.landArea).toBeCloseTo(linearCoastMetrics(geometry).landArea,6);
      expect(result.stats.seaDischarge+result.stats.endorheicDischarge).toBeCloseTo(result.stats.landArea,6);
    }
    expect(Math.abs(b.stats.landArea/a.stats.landArea-1)).toBeLessThan(1e-6);
    expect(Math.abs(b.stats.minCatchment/a.stats.minCatchment-1)).toBeLessThan(1e-6);
  });
  it('scales source area quadratically, independently of point count or display threshold',()=>{
    const doc=triangle([45,45,0]),larger={...doc,width:200,height:200,points:doc.points.map(([x,y])=>[x*2,y*2] as FmsPoint)};
    const a=deriveFmsDrainage(doc,{minCatchment:.1}),b=deriveFmsDrainage(larger,{minCatchment:.1});
    expect(a.receiver).toEqual(b.receiver);a.runoff.forEach((value,i)=>expect(b.runoff[i]).toBe(value*4));
    const hidden=deriveFmsDrainage(larger,{minCatchment:40_000});
    expect(hidden.receiver).toEqual(b.receiver);expect(hidden.runoff).toEqual(b.runoff);expect(hidden.accumulation).toEqual(b.accumulation);
    expect(hidden.riverSegments).toEqual([]);expect(b.riverSegments.length).toBeGreaterThan(0);
  });
});
