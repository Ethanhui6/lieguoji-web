import { describe, expect, it } from 'vitest';
import { Delaunay } from 'd3-delaunay';
import { coastFixture, compareLinearCoasts } from '../../tests/helpers/fms-coast-metrics';
import { measureFmsSmoothing } from '../../tests/helpers/fms-smoothing-metrics';
import { assertFmsDocument, FmsEditHistory, type FmsDocument } from './model';
import { prepareFmsCoastSmoothPreview, smoothFmsCoast } from './coast-smoothing';
import { prepareFmsCoastPreview, refineFmsCoast } from './coast-refinement';
import { naturalizeFmsTerrain } from './naturalize';

const options={maxOffset:4};
function preview(doc:FmsDocument,maxOffset=4){const chosen={maxOffset},result=smoothFmsCoast(doc,chosen);return {result,document:prepareFmsCoastSmoothPreview(doc,result,chosen)};}
function adjacency(doc:FmsDocument){const rows=doc.points.map(()=>new Set<number>());for(let t=0;t<doc.triangles.length;t+=3){const[a,b,c]=doc.triangles.slice(t,t+3);rows[a].add(b).add(c);rows[b].add(a).add(c);rows[c].add(a).add(b);}doc.neighbors=rows.map(row=>[...row]);}
describe('bounded coastal relaxation with the same render topology',()=>{
  it.each(['neck','asymmetric'] as const)('bounds actual clipped %s components, crossings and stretch independently',kind=>{
    const doc=coastFixture(kind),old=structuredClone(doc),{result,document}=preview(doc),m=measureFmsSmoothing(doc,document);
    expect(doc).toEqual(old);expect(result.moves.length).toBeGreaterThan(100);expect(result.stats.maxDisplacement).toBeGreaterThan(.1);
    expect(m.missingCrossings).toBe(0);expect(m.flippedFaces).toBe(0);expect(m.maxCoastDisplacement).toBeLessThanOrEqual(4);
    expect(m.maxComponentAreaFraction).toBeLessThanOrEqual(.02+1e-10);expect(m.maxComponentAreaFraction).toBeCloseTo(result.stats.maxComponentAreaFraction,9);
    expect(m.minStretch).toBeGreaterThanOrEqual(.8-1e-9);expect(m.maxStretch).toBeLessThanOrEqual(1.2+1e-9);
    expect(m.sectionAfter).toEqual(m.sectionBefore); // x=205 cuts the one-row neck, not a grid line.
    expect(document.triangles).toEqual(doc.triangles);expect(document.elevations).toEqual(doc.elevations);assertFmsDocument(document);
  });
  it.each([.25,1,4])('enforces the chosen %s-unit bound on the final float32 geometry',offset=>{
    const doc=coastFixture('asymmetric'),{result,document}=preview(doc,offset),m=measureFmsSmoothing(doc,document);
    expect(result.moves.length).toBeGreaterThan(0);expect(result.stats.maxDisplacement).toBeLessThanOrEqual(offset);expect(m.maxCoastDisplacement).toBeLessThanOrEqual(offset);
  });
  it('keeps zero offset, empty sea, tiny islands and three-by-three islands fixed',()=>{
    const doc=coastFixture('asymmetric');expect(preview(doc,0).document).toBe(doc);doc.elevations.fill(0);expect(preview(doc).document).toBe(doc);
    for(const wide of [false,true]){const island=coastFixture('island');if(wide)island.points.forEach(([x,y],i)=>island.elevations[i]=x>=30&&x<=50&&y>=30&&y<=50?45:0);
      expect(preview(island).document).toBe(island);}
  });
  it('treats two positive-area islands joined only by a zero-width sea-level line as separate area components',()=>{
    const doc=coastFixture('asymmetric');doc.elevations.fill(0);
    doc.points.forEach(([x,y],i)=>{if((x>=50&&x<=130&&y>=150&&y<=230)||(x>=150&&x<=170&&y>=250&&y<=270))doc.elevations[i]=45;});
    // Break the diagonal sampled connection but retain a zero-width sea-level contact.
    doc.points.forEach(([x,y],i)=>{if(x>=130&&x<=150&&y===240)doc.elevations[i]=20;});
    const reachable=new Set<number>(),queue=[23*41+13];while(queue.length){const i=queue.pop()!;if(reachable.has(i))continue;reachable.add(i);queue.push(...doc.neighbors[i].filter(j=>doc.elevations[j]>=20&&!reachable.has(j)));}
    expect(reachable.has(25*41+15)).toBe(true); // Old vertex-labeling incorrectly merged these two budgets.
    const {document,result}=preview(doc),m=measureFmsSmoothing(doc,document);
    expect(m.components.filter(c=>c.land).length).toBeGreaterThan(1);
    for(const c of m.components.filter(c=>c.land&&c.before<4096))expect(c.after).toBe(c.before);
    expect(m.maxComponentAreaFraction).toBeCloseTo(result.stats.maxComponentAreaFraction,9);
  });
  it.each([[21,19],[100,0],[100,19],[20,0]])('handles land %s / sea %s without losing contour or area constraints',(land,sea)=>{
    const doc=coastFixture('asymmetric');doc.elevations=doc.elevations.map(h=>h?land:sea);
    const {document,result}=preview(doc),m=measureFmsSmoothing(doc,document);
    expect(m.flippedFaces).toBe(0);expect(m.missingCrossings).toBe(0);expect(m.maxCoastDisplacement).toBeLessThanOrEqual(4);
    expect(m.maxComponentAreaFraction).toBeLessThanOrEqual(.02+1e-8);expect(result.stats.maxGradient).toBeLessThanOrEqual(.2);
  });
  it('fixes whole faces touching a player lock and owns the moved geometry through undo/redo',()=>{
    const doc=coastFixture('asymmetric');doc.version=2;doc.terrainLocks=new Uint8Array(doc.points.length);doc.terrainLocks[7*41+10]=1;
    const {document,result}=preview(doc),fixed=new Set<number>();
    for(let t=0;t<doc.triangles.length;t+=3){const ids=doc.triangles.slice(t,t+3);if(ids.some(i=>doc.terrainLocks![i]))ids.forEach(i=>fixed.add(i));}
    fixed.forEach(i=>expect(document.points[i]).toEqual(doc.points[i]));expect(result.moves.length).toBeGreaterThan(0);
    const history=new FmsEditHistory(doc),committed=structuredClone(history.replaceDocument(document,doc.revision));
    document.points[result.moves[0].cell][0]=0;expect(history.undo().points).toEqual(doc.points);expect(history.redo().points).toEqual(committed.points);
    expect(history.document.terrainLocks).toEqual(doc.terrainLocks);
  });
  it('supports exact sea-level knots from microdetail, then fixes the new coast during relief generation',()=>{
    const doc=coastFixture('asymmetric'),detail=prepareFmsCoastPreview(doc,refineFmsCoast(doc,{seed:42,maxOffset:4}),{seed:42,maxOffset:4});
    const {document,result}=preview(detail),m=measureFmsSmoothing(detail,document);expect(result.moves.length).toBeGreaterThan(0);
    expect(m.maxComponentAreaFraction).toBeCloseTo(result.stats.maxComponentAreaFraction,9);expect(m.minStretch).toBeGreaterThanOrEqual(.8);
    const relief=naturalizeFmsTerrain(document,{seed:42,strength:1});expect(compareLinearCoasts(document,relief.elevations).maxCrossingDisplacement).toBe(0);
  });
  it.each([13,42,1337])('does not introduce extra zigzags when relaxing an irregular micro-detailed coast (%s)',seed=>{
    const doc=coastFixture('asymmetric');
    doc.points=doc.points.map(([x,y],i)=>x===0||y===0||x===doc.width||y===doc.height?[x,y]:[x+2*Math.sin(i*seed),y+2*Math.cos(i*(seed+1))]);
    const mesh=Delaunay.from(doc.points);doc.triangles=Uint32Array.from(mesh.triangles);doc.neighbors=doc.points.map((_,i)=>[...mesh.neighbors(i)]);
    const detail=prepareFmsCoastPreview(doc,refineFmsCoast(doc,{seed,maxOffset:4}),{seed,maxOffset:4}),{document,result}=preview(detail),m=measureFmsSmoothing(detail,document);
    expect(result.moves.length).toBeGreaterThan(0);expect(m.turningEnergyAfter).toBeLessThan(m.turningEnergyBefore);
    expect(m.maxComponentAreaFraction).toBeLessThanOrEqual(.02);expect(m.minStretch).toBeGreaterThanOrEqual(.8);
  });
  it.each(['hole','overlap','fold','nonrectangular'] as const)('rejects a %s source without attempting an unsafe remesh',fault=>{
    const doc=coastFixture('asymmetric');
    if(fault==='hole'){doc.triangles=doc.triangles.slice(3);adjacency(doc);}
    if(fault==='overlap'){doc.triangles=Uint32Array.from([...doc.triangles,0,2,42]);adjacency(doc);}
    if(fault==='fold')doc.points[20*41+20]=[216,204];
    if(fault==='nonrectangular')doc.width=410;
    const old=structuredClone(doc);expect(()=>preview(doc)).toThrow();expect(doc).toEqual(old);
  });
  it.each(['stats','duplicate','world','revision','options','fixed','out-of-range','not-f32','extra'] as const)('rejects forged %s responses before commit',fault=>{
    const doc=coastFixture('asymmetric'),old=structuredClone(doc),result=smoothFmsCoast(doc,options);
    if(fault==='stats')result.stats.maxComponentAreaFraction=0;
    if(fault==='duplicate')result.moves.push(structuredClone(result.moves[0]));
    if(fault==='world')result.worldId=crypto.randomUUID();if(fault==='revision')result.baseRevision++;
    if(fault==='options')result.options.maxOffset=0;
    if(fault==='fixed')result.moves.push({cell:0,point:[1,1]});
    if(fault==='out-of-range')result.moves[0].point=[-1,4000];
    if(fault==='not-f32')result.moves[0].point[0]+=.000000001;
    if(fault==='extra')Object.assign(result.stats,{untrusted:true});
    expect(()=>prepareFmsCoastSmoothPreview(doc,result,options)).toThrow();expect(doc).toEqual(old);
  });
  it('is deterministic, bounds each operation relative to its source, and never mutates a previous preview',()=>{
    const doc=coastFixture('asymmetric');expect(smoothFmsCoast(doc,options)).toEqual(smoothFmsCoast(doc,options));
    const first=preview(doc),old=structuredClone(first.document),second=preview(first.document),m=measureFmsSmoothing(first.document,second.document);
    expect(first.document).toEqual(old);expect(m.maxCoastDisplacement).toBeLessThanOrEqual(4);expect(second.document.revision).toBe(2);
  });
});
