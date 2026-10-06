import {it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {createDistrictRun,polygonArea} from './district-world';
import {createFmsRun} from './world';
import {buildTerrainContext,assertTerrainContext} from './terrain13-context';
it.each([
 ['coast',(x:number)=>x<=120?45:0],
 ['h20',(x:number,y:number)=>x<60?0:x===60?20:y>150?85:45],
 ['islands',(x:number,y:number)=>((x>20&&x<100)||(x>170&&x<230))&&y>30&&y<220?45:0],
 ['lake',(x:number,y:number)=>x>80&&x<160&&y>80&&y<160?0:45],
 ['unclamped saved elevation',()=>145],
] as const)('recovers every clipped land face on %s without moving the saved geography',(_,height)=>{
 const doc=grid(height),run=createDistrictRun(doc,2),before=structuredClone(run),c=buildTerrainContext(doc,run.world,run.scale);assertTerrainContext(c,run.world,doc.points.length);
 for(const p of run.world.provinces){expect(c.provinces[p.id].area).toBeCloseTo(polygonArea(p.polygon),5);expect(c.provinces[p.id].biomes.reduce((s,n)=>s+n)).toBeCloseTo(1,6);}
 expect(run).toEqual(before);expect(buildTerrainContext(doc,run.world,run.scale)).toEqual(c);
});
it('uses actual area through different saved district partitions and unique vertex elevations',()=>{
 const doc=grid((x,y)=>x===120&&y===120?90:45),current=createDistrictRun(doc,2),old=createFmsRun(doc,2),a=buildTerrainContext(doc,current.world,current.scale),b=buildTerrainContext(doc,old.world,old.scale);
 const totals=(c:typeof a)=>new Array<number>(13).fill(0).map((_,i)=>Object.values(c.provinces).reduce((s,p)=>s+p.area*p.biomes[i],0));
 totals(a).forEach((value,i)=>expect(value).toBeCloseTo(totals(b)[i],1));
 const peaks=Object.values(a.provinces).filter(p=>p.average>45);expect(peaks.length).toBeGreaterThan(0);for(const p of peaks)expect(p.average).toBeCloseTo(45+45/p.samples,5);
});
it('rejects overlapping or moved saved provinces instead of guessing a nearby terrain',()=>{
 const doc=grid(),r=createDistrictRun(doc,2);r.world.provinces[1].polygon=structuredClone(r.world.provinces[0].polygon);expect(()=>buildTerrainContext(doc,r.world,r.scale)).toThrow('唯一匹配');
});
