/** PE/IL2CPP Army.FindTargetIdleProvince 348CE0, GetCapitalAreaProvinces
 * 34B170 and WeightedRandomSelection 352540. Input order is significant.
 * Targeting count is Province.armiesTargetingProvince (+130), not residents.
 * Browser PRNG, route feasibility and province projection live in the adapter. */
export type IdleArmyProvince={id:string;capitalArea:boolean;border:boolean;land:boolean;coastal:boolean;allyNeighbor:boolean;foreignLandNeighbor:boolean;targeting:number};
export function nativeIdleArmyPools(provinces:IdleArmyProvince[]){
 const priority:{id:string;weight:number}[]=[],secondary:{id:string;weight:number}[]=[];
 const weight=(p:IdleArmyProvince)=>p.coastal?0.5:p.land?2:1;
 for(const p of provinces){if(!p.border||p.capitalArea)continue;const cap=p.allyNeighbor?1:4;if(p.targeting>=cap)continue;(p.foreignLandNeighbor?priority:secondary).push({id:p.id,weight:p.allyNeighbor?Math.fround(0.2):weight(p)});}
 for(const p of provinces)if(p.capitalArea&&p.targeting<4)priority.push({id:p.id,weight:weight(p)});
 return {priority,secondary};
}
export function nativeChooseIdleArmy(pools:ReturnType<typeof nativeIdleArmyPools>,homeId:string|null,ownIds:string[],random:()=>number):string|null{
 const {priority,secondary}=pools;
 const list=priority.length&&secondary.length?(Math.fround(random())<Math.fround(0.18)?secondary:priority):priority.length?priority:secondary;
 if(!list.length)return homeId??(ownIds.length?ownIds[Math.min(ownIds.length-1,Math.floor(random()*ownIds.length))]:null);
 const total=list.reduce((sum,p)=>Math.fround(sum+p.weight),0);
 if(total<=0)return list[Math.min(list.length-1,Math.floor(random()*list.length))].id;
 const draw=Math.fround(Math.fround(random())*total);let sum=0;
 for(const p of list){sum=Math.fround(sum+p.weight);if(sum>=draw)return p.id;}
 return list[list.length-1].id;
}
