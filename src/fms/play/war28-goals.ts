import type {SeaGraph} from './sea-path';
import {buildWar26Goal} from './war26-state';
import {war26Strength} from './war26-strength';
import {seededCharacterRandom} from './native-economy/character-generation';
import {provinceNumber,stateNumber,orderedWar28Provinces,type War28State,type War28World} from './war28-state';
import type {NativeSettlementGoal} from './native-war/settlement-verdict';
import {nativeConquestGoals} from './native-war/conquest-goals';
import {NativeWarIdSet,nativeGrowClaimComponent,nativeProvinceDistance,type NativeWarProvince} from './war26-native';
import {landComponents} from './voyage24-geography';
/** Ordinary TerritorialConquest branch of BuildDefaultGoals (6678C0).
 * Reachable claim selection and PRNG are explicit web adapters; complete CB
 * eligibility/catalog/AI selection are not claimed by this bridge. */
export function war28DeclarationGoals(r:War28World,s:War28State,g:SeaGraph,attacker:string,defender:string):NativeSettlementGoal[]{
 const selected=buildWar26Goal(r.world,g,attacker,defender,(w,id)=>war26Strength(w,r,id));
 if(!selected.provinceIds.length)throw Error('这场战争没有可抵达的陆地或登陆目标。');
 const a=stateNumber(r,attacker),d=stateNumber(r,defender),lands=landComponents(r.world,g),starts=g.ports.filter(p=>r.world.provinces.find(v=>v.id===p.provinceId)?.controller===attacker);
 const reachablePorts=new Set(g.ports.filter(p=>starts.some(from=>lands.get(from.provinceId)!==lands.get(p.provinceId)&&g.nodes.get(from.node)!.component===g.nodes.get(p.node)!.component)).map(p=>p.provinceId));
 const cedeable=orderedWar28Provinces(r,defender).filter(p=>p.neighbors.some(id=>r.world.provinces.find(v=>v.id===id)?.controller===attacker)||reachablePorts.has(p.id)).map(p=>provinceNumber(s,p.id));
 const positions=s.provinceIds.map(id=>{const p=r.world.provinces.find(p=>p.id===id)!;return {x:p.center.x,y:0,z:p.center.y};});
 const provinces=new Map<number,NativeWarProvince>(r.world.provinces.map(p=>{const id=provinceNumber(s,p.id);return [id,{id,center:id-1,stateId:stateNumber(r,p.controller),isLand:true,neighbors:new NativeWarIdSet(p.neighbors.map(id=>provinceNumber(s,id)))}];}));
 // Separate deterministic stream freezes the draw at declaration. It does
 // not reproduce Unity.Random's shared process stream or native CB CanUse.
 const random=seededCharacterRandom(`${r.world.custom!.seed}/war28-goal/${s.nextId}/${attacker}/${defender}/${r.clock.tick}`);
 return nativeConquestGoals(a,d,{canUse:()=>selected.provinceIds.length>0&&r.world.provinces.some(p=>p.controller===attacker),cedeable:()=>cedeable,defenderLand:()=>orderedWar28Provinces(r,defender).length,strength:id=>war26Strength(r.world,r,id===a?attacker:defender),randomValue:()=>random.value(),connected:count=>{const result:number[]=[];nativeGrowClaimComponent(provinces.get(provinceNumber(s,selected.provinceIds[0]))!,d,count,result,new NativeWarIdSet(),id=>provinces.get(id)??null,(a,b)=>nativeProvinceDistance(a,b,()=>positions));return result;}});
}
