/** Character construction/registration 838760 and named creation 8385C0.
 * Native failures are non-atomic. The web caller must own a private registry. */
import {f,finite,iadd,int32} from './numeric';
import type {CharacterRandom} from './character-generation';
import type {NativeBaseSkills} from './character-income';

export interface NativeRegisteredCharacter<Trait,Role=unknown,PastRole=unknown> {
 id:number;firstName:string|null;lastName:string|null;cultureName:string|null;gender:number;
 age:number;birthTime:number;deathTime:number;isAlive:boolean;isHistoricallyImportant:boolean;
 familyId:number;originalFamilyId:number;stateId:number;religionId:string|null;fatherId:number;motherId:number;spouseId:number;marriageType:number;
 base:NativeBaseSkills;traits:Trait[]|null;childrenIds:number[];roles:Role[];pastRoles:PastRole[];
}
/** A new instance, not a reset of an existing person's references. No RNG. */
export function nativeCharacterDefaults<Trait,Role=unknown,PastRole=unknown>():NativeRegisteredCharacter<Trait,Role,PastRole>{
 return {id:0,firstName:null,lastName:'',cultureName:null,gender:0,age:0,birthTime:0,deathTime:0,isAlive:true,isHistoricallyImportant:false,
  familyId:0,originalFamilyId:0,stateId:0,religionId:null,fatherId:0,motherId:0,spouseId:0,marriageType:0,
  base:{charisma:50,military:50,diplomatic:50,administrative:50},traits:[],childrenIds:[],roles:[],pastRoles:[]};
}
export interface NativeCharacterRegistry<C> {nextId:number;characters:Map<number,C>|null}
export function nativeCreateBlankCharacter<C>(registry:NativeCharacterRegistry<C>,ports:{construct:()=>C&{id:number;birthTime:number};gameTime:()=>number}):C&{id:number;birthTime:number}{
 const person=ports.construct();person.id=int32(registry.nextId);registry.nextId=iadd(person.id,1);
 person.birthTime=f(ports.gameTime());
 if(registry.characters===null)throw Error('Null native character registry');
 registry.characters.set(person.id,person);return person;
}
/** Registered before naming and sequential random writes. The traits port
 * obtains its manager after the count draw and can return null, as native. */
export function nativeCreateNamedCharacter<C extends NativeRegisteredCharacter<unknown>>(
 first:string|null,last:string|null,gender:number,culture:string|null,
 ports:{createBlank:()=>C|null;random:Pick<CharacterRandom,'floatRange'|'intRange'>;selectTraits:(count:number)=>C['traits']},
):C{
 const person=ports.createBlank();if(person===null)throw Error('Null native character creation');
 person.firstName=first;person.lastName=last;person.cultureName=culture;person.gender=gender;
 const draw=()=>Math.min(100,Math.max(0,finite(ports.random.floatRange(20,80))));
 person.base.charisma=draw();person.base.military=draw();person.base.diplomatic=draw();person.base.administrative=draw();
 const count=int32(ports.random.intRange(1,4));if(count<1||count>=4)throw Error('Invalid native trait request');
 person.traits=ports.selectTraits(count);return person;
}
