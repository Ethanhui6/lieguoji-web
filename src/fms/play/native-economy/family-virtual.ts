/** CreateVirtualFamilyMember 85CA70, recovered outer creation transaction.
 * GenerateCharacterFromCulture and the actual registry remain explicit ports.
 * A production caller must supply private mutable state: native failure does
 * not undo an already registered person or earlier identity/age writes. */
import {f,finite} from './numeric';
import type {CharacterRandom} from './character-generation';

export interface NativeVirtualFamily {
 id:number;stateId:number;religionId:string|null;cultureName:string|null;
 collateralMemberIds:number[]|null;
}
export interface NativeVirtualPerson {
 id:number;familyId:number;stateId:number;religionId:string|null;age:number;birthTime:number;
}
export interface NativeVirtualPorts<C extends NativeVirtualPerson> {
 generate:(culture:string|null,gender:number,father:null)=>C|null;
 random:Pick<CharacterRandom,'floatRange'>;
 getBirthTimeFromAge:(age:number)=>number;
 updateAge:(person:C)=>void;
}
export function nativeCreateVirtualFamilyMember<C extends NativeVirtualPerson>(
 family:NativeVirtualFamily|null,gender:number,ports:NativeVirtualPorts<C>,
):C|null{
 if(family===null)throw Error('Null native virtual family');
 const person=ports.generate(family.cultureName,gender,null);
 if(person===null)return null;
 person.familyId=family.id;person.stateId=family.stateId;person.religionId=family.religionId;
 const draw=finite(ports.random.floatRange(25,35));
 if(draw<25||draw>35)throw Error('Invalid native virtual age draw');
 person.age=Math.trunc(draw);
 person.birthTime=f(ports.getBirthTimeFromAge(person.age));
 ports.updateAge(person);
 if(family.collateralMemberIds===null)throw Error('Null native collateral list');
 family.collateralMemberIds.push(person.id);
 return person;
}
