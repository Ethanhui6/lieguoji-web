import type {NativeDeclarationState,NativeCasusBelli} from './declaration-choice';
const f=Math.fround;
export interface NativeCandidateQueries<S extends NativeDeclarationState,Relation> {
 neighbors:(state:S)=>Iterable<number>|null;
 seaNeighbors:(state:S)=>Iterable<number>|null;
 resolve:(id:number)=>S|null;
 atWar:(attacker:S,target:S)=>boolean;
 vassalOf:(target:S,attacker:S)=>boolean;
 /** Null means no alliance. A present alliance with a null member collection
  * is malformed and is not silently converted to an empty alliance. */
 alliance:(state:S)=>{states:ReadonlySet<S>|null}|null;
 overlord:(state:S)=>S|null;
 strength:(state:S)=>number;
 relation:(attacker:S,target:S)=>Relation|null;
 yearsSinceWar:(relation:Relation)=>number;
 truceYears:(relation:Relation)=>number;
 affinity:(attacker:S,target:S)=>number;
 exemptUnification:(attacker:S,target:S)=>boolean;
}
/** EnumerateCandidates.MoveNext 672410. Deliberately lazy. Rejected IDs enter
 * seen before state resolution, so a duplicate is never retried in sea order.
 * Alliance membership compares State objects, not numeric IDs. */
export function* nativeDeclarationCandidates<S extends NativeDeclarationState,R>(a:S,q:NativeCandidateQueries<S,R>):Generator<S>{
 const land=q.neighbors(a),sea=q.seaNeighbors(a);
 // Enumerable.Concat validates both sources when the iterator is initialized.
 if(!land||!sea)throw Error('Native null neighbor collection');
 const seen=new Set<number>();
 for(const ids of [land,sea])for(const id of ids){
  if(seen.has(id))continue;seen.add(id);
  const target=q.resolve(id);
  if(!target||target.dead||target===a||q.atWar(a,target)||q.vassalOf(target,a)||target.blankState&&!target.conquerable)continue;
  const alliance=q.alliance(a);
  if(alliance){if(!alliance.states)throw Error('Native null alliance members');if(alliance.states.has(target))continue;}
  if(target.vassal){const lord=q.overlord(target),strength=f(q.strength(target)),lordStrength=lord?f(q.strength(lord)):0,own=f(q.strength(a));if(f(strength+lordStrength)>own)continue;}
  const relation=q.relation(a,target);
  if(relation){const elapsed=q.yearsSinceWar(relation),required=q.truceYears(relation);if(elapsed<required)continue;}
  const affinity=f(q.affinity(a,target));if(affinity>0&&!q.exemptUnification(a,target))continue;
  yield target;
 }
}
/** ShouldExemptAffinityForUnification 6764E0. Nonpositive total strength
 * bypasses the share floor; it does not automatically fail unification. */
export function nativeUnificationAffinityExemption<S extends NativeDeclarationState,C extends NativeCasusBelli>(a:S|null,d:S|null,q:{unifier:(a:S)=>boolean;strength:(s:S)=>number;usable:(id:number,a:S,d:S)=>C|null}):boolean{
 if(!a)throw Error('Native null attacker');
 if(!q.unifier(a))return false;
 const attack=f(q.strength(a));
 if(!d)throw Error('Native null target');
 const defend=f(q.strength(d)),sum=f(attack+defend);
 if(sum>0&&f(attack/sum)<f(.45))return false;
 return q.usable(6,a,d)!==null;
}
