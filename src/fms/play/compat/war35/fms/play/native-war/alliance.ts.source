/** Installed PE: GetAllianceTarget 899630, IsAcceptable 33E510,
 * TryJoin/Start/EndAlliance 5DA480/5DB6D0/5D9CD0, UpdateDiplomacy 5DD840.
 * Call order, strict thresholds and land-versus-sea tests are observable rules.
 * Random/calendar/ranking are ports; no Unity RNG equivalence is asserted. */
export interface NativeAllianceState {id:number;dead:boolean;blankState:boolean;vassal:boolean;alliance:object|null;neighbors:ReadonlySet<number>;seaNeighbors:ReadonlySet<number>}
export interface NativeAllianceQueries<S extends NativeAllianceState>{
 strength:(n:S)=>number;superPower:(n:S)=>boolean;atWar:(a:S,b:S)=>boolean;
 isAtWar:(n:S)=>boolean;affinity:(a:S,b:S)=>number;
}
export function nativeAllianceTargets<S extends NativeAllianceState>(a:S,states:readonly S[],q:NativeAllianceQueries<S>){
 if(a.dead)return [];
 return states.filter(b=>b!==a&&!b.dead&&b.id!==0&&!b.blankState&&!b.vassal&&b.alliance===null&&!q.atWar(a,b)&&
  (a.neighbors.has(b.id)||a.seaNeighbors.has(b.id))&&!q.superPower(b)&&
  q.strength(a)<=Math.fround(q.strength(b)*3)&&q.strength(b)<=Math.fround(q.strength(a)*3)&&q.affinity(a,b)>5);
}
export function nativeAllianceAcceptable<S extends NativeAllianceState>(members:readonly S[],candidate:S,q:NativeAllianceQueries<S>){
 return members.length>1&&members.some(n=>!n.dead)&&members.every(n=>q.affinity(n,candidate)>=0&&!q.isAtWar(n))&&members.some(n=>n.neighbors.has(candidate.id));
}
export interface NativeAllianceDecision<S extends NativeAllianceState,A>{
 enabled:boolean;sinceAction:number;states:readonly S[];alliances:readonly A[];current:A|null;
 members:(a:A)=>S[];sinceJoin:(a:A)=>number;age:(a:A)=>number;
 randomIndex:(count:number)=>number;join:(a:A)=>void;create:(target:S)=>void;destroy:(a:A)=>void;
}
/** UpdateDiplomacy spends the shared power only for the first successful branch.
 * A native unbreakable alliance may reject DestroyedBy; TryEnd still succeeds. */
export function nativeUpdateAlliance<S extends NativeAllianceState,A>(a:S,pool:{power:number},q:NativeAllianceQueries<S>,d:NativeAllianceDecision<S,A>):'join'|'create'|'destroy'|null{
 if(!(pool.power>100)||d.sinceAction<3)return null;
 const finish=(result:'join'|'create'|'destroy')=>{pool.power=Math.fround(pool.power-100);return result;};
 if(d.enabled&&!d.current&&!q.superPower(a)){
  if(!q.isAtWar(a)){const acceptable=d.alliances.filter(v=>nativeAllianceAcceptable(d.members(v),a,q));if(acceptable.length){d.join(acceptable[d.randomIndex(acceptable.length)]);return finish('join');}}
  const targets=nativeAllianceTargets(a,d.states,q);if(targets.length){d.create(targets[d.randomIndex(targets.length)]);return finish('create');}
 }
 if(d.current&&q.superPower(a)&&d.sinceJoin(d.current)>=7&&d.age(d.current)>=10){
  const members=d.members(d.current),outsiders=d.states.filter(n=>n.id!==0&&!n.dead&&n.alliance!==a.alliance);
  // Enumerable.Sum(float) accumulates in double, then returns float.
  const strength=(states:readonly S[])=>Math.fround(states.reduce((sum,n)=>sum+q.strength(n),0));
  if(Math.fround(strength(members)*.5)>strength(outsiders)||members.filter(n=>n!==a).reduce((sum,n)=>Math.fround(sum+q.affinity(a,n)),0)<0){d.destroy(d.current);return finish('destroy');}
 }
 return null;
}
