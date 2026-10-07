import {nativeDiplomaticPairKey,type NativeDiplomaticRelation} from './diplomatic-relations';
const f=Math.fround;
export interface NativeAffinityTrait {name:string;relationshipBonus:number}
export interface NativeAffinityLeader {alive:boolean;traits:readonly (NativeAffinityTrait|null)[]|null}
export interface NativeAffinityState {
 id:number;
 neighbors:ReadonlySet<number>;
 features:ReadonlySet<number>;
 culture:number;
 politicalSystem:number;
 provinceCount:number;
 alliance:object|null;
}
export interface NativeAffinityCaches {affinity:Map<bigint,number>;atWar:Map<bigint,boolean>;sameWar:Map<bigint,boolean>}
export const createNativeAffinityCaches=():NativeAffinityCaches=>({affinity:new Map(),atWar:new Map(),sameWar:new Map()});
/** DiplomacyManager.Update in World.FixedUpdate: these three caches expire
 * together only while the game has started and is not paused. */
export function nativeUpdateDiplomaticCaches(c:NativeAffinityCaches,started:boolean,paused:boolean){if(started&&!paused){c.affinity.clear();c.atWar.clear();c.sameWar.clear();}}
export interface NativeAffinityQueries<S extends NativeAffinityState,L extends NativeAffinityLeader> {
 isSuperPower:(state:S)=>boolean;
 superSuperpowerExists:()=>boolean;
 nearSea:(state:S)=>boolean;
 intersectLands:(source:S,target:S)=>boolean;
 atWar:(source:S,target:S)=>boolean;
 enemies:(state:S)=>Iterable<S>;
 leader:(state:S)=>L|null;
 diplomaticSkill:(leader:L)=>number;
 relation:(source:S,target:S)=>NativeDiplomaticRelation;
 yearsSinceWar:(relation:NativeDiplomaticRelation)=>number;
 truceYears:(relation:NativeDiplomaticRelation)=>number;
 minimumYearsBeforeNewWar:number;
}
const systemAffinity=[
 [10,-10,10,10,0,5], [15,-30,-20,-20,0,0],
 [10,-20,20,20,-10,-20], [10,-20,20,20,-10,-20],
 [0,-10,-10,-10,25,0], [10,-10,-10,-10,0,-20],
] as const;
/** GetPoliticalSystemAffinity 896C40, row source / column target. */
export const nativePoliticalSystemAffinity=(source:number,target:number):number=>systemAffinity[source as 0]?.[target as 0]??0;
function add<K,V>(cache:Map<K,V>,key:K,value:V){if(cache.has(key))throw Error('Native duplicate cache key');cache.set(key,value);}
/** GetAffinity 8963E0. The formula is directional, but its cache key is NOT.
 * Preserve first-query direction; do not average, clamp, or symmetrize it.
 * External inputs retain explicit ports until their production data exists. */
export function nativeDiplomaticAffinity<S extends NativeAffinityState,L extends NativeAffinityLeader>(source:S,target:S,c:NativeAffinityCaches,q:NativeAffinityQueries<S,L>):number{
 const key=nativeDiplomaticPairKey(source.id,target.id);
 if(c.affinity.has(key))return c.affinity.get(key)!;
 let atWar=c.atWar.get(key);
 if(atWar===undefined){atWar=q.atWar(source,target);add(c.atWar,key,atWar);}
 let value=f(0);
 if(q.isSuperPower(target)||q.isSuperPower(source))value=f(value-100);
 else if(q.superSuperpowerExists()&&!q.isSuperPower(source))value=f(value+25);
 if(target.neighbors.size===1&&target.neighbors.has(source.id)&&!q.nearSea(target))value=f(value-200);
 if(q.intersectLands(source,target))value=f(value-300);
 value=f(value+(source.neighbors.has(target.id)?-25:25));
 const overlapping=[...source.features].some(id=>target.features.has(id));value=f(value+(overlapping?-25:-10));
 if(atWar){value=f(value-500);add(c.sameWar,key,true);}
 else{
  let shared=c.sameWar.get(key);
  if(shared===undefined){
   // Enumerable.Intersect enumerates the second sequence into a set first.
   const first=q.enemies(source),second=q.enemies(target),targets=new Set(second);
   shared=false;for(const enemy of first)if(targets.has(enemy)){shared=true;break;}
   add(c.sameWar,key,shared);
  }
  if(shared)value=f(value+50);
 }
 if(source.culture===target.culture)value=f(value+15);
 const leader=q.leader(target);
 if(leader?.traits)for(const trait of leader.traits){
  if(!trait)throw Error('Native null character trait');
  if(trait.name==='SocialButterfly'&&trait.relationshipBonus>0){value=f(value+f(trait.relationshipBonus));break;}
 }
 const countDifference=(source.provinceCount-target.provinceCount)|0;
 value=f(value+Math.max(-20,Math.min(0,Math.trunc(countDifference/5))));
 const relation=q.relation(source,target);
 if(!atWar&&q.yearsSinceWar(relation)>f(q.minimumYearsBeforeNewWar)&&value>20)value=20;
 if(source.alliance!==null&&source.alliance===target.alliance)value=f(value+30);
 if(!atWar){const truce=q.truceYears(relation),years=q.yearsSinceWar(relation);if(truce>=years)value=f(value+100);}
 value=f(value+nativePoliticalSystemAffinity(source.politicalSystem,target.politicalSystem));
 const currentLeader=q.leader(target);
 if(currentLeader?.alive)value=f(value+f(f(q.diplomaticSkill(currentLeader))-50));
 add(c.affinity,key,value);return value;
}
