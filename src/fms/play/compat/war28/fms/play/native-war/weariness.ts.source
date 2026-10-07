import {nativeWarScoreParts,type NativeScoreWar,type NativeWarQueries,type NativeWarNation,type NativeWarSide} from './score';

export type NativeFatigueWar=NativeScoreWar&{primaryAttackerId:number;startTime:number;deathsByState:Map<number,number>;initialCapitals:Map<number,number>|null};
export type NativeFatigueNation=NativeWarNation&{gold:number;goldPerMonth:number;armyCostGold:number};
export type NativeFatigueQueries=Omit<NativeWarQueries,'state'>&{
 state:(id:number)=>NativeFatigueNation|null;
 strength:(state:NativeFatigueNation,id:number)=>number;
 // Whole calendar months from original double StartTime, supplied by the
 // calendar adapter; deliberately no fixed day/30 conversion here.
 monthsSince:(startTime:number)=>number;
};
const f=Math.fround;
const clamp=(n:number)=>n<0?0:n>1?1:n;
export const nativeWarSide=(w:NativeScoreWar,id:number):NativeWarSide=>w.participants.find(p=>p.stateId===id)?.side??2;
export function nativeSideDeaths(w:NativeFatigueWar,side:NativeWarSide){let total=0;for(const p of [...w.participants,...w.destroyedParticipants])if(p.side===side)total=f(total+(w.deathsByState.get(p.stateId)??0));return total;}
export function nativeSideStrength(w:NativeScoreWar,side:NativeWarSide,q:NativeFatigueQueries){let total=0;for(const p of w.participants)if(p.side===side){const state=q.state(p.stateId);if(state)total=f(total+q.strength(state,p.stateId));}return total;}
export function nativeCasualtyStress(w:NativeFatigueWar,side:NativeWarSide,enemy:NativeWarSide){
 const own=nativeSideDeaths(w,side),other=nativeSideDeaths(w,enemy),total=f(other+own);if(total<=0)return 0;
 const disadvantage=clamp(f(f(f(own/total)-.5)*3)),magnitude=clamp(f(total/2000));return f(magnitude*disadvantage);
}
export function nativeStrengthStress(w:NativeScoreWar,side:NativeWarSide,enemy:NativeWarSide,q:NativeFatigueQueries){
 const own=nativeSideStrength(w,side,q),other=nativeSideStrength(w,enemy,q),total=f(other+own);if(total<=0)return 0;
 const difference=f(.5-f(own/total));return clamp(f(difference+difference));
}
export function nativeEconomyStress(state:NativeFatigueNation){
 const income=f(state.goldPerMonth),expense=f(state.armyCostGold);
 const burn=income>0?clamp(f(f(expense-income)/income)):expense>0?1:0;
 const treasury=clamp(f(1-f(f(state.gold)/f(Math.max(1,income)*6))));
 return clamp(f(f(treasury*.5)+f(burn*.5)));
}
export function nativeGainedProvinces(w:NativeScoreWar,id:number,q:NativeWarQueries){
 const side=nativeWarSide(w,id);if(side===2)return 0;
 const enemies=new Set([...w.participants,...w.destroyedParticipants].filter(p=>p.side!==side&&p.side!==2).map(p=>p.stateId));let net=0;
 for(const [pid,initial]of w.initialOwners){if(!q.province(pid)?.isLand)continue;const current=q.province(pid)?.stateId??-1;
  if(enemies.has(initial)&&current===id)net=(net+1)|0;else if(initial===id&&enemies.has(current))net=(net-1)|0;
 }return net;
}
export const nativeDecisiveIntent=(w:NativeScoreWar)=>w.goals.some(g=>g.type===3||g.type===4||g.type===11);
export function nativeCapitalPressure(w:NativeFatigueWar,id:number,q:NativeWarQueries){
 if(!w.initialCapitals?.has(id))return 0;const p=q.province(w.initialCapitals.get(id)!);if(!p)return 0;
 const side=nativeWarSide(w,id),ownerSide=nativeWarSide(w,p.stateId);return side!==2&&ownerSide!==2&&side!==ownerSide?f(.15):0;
}
export function nativeWearinessFloor(w:NativeFatigueWar,q:NativeFatigueQueries){return clamp(f(f((q.monthsSince(w.startTime)-60)|0)/60));}
export function nativeWarWeariness(w:NativeFatigueWar|null,id:number,q:NativeFatigueQueries){
 if(!w)return 0;const side=nativeWarSide(w,id),state=q.state(id);if(side===2||!state)return 0;const enemy=side===0?1:0;
 const casualty=nativeCasualtyStress(w,side,enemy),strength=nativeStrengthStress(w,side,enemy,q),territory=clamp(f(f(nativeGainedProvinces(w,id,q))/3)),economy=nativeEconomyStress(state);
 let subtotal=f(f(casualty*f(.35))+f(strength*.25));subtotal=f(subtotal+f(territory*.25));let base=f(f(economy*f(.15))+subtotal);
 if(nativeDecisiveIntent(w))base=f(base*f(.6));const withCapital=f(nativeCapitalPressure(w,id,q)+base);
 return clamp(Math.max(nativeWearinessFloor(w,q),withCapital));
}
export function nativeWarDistress(w:NativeFatigueWar|null,id:number,q:NativeFatigueQueries){
 if(!w)return 0;const side=nativeWarSide(w,id),state=q.state(id);if(side===2||!state)return 0;const enemy=side===0?1:0;
 const casualty=nativeCasualtyStress(w,side,enemy),strength=nativeStrengthStress(w,side,enemy,q),economy=nativeEconomyStress(state);
 return clamp(f(f(economy*f(.2))+f(f(strength*f(.35))+f(casualty*f(.45)))));
}
export function nativeForceSettleThreshold(w:NativeFatigueWar|null,q:NativeFatigueQueries){
 let fatigue=0;if(w){const attacker=nativeWarWeariness(w,w.primaryAttackerId,q),defender=nativeWarWeariness(w,w.primaryDefenderId,q);fatigue=Math.max(attacker,defender);}
 return f(f(clamp(fatigue)*-35)+75);
}
export function nativeShouldForceSettle(w:NativeFatigueWar|null,q:NativeFatigueQueries){const score=nativeWarScoreParts(w,q).score;return Math.abs(score)>=nativeForceSettleThreshold(w,q);}
