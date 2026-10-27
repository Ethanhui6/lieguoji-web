import {beforeAll,expect,it} from 'vitest';
import {nativeBiomeSpeed,NATIVE_BIOME_SPEED} from './native-war/biome-speed';
import {grid} from './fixture.test-support';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {actualForces47} from './force-runtime47';
import {actualForceSpeed47,assertForceSpeed47} from './force-speed47';
import {advanceArmyTravel47,armyTravelLocation47,beginArmyTravelToPoint47} from './army-travel47-state';
import {armyMovementInfo47} from './army-movement-info47';

let base:FoundingForces47;
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),4,24,'peace',{mode:'culture-generated',enabled:['chinese','japanese','english','arab']},{},undefined,undefined,'original');},30000);
it('matches all 13 original entries and rejects invalid biome identities',()=>{
 expect(NATIVE_BIOME_SPEED).toEqual([1,.7,.7,1,1,1,1,1,1,1,1,.7,1].map(Math.fround));
 for(const n of [-1,13,1.5,NaN])expect(()=>nativeBiomeSpeed(n)).toThrow();
});
it('persists founding face sampling and rejects damaged saved tables',()=>{
 expect(base.forceSpeed.biomePolicy).toBe('native-biome-face-v1');
 if(base.forceSpeed.biomePolicy!=='native-biome-face-v1')throw Error('missing biome table');
 expect(base.forceSpeed.faceBiomes).toHaveLength(base.terrain.triangles.length/3);
 const restored=JSON.parse(JSON.stringify(base.forceSpeed));assertForceSpeed47(restored,base.world,0);
 restored.faceBiomes[0]=13;expect(()=>assertForceSpeed47(restored,base.world,0)).toThrow();
});
it('same army and same travel route cover 30% less distance on desert or snow; province flags override biome',()=>{
 const r=structuredClone(base),frame=actualForces47(r),force=frame.forces.find(f=>f.kind==='army')!,g=frame.spatial.graph,cell=armyTravelLocation47(force.travel,g).cell;
 if(r.forceSpeed.biomePolicy!=='native-biome-face-v1'||!cell.provinceId)throw Error('missing land');
 const table=r.forceSpeed.faceBiomes,land=r.terrainContext.provinces[cell.provinceId];land.mountain=false;land.plateau=false;
 const origin=cell.center,destination={x:(origin.x+cell.polygon[0].x)/2,y:(origin.y+cell.polygon[0].y)/2};
 const path=beginArmyTravelToPoint47(force.id,[cell.id],g,origin,destination);
 const distance=(biome:number)=>{table[cell.face]=biome;const next=advanceArmyTravel47(path,g,1,c=>actualForceSpeed47(r,force,c),()=>true).travel,p=armyTravelLocation47(next,g).point;return Math.hypot(p.x-origin.x,p.y-origin.y);};
 const normal=distance(4);expect(normal).toBeGreaterThan(0);
 for(const biome of [1,2,11])expect(distance(biome)/normal).toBeCloseTo(.7,5);
 table[cell.face]=1;const desert=actualForceSpeed47(r,force,cell);land.mountain=true;const mountain=actualForceSpeed47(r,force,cell);table[cell.face]=4;expect(actualForceSpeed47(r,force,cell)).toBe(mountain);expect(mountain/desert).toBeCloseTo(.5/.7,5);
 const info=armyMovementInfo47(r,force.id)!;expect(info.terrain).toBe(.5);expect(info.reason).toBe('山地');expect(info.speed*r.forceSpeed.mapUnitsPerNativeUnit*r.forceClock.secondsPerTick).toBeCloseTo(mountain,10);
 land.mountain=false;land.plateau=true;const plateau=actualForceSpeed47(r,force,cell);table[cell.face]=11;expect(actualForceSpeed47(r,force,cell)).toBe(plateau);
});
