/** Independent recovery of Province.HandleRestorationRebellion (4559E0).
 * No production caller yet. This is not the normal family succession rule. */
export type NativeRestorationPerson={id:number;familyId:number;age:number;gender:number;isAlive:boolean};
export type NativeRestorationFamily={id:number;stateId:number;isRulingFamily:boolean;patriarchId:number;memberIds:readonly number[]};
export type NativeRestorationState={i:number;leaderId:number};
export type NativeRestorationSkills<P>={charisma:(person:P)=>number;military:(person:P)=>number;administrative:(person:P)=>number};

/** Family.GetLivingMembers 84A9D0 preserves duplicate IDs and source order. */
export function nativeFamilyLivingMembers<P extends NativeRestorationPerson>(family:NativeRestorationFamily,getPerson:(id:number)=>P|null):P[]{
  const result:P[]=[];
  for(const id of family.memberIds){const p=getPerson(id);if(p?.isAlive&&p.familyId===family.id)result.push(p);}
  return result;
}
/** get_Patriarch 5E3B40 only resolves a positive ID; no living/member check. */
export function nativeFamilyPatriarch<P extends NativeRestorationPerson>(family:NativeRestorationFamily,getPerson:(id:number)=>P|null):P|null{
  return family.patriarchId>0?getPerson(family.patriarchId):null;
}
const floatDescending=(a:number,b:number)=>a>b?-1:a<b?1:Number.isNaN(a)?Number.isNaN(b)?0:1:Number.isNaN(b)?-1:0;

/** 462940/970/990/9F0: ages 16..60; male; effective skill sum;
 * distance from 35. Ties retain member order. No random or inheritance flag. */
export function nativeRestorationCandidate<P extends NativeRestorationPerson>(members:readonly (P|null)[],skills:NativeRestorationSkills<P>):P|null{
  const ranked=members.filter((p):p is P=>{if(!p)throw Error('Null native restoration member');return p.age>=16&&p.age<=60;}).map(p=>{
    const charisma=Math.fround(skills.charisma(p)),military=Math.fround(skills.military(p)),administrative=Math.fround(skills.administrative(p));
    return {p,male:p.gender===0?1:0,score:Math.fround(administrative+Math.fround(military+charisma)),ageDistance:Math.abs(p.age-35)};
  });
  ranked.sort((a,b)=>b.male-a.male||floatDescending(a.score,b.score)||a.ageDistance-b.ageDistance);
  return ranked[0]?.p??null;
}

/** The caller supplies the current family dictionary's values in order (not
 * historical families). Failed restoration invokes full InitStateSimulationData
 * with true, not just family creation. Its deeper side effects remain external. */
export function nativeRestoreLeader<P extends NativeRestorationPerson>(input:{
  state:NativeRestorationState;
  currentFamilies:readonly (NativeRestorationFamily|null)[];
  getLivingMembers:(family:NativeRestorationFamily)=>P[];
  getPatriarch:(family:NativeRestorationFamily)=>P|null;
  skills:NativeRestorationSkills<P>;
  initializeState:(state:NativeRestorationState,initializeFamily:true)=>void;
}):{kind:'restored';person:P;family:NativeRestorationFamily;changedPatriarch:boolean}|{kind:'initialized'}{
  const {state}=input;
  const family=input.currentFamilies.find(f=>{if(!f)throw Error('Null native family');return f.stateId===state.i&&f.isRulingFamily;});
  const initialize=()=>{input.initializeState(state,true);return {kind:'initialized'} as const;};
  if(!family||!input.getLivingMembers(family).length)return initialize();
  let person=input.getPatriarch(family),changedPatriarch=false;
  if(!person?.isAlive){
    // Preserve the original second query and its empty-list edge. It does not
    // recheck the previous patriarch's alive flag if this list becomes empty.
    const members=input.getLivingMembers(family);
    if(members.length){
      person=nativeRestorationCandidate(members,input.skills);
      if(person){family.patriarchId=person.id;changedPatriarch=true;}
    }
  }
  if(!person)return initialize();
  state.leaderId=person.id;
  return {kind:'restored',person,family,changedPatriarch};
}
