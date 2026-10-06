/** Native algorithm on an explicitly supplied province graph, not old v13 World.
 * v14 separately binds web province topology and its annual clock.
 * See CORE_DISTANCE_RECOVERY.md for disconnected ordering and refresh times. */
export interface CoreProvince { id: string; stateRef: string | null; neighbors: readonly string[] }
export interface CoreDistance { distance: number; connected: boolean }
export function nativeCoreDistances(provinces: readonly CoreProvince[], stateRef: string, capital: string, ownedOrder: readonly string[]): Record<string, CoreDistance> {
  const byId = new Map(provinces.map(p => [p.id, p]));
  const owned = new Set(ownedOrder);
  if (byId.size !== provinces.length || owned.size !== ownedOrder.length || !owned.has(capital) || ownedOrder.some(id => byId.get(id)?.stateRef !== stateRef)) {
    throw new Error('Invalid core-distance province references');
  }
  const visited = new Set([capital]), queue = [capital];
  const result: Record<string, CoreDistance> = Object.create(null);
  result[capital] = { distance: 0, connected: true };
  let depth = 0, cursor = 0;
  while (cursor < queue.length) {
    const end = queue.length;
    for (; cursor < end; cursor++) for (const id of byId.get(queue[cursor])!.neighbors) {
      const next = byId.get(id);
      if (!next) throw new Error('Missing core-distance neighbor');
      if (next.stateRef !== stateRef || visited.has(id)) continue;
      if (!owned.has(id)) throw new Error('Inconsistent core-distance ownership');
      result[id] = { distance: depth + 1, connected: true };
      queue.push(id); visited.add(id);
    }
    depth++;
  }
  for (const id of ownedOrder) if (!visited.has(id)) result[id] = { distance: ++depth, connected: false };
  return result;
}
/** Original predicate deliberately does not require connected=true. */
export const isNativeCore = (distance: number, threshold: number, hasState: boolean) => hasState && distance <= threshold;
/** Annual one-step growth; keeps original unordered (empty 0/0) comparison. */
export function advanceCoreThreshold(threshold: number, coreCount: number, total: number, rate: number): number {
  const ratio = Math.fround(Math.fround(coreCount) / Math.fround(total));
  return ratio > Math.fround(rate) ? threshold : (threshold + 1) | 0;
}
