import type {FmsDocument} from '../model';
import type {World} from '../../sim/types';
import {nativeFilterProvinceCells53} from './native-combat/province-cells53';
import {nativeProvinceProtruding52} from './native-combat/province-border52';
import {nativeCountBorderContactCells} from './native-combat/border-contact55';
import {projectCellData55} from './celldata-projection55';
import {certifiedGeography47,copyGeographyContent47,sameGeographyContent47,geographyDependencies47,retainGeographyWitness47} from './geography-content47';

type Input={terrain:FmsDocument;world:World;scale:number};
type Contact={id:string;cells:number};
type Row={id:string;borderNeighborCells:number[];contacts:Contact[];neighbors:string[];isSeaNeighbor:boolean;isAllCellsConnected:boolean;feature:number};
type Deps=ReturnType<typeof geographyDependencies47>&{neighbors:FmsDocument['neighbors'];scale:number};
type Entry={cost:number;witness:Deps;owners:Int32Array;rows:Row[]};
const cache:Entry[]=[];

function bordersOf(r:Input):Entry{
 const deps:Deps={...geographyDependencies47(r),neighbors:r.terrain.neighbors,scale:r.scale};
 const hit=cache.find(e=>sameGeographyContent47(deps,e.witness));if(hit){
  if(certifiedGeography47(deps.neighbors)&&(hit.witness as Deps).neighbors!==deps.neighbors){const fresh=copyGeographyContent47(deps);if(fresh){hit.witness=fresh.value;hit.cost=fresh.cost;}}
  return hit;
 }
 // Cell ownership is the display vote. Border lists come only from
 // FilterProvinceCells on those cells, never from clipped march faces.
 const projected=projectCellData55(r.terrain,r.world.provinces,r.scale);
 const native=nativeFilterProvinceCells53({province:projected.province,neighbor:projected.neighbor,height:projected.height,feature:projected.feature},Array(r.world.provinces.length+1).fill(true));
 const rows=r.world.provinces.map((p,i)=>{
  const row=native[i+1];if(!row)throw Error('边境格省份槽缺失。');
  let total=0;const contacts=row.neighbors.map(slot=>{
   const other=slot-1,province=r.world.provinces[other];if(!province)throw Error('边境邻省不存在。');
   let cells=0;for(const c of row.borderNeighborCells)if(projected.owners[c]===other)cells++;
   total+=cells;return {id:province.id,cells};
  });
  if(total!==row.borderNeighborCells.length)throw Error('边境格接触与邻省计数不一致。');
  return {id:p.id,borderNeighborCells:row.borderNeighborCells,contacts,neighbors:contacts.map(c=>c.id),isSeaNeighbor:row.isSeaNeighbor,isAllCellsConnected:row.isAllCellsConnected,feature:row.cells.length?projected.feature[row.cells[0]]:0};
 });
 const witness=copyGeographyContent47(deps),entry:Entry={cost:witness?.cost??0,witness:witness?.value??deps,owners:projected.owners,rows};
 if(witness)retainGeographyWitness47(cache,entry);
 return entry;
}
function nationSlot(world:World,id:string){
 const slot=world.nations.findIndex(n=>n.id===id);if(slot<0)throw Error('边境格国家不存在。');return slot+1;
}
function liveStates(world:World,owners:Int32Array){
 const slots=world.provinces.map(p=>nationSlot(world,p.controller)),states=new Int32Array(owners.length);
 for(let c=0;c<owners.length;c++){const owner=owners[c];if(owner<0)continue;if(owner>=slots.length)throw Error('边境格省份不存在。');states[c]=slots[owner];}
 return states;
}
export type StateBorderProfile55={contacts:number;neighbors:string[];sea:boolean;feature:number;connected:boolean};
/** Production State.Update border view. Quantities are FilterProvinceCells
 * borderNeighborCells. 网页适配：首都圈与贴海驻防仍用多边形邻省和行军面，
 * 不在这里改写；isSeaNeighbor 也不是“贴着省0海洋”。 */
export function stateBorderView55(r:Input,world:World=r.world){
 const stored=bordersOf({...r,world}),byId=new Map(stored.rows.map((row,i)=>[row.id,i]));
 let stamp='',states:Int32Array|null=null;
 const cellStates=():Int32Array=>{
  let next='';for(const n of world.nations)next+=n.id+'\n';for(const p of world.provinces)next+=p.controller+'\n';
  if(!states||next!==stamp){stamp=next;states=liveStates(world,stored.owners);}
  return states;
 };
 const resolve=(id:string)=>{
  const index=byId.get(id);if(index===undefined)throw Error('突出部省份不存在。');
  const province=world.provinces[index];if(province?.id!==id)throw Error('突出部省份顺序已改变。');
  return {province,row:stored.rows[index]};
 };
 return {
  protruding:(id:string)=>{const {province,row}=resolve(id);return nativeProvinceProtruding52(nationSlot(world,province.controller),row.borderNeighborCells,cellStates());},
  contacts:(id:string)=>resolve(id).row.contacts.map(c=>({id:c.id,cells:c.cells})),
  contactCount:(id:string,attackerNationId:string)=>nativeCountBorderContactCells(resolve(id).row.borderNeighborCells,cellStates(),nationSlot(world,attackerNationId)),
  profile:(id:string):StateBorderProfile55=>{const {row}=resolve(id);return {contacts:row.borderNeighborCells.length,neighbors:[...row.neighbors],sea:row.isSeaNeighbor,feature:row.feature,connected:row.isAllCellsConnected};},
 };
}
export function stateBorderDigest55(r:Input){
 const view=stateBorderView55(r),provinces=r.world.provinces.map(p=>{const profile=view.profile(p.id);return {id:p.id,contacts:profile.contacts,neighbors:profile.neighbors,sea:profile.sea,feature:profile.feature,connected:profile.connected};});
 return {source:'cells' as const,contacts:provinces.reduce((n,p)=>n+p.contacts,0),provinces};
}
