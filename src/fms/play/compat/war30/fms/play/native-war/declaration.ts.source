import {nativeCanConsiderDeclaring,type NativeDeclarationState,type NativeConsiderQueries,type NativeCasusBelli} from './declaration-choice';

export interface NativeDeclaration<Goal> {attackerId:number;defenderId:number;casusBelliId:number;goals:readonly Goal[]}
export interface NativeDeclarationQueries<S extends NativeDeclarationState,C extends NativeCasusBelli,Goal,Result> extends NativeConsiderQueries<S> {
 suppressed:(state:S)=>boolean;
 candidates:(state:S)=>Iterable<S>;
 catalog:()=>Iterable<C|null>;
 internal:(cb:C)=>boolean;
 canUse:(cb:C,attacker:S,target:S)=>boolean;
 weight:(cb:C,attacker:S,target:S)=>number;
 choose:(attacker:S,target:S,fallback:C)=>C|null;
 defaultGoals:(cb:C,attacker:S,target:S)=>readonly Goal[]|null;
 stateTag:(id:number)=>string;
 log:(attackerTag:string,defenderTag:string,chosenId:number,winningWeight:number)=>void;
 startWar:(declaration:NativeDeclaration<Goal>)=>Result|null;
}
/** EvaluateDeclaration 674F30. The native usable catalog is fully materialized
 * for EACH candidate before any weight query. No second-best retry after a
 * failed choice/empty goal set. StartWar remains an explicit transactional
 * port, not a fabricated successful declaration or a direct relation write. */
export function nativeEvaluateDeclaration<S extends NativeDeclarationState,C extends NativeCasusBelli,G,R>(a:S|null,q:NativeDeclarationQueries<S,C,G,R>):R|null{
 if(!nativeCanConsiderDeclaring(a,q)||!a||q.suppressed(a))return null;
 let best=Math.fround(.55),target:S|null=null,cb:C|null=null;
 for(const candidate of q.candidates(a)){
  const usable:C[]=[];
  for(const item of q.catalog()){
   if(!item)throw Error('Native null casus belli');
   if(!q.internal(item)&&q.canUse(item,a,candidate))usable.push(item);
  }
  for(const item of usable){const value=Math.fround(q.weight(item,a,candidate));if(value>best){best=value;target=candidate;cb=item;}}
 }
 if(!target||!cb)return null;
 const chosen=q.choose(a,target,cb);if(!chosen)return null;
 const goals=q.defaultGoals(chosen,a,target);if(!goals||!goals.length)return null;
 const declaration={attackerId:a.id,defenderId:target.id,casusBelliId:chosen.id,goals};
 const attackerTag=q.stateTag(a.id),defenderTag=q.stateTag(target.id);
 q.log(attackerTag,defenderTag,chosen.id,best);
 return q.startWar(declaration);
}
