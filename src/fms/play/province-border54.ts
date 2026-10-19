import type {FmsDocument} from '../model';
import type {World} from '../../sim/types';
import {originalCellProvinces} from '../original/original-politics';
import {nativeFilterProvinceCells53} from './native-combat/province-cells53';
import {nativeProvinceProtruding52} from './native-combat/province-border52';
import {certifiedGeography47,copyGeographyContent47,sameGeographyContent47,geographyDependencies47,retainGeographyWitness47} from './geography-content47';
type Input={terrain:FmsDocument;world:World;scale:number};
type Borders={id:string;outside:number[];indices:number[]}[];
const cache:{cost:number;witness:unknown;borders:Borders}[]=[];
function bordersOf(r:Input):Borders{
 const deps={...geographyDependencies47(r),neighbors:r.terrain.neighbors,scale:r.scale};
 const hit=cache.find(e=>sameGeographyContent47(e.witness,deps));if(hit){
  if(certifiedGeography47(deps.neighbors)&&(hit.witness as typeof deps).neighbors!==deps.neighbors){const fresh=copyGeographyContent47(deps);if(fresh){hit.witness=fresh.value;hit.cost=fresh.cost;}}
  return hit.borders;
 }
 // Explicit WEB bridge: exactly the cell ownership painted by original-style
 // politics. Never count clipped travel triangles as native map cells.
 const owners=originalCellProvinces(r.terrain,r.world.provinces,r.scale);
 const rows=nativeFilterProvinceCells53({province:Array.from(owners,i=>i+1),neighbor:r.terrain.neighbors,height:Array.from(r.terrain.elevations),feature:Array.from(owners,()=>0)},Array(r.world.provinces.length+1).fill(true));
 // Only border contacts are consumed; placeholder Feature is NOT used as
 // native connectivity evidence. Unassigned sea remains province zero.
 const borders=r.world.provinces.map((p,i)=>{const outside=rows[i+1]!.borderNeighborCells.map(c=>owners[c]);return{id:p.id,outside,indices:outside.map((_,i)=>i)};});
 const witness=copyGeographyContent47(deps);if(witness)retainGeographyWitness47(cache,{cost:witness.cost,witness:witness.value,borders});
 return borders;
}
/** Geometry is content-checked once per reader; ownership is read on EVERY
 * call so captures within one occupation phase cannot retain old modifiers.
 * The derived cache is never serialized; old journals use their frozen engine. */
export function provinceBorderReader54(r:Input,world:World=r.world):(id:string)=>boolean{
 const rows=bordersOf({...r,world}),byId=new Map(rows.map((p,i)=>[p.id,i]));
 return id=>{
  const index=byId.get(id);if(index===undefined)throw Error('突出部省份不存在。');
  const row=rows[index],province=world.provinces[index];if(province?.id!==id)throw Error('突出部省份顺序已改变。');
  const states=row.outside.map(i=>{const p=world.provinces[i];if(!p||p.id!==rows[i].id)throw Error('突出部邻省已改变。');return p.controller===province.controller?1:0;});
  return nativeProvinceProtruding52(1,row.indices,states);
 };
}
