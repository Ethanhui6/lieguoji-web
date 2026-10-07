/** Family succession selectors recovered from 860DE0/890150/8572D0.
 * These kernels do not appoint a ruler or invent missing family relations.
 * The production caller must run mutating ports on a private transaction. */
import {f,finite,iadd,int32} from './numeric';

export interface NativeSuccessionPerson {
 id:number;familyId:number;isAlive:boolean;gender:number;age:number;
 childrenIds:readonly number[]|null;
}
export interface NativeSuccessionFamily {
 id:number;allowFemaleInheritance:boolean;
 memberIds:readonly number[]|null;collateralMemberIds:readonly number[]|null;
}
export type NativeCharacterLookup<C>=(id:number)=>C|null|undefined;
function required<T>(value:T|null):T{
 if(value===null)throw Error('Missing reached native family input');
 return value;
}

/** 8572D0: null family is only dereferenced for a female character. */
export function nativeSuccessionPriority(
 person:NativeSuccessionPerson|null,family:NativeSuccessionFamily|null,
 isCollateral=false,isFemaleInheritance=false,
):number{
 const c=required(person);
 let score=(isCollateral?1000:0)+(isFemaleInheritance?500:0);
 if(c.gender===1&&!required(family).allowFemaleInheritance)score+=10000;
 return iadd(iadd(score,-int32(c.age)),100);
}

/** 860DE0: stop at the first nonempty relation tier. Females receive a
 * penalty, not an exclusion. Reached null lists throw; later tiers stay lazy. */
export function nativeFindSuccessor<C extends NativeSuccessionPerson>(
 family:NativeSuccessionFamily|null,deceased:NativeSuccessionPerson|null,
 getCharacter:NativeCharacterLookup<C>,createVirtual:(family:NativeSuccessionFamily,gender:0)=>C|null,
):C|null{
 if(family===null||deceased===null)return null;
 const stage=(ids:readonly number[]|null,tier:0|1|2|3):C|null=>{
  let best:C|null=null,bestScore=0;
  for(const id of required(ids)){
   if(tier===3&&id===deceased.id)continue;
   const c=getCharacter(id);
   if(!c||!c.isAlive||tier<2&&c.familyId!==family.id||tier===1&&c.gender!==1)continue;
   const score=iadd(nativeSuccessionPriority(c,family,tier===2,tier===1),tier===3?2000:0);
   if(best===null||score<bestScore){best=c;bestScore=score;}
  }
  return best;
 };
 let candidate=stage(deceased.childrenIds,0);
 if(candidate!==null)return candidate;
 if(family.allowFemaleInheritance){candidate=stage(deceased.childrenIds,1);if(candidate!==null)return candidate;}
 candidate=stage(family.collateralMemberIds,2);if(candidate!==null)return candidate;
 candidate=stage(family.memberIds,3);if(candidate!==null)return candidate;
 return createVirtual(family,0);
}

export interface NativeFamilyFallbackPorts<C extends NativeSuccessionPerson> {
 getLivingMembers:(family:NativeSuccessionFamily)=>readonly (C|null)[]|null;
 getCharacter:NativeCharacterLookup<C>;
 charisma:(person:C)=>number;administrative:(person:C)=>number;military:(person:C)=>number;
}
/** 890150: age first, then f32 military+(administrative+charisma), both
 * descending, stable ties. Port invocation counts inside native generic LINQ
 * are not claimed; the three ability reads retain their recovered order. */
export function nativeFamilyFallback<C extends NativeSuccessionPerson>(
 family:NativeSuccessionFamily|null,ports:NativeFamilyFallbackPorts<C>,
):C|null{
 if(family===null)return null;
 const candidates=[...required(ports.getLivingMembers(family))];
 for(const id of required(family.collateralMemberIds)){
  const c=ports.getCharacter(id);if(c&&c.isAlive)candidates.push(c);
 }
 let best:C|null=null,bestAge=0,bestScore=0;
 for(const c of candidates){
  if(c===null||!c.isAlive)continue;
  const age=int32(c.age),charisma=finite(ports.charisma(c)),administrative=finite(ports.administrative(c)),military=finite(ports.military(c));
  const score=f(military+f(administrative+charisma));
  if(best===null||age>bestAge||age===bestAge&&score>bestScore){best=c;bestAge=age;bestScore=score;}
 }
 return best;
}
