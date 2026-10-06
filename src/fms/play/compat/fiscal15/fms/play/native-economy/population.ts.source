/** Native initialization only; ordered source cells must be explicitly resolved.
 * Not an area-to-cell bridge or a replacement for existing v14 web population. */
import { f, int32, finite, truncInt } from './numeric';
export const POPULATION_CAPACITY = [5, .5, .5, 4, 6, 8, 10, 6, 6, 4, 3, .5, 5] as const;
export const FOOD_PRODUCTION_EFFICIENCY = [5, 1, 1, 3, 5, 7, 10, 5, 6, 3, 2, 0, 4] as const;
export interface PopulationInput {
  cellBiomes: readonly number[]; perCellFactor: number; growthRate: number;
  statePercentage: number; provinceRandom: number; atWarInProvince: boolean;
  oldPopulation: number; oldMaxPopulation: number; maxLocked: boolean;
}
export function nativeInitialPopulation(i: PopulationInput) {
  int32(i.oldPopulation); int32(i.oldMaxPopulation);
  int32(i.perCellFactor); finite(i.growthRate); finite(i.statePercentage); finite(i.provinceRandom);
  if (i.perCellFactor < 0 || i.growthRate < 0 || i.statePercentage < 0 || i.provinceRandom < 0) throw Error('Invalid population settings');
  let sum = f(0);
  for (const biome of i.cellBiomes) {
    if (!Number.isInteger(biome) || biome < 0 || biome >= POPULATION_CAPACITY.length) throw Error('Invalid population biome');
    sum = f(sum + POPULATION_CAPACITY[biome]);
  }
  const computedMax = Math.max(1, truncInt(f(f(f(i.perCellFactor) * sum) + f(5000))));
  const hadData = i.oldMaxPopulation > 0 || i.oldPopulation > 0;
  const maxPopulation = i.maxLocked && i.oldMaxPopulation > 0 ? i.oldMaxPopulation : computedMax;
  let population = hadData ? Math.min(maxPopulation, Math.max(0, i.oldPopulation)) : truncInt(f(f(f(maxPopulation) * f(i.statePercentage)) * f(i.provinceRandom)));
  const growth = i.atWarInProvince ? f(f(i.growthRate) * f(.97)) : f(i.growthRate);
  population = truncInt(f(f(population) * growth));
  const minimum = f(f(maxPopulation) * f(.3));
  if (population > maxPopulation) population = maxPopulation;
  else if (minimum > f(population)) population = truncInt(minimum);
  return { population, maxPopulation };
}
