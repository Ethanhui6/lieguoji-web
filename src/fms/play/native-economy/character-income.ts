/** Original character trait arithmetic; finite input checks are web validation.
 * Evidence: fiscal15/NEXT_RECOVERY.md and CHARACTER_RECOVERY.md. */
import original from './character-traits.json';
import {f,finite} from './numeric';

export interface NativeIncomeTrait {
  name: string;
  administrativeModifier: number;
  taxEfficiencyModifier: number;
  militaryModifier: number;
  diplomaticModifier: number;
  charismaModifier: number;
}
export const ORIGINAL_CHARACTER_TRAITS: readonly NativeIncomeTrait[] = original.traits;
type TaxTrait = Pick<NativeIncomeTrait,'taxEfficiencyModifier'>;
type AdministrativeTrait = Pick<NativeIncomeTrait,'administrativeModifier'>;

/** Original null list is zero; null elements trap, duplicates remain ordered. */
export function nativeTaxModifier(traits: readonly TaxTrait[] | null): number {
  let total=0;
  for(const trait of traits??[]){
    if(!trait)throw Error('Unresolved original tax trait');
    total=f(total+finite(trait.taxEfficiencyModifier));
  }
  return total;
}
export function nativeAdministrativeSkill(base: number,traits: readonly AdministrativeTrait[] | null): number {
  let total=0;
  for(const trait of traits??[]){
    if(!trait)throw Error('Unresolved original administrative trait');
    total=f(total+finite(trait.administrativeModifier));
  }
  return Math.min(100,Math.max(0,f(total+finite(base))));
}
/** Only the getter is recovered; callers must resolve the military modifier. */
export function nativeMilitarySkill(base: number,resolvedModifiers: number): number {
  return Math.min(100,Math.max(0,f(finite(resolvedModifiers)+finite(base))));
}
type SkillTrait = Pick<NativeIncomeTrait,'administrativeModifier'|'militaryModifier'|'diplomaticModifier'|'charismaModifier'>;
export type NativeBaseSkills={administrative:number;military:number;diplomatic:number;charisma:number};
/** RVAs 83BEE0/83BDB0/83BB60. Ordered adds, no dedup or age multiplier. */
export function nativeSkillModifier(traits:readonly Partial<SkillTrait>[]|null,key:keyof SkillTrait):number{
 let sum=0;
 for(const trait of traits??[]){if(!trait)throw Error('Unresolved original skill trait');sum=f(sum+finite(trait[key]!));}
 return sum;
}
/** All final getters clamp after base + trait sum, not before. */
export function nativeCharacterSkills(base:NativeBaseSkills,traits:readonly SkillTrait[]|null):NativeBaseSkills{
 return {administrative:nativeAdministrativeSkill(base.administrative,traits),military:nativeMilitarySkill(base.military,nativeSkillModifier(traits,'militaryModifier')),diplomatic:nativeMilitarySkill(base.diplomatic,nativeSkillModifier(traits,'diplomaticModifier')),charisma:nativeMilitarySkill(base.charisma,nativeSkillModifier(traits,'charismaModifier'))};
}
