import { yieldAtlas, type AtlasControl, type AtlasSize } from '../model';
import { FIELD_Q, noiseQ12, roundRatio } from './seed';

/** Fixed first-natural-landmass@2 semantics, not a user-tunable ocean recipe. */
export const NATURAL_OCEAN_BASE_PROFILE = 'natural-ocean-base-v1' as const;
export const NATURAL_OCEAN_BASE_SEED_DOMAIN = 'natural-ocean-base@1\0' as const;
const WORLD_Q = 4096 * 256, BATCH = 1024;
const MEAN_DEPTH = 3800, MIN_DEPTH = 1200, MAX_DEPTH = 6500;

export interface NaturalOceanBaseInput {
  size: AtlasSize;
  /** Row-major real area centroids from the already verified empty atlas. */
  centersQ: ArrayBuffer;
  seed: string;
}

function domainSeed(seed: string): number {
  const encoder = new TextEncoder(), domain = encoder.encode(NATURAL_OCEAN_BASE_SEED_DOMAIN), bytes = encoder.encode(seed);
  let value = 2166136261;
  const add = (byte: number) => { value = Math.imul(value ^ byte, 16777619) >>> 0; };
  for (const byte of domain) add(byte);
  for (let index = 0; index < 4; index++) add(bytes.length >>> (index * 8) & 255);
  for (const byte of bytes) add(byte);
  return value;
}

/** The caller owns the empty-world gate. This helper never edits the atlas,
 * declares land, allocates fine nodes or changes an existing saved seafloor.
 * Absolute centroid coordinates drive coherent low-frequency basin/ridge
 * variation; this is a seeded geographic profile, not plate simulation. */
export async function createNaturalOceanBase(input: NaturalOceanBaseInput, control?: AtlasControl): Promise<Int32Array> {
  control?.signal?.throwIfAborted();
  const { size, seed, centersQ } = input;
  if (![128, 256, 512].includes(size) || typeof seed !== 'string' || seed.trim().length === 0 || seed.length > 120) throw new Error('自然海床规格或种子无效。');
  const total = size * size, step = WORLD_Q / size;
  if (!centersQ || Object.getPrototypeOf(centersQ) !== ArrayBuffer.prototype || Reflect.ownKeys(centersQ).length || centersQ.byteLength !== total * 2 * 4) throw new Error('自然海床需要独立且长度准确的真实重心缓冲区。');
  // Snapshot before the first await: cancellation or external mutation cannot
  // expose partial elevations or replace later centroid samples.
  const centers = new Int32Array(ArrayBuffer.prototype.slice.call(centersQ, 0) as ArrayBuffer), output = new Int32Array(total), seedValue = domainSeed(seed);
  let sum = 0, minimum = Infinity, maximum = -Infinity;
  for (let start = 0; start < total; start += BATCH) {
    control?.signal?.throwIfAborted();
    const end = Math.min(total, start + BATCH);
    for (let id = start; id < end; id++) {
      const xQ = centers[id * 2], yQ = centers[id * 2 + 1], column = id % size, row = Math.floor(id / size);
      if (xQ <= column * step || xQ >= (column + 1) * step || yQ <= row * step || yQ >= (row + 1) * step) throw new Error('自然海床真实重心越出所属粗格。');
      const basin = noiseQ12(seedValue, 1, xQ, yQ, 2048 * 256);
      const regional = noiseQ12(seedValue, 2, xQ, yQ, 1024 * 256);
      const ridge = FIELD_Q - 2 * Math.abs(noiseQ12(seedValue, 3, xQ, yQ, 768 * 256));
      const variation = roundRatio(1700 * basin + 650 * regional - 1000 * ridge, FIELD_Q);
      output[id] = variation; sum += variation; minimum = Math.min(minimum, variation); maximum = Math.max(maximum, variation);
    }
    await yieldAtlas(control, '采样自然海盆与海岭', end, total);
  }
  // Center the actual sampled field around 3800 m, reducing its amplitude only
  // if needed. Integer numerators remain safely below 2^53 at every atlas size.
  // No hard clipping terraces: one affine rescaling preserves relative slopes.
  const denominator = Math.max(total,
    Math.ceil((sum - minimum * total) / (MEAN_DEPTH - MIN_DEPTH)),
    Math.ceil((maximum * total - sum) / (MAX_DEPTH - MEAN_DEPTH)));
  for (let start = 0; start < total; start += BATCH) {
    control?.signal?.throwIfAborted();
    const end = Math.min(total, start + BATCH);
    for (let id = start; id < end; id++) output[id] = -(MEAN_DEPTH + roundRatio(output[id] * total - sum, denominator));
    await yieldAtlas(control, '校准自然海床深度', end, total);
  }
  control?.signal?.throwIfAborted();
  return output;
}
