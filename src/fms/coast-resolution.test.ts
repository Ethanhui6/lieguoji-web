import {describe,expect,it} from 'vitest';
import {resolveFmsCoast} from './coast-resolution';
import {smoothFmsCoast,prepareFmsCoastSmoothPreview,prepareFmsCoastSmoothGeometry} from './coast-smoothing';
import {assertFmsDocument,FmsEditHistory,type FmsPoint} from './model';
import {coastFixture,linearCoastMetrics,compareLinearCoasts} from '../../tests/helpers/fms-coast-metrics';
import {deriveFmsShade} from './shading';
import {naturalizeFmsTerrain} from './naturalize';
import {measureFmsSmoothing} from '../../tests/helpers/fms-smoothing-metrics';
import {Delaunay} from 'd3-delaunay';

const cross=(a:FmsPoint,b:FmsPoint,c:FmsPoint)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const options={maxOffset:4,resample:true as const};
describe('explicit coastline edges and bounded local resolution',()=>{
  it.each([[45,0],[21,19],[100,19],[100,0]])('subdivides the same continuous height field at integer h20 (%s/%s)',(land,sea)=>{
    const doc=coastFixture('asymmetric');doc.elevations=doc.elevations.map(h=>h?land:sea);
    const old=structuredClone(doc),{document,reference}=resolveFmsCoast(doc,new Uint8Array(doc.points.length));assertFmsDocument(document);
    expect(doc).toEqual(old);expect(document.points.length).toBeGreaterThan(doc.points.length);expect(document.points.length).toBeLessThanOrEqual(50_000);
    expect(Array.from(document.elevations.slice(doc.points.length)).every(h=>h===20)).toBe(true);
    let totalArea=0;
    const parents=Array.from({length:doc.triangles.length/3},(_,j)=>{
      const ids=Array.from(doc.triangles.slice(j*3,j*3+3)),p=ids.map(i=>doc.points[i].map(Math.fround) as FmsPoint);
      return {ids,p,D:cross(p[0],p[1],p[2]),minX:Math.min(...p.map(v=>v[0])),maxX:Math.max(...p.map(v=>v[0])),minY:Math.min(...p.map(v=>v[1])),maxY:Math.max(...p.map(v=>v[1]))};
    });
    // Each new child centroid must lie on the same original PL surface. This
    // catches wrong diagonals, integer truncation, overlaps and missing pieces.
    for(let t=0;t<document.triangles.length;t+=3){
      const ids=Array.from(document.triangles.slice(t,t+3)),p=ids.map(i=>reference[i]),q:FmsPoint=[p.reduce((s,v)=>s+v[0],0)/3,p.reduce((s,v)=>s+v[1],0)/3];
      totalArea+=Math.abs(cross(p[0],p[1],p[2]))/2;let matched=false;
      for(const {ids:base,p:[a,b,c],D,minX,maxX,minY,maxY}of parents){if(q[0]<minX||q[0]>maxX||q[1]<minY||q[1]>maxY)continue;
        const w=[cross(q,b,c)/D,cross(a,q,c)/D,cross(a,b,q)/D];if(w.some(v=>v < -1e-8))continue;
        expect(ids.reduce((s,i)=>s+document.elevations[i],0)/3).toBeCloseTo(w.reduce((s,v,i)=>s+v*doc.elevations[base[i]],0),7);matched=true;break;
      }expect(matched).toBe(true);
    }
    expect(totalArea).toBeCloseTo(doc.width*doc.height,6);
    const before=linearCoastMetrics(doc,doc.elevations),after=linearCoastMetrics(document,document.elevations);
    expect(Math.abs(after.landArea/before.landArea-1)).toBeLessThan(1e-6);
    const a=deriveFmsShade(doc),b=deriveFmsShade(document);doc.elevations.forEach((h,i)=>{if(h!==20)expect(b[i]).toBe(a[i]);});
    expect(deriveFmsShade(structuredClone(document))).toEqual(b);
  });
  it.each(['neck','asymmetric','island'] as const)('preserves protected faces and small boundaries through the complete %s operation',kind=>{
    const doc=coastFixture(kind);doc.version=2;doc.terrainLocks=new Uint8Array(doc.points.length);doc.terrainLocks[7*41+10]=1;
    const old=structuredClone(doc),result=smoothFmsCoast(doc,options),candidate=prepareFmsCoastSmoothPreview(doc,result,options);expect(doc).toEqual(old);
    expect(result.stats.maxDisplacement).toBeLessThanOrEqual(4);expect(result.stats.maxGradient).toBeLessThanOrEqual(.2);expect(result.stats.maxComponentAreaFraction).toBeLessThanOrEqual(.02);
    for(let t=0;t<doc.triangles.length;t+=3){const ids=doc.triangles.slice(t,t+3);if(ids.some(i=>doc.terrainLocks![i])){
      ids.forEach(i=>expect(candidate.points[i]).toEqual(doc.points[i]));
      expect(Array.from({length:candidate.triangles.length/3},(_,j)=>Array.from(candidate.triangles.slice(j*3,j*3+3))).some(row=>row.every((id,j)=>id===ids[j]))).toBe(true);
    }}
    if(kind==='island'){expect(candidate).toBe(doc);return;}
    expect(result.stats.addedPoints).toBeGreaterThan(0);expect(result.moves.length).toBeGreaterThan(0);expect(result.stats.turningEnergyAfter).toBeLessThan(result.stats.turningEnergyBefore);
    const prepared=prepareFmsCoastSmoothGeometry(doc,options),reference={...prepared.doc,points:prepared.source.points};
    const measured=measureFmsSmoothing(reference,candidate,205,false);
    expect(measured.flippedFaces).toBe(0);expect(measured.missingCrossings).toBe(0);expect(measured.maxCoastDisplacement).toBeLessThanOrEqual(4);
    expect(measured.minStretch).toBeGreaterThanOrEqual(.8);expect(measured.maxStretch).toBeLessThanOrEqual(1.2);
    expect(measured.maxComponentAreaFraction).toBeCloseTo(result.stats.maxComponentAreaFraction,8);
    expect(linearCoastMetrics(reference,reference.elevations,205,false).landArea).toBeCloseTo(linearCoastMetrics(doc).landArea,6);
    const before=linearCoastMetrics(doc,doc.elevations),after=linearCoastMetrics(candidate,candidate.elevations);expect(Math.abs(after.landArea/before.landArea-1)).toBeLessThanOrEqual(.02);
    if(kind==='neck')expect(after.sectionIntervals).toEqual(before.sectionIntervals);
    const history=new FmsEditHistory(doc);history.replaceDocument(candidate,doc.revision);expect(history.undo().points).toEqual(doc.points);expect(history.redo().points).toEqual(candidate.points);
    const relief=naturalizeFmsTerrain(candidate,{seed:42,strength:1});expect(compareLinearCoasts(candidate,relief.elevations).maxCrossingDisplacement).toBe(0);
  });
  it('uses the caller resampling mode during response validation and leaves zero offset untouched',()=>{
    const doc=coastFixture('asymmetric'),result=smoothFmsCoast(doc,options);
    expect(()=>prepareFmsCoastSmoothPreview(doc,result,{maxOffset:4})).toThrow();
    const zero={...options,maxOffset:0};expect(prepareFmsCoastSmoothPreview(doc,smoothFmsCoast(doc,zero),zero)).toBe(doc);
    const changed=structuredClone(result);changed.stats.addedPoints++;expect(()=>prepareFmsCoastSmoothPreview(doc,changed,options)).toThrow();
  });
  it.each([.25,1,4])('includes remeshing float32 error in the final %s-unit displacement budget',maxOffset=>{
    const doc=coastFixture('asymmetric'),chosen={...options,maxOffset},result=smoothFmsCoast(doc,chosen),candidate=prepareFmsCoastSmoothPreview(doc,result,chosen);
    expect(result.moves.length).toBeGreaterThan(0);const prepared=prepareFmsCoastSmoothGeometry(doc,chosen),m=measureFmsSmoothing({...prepared.doc,points:prepared.source.points},candidate,205,false);
    expect(m.maxCoastDisplacement).toBeLessThanOrEqual(maxOffset);expect(result.stats.maxDisplacement).toBeLessThanOrEqual(maxOffset);expect(m.minStretch).toBeGreaterThanOrEqual(.8);
  });
  it('closes both sides of every selected edge when the 50k point budget truncates a coast',()=>{
    const points:FmsPoint[]=[];for(let y=0;y<223;y++)for(let x=0;x<223;x++)points.push([x,y]);
    const mesh=Delaunay.from(points),doc={...coastFixture('island'),width:222,height:222,points,triangles:Uint32Array.from(mesh.triangles),neighbors:points.map((_,i)=>[...mesh.neighbors(i)]),elevations:Int32Array.from(points.map(([x])=>x<110?45:0))};
    const {document}=resolveFmsCoast(doc,new Uint8Array(points.length));expect(document.points.length).toBe(50_000);assertFmsDocument(document);
    const edges=new Map<string,number>();for(let t=0;t<document.triangles.length;t+=3){const ids=document.triangles.slice(t,t+3);for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=[a,b].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)??0)+1);}}
    expect(document.points.length-edges.size+document.triangles.length/3).toBe(1);
    for(const[key,count]of edges){expect(count).toBeLessThanOrEqual(2);if(count===1){const[a,b]=key.split(':').map(i=>document.points[+i]);expect((a[0]===b[0]&&(a[0]===0||a[0]===222))||(a[1]===b[1]&&(a[1]===0||a[1]===222))).toBe(true);}}
  });
});
