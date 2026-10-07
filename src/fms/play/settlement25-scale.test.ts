import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createFmsDocument,prepareFmsOutlineEdit,commitFmsEdit} from '../model';
import {settlementRegions} from './settlement25-regions';
import {landFaces,polygonArea} from './settlement25-mesh';
import {Settlement25Session} from './settlement25-session';
import {assertSettlement25,type Settlement25Run} from './settlement25-model';
it('partitions full default drawing topology at selected densities and creates a real playable 24-country world',async()=>{
 const raw=await createFmsDocument(),w=raw.width,h=raw.height,terrain=commitFmsEdit(raw,prepareFmsOutlineEdit(raw,[[w*.05,h*.25],[w*.95,h*.25],[w*.95,h*.75],[w*.05,h*.75]],45)),faces=landFaces(terrain),area=faces.reduce((s,f)=>s+polygonArea(f.ring),0),measurements:object[]=[];
 for(const count of [24,60,120,240,480]){const start=performance.now();try{const regions=settlementRegions(terrain,count);measurements.push({count,created:regions.length,ms:performance.now()-start,maxBoundary:Math.max(...regions.map(r=>r.ring.length)),smallestArea:Math.min(...regions.map(r=>r.area))});expect(regions).toHaveLength(count);expect(regions.reduce((s,r)=>s+polygonArea(r.ring),0)).toBeCloseTo(area,4);}catch(error){measurements.push({count,error:String(error),ms:performance.now()-start});throw error;}finally{mkdirSync('.autopilot/settlement25-evidence',{recursive:true});writeFileSync('.autopilot/settlement25-evidence/scale.json',JSON.stringify({scope:'Synthetic drawn full 36864-point default mesh. Local CPU, not phone performance.',measurements},null,2));}}
 const s=new Settlement25Session(),start=performance.now(),run=s.execute({type:'create',terrain,count:24,cityCount:120,relations:'peace'}).run as Settlement25Run,createdMs=performance.now()-start;assertSettlement25(run);expect(run.world.cities).toHaveLength(120);expect(run.world.nations).toHaveLength(24);expect(run.world.nations.every(n=>/^#[a-f0-9]{6}$/.test(n.color))).toBe(true);
 const tick=performance.now(),next=s.execute({type:'tick',ticks:12,expected:{day:run.world.day,nextEventId:run.world.nextEventId,tick:run.clock.tick}}).run as Settlement25Run,tickMs=performance.now()-tick;assertSettlement25(next);expect(next.clock.tick).toBe(12);expect(createdMs).toBeLessThan(25000);
 writeFileSync('.autopilot/settlement25-evidence/scale.json',JSON.stringify({scope:'Synthetic drawn full 36864-point default mesh. Local CPU, not phone performance.',points:terrain.points.length,faces:faces.length,measurements,createdMs,tickMs,cities:run.world.cities.length,nations:run.world.nations.length,armies:run.world.armies.length,engine:run.engine},null,2));
},90000);
it.each(['lake','neck'] as const)('preserves all full-mesh %s land when drawing 60 cities',async kind=>{
 const doc=await createFmsDocument();doc.elevations=Int32Array.from(doc.points,([px,py])=>{const x=px/doc.width,y=py/doc.height;return (kind==='lake'?x>.08&&x<.92&&y>.08&&y<.92&&!(x>.35&&x<.65&&y>.35&&y<.65):(((x>.08&&x<.40)||(x>.60&&x<.92))&&y>.20&&y<.80)||x>=.40&&x<=.60&&Math.abs(y-.5)<.005)?45:0;});
 const regions=settlementRegions(doc,60),faces=landFaces(doc);expect(regions).toHaveLength(60);expect(new Set(regions.flatMap(r=>r.members)).size).toBe(faces.length);expect(regions.reduce((s,r)=>s+polygonArea(r.ring),0)).toBeCloseTo(faces.reduce((s,f)=>s+polygonArea(f.ring),0),4);
 if(kind==='lake'){const s=new Settlement25Session(),r=s.execute({type:'create',terrain:doc,count:10,cityCount:60,relations:'peace'}).run as Settlement25Run;assertSettlement25(r);expect(r.world.cities).toHaveLength(60);const n=s.execute({type:'tick',ticks:1,expected:{day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick}}).run as Settlement25Run;assertSettlement25(n);expect(n.clock.tick).toBe(1);}
},30000);
