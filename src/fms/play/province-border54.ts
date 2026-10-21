import type {FmsDocument} from '../model';
import type {World} from '../../sim/types';
import {originalCellProvinces} from '../original/original-politics';
import {nativeFilterProvinceCells53} from './native-combat/province-cells53';
import {nativeBorderEnemies55} from './native-war/state-border55';
import {certifiedGeography47,copyGeographyContent47,sameGeographyContent47,geographyDependencies47,retainGeographyWitness47} from './geography-content47';
type Input={terrain:FmsDocument;world:World;scale:number};
type Borders={id:string;outside:number[];indices:number[];groups?:[number,number][]}[];
const cache:{cost:number;witness:unknown;borders:Borders}[]=[];
function bordersOf(r:Input):Borders{
 const deps={...geographyDependencies47(r),neighbors:r.terrain.neighbors,scale:r.scale};
 const hit=cache.find(e=>sameGeographyContent47(deps,e.witness));if(hit){
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
  // Same result as nativeProvinceProtruding52 over every border contact: the
  // foreign contact count is an exact integer, so contacts are grouped once by
  // neighbouring province and each province's owner is read once per call.
  const groups=row.groups??=[...row.outside.reduce((m,i)=>m.set(i,(m.get(i)??0)+1),new Map<number,number>())];
  let foreign=0;for(const [i,count] of groups){const p=world.provinces[i];if(!p||p.id!==rows[i].id)throw Error('突出部邻省已改变。');if(p.controller!==province.controller)foreign+=count;}
  return Math.fround(Math.fround(foreign)/Math.fround(row.outside.length))>.5;
 };
}

/** Derived WEB bridge to State.FilterBorderEnemyProvince. Use the same
 * displayed map-cell contacts as combat. Re-read ownership and enemy sets on
 * each call: a captured province or a truce must not survive in a cached front.
 * Current campaigns supply regular enemies; native rebel classification is
 * not claimed. Route/access validation still runs after target selection. */
export function stateBorderReader55(r:Input){
 const rows=bordersOf(r),neighbors=new Map(rows.map(row=>[row.id,[...new Set(row.outside.map(i=>rows[i].id))]]));
 const places=new Map(r.world.provinces.map(p=>[p.id,p]));
 return (state:string,regular:ReadonlySet<string>)=>{
  const owned=r.world.provinces.filter(p=>p.controller===state).map(p=>p.id);
  return nativeBorderEnemies55(state,owned,id=>neighbors.get(id)!,id=>places.get(id)!.controller,regular,regular,new Set<string>()).regular;
 };
}
