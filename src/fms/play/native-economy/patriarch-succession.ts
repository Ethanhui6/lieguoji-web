/** HandlePatriarchSuccession 863B70. This is family leadership, separate from
 * national succession; it neither appoints a ruler nor creates a role. */
export interface NativePatriarchPerson {id:number;isAlive:boolean;familyId:number;age:number;isHistoricallyImportant:boolean}
export interface NativePatriarchFamily {id:number;patriarchId:number;heirId:number}
export function nativeHandlePatriarchSuccession<C extends NativePatriarchPerson,F extends NativePatriarchFamily>(family:F|null,ports:{getCharacter:(id:number)=>C|null;findSuccessor:(family:F,previous:C)=>C|null;getLivingMembers:(family:F)=>readonly C[]|null}):void{
 if(family===null)return;
 const old=ports.getCharacter(family.patriarchId);if(old!==null&&old.isAlive)return;
 let next:C|null=null;
 if(family.heirId>0){const heir=ports.getCharacter(family.heirId);if(heir!==null&&heir.isAlive&&heir.familyId===family.id)next=heir;}
 if(next===null&&old!==null)next=ports.findSuccessor(family,old);
 if(next===null){const members=ports.getLivingMembers(family);if(members===null)throw Error('Null living family members');for(const person of members)if(next===null||person.age>next.age)next=person;}
 if(next===null){family.patriarchId=0;return;}
 family.patriarchId=next.id;next.isHistoricallyImportant=true;
 if(family.patriarchId<=0)return;
 const head=ports.getCharacter(family.patriarchId);if(head===null)return;
 const heir=ports.findSuccessor(family,head);family.heirId=heir!==null&&heir.id!==family.patriarchId?heir.id:0;
}
