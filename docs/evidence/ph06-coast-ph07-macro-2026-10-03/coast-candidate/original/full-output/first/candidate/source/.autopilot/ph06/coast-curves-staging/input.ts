import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { integerSqrt } from '../../../src/world/generation/seed';
import { naturalFacingSeparation, type NaturalPointQ } from './baseline/detail-natural-outline';

export const capturePath = '.autopilot/ph06/demo22-replay/runs/2026-09-27T22-49-07.265Z/capture.json';
export function loadCapturedOutline() {
  const bytes = readFileSync(capturePath), capture = JSON.parse(bytes.toString()) as {
    format: string; version: number; buildVersion: string; originalIabSaveRead: boolean; independentPrivateContext: boolean;
    recipe: { parameters: { pointsQ: NaturalPointQ[]; coastStructureWorld: number; coastRoughnessWorld: number } };
  };
  if (capture.format !== 'lieguoji-independent-demo22-ui-replay' || capture.version !== 1 || capture.buildVersion !== '0.5.0-preview.22'
    || capture.originalIabSaveRead !== false || capture.independentPrivateContext !== true) throw new Error('Require independently captured actual22 gesture input.');
  const recipe = capture.recipe.parameters;
  return { input: prepareInput(recipe.pointsQ, recipe.coastStructureWorld, recipe.coastRoughnessWorld),
    captureSha256: createHash('sha256').update(bytes).digest('hex') };
}

/** Test-only application of the unchanged production cap preparation. No
 * source simplification is needed for these explicit noncollinear fixtures. */
export function prepareInput(points: readonly NaturalPointQ[], structureWorld = 96, roughnessWorld = 16) {
  const count = points.length, edgeCaps = new Int32Array(count).fill((structureWorld + roughnessWorld) * 256);
  const lengths = points.map((a, i) => { const b = points[(i + 1) % count]; return integerSqrt((a.xQ - b.xQ) ** 2 + (a.yQ - b.yQ) ** 2); });
  for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
    if (j === i + 1 || i === 0 && j === count - 1) continue;
    const distance = naturalFacingSeparation(points, i, j);
    if (distance !== null) { const cap = Math.max(0, Math.floor(distance / 4) - 2); edgeCaps[i] = Math.min(edgeCaps[i], cap); edgeCaps[j] = Math.min(edgeCaps[j], cap); }
  }
  const caps = points.map((_, id) => Math.min(edgeCaps[id], edgeCaps[(id + count - 1) % count]));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < count; i++) caps[(i + 1) % count] = Math.min(caps[(i + 1) % count], caps[i] + Math.floor(lengths[i] / 4));
    for (let i = count - 1; i >= 0; i--) caps[i] = Math.min(caps[i], caps[(i + 1) % count] + Math.floor(lengths[i] / 4));
  }
  return { points, caps, structureWorld, roughnessWorld,
    area2: points.reduce((sum, a, i) => { const b = points[(i + 1) % count]; return sum + a.xQ * b.yQ - b.xQ * a.yQ; }, 0) };
}
export const q = (points: number[][]): NaturalPointQ[] => points.map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 }));
export const fast = { yieldControl: async () => {} };
export function exactDistance(points: readonly NaturalPointQ[], x: number, y: number) {
  let nearest = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], dx = b.xQ - a.xQ, dy = b.yQ - a.yQ;
    const t = Math.max(0, Math.min(1, ((x - a.xQ) * dx + (y - a.yQ) * dy) / (dx * dx + dy * dy)));
    nearest = Math.min(nearest, Math.hypot(x - a.xQ - dx * t, y - a.yQ - dy * t));
  }
  return nearest;
}
