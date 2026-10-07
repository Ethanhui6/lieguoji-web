/** WarSideBuilderV2 68F030 / 68F3A0 / 68F850 / 68FBA0.
 * The ordered shared set is significant: a state belongs to the first side
 * that actually added it. No recursive alliance/vassal transitive closure. */
export type NativeSideState={id:number;dead:boolean};
export type NativeSideMember={stateId:number;side:0|1;role:0|1|2;joinedAt:number;isPrimary:boolean};
export type NativeSideDeclaration={attackerId:number;defenderId:number;internal:boolean;rebelStateId:number;motherStateId:number};
export interface NativeSideQueries<S extends NativeSideState>{
 state:(id:number)=>S|null;
 allianceMembers:(state:S)=>readonly (S|null)[];
 isOverlord:(state:S)=>boolean;
 vassals:(state:S)=>readonly (S|null)[];
 isVassal:(state:S)=>boolean;
 overlord:(state:S)=>S|null;
}
export function nativeBuildWarSides<S extends NativeSideState>(declaration:NativeSideDeclaration|null,time:number,q:NativeSideQueries<S>):NativeSideMember[]{
 const result:NativeSideMember[]=[],seen=new Set<number>();
 if(!declaration)return result;
 const attacker=q.state(declaration.attackerId),defender=q.state(declaration.defenderId);
 if(!attacker||!defender)return result;
 const add=(state:S|null,side:0|1,role:0|1|2,isPrimary:boolean)=>{if(!state||state.dead||seen.has(state.id))return;seen.add(state.id);result.push({stateId:state.id,side,role,joinedAt:time,isPrimary});};
 const kin=(state:S|null,side:0|1)=>{
  if(!state)return;
  if(q.isOverlord(state))for(const v of q.vassals(state))add(v,side,2,false);
  if(q.isVassal(state)){const lord=q.overlord(state);if(!lord)return;add(lord,side,2,false);for(const v of q.vassals(lord))add(v,side,2,false);}
 };
 const side=(state:S,which:0|1,role:0|1)=>{
  add(state,which,role,true);
  // Native still visits kin after an ally was dead/already present. It does
  // not expand the ally's own alliance list or recurse through descendants.
  for(const ally of q.allianceMembers(state)){if(ally===state)continue;add(ally,which,2,false);kin(ally,which);}
  kin(state,which);
 };
 if(!declaration.internal){side(attacker,0,0);side(defender,1,1);return result;}
 const rebel=q.state(declaration.rebelStateId),mother=q.state(declaration.motherStateId);
 if(rebel&&mother&&rebel!==mother&&[attacker,defender].includes(rebel)&&[attacker,defender].includes(mother)){
  const rebelSide=rebel===attacker?0:1;add(rebel,rebelSide,rebelSide,true);side(mother,rebelSide===0?1:0,rebelSide===0?1:0);
 }else{add(attacker,0,0,true);side(defender,1,1);}
 return result;
}
/** StartWar checks the two declared principals after building sides. Sharing
 * an alliance must not quietly turn a defender into the attacker's supporter. */
export function nativeOpposingPrincipals(members:readonly NativeSideMember[],attacker:number,defender:number){
 return members.find(m=>m.stateId===attacker)?.side===0&&members.find(m=>m.stateId===defender)?.side===1;
}
