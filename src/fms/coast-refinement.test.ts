import { describe, expect, it } from 'vitest';
import { Delaunay } from 'd3-delaunay';
import { coastFixture, compareLinearCoasts } from '../../tests/helpers/fms-coast-metrics';
import { naturalizeFmsTerrain } from './naturalize';
import { measureFmsRefinement } from '../../tests/helpers/fms-refinement-metrics';
import { assertFmsDocument, FmsEditHistory, prepareFmsLockEdit, prepareFmsBrushEdit, type FmsDocument } from './model';
import { refineFmsCoast, prepareFmsCoastPreview } from './coast-refinement';

const options={seed:1337,maxOffset:4};
function preview(doc:FmsDocument,chosen=options){const result=refineFmsCoast(doc,chosen);return {result,document:prepareFmsCoastPreview(doc,result,chosen)};}
describe('bounded visible coast refinement',()=>{
  it.each(['island','neck','asymmetric'] as const)('clips changed topology independently and preserves %s sampled features',kind=>{
    const doc=coastFixture(kind),original=structuredClone(doc),{result,document}=preview(doc),m=measureFmsRefinement(doc,document,kind==='island'?40:205);
    expect(doc).toEqual(original);assertFmsDocument(document);
    expect(m).toMatchObject({wrongOrientation:0,unknownChildren:0,originalCrossingDisplacement:0,missingOriginalCrossings:0});
    expect(m.sectionAfter).toEqual(m.sectionBefore);expect(m.maxCoverageError).toBeLessThan(1e-8);
    expect(m.maxLandFraction).toBeLessThanOrEqual(.02+1e-9);expect(m.maxSeaFraction).toBeLessThanOrEqual(.02+1e-9);
    expect(m.maxDisplacement).toBeLessThanOrEqual(options.maxOffset);expect(m.maxDisplacement).toBeCloseTo(result.stats.maxDisplacement,10);
    expect(m.splitParents).toBe(result.splits.length);expect(m.addedPoints).toBe(result.splits.length);
    expect(document.points.slice(0,doc.points.length)).toEqual(doc.points);expect(document.elevations.slice(0,doc.points.length)).toEqual(doc.elevations);
    expect(Array.from(document.elevations.slice(doc.points.length)).every(h=>h===20)).toBe(true);
    if(kind==='island'){expect(result.splits).toHaveLength(0);expect(document).toBe(doc);}
    else {expect(result.splits.length).toBeGreaterThan(50);expect(m.maxDisplacement).toBeGreaterThan(0);expect(refineFmsCoast(document,options).splits).toHaveLength(0);}
  });
  it.each([[21,0],[100,15],[22,19],[100,0]])('bounds both sides at land=%s sea=%s after float32 quantization', (land,sea)=>{
    for(const seed of [1,42,1337]){
      const doc=coastFixture('asymmetric');doc.points=doc.points.map(([x,y])=>[x+7000.123,y+7000.123]);doc.width=8192;doc.height=8192;
      doc.elevations=doc.elevations.map(h=>h>=20?land:sea);
      const {document,result}=preview(doc,{seed,maxOffset:4}),m=measureFmsRefinement(doc,document);
      expect(result.splits.length).toBeGreaterThan(0);expect(m.maxLandFraction).toBeLessThanOrEqual(.02+1e-6);expect(m.maxSeaFraction).toBeLessThanOrEqual(.02+1e-6);
      expect(m.wrongOrientation).toBe(0);expect(m.maxCoverageError).toBeLessThan(1e-7);expect(m.originalCrossingDisplacement).toBe(0);
    }
  });
  it('keeps extreme 100/19 triangles unchanged when the coast leaves no room for robust positive-area children',()=>{
    const doc=coastFixture('asymmetric');doc.elevations=doc.elevations.map(h=>h?100:19);
    const {document,result}=preview(doc);expect(result.splits).toHaveLength(0);expect(document).toBe(doc);
  });
  it('keeps the refined visible coast fixed during subsequent inland naturalization',()=>{
    const refined=preview(coastFixture('asymmetric')).document,result=naturalizeFmsTerrain(refined,{seed:42,strength:1});
    const m=compareLinearCoasts(refined,result.elevations,200);
    expect(result.stats.changedCells).toBeGreaterThan(0);expect(m.maxCrossingDisplacement).toBe(0);expect(m.absoluteAreaChange).toBe(0);expect(m.sectionAfter).toEqual(m.sectionBefore);
  });
  it('keeps default zero offset identical and is deterministic without input aliasing',()=>{
    const doc=coastFixture('neck');expect(preview(doc,{...options,maxOffset:0}).document).toBe(doc);
    expect(refineFmsCoast(doc,options)).toEqual(refineFmsCoast(doc,options));
    const a=preview(doc),b=preview(doc);a.document.points.at(-1)![0]=0;a.document.elevations[0]=99;
    expect(b.document).toEqual(preview(doc).document);expect(doc.elevations[0]).toBe(0);
  });
  it('leaves every locked face intact and freezes exact sea-level triangles',()=>{
    const doc=coastFixture('neck'),initial=refineFmsCoast(doc,options),target=initial.splits[0].triangle;
    doc.version=2;doc.terrainLocks=new Uint8Array(doc.points.length);doc.terrainLocks[doc.triangles[target*3]]=1;
    const {document,result}=preview(doc),splitIds=new Set(result.splits.map(x=>x.triangle));
    for(let t=0;t<doc.triangles.length/3;t++)if(doc.triangles.slice(t*3,t*3+3).some(i=>doc.terrainLocks![i]))expect(splitIds.has(t)).toBe(false);
    expect(document.terrainLocks!.slice(0,doc.points.length)).toEqual(doc.terrainLocks);expect(document.terrainLocks!.slice(doc.points.length).some(Boolean)).toBe(false);
    const exact=structuredClone(doc);exact.elevations[doc.triangles[target*3]]=20;
    expect(refineFmsCoast(exact,options).splits.some(s=>s.triangle===target)).toBe(false);
  });
  it.each(['point','not-f32','duplicate','revision','seed','stats','locked','zero','collinear'] as const)('rejects forged %s geometry atomically',fault=>{
    const doc=coastFixture('neck'),original=structuredClone(doc),packet=refineFmsCoast(doc,options),split=packet.splits[0];
    if(fault==='point')split.point=[0,0];
    if(fault==='not-f32')split.point[0]+=1e-10;
    if(fault==='duplicate')packet.splits.push(structuredClone(split));
    if(fault==='revision')packet.baseRevision++;
    if(fault==='seed')packet.options.seed++;
    if(fault==='stats')packet.stats.maxDisplacement++;
    if(fault==='locked'){doc.version=2;doc.terrainLocks=new Uint8Array(doc.points.length);doc.terrainLocks[doc.triangles[split.triangle*3]]=1;}
    if(fault==='zero'||fault==='collinear'){
      // h=40 yields binary-exact edge midpoints; an off-midpoint collinear point is not detail.
      doc.elevations=doc.elevations.map(h=>h?40:0);const fresh=refineFmsCoast(doc,options);Object.assign(packet,fresh);
      const s=packet.splits[0],ids=Array.from(doc.triangles.slice(s.triangle*3,s.triangle*3+3)),hits:number[][]=[];
      for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3];if(doc.elevations[a]!==doc.elevations[b])hits.push([(doc.points[a][0]+doc.points[b][0])/2,(doc.points[a][1]+doc.points[b][1])/2]);}
      const t=fault==='zero'?.5:.5001;s.point=[Math.fround(hits[0][0]*(1-t)+hits[1][0]*t),Math.fround(hits[0][1]*(1-t)+hits[1][1]*t)];
    }
    const before=structuredClone(doc);expect(()=>prepareFmsCoastPreview(doc,packet,options)).toThrow();expect(doc).toEqual(before);
    if(!['locked','zero','collinear'].includes(fault))expect(doc).toEqual(original);
  });
  it.each([-1,4.01,NaN,Infinity])('rejects invalid max offset %s',maxOffset=>expect(()=>refineFmsCoast(coastFixture('island'),{...options,maxOffset})).toThrow());
  it('respects the actual 50,000-site document budget',()=>{
    const doc=coastFixture('neck');doc.points=[];
    for(let y=0;y<200;y++)for(let x=0;x<250;x++)if(x!==249||y!==199)doc.points.push([x*10,y*10]);
    doc.width=2500;doc.height=2000;const mesh=Delaunay.from(doc.points);doc.triangles=Uint32Array.from(mesh.triangles);
    doc.neighbors=doc.points.map((_,i)=>[...mesh.neighbors(i)]);doc.elevations=Int32Array.from(doc.points,([x,y])=>x>400&&x<2100&&y>400&&y<1600?45:0);
    const {result,document}=preview(doc);expect(result.splits).toHaveLength(1);expect(result.stats.budgetLimited).toBe(true);expect(document.points).toHaveLength(50000);
    expect(refineFmsCoast(document,options).splits).toHaveLength(0);
    const over=structuredClone(result);over.splits.push(structuredClone(over.splits[0]));expect(()=>prepareFmsCoastPreview(doc,over,options)).toThrow();
  });
});

describe('whole-mesh history with point patches and protection opt-in',()=>{
  it('undoes and redoes refinement across v1 -> v2 without downgrading or reusing wrong-length locks',()=>{
    const original=coastFixture('neck'),history=new FmsEditHistory(original),candidate=preview(original).document;
    history.replaceDocument(candidate,0);const count=candidate.points.length;
    history.commit(prepareFmsLockEdit(history.document,[{x:100,y:100,radius:15}],true));const locks=history.document.terrainLocks!.slice();
    history.undo();expect(history.document.terrainLocks!.some(Boolean)).toBe(false);
    history.undo();expect(history.document.points).toEqual(original.points);expect(history.document.version).toBe(2);expect(history.document.terrainLocks).toHaveLength(original.points.length);
    history.redo();expect(history.document.points).toHaveLength(count);expect(history.document.version).toBe(2);expect(history.document.terrainLocks).toHaveLength(count);
    history.redo();expect(history.document.terrainLocks).toEqual(locks);expect(history.document.revision).toBe(6);assertFmsDocument(history.document);
  });
  it('owns mesh snapshots, mixes later brush undo, and rejects stale replacement without clearing redo',()=>{
    const original=coastFixture('neck'),history=new FmsEditHistory(original),candidate=preview(original).document,expected=structuredClone(candidate);
    history.replaceDocument(candidate,0);candidate.points[0][0]=9;candidate.elevations[0]=99;
    history.commit(prepareFmsBrushEdit(history.document,{tool:'land',height:70,stamps:[{x:100,y:100,radius:15}]}));
    history.undo();expect(history.document.elevations).toEqual(expected.elevations);history.undo();
    expect(()=>history.replaceDocument(candidate,0)).toThrow();expect(history.canRedo).toBe(true);
    history.redo();expect(history.document.points).toEqual(expected.points);expect(history.document.elevations).toEqual(expected.elevations);
    history.document.points[0][0]=8;history.undo();expect(history.document.points).toEqual(original.points);history.redo();expect(history.document.points).toEqual(expected.points);
  });
});
