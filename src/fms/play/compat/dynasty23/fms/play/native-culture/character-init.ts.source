/** InitState generation 838EE0. Ensure838CB0 remains an explicit port. */
import type {NativeCharacterCreatePorts,NativeCharacterFather} from './character-create';
export function nativeGenerateInitCharacter<Culture,Character,Father extends NativeCharacterFather>(
 input:string|null,gender:number,father:Father|null,
 p:NativeCharacterCreatePorts<Culture,Character,Father>&{determineDefaultCultureId:()=>string;ensureMapCultureForInit:(id:string)=>Culture|null},
):{character:Character|null;effectiveCultureId:string|null}{
 let effectiveCultureId=input,culture=input===null||input===''?null:p.lookupMapCulture(input);
 if(culture===null){effectiveCultureId=p.determineDefaultCultureId();culture=p.ensureMapCultureForInit(effectiveCultureId);if(culture===null)return {character:null,effectiveCultureId};}
 const name=p.generateName(culture,gender,null,false,father===null?null:father.firstName);let last=name.last;
 if(father!==null&&father.familyId>0){const checked=p.getLastName(father);if(checked!==null&&checked!=='')last=p.getLastName(father);}
 return {character:p.createCharacter(name.first,last,gender,effectiveCultureId),effectiveCultureId};
}
