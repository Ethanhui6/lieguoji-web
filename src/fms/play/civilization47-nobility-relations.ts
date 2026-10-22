import {nativeCharacterSkills} from './native-economy/character-income';
import {NATIVE_CHARACTER_POOL} from './native-economy/character-generation';
import {combatTraits47} from './civilization47-combat-state';
import {familyStrength47,familyWarMerit47} from './civilization47-nobility-territory';
import type {NobilityRun47} from './civilization47-nobility';
import {f} from './native-economy/numeric';

/** FamilyManager.CalculateFamilyRelation 855AB0 (a's view of b, same state):
 * stored relation + marriage ties (CheckMarriageConnection 858EA0) + culture
 * and religion + geography (CalculateGeographicalModifier 855E50) + power gap
 * (CalculatePowerGapModifier 856260) + b's patriarch charisma and
 * SocialButterfly bonus, clamped to ±100. */
export function familyRelation47(r:NobilityRun47,aId:string,bId:string){
  const n=r.nobility!,a=n.families[aId],b=n.families[bId],ka=r.kin.families[aId],kb=r.kin.families[bId];
  if(!a||!b||!ka||!kb||aId===bId||ka.stateId!==kb.stateId)return 0;
  const stored=n.relations[aId]?.[bId]??0;
  let v=f(marriageConnection47(r,aId,bId)+0);
  if(ka.cultureName!==kb.cultureName)v=f(v-20);
  v=f(v+(a.religionId===b.religionId?10:-15));
  let x=f(geography(r,aId,bId)+v);x=f(x+powerGap(r,aId,bId));
  const head=r.kin.persons[kb.headId];
  if(head?.isAlive){
    x=f(f(f(nativeCharacterSkills(head.base,combatTraits47(head.traits)).charisma-50)*f(.5))+x);
    for(const name of head.traits??[])if(name==='SocialButterfly'){const bonus=f((NATIVE_CHARACTER_POOL.find(t=>t.name===name) as {relationshipBonus?:number}|undefined)?.relationshipBonus??0);if(bonus>0){x=f(x+bonus);break;}}
  }
  const total=f(stored+x);return -100>total?-100:total>100?100:total;
}
/** A living member's living spouse born in the other family: 10, or 5 for a matrilineal match. */
export function marriageConnection47(r:NobilityRun47,aId:string,bId:string){
  if(aId===bId)return 0;let best=0;
  for(const [own,other] of [[aId,bId],[bId,aId]]){
    for(const id of r.kin.families[own].memberIds){
      const m=r.kin.persons[id];if(!m?.isAlive||!m.spouseId)continue;
      const s=r.kin.persons[m.spouseId];if(!s?.isAlive)continue;
      if(String(s.originalFamilyId>0?s.originalFamilyId:s.familyId)!==other)continue;
      best=Math.max(best,m.marriageType===1||s.marriageType===1?5:10);
    }
  }
  return f(best);
}
/** Mean of CalculateProvinceDistance over the first three provinces of each: <10 +5, >30 −10. */
function geography(r:NobilityRun47,aId:string,bId:string){
  const n=r.nobility!,a=n.families[aId].controlledProvinces,b=n.families[bId].controlledProvinces;
  if(!a.length||!b.length)return 0;
  const scale=(r as unknown as {scale:number}).scale,pos=new Map(r.world.provinces.map(p=>[p.id,p.center]));
  let sum=0,count=0;
  for(const p of a.slice(0,3))for(const q of b.slice(0,3)){
    const u=pos.get(p),w=pos.get(q);let d:number;
    if(!u||!w)d=1000;else{d=f(f(Math.hypot(f(u.x/scale-w.x/scale),f(u.y/scale-w.y/scale)))/5);d=1>d?1:d>20?20:d;}
    sum=f(sum+d);count++;
  }
  const mean=f(sum/count);
  return mean<10?5:mean>30?-10:0;
}
function powerGap(r:NobilityRun47,aId:string,bId:string){
  const n=r.nobility!,sa=f(familyWarMerit47(n.families[aId])+familyStrength47(n.families[aId])),sb=f(familyWarMerit47(n.families[bId])+familyStrength47(n.families[bId]));
  const ratio=f(Math.max(sa,sb)/Math.max(1,Math.min(sa,sb)));
  return ratio>10?-25:ratio>5?-15:ratio>3?-10:ratio>2?-5:-3;
}
