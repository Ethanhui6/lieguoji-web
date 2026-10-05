import {describe,it,expect} from 'vitest';
import {coastFixture} from '../../tests/helpers/fms-coast-metrics';
import {deriveFmsRiverShape,recoveredRiverMidpoint,recoveredRiverThickness,recoveredRiverControls} from './river-shape';
import type {FmsDocument,FmsPoint} from './model';

const area=(a:FmsPoint,b:FmsPoint,c:FmsPoint)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
// Independent barycentric oracle: all three vertices of each output triangle
// must be in the SAME source triangle and above its linearly interpolated h20.
function assertLand(doc:FmsDocument,positions:Float32Array){
  const p=doc.points.map(p=>p.map(Math.fround) as FmsPoint);
  for(let i=0;i<positions.length;i+=6){
    const output:[FmsPoint,FmsPoint,FmsPoint]=[[positions[i],positions[i+1]],[positions[i+2],positions[i+3]],[positions[i+4],positions[i+5]]];
    let contained=false;
    for(let t=0;t<doc.triangles.length;t+=3){
      const [a,b,c]=Array.from(doc.triangles.slice(t,t+3)),d=area(p[a],p[b],p[c]);
      if(output.every(q=>{const u=area(q,p[b],p[c])/d,v=area(q,p[c],p[a])/d,w=1-u-v;
        return Math.min(u,v,w)>=-2e-5&&u*doc.elevations[a]+v*doc.elevations[b]+w*doc.elevations[c]>=20-2e-4;})){contained=true;break;}
    }
    expect(contained,`river triangle ${i/6} must remain on one actual land face`).toBe(true);
  }
}
describe('recovered river shape with the actual web coastline',()=>{
  it('uses the active JS deterministic meander and skips short edges on longer paths',()=>{
    expect(recoveredRiverMidpoint([0,0],[10,0],0,3)).toEqual([5,1]);
    expect(recoveredRiverMidpoint([0,0],[0,10],0,3)).toEqual([-1,5]);
    expect(recoveredRiverMidpoint([0,0],[5,0],0,6)).toBeUndefined();
    expect(recoveredRiverMidpoint([0,0],[5,0],0,5)).toEqual([2.5,1]);
    expect(recoveredRiverMidpoint([0,0],[0,0],0,3)).toBeUndefined();
    expect(recoveredRiverMidpoint([0,0],[10,0],10,3)?.[1]).toBeCloseTo(.85,10);
  });
  it('recovers native thickness independently of flux and endpoint-normalized cubic handles',()=>{
    expect(recoveredRiverThickness(0,20)).toBeCloseTo(1.05,6);
    expect(recoveredRiverThickness(10,20)).toBeCloseTo(1.575,6);
    expect(recoveredRiverThickness(19,20)).toBeCloseTo(2.0475,6);
    const points:FmsPoint[]=[[0,0],[10,0],[10,10]],a=recoveredRiverControls(points,0),b=recoveredRiverControls(points,1);
    expect(a[0]).toEqual([0,0]);expect(a[1][0]).toBeCloseTo(10-5/Math.sqrt(2));expect(a[1][1]).toBeCloseTo(-5/Math.sqrt(2));
    expect(b[0][0]).toBeCloseTo(10+5/Math.sqrt(2));expect(b[1]).toEqual([10,10]);
  });
  it('clips the complete width at an isolated island shore, even with 21-to-0 heights',()=>{
    const doc=coastFixture('island');doc.elevations[40]=21;
    const before=structuredClone(doc),shape=deriveFmsRiverShape(doc,[[40,41]]);
    expect(shape.positions.length).toBeGreaterThan(0);assertLand(doc,shape.positions);expect(doc).toEqual(before);
    expect(Math.max(...Array.from(shape.positions).filter((_,i)=>i%2===0))).toBeCloseTo(40+10/21,5);
  });
  it('keeps a sub-unit-wide neck connected, clips both banks, and pins a confluence',()=>{
    const doc=coastFixture('neck');doc.elevations=Int32Array.from(doc.elevations,h=>h?21:0);
    const path=Array.from({length:11},(_,i)=>27*41+15+i),shape=deriveFmsRiverShape(doc,[path,[26*41+15,path[0],path[1]]]);
    assertLand(doc,shape.positions);
    // Every mid-neck cross section is covered by a ribbon triangle. A meander
    // escaping the thin neck would leave an actual gap here.
    for(let x=165;x<=235;x+=5){let covered=false;
      for(let i=0;i<shape.positions.length;i+=6){const a:FmsPoint=[shape.positions[i],shape.positions[i+1]],b:FmsPoint=[shape.positions[i+2],shape.positions[i+3]],c:FmsPoint=[shape.positions[i+4],shape.positions[i+5]],q:FmsPoint=[x,270],d=area(a,b,c);if(!d)continue;
        if(Math.min(area(q,b,c)/d,area(q,c,a)/d,area(q,a,b)/d)>=-1e-5){covered=true;break;}}
      expect(covered,`neck coverage at ${x}`).toBe(true);
    }
  });
  it('reuses original ordered paths deterministically without changing their cells',()=>{
    const doc=coastFixture('island');doc.elevations.fill(45);
    const paths=[[20,21,22,31,40,41,42]],copy=structuredClone(paths),shape=deriveFmsRiverShape(doc,paths);
    expect(shape.stats.curves).toBeGreaterThan(paths[0].length-1);expect(shape.positions.length).toBeGreaterThan(0);
    assertLand(doc,shape.positions);expect(deriveFmsRiverShape(doc,paths)).toEqual(shape);expect(paths).toEqual(copy);
  });
  it('handles empty, all-sea, off-map terminal and zero-length shore paths',()=>{
    const doc=coastFixture('island');expect(deriveFmsRiverShape(doc,[]).positions).toHaveLength(0);
    expect(deriveFmsRiverShape(doc,[[0,1,2]]) .positions).toHaveLength(0);
    expect(deriveFmsRiverShape(doc,[[40,-1]]).positions).toHaveLength(0);
    doc.elevations[40]=20;expect(deriveFmsRiverShape(doc,[[40,41]]).positions).toHaveLength(0);
  });
});
