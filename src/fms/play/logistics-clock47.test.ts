import {it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {createFoundingForces47} from './civilization47-forces';
import {actualForces47} from './force-runtime47';
import {beginArmyTravel47} from './army-travel47-state';
import {advanceCivilizationMilitary47} from './civilization47-military';
import {settleCivilizationDay47} from './civilization47-daily';
import {forceKey47} from './force-motion47';
import {prepareOwnedGeography47,withOwnedNumericGeography47} from './geography-content47';
import {fleetRation47} from './logistics-clock47';
it('keeps carried food through the first and subsequent native attack deadlines, without granting a resupply',()=>{
 let r=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),2,24,'war',{mode:'culture-generated',enabled:['chinese','japanese']});
 const g=actualForces47(r).spatial.graph,sea=[...g.cells.values()].find(c=>c.surface==='sea')!,a=r.world.armies[0],b=r.world.armies.find(v=>v.nationId!==a.nationId)!;
 for(const army of r.world.armies){army.troops=0;army.status='destroyed';}
 for(const army of [a,b]){army.troops=20000;army.supplies=100;army.status='idle';r.armyPositions.records[army.id]=beginArmyTravel47(army.id,[sea.id],g);}
 for(const fleet of r.navy.fleets){fleet.status='lost';r.maritime.hulls[fleet.id]=0;}
 const snapshots:{day:number;food:number;volleys:number}[]=[],times:number[]=[];
 prepareOwnedGeography47(r);
 for(let day=1;day<=81;day++){
  r=withOwnedNumericGeography47(r,candidate=>{const out=advanceCivilizationMilitary47(candidate,120,{preferPorts:false,portSeaFaces:new Set(),oceanRouteFaces:new Set()});times.push(...out.volleys.map(v=>v.at));return settleCivilizationDay47(out.run,()=>undefined);});prepareOwnedGeography47(r);
  if([13,20,81].includes(day))snapshots.push({day,food:r.world.armies.find(v=>v.id===a.id)!.supplies,volleys:times.length});
 }
 expect(snapshots[0].food).toBeCloseTo(100-13*8/30,8);expect(snapshots[0].volleys).toBe(0);
 expect(snapshots[1].volleys).toBeGreaterThan(0);expect(snapshots[1].food).toBeGreaterThan(90);
 expect(snapshots[2].volleys).toBeGreaterThan(snapshots[1].volleys);expect(snapshots[2].food).toBeGreaterThan(70);
 expect(r.losses.nations[a.nationId].total.starvation).toBe(0);expect(r.forceDamage.losses[forceKey47({kind:'army',id:a.id})]).toBeGreaterThan(0);
},180000);
it('rounds actual fleet day rations up without free grain or a zero consumption small crew',()=>{
 expect(fleetRation47(1)).toBe(1);expect(fleetRation47(40)).toBe(2);expect(fleetRation47(120)).toBe(4);
});
