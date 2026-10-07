/** WarAIV2 and ordinary conquest AI leaf functions. Inputs are explicit native
 * ports. This module does not invent personality/affinity from grain policy,
 * nor silently install these rules into an existing saved web world. */
export interface NativeDeclarationState {
 id:number;
 dead:boolean;
 blankState:boolean;
 conquerable:boolean;
 vassal:boolean;
 pacifist:boolean;
 autoDiplomacy:boolean;
 expansionism:number;
}
export interface NativeCasusBelli {id:number}
const f=Math.fround;
const clamp01=(v:number)=>v<0?0:v>1?1:v;
export interface NativeWeightQueries<S extends NativeDeclarationState> {
 strength:(state:S)=>number;
 affinity:(attacker:S,defender:S)=>number;
 ambitious:(state:S)=>boolean;
}
/** EvaluateAiWeight 668980 for ordinary CB1. Sequential float32 arithmetic,
 * including the intermediate sums, is observable at the strict .55 gate. */
export function nativeConquestAiWeight<S extends NativeDeclarationState>(a:S|null,d:S|null,q:NativeWeightQueries<S>,bonus?:(share:number)=>number):number{
 if(!a||!d)return 0;
 const attack=f(q.strength(a)),defend=f(q.strength(d)),sum=f(attack+defend);
 if(sum<=0)return 0;
 const share=f(attack/sum),hostility=clamp01(f(-f(q.affinity(a,d))/f(50))),expansion=clamp01(f(f(a.expansionism)-1)),ambition=q.ambitious(a)?1:0;
 let value=f(f(f(share+f(hostility*f(.08)))+f(expansion*f(.08)))+f(ambition*f(.04)));
 if(bonus)value=f(value+f(bonus(share)));
 return clamp01(value);
}
/** IsSuppressed 6762A0. Preserve enemy enumeration and per-add float32
 * rounding; the native leaf does not independently reject dead enemies. */
export function nativeDeclarationSuppressed<S extends NativeDeclarationState>(a:S,enemies:Iterable<S|null>,strength:(state:S)=>number):boolean{
 const own=f(strength(a));let total=f(0);
 for(const enemy of enemies)if(enemy&&!(enemy.blankState&&enemy.conquerable))total=f(total+f(strength(enemy)));
 return total>0&&f(total+total)>own;
}
export interface NativeConsiderQueries<S extends NativeDeclarationState> {
 worldAutoDiplomacy:()=>boolean;
 activeIntervalMonths:number;
 passiveIntervalMonths:number;
 monthsSinceActive:(state:S)=>number;
 monthsSincePassive:(state:S)=>number;
}
/** CanConsiderDeclaring 674600. Timestamp conversion and initialization are
 * separate dependencies: zero is not replaced by a guessed elapsed month. */
export function nativeCanConsiderDeclaring<S extends NativeDeclarationState>(a:S|null,q:NativeConsiderQueries<S>):boolean{
 if(!a||a.dead||a.vassal||a.pacifist||!q.worldAutoDiplomacy()||!a.autoDiplomacy)return false;
 if(q.monthsSinceActive(a)<q.activeIntervalMonths||q.monthsSincePassive(a)<q.passiveIntervalMonths)return false;
 return true;
}
export interface NativeChooseQueries<S extends NativeDeclarationState,C extends NativeCasusBelli> {
 strength:(state:S)=>number;
 landCount:(state:S)=>number;
 usable:(id:number,attacker:S,defender:S)=>C|null;
 randomValue:()=>number;
}
/** ChooseCasusBelli 6747E0. Random is consumed only after the corresponding
 * catalog entry passes CanUse. A fallback with ID != 7 is not revalidated. */
export function nativeChooseCasusBelli<S extends NativeDeclarationState,C extends NativeCasusBelli>(a:S,d:S,fallback:C|null,q:NativeChooseQueries<S,C>):C|null{
 const attack=f(q.strength(a)),defend=f(q.strength(d)),sum=f(attack+defend),share=sum>0?f(attack/sum):f(.5);
 const defenderLand=q.landCount(d),attackerLand=q.landCount(a);
 if(share>=f(.75)&&(defenderLand<=5||Math.imul(defenderLand,4)<=attackerLand)){
  const annex=q.usable(2,a,d);if(annex&&f(q.randomValue())<f(.8))return annex;
 }
 const unify=q.usable(6,a,d);if(unify)return unify;
 const convert=q.usable(7,a,d);if(convert&&f(q.randomValue())<f(.35))return convert;
 if(share>=f(.65)&&defenderLand<=14&&!d.vassal&&!a.vassal){const vassal=q.usable(3,a,d);if(vassal)return vassal;}
 if(fallback&&fallback.id!==7)return fallback;
 return q.usable(1,a,d);
}

/** The EvaluateDeclaration winner loop uses a strict float32 .55 floor.
 * The caller supplies original candidate/catalog order; ties keep the first.
 * Choice does not itself StartWar: nonempty default goals are required. */
export function nativeBestDeclarationCandidate<S,C>(candidates:Iterable<S>,usable:(state:S)=>Iterable<C>,weight:(state:S,cb:C)=>number):{defender:S;casusBelli:C;weight:number}|null{
 let best=f(.55),winner:{defender:S;casusBelli:C;weight:number}|null=null;
 for(const defender of candidates)for(const cb of Array.from(usable(defender))){
  const value=f(weight(defender,cb));if(value>best){best=value;winner={defender,casusBelli:cb,weight:value};}
 }
 return winner;
}
