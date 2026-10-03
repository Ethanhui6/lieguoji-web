import { expect, it } from 'vitest';
import { deriveFmsShade } from './shading';
import { coastFixture } from '../../tests/helpers/fms-coast-metrics';
import { refineFmsCoast, prepareFmsCoastPreview } from './coast-refinement';
it('does not create coast cliffs by adding sea-level knots; preserves original shade and interpolates parent face',()=>{
  const doc=coastFixture('neck'),options={seed:1337,maxOffset:4};
  doc.elevations=doc.elevations.map((h,i)=>h?35+(i%17):0);
  const refined=prepareFmsCoastPreview(doc,refineFmsCoast(doc,options),options),before=deriveFmsShade(doc),after=deriveFmsShade(refined);
  expect(after.slice(0,doc.points.length)).toEqual(before);expect(refined.points.length).toBeGreaterThan(doc.points.length);
  for(let i=doc.points.length;i<refined.points.length;i++){
    const [ia,ib,ic]=refined.neighbors[i],[a,b,c]=[ia,ib,ic].map(id=>refined.points[id].map(Math.fround)),p=refined.points[i];
    const cross=(q:number[],r:number[],s:number[])=>(r[0]-q[0])*(s[1]-q[1])-(r[1]-q[1])*(s[0]-q[0]);
    const total=cross(a,b,c),expected=(cross(p,b,c)*before[ia]+cross(p,c,a)*before[ib]+cross(p,a,b)*before[ic])/total;
    expect(after[i]).toBe(Math.fround(expected));expect(after[i]).toBeGreaterThanOrEqual(Math.min(before[ia],before[ib],before[ic])-1e-7);
  }
});
