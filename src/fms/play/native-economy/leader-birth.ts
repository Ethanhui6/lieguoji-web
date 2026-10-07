/** StateLeaderGenerator.GenerateLeaderForState 88E1A0, post-generation slice.
 * Culture/name/skills/traits and state identity are already assigned by the
 * caller. This is not the separate family/child/succession creation policy. */
import {f,int32} from './numeric';
import type {CharacterRandom} from './character-generation';

export interface NativeLeaderBirth {age:number;birthTime:number}

/** Null generation consumes no age draw. Assignment order matches 88E3E8–88E42E:
 * integer age, then birthday from that age, then float-to-double storage.
 * Failure is deliberately not swallowed; production must use a private draft. */
export function nativeInitStateLeaderBirth(
 character:NativeLeaderBirth|null,
 random:Pick<CharacterRandom,'intRange'>,
 getBirthTimeFromAge:(age:number)=>number,
):void{
 if(character===null)return;
 const age=int32(random.intRange(35,55));
 if(age<35||age>=55)throw Error('Invalid original initial leader age draw');
 character.age=age;
 character.birthTime=f(getBirthTimeFromAge(age));
}
