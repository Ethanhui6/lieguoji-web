/** Emergency succession recovered from 890600 / 890CD0 / 891210. This is
 * selection only: it neither appoints a ruler nor fabricates family members.
 * Ability inputs are finite native f32s; arithmetic overflow is retained.
 * Generic LINQ allocation/getter invocation counts are not reproduced. */
import {f,finite,int32} from './numeric';

export interface NativeCandidatePerson {isAlive:boolean;age:number}
export interface NativeCandidateFamily {influence:number;collateralMemberIds:readonly number[]|null}
export interface NativeCandidateState {i:number}
export interface NativeCandidateSkills<C> {
 administrative:(person:C)=>number;charisma:(person:C)=>number;
 military:(person:C)=>number;diplomatic:(person:C)=>number;
}
export interface NativeCandidatePorts<S,F,C> extends NativeCandidateSkills<C> {
 familyManager:()=>{getFamiliesByState:(id:number)=>readonly (F|null)[]|null}|null;
 characterManager:()=>{getCharacter:(id:number)=>C|null}|null;
 getLivingMembers:(family:F)=>readonly (C|null)[]|null;
 warMerit:(family:F)=>number;
 // S is carried through the caller's state type without projecting new IDs.
 stateId:(state:S)=>number;
}
function required<T>(value:T|null):T{
 if(value===null)throw Error('Missing reached native succession input');return value;
}

/** 88FE10: a nonempty GetLivingMembers result succeeds by Count, without a
 * second alive predicate. Otherwise look up collateral IDs in order, reading
 * CharacterManager again for each ID. Null family alone means false. */
export function nativeHasLivingFamily<F extends NativeCandidateFamily,C extends NativeCandidatePerson>(
 family:F|null,p:Pick<NativeCandidatePorts<unknown,F,C>,'getLivingMembers'|'characterManager'>,
):boolean{
 if(family===null)return false;
 if(required(p.getLivingMembers(family)).length>0)return true;
 for(const id of required(family.collateralMemberIds)){
  const person=required(p.characterManager()).getCharacter(id);
  if(person!==null&&person.isAlive)return true;
 }
 return false;
}

/** 88E8F0: ability reads precede the age gates, including a negative age. */
export function nativeTheocracySuccessionScore<C extends NativeCandidatePerson>(person:C|null,p:Pick<NativeCandidateSkills<C>,'administrative'|'charisma'>):number{
 if(person===null)return 0;
 const administrative=finite(p.administrative(person)),charisma=finite(p.charisma(person)),age=int32(person.age);
 if(age<0)return 0;
 const multiplier=age>=35?1:age>=30?.9:age>=25?.8:age>=18?.6:age>=10?.4:.25;
 return f(f(charisma+administrative)*f(multiplier));
}
/** 88EA20: this score accepts children below 12; the emergency selector has
 * its own >=12 eligibility gate. The two rules must stay separate. */
export function nativeTribalSuccessionScore<C extends NativeCandidatePerson>(person:C|null,p:Pick<NativeCandidateSkills<C>,'military'|'charisma'>):number{
 if(person===null)return 0;
 const military=finite(p.military(person)),charisma=finite(p.charisma(person)),age=int32(person.age);
 if(age<0)return 0;
 const multiplier=age>=35?1:age>=30?.9:age>=25?.8:age>=18?.65:age>=12?.45:age>=6?.3:.2;
 return f(f(charisma+military)*f(multiplier));
}
/** Single.CompareTo 1854E90: NaN sorts below all numbers; both NaNs tie.
 * Finite source values can still produce NaN via intermediate overflow. */
function compareScore(a:number,b:number):number{
 if(a>b)return 1;if(a<b)return -1;if(a===b)return 0;
 return Number.isNaN(a)?Number.isNaN(b)?0:-1:1;
}
function best<C extends NativeCandidatePerson>(candidates:readonly {person:C;score:number}[]):C|null{
 let chosen:C|null=null,chosenScore=0,chosenAge=0;
 for(const {person,score} of candidates){
  const age=int32(person.age),comparison=compareScore(score,chosenScore);
  if(chosen===null||comparison>0||comparison===0&&age>chosenAge){chosen=person;chosenScore=score;chosenAge=age;}
 }
 return chosen;
}
function families<S,F,C>(state:S|null,p:NativeCandidatePorts<S,F,C>):readonly (F|null)[]|null{
 const manager=p.familyManager();if(manager===null)return null;
 return required(manager.getFamiliesByState(p.stateId(required(state))));
}

/** Republic/federation: >=25, score then age descending, stable ties. Gate
 * GetLivingMembers is a separate read from the list subsequently enumerated.
 * The gate can see collateral members; they are not added to candidates. */
export function nativeRepublicEmergencyLeader<S,F extends NativeCandidateFamily,C extends NativeCandidatePerson>(state:S|null,p:NativeCandidatePorts<S,F,C>):C|null{
 const all=families(state,p);if(all===null)return null;
 const candidates:{person:C;score:number}[]=[];
 for(const family of all){
  if(!nativeHasLivingFamily(family,p))continue;
  const present=required(family),merit=finite(p.warMerit(present)),influence=finite(present.influence);
  for(const person of required(p.getLivingMembers(present))){
   if(person===null||!person.isAlive||int32(person.age)<25)continue;
   const military=finite(p.military(person)),charisma=finite(p.charisma(person)),diplomatic=finite(p.diplomatic(person)),administrative=finite(p.administrative(person));
   const influenceTerm=f(influence*f(.15)),meritTerm=f(merit*f(.1));
   const score=f(f(f(f(f(military+charisma)+diplomatic)+administrative)+meritTerm)+influenceTerm);
   candidates.push({person,score});
  }
 }
 return best(candidates);
}
function spiritualOrTribal<S,F extends NativeCandidateFamily,C extends NativeCandidatePerson>(state:S|null,p:NativeCandidatePorts<S,F,C>,tribal:boolean):C|null{
 const all=families(state,p);if(all===null)return null;
 const candidates:C[]=[];
 for(const family of all){
  for(const person of required(p.getLivingMembers(required(family)))){
   if(person!==null&&person.isAlive&&int32(person.age)>=(tribal?12:0))candidates.push(person);
  }
 }
 // Where(alive) happens after collecting all families. No family/gender/
 // religion gate or random tie breaker appears in these original selectors.
 const scored:{person:C;score:number}[]=[];
 for(const person of candidates){
  if(person.isAlive)scored.push({person,score:tribal?nativeTribalSuccessionScore(person,p):nativeTheocracySuccessionScore(person,p)});
 }
 return best(scored);
}
export function nativeTheocracyEmergencyLeader<S,F extends NativeCandidateFamily,C extends NativeCandidatePerson>(state:S|null,p:NativeCandidatePorts<S,F,C>):C|null{return spiritualOrTribal(state,p,false);}
export function nativeTribalEmergencyLeader<S,F extends NativeCandidateFamily,C extends NativeCandidatePerson>(state:S|null,p:NativeCandidatePorts<S,F,C>):C|null{return spiritualOrTribal(state,p,true);}
