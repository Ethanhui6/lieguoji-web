/** Resolved original character inputs. No generated people or v15 callers.
 * Evidence: fiscal15/NEXT_RECOVERY.md, RVAs 83C330/83B880/83DF70/83E330. */
import original from './character-traits.json';
import {f,finite} from './numeric';

export interface NativeIncomeTrait {
  name: string;
  administrativeModifier: number;
  taxEfficiencyModifier: number;
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
