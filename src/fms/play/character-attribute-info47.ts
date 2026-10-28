import {nativeCharacterSkills,nativeSkillModifier,nativeTaxModifier,type NativeBaseSkills} from './native-economy/character-income';
import {combatTraits47} from './civilization47-combat-state';
import {nativeRebellionResistance} from './native-war/vassal-rebellion';
import {nativeNavalCharacter47,nativeLeaderEnemies47} from './native-combat/personnel47';
import labels from './native-economy/character-trait-labels.json';

export const CHARACTER_SKILLS47=[['charisma','魅力'],['military','军事'],['diplomatic','外交'],['administrative','行政']] as const;
export const signedAttribute47=(v:number,digits=1)=>(v>0?'+':'')+v.toFixed(digits);
/** Presentation of the same ordered float32 getters used by the simulation.
 * These are conditional personal effects, not a claim that every person rules a state. */
export function characterAttributeInfo47(person:{base:NativeBaseSkills;traits:readonly string[]}){
 const traits=combatTraits47(person.traits),current=nativeCharacterSkills(person.base,traits);
 return {
  skills:CHARACTER_SKILLS47.map(([key,label])=>({key,label,base:person.base[key],modifier:nativeSkillModifier(traits,`${key}Modifier`),current:current[key]})),
  tax:nativeTaxModifier(traits),resistance:nativeRebellionResistance(traits),naval:nativeNavalCharacter47(traits),
  perEnemy:nativeLeaderEnemies47(traits,1),
  traits:traits.map(t=>({name:labels[t.name as keyof typeof labels]??t.name,effects:[
   ...CHARACTER_SKILLS47.filter(([key])=>t[`${key}Modifier`]!==0).map(([key,label])=>`${label} ${signedAttribute47(t[`${key}Modifier`])}`),
   ...(t.taxEfficiencyModifier?[`领袖税收修正 ${signedAttribute47(t.taxEfficiencyModifier*100)}%`]:[]),
   ...(t.rebellionResistanceModifier?[`领袖叛乱抵抗 ${signedAttribute47(t.rebellionResistanceModifier*100)}%`]:[]),
   ...(t.navalCombatModifier?[`领袖海战修正 ${signedAttribute47(t.navalCombatModifier*100)}%`]:[]),
   ...(t.combatModifierPerEnemy?[`每个敌国的领袖陆战修正 ${signedAttribute47(t.combatModifierPerEnemy*100)}%`]:[]),
   ...(t.name==='Reformer'?['改革效果待还原']:[]),
  ]})),
 };
}
