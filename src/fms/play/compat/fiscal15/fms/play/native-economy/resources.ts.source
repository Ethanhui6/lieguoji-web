/** Original resource config is reused under the user's 2026-10-03 authorization.
 * SHA256 c6fe1e80f126358d058921ca17a96e0088164d15b1af283ff7285fcc70104445.
 * Keep native exact-name mismatches: do not silently alias Savannah or Fox Fur. */
import original from './biome-resources.json';
import { BIOME_NAMES } from '../terrain13-native';
import type { NativeEthnic } from '../native-combat/upper-efficiency';
import type { EconomicResource } from './settlement';
import { f, finite, int32 } from './numeric';
export interface ResourceSource {
  resources: { Name: string; BaseValue: number; AffectedBy: string[] }[];
  biomeDistribution: { Name: string; Resources: { Name: string; Probability: number }[] }[];
}
export type ResourceTable = Readonly<Record<string, readonly EconomicResource[]>>;
// Original enum has only five values. Other is a web neutral input, not source data.
const ethnicNames: readonly NativeEthnic[] = ['FishAndHunting', 'Agriculture', 'Nomadic', 'Maritime', 'Commercial'];
export function buildNativeResourceTable(source: ResourceSource) {
  const global = new Map(source.resources.map(r => [r.Name, r]));
  if (global.size !== source.resources.length) throw Error('Duplicate global resource');
  const table: Record<string, EconomicResource[]> = Object.create(null), unresolved: string[] = [];
  for (const b of source.biomeDistribution) {
    if (Object.hasOwn(table, b.Name)) throw Error('Duplicate resource biome');
    table[b.Name] = [];
    for (const c of b.Resources) {
      const r = global.get(c.Name);
      if (!r) { unresolved.push(`${b.Name}/${c.Name}`); continue; }
      const baseValue = int32(r.BaseValue), probability = finite(c.Probability);
      if (probability < 0 || probability > 1 || r.AffectedBy.some(e => !ethnicNames.includes(e as NativeEthnic))) throw Error('Invalid original resource input');
      table[b.Name].push({name:r.Name,baseValue,probability,affectedBy:[...r.AffectedBy] as NativeEthnic[]});
    }
  }
  return { table, unresolved };
}
export const ORIGINAL_RESOURCE_TABLE = buildNativeResourceTable(original);
/** Caller supplies the random stream and the actual ordered cell biome list.
 * Seed implementation and web geography are deliberately outside this kernel. */
export function nativeInitialResources(cellBiomes: readonly number[], seaNeighbor: boolean, random: () => number, table: ResourceTable = ORIGINAL_RESOURCE_TABLE.table): EconomicResource[] {
  const counts = new Map<number, number>();
  for (const id of cellBiomes) {
    if (!Number.isInteger(id) || id < 0 || id >= BIOME_NAMES.length) throw Error('Invalid resource biome');
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const selected = new Map<string, EconomicResource>();
  function sample(name: string, ratio: number) {
    for (const candidate of table[name] ?? []) {
      const draw = finite(random()); if (draw < 0 || draw > 1) throw Error('Invalid random value');
      const weight = f(ratio * f(candidate.probability));
      if (draw >= weight) continue;
      const existing = selected.get(candidate.name);
      if (existing) {
        existing.probability = f(existing.probability + weight);
        existing.baseValue = Math.max(existing.baseValue, candidate.baseValue);
      } else selected.set(candidate.name, {...candidate, probability:weight, affectedBy:[...candidate.affectedBy]});
    }
  }
  for (const [id, count] of counts) sample(BIOME_NAMES[id], f(f(count) / f(cellBiomes.length)));
  if (seaNeighbor) sample('Marine', f(.3));
  const resources = [...selected.values()];
  // Enumerable.Sum(float) accumulates in double before one final float conversion.
  let sum = 0; for (const resource of resources) sum += resource.probability;
  const total = f(sum);
  for (const resource of resources) resource.probability = f(resource.probability / total);
  return resources;
}
