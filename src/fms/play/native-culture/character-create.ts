/** GenerateCharacterFromCulture 839080. This is deliberately distinct from
 * the founding-only InitState path: missing culture still creates Unknown. */
import type {NativeCharacterName} from './character-name';
export interface NativeCharacterFather {familyId:number;firstName:string|null}
export interface NativeCharacterCreatePorts<Culture,Character,Father extends NativeCharacterFather> {
 lookupMapCulture:(id:string|null)=>Culture|null;
 generateName:(culture:Culture,gender:number,language:null,usePatronymic:false,fatherFirstName:string|null)=>NativeCharacterName;
 getLastName:(father:Father)=>string|null;
 createCharacter:(first:string|null,last:string|null,gender:number,culture:string|null)=>Character|null;
}
export function nativeGenerateCharacterFromCulture<Culture,Character,Father extends NativeCharacterFather>(
 cultureId:string|null,gender:number,father:Father|null,ports:NativeCharacterCreatePorts<Culture,Character,Father>,
):Character|null{
 const culture=ports.lookupMapCulture(cultureId);
 const name=culture===null?{first:'Unknown',last:'Unknown'}:ports.generateName(culture,gender,null,false,father===null?null:father.firstName);
 let last=name.last;
 if(father!==null&&father.familyId>0){
  const checked=ports.getLastName(father);
  if(checked!==null&&checked!=='')last=ports.getLastName(father);
 }
 return ports.createCharacter(name.first,last,gender,cultureId);
}
