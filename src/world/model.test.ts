import { beforeAll, describe, expect, it } from 'vitest';
import { ATLAS_LAYERS, UNASSIGNED, blockKey, cloneAtlasDraft, cloneBlock, cloneVerifiedAtlasDraft, createAtlasDraft, decodeBlock, decodeManifest, encodeBlock, encodeManifest, getAdminLeaf, getBlock, getCellLayerSlot, getSimRegion, getVertexSlot, hashBlock, hashManifest, validateAtlasDraft, validateAtlasDraftAsync, validateBlock, validateCatalogs, validateManifest, verifyAtlasDraft } from './model';
import type { AtlasBlock, AtlasCreateOptions, AtlasDraftData, BlockKey, GeometryBlock } from './model';

const fixedIds = { draftId: 'atlas-11111111-1111-4111-8111-111111111111', atlasId: 'geo-22222222-2222-4222-8222-222222222222' };
const options: AtlasCreateOptions = { size: 256, seed: 'ph04-production-shared-ocean', name: '空白创世草稿', ...fixedIds };
const noWait = { yieldTask: async () => {} };
let standard: AtlasDraftData;
beforeAll(async () => { standard = await createAtlasDraft(options, noWait); }, 20000);

async function refresh(data: AtlasDraftData, keys: BlockKey[]) {
  for (const key of new Set(keys)) data.manifest.blockRefs.find(ref => ref.key === key)!.hash = await hashBlock(getBlock(data, key));
}

describe('production atlas model and immutable block codec', () => {
  it('cooperative validation visits real structure and geometry and cancels before completion', async () => {
    const aborter = new AbortController(), seen: { stage: string; completed: number; total: number }[] = [];
    await expect(validateAtlasDraftAsync(standard, {
      ...noWait, signal: aborter.signal, onProgress: progress => {
        seen.push(progress); if (progress.stage === '核验共享地理与跨块邻接') aborter.abort();
      },
    })).rejects.toThrow();
    expect(seen.some(row => row.stage === '核验地理块结构与成员引用' && row.completed === standard.blocks.size)).toBe(true);
    expect(seen.at(-1)).toEqual({ stage: '核验共享地理与跨块邻接', completed: 4096, total: 257 ** 2 });
    await expect(validateAtlasDraftAsync(standard, noWait)).resolves.toBe(true);
    const missing = cloneAtlasDraft(standard); missing.blocks.delete('elevation:7:7');
    await expect(validateAtlasDraftAsync(missing, noWait)).resolves.toBe(false);
    const badMembership = cloneAtlasDraft(standard), block = badMembership.blocks.get('admin-membership:7:7')!;
    if (block.layer !== 'admin-membership') throw new Error('wrong fixture layer'); block.values[1023] = 42;
    expect(validateAtlasDraft(badMembership)).toBe(false); await expect(validateAtlasDraftAsync(badMembership, noWait)).resolves.toBe(false);
  });

  it('takes a strict complete ingress copy before the first cooperative yield without laundering unsafe buffers', async () => {
    const input = cloneAtlasDraft(standard); let yields = 0;
    const owned = await cloneVerifiedAtlasDraft(input, { yieldTask: async () => {
      if (yields++ === 0) {
        const last = input.blocks.get('elevation:7:7')!; if (last.layer !== 'elevation') throw new Error('wrong fixture layer');
        last.values[1023] = 900; input.manifest.name = 'caller mutation'; input.manifest.blockRefs.at(-1)!.hash = '0'.repeat(64);
      }
    } });
    expect(yields).toBeGreaterThan(1); expect(owned).toEqual(standard); expect(input).not.toEqual(owned);
    const unsafe = cloneAtlasDraft(standard), last = unsafe.blocks.get('elevation:7:7')!;
    if (last.layer !== 'elevation') throw new Error('wrong fixture layer'); last.values = new Int32Array(new SharedArrayBuffer(4096));
    let yieldedUnsafe = false;
    await expect(cloneVerifiedAtlasDraft(unsafe, { yieldTask: async () => { yieldedUnsafe = true; } })).rejects.toThrow();
    expect(yieldedUnsafe).toBe(false);
    const staleHash = cloneAtlasDraft(standard), altered = staleHash.blocks.get('elevation:7:7')!;
    if (altered.layer !== 'elevation') throw new Error('wrong fixture layer'); altered.values[1023] = 900;
    await expect(cloneVerifiedAtlasDraft(staleHash, noWait)).rejects.toThrow('摘要');
  });

  it('creates a real 65,536-cell empty ocean with unique shared vertices and independent empty memberships', async () => {
    expect(validateAtlasDraft(standard)).toBe(true); await expect(verifyAtlasDraft(standard, noWait)).resolves.toBeUndefined();
    expect(standard.manifest).toMatchObject({ format: 'lieguoji-atlas-draft', version: 1, kind: 'draft', revision: 0, ...fixedIds, spec: { columns: 256, rows: 256, width: 4096, height: 4096, coordinateScale: 256, blockCells: 32 }, catalogs: { simRegions: [], administration: [] } });
    expect(standard.manifest).not.toHaveProperty('engineFingerprint');
    expect(standard.blocks.size).toBe(256);
    const vertices = new Set<number>(); let cells = 0;
    for (const block of standard.blocks.values()) {
      expect(validateBlock(block, standard.manifest.spec)).toBe(true);
      if (block.layer === 'geometry') for (const id of block.vertexIds) { expect(vertices.has(id)).toBe(false); vertices.add(id); }
      else if (block.layer === 'elevation') { cells += block.values.length; expect(block.values.every(value => value === -100)).toBe(true); }
      else expect(block.values.every(value => value === UNASSIGNED)).toBe(true);
    }
    expect(vertices.size).toBe(257 * 257); expect(cells).toBe(65536);
    expect(getSimRegion(standard, 32768)).toBeNull(); expect(getAdminLeaf(standard, 32768)).toBeNull();
  }, 20000);

  it('is seed-deterministic while draft/atlas identity belongs to the manifest rather than content blocks', async () => {
    const first = await createAtlasDraft({ ...options, size: 128 }, noWait);
    const second = await createAtlasDraft({ ...options, size: 128, draftId: 'atlas-33333333-3333-4333-8333-333333333333', atlasId: 'geo-44444444-4444-4444-8444-444444444444' }, noWait);
    expect(first.manifest.blockRefs).toEqual(second.manifest.blockRefs);
    expect(await hashManifest(first.manifest)).not.toBe(await hashManifest(second.manifest));
    const changedSeed = await createAtlasDraft({ ...options, size: 128, seed: 'another-seed' }, noWait);
    expect(changedSeed.manifest.blockRefs.filter(ref => ref.key.startsWith('geometry:'))).not.toEqual(first.manifest.blockRefs.filter(ref => ref.key.startsWith('geometry:')));
    for (const ref of first.manifest.blockRefs.filter(ref => !ref.key.startsWith('geometry:'))) expect(changedSeed.manifest.blockRefs.find(value => value.key === ref.key)).toEqual(ref);
    expect(first.blocks.get('geometry:0:0')).not.toBe(second.blocks.get('geometry:0:0'));
  }, 20000);

  it('uses the same production codec at the 512-grid boundary without overflowing final cell or vertex identity', async () => {
    const extended = await createAtlasDraft({ ...options, size: 512 }, noWait);
    expect(extended.blocks.size).toBe(1024);
    const finalCell = getCellLayerSlot(extended, 'elevation', 512 * 512 - 1), finalVertex = getVertexSlot(extended, 513 * 513 - 1);
    expect(finalCell).toMatchObject({ key: 'elevation:15:15', slot: 1023 });
    expect(finalVertex.key).toBe('geometry:15:15');
    expect(finalVertex.block.xyQ.slice(finalVertex.slot * 2, finalVertex.slot * 2 + 2)).toEqual(new Int32Array([4096 * 256, 4096 * 256]));
    expect(decodeBlock(encodeBlock(finalVertex.block), extended.manifest.spec)).toEqual(finalVertex.block);
    expect(validateManifest(extended.manifest)).toBe(true);
  }, 20000);

  it('round-trips each strict typed block codec with fixed little-endian values and detached output ownership', async () => {
    for (const layer of ATLAS_LAYERS) {
      const block = getBlock(standard, blockKey(layer, 0, 0)), encoded = encodeBlock(block), decoded = decodeBlock(encoded, standard.manifest.spec);
      expect(decoded).toEqual(block); expect(encodeBlock(decoded)).toEqual(encoded); expect(await hashBlock(decoded)).toBe(await hashBlock(block));
      encoded.fill(0); expect(encodeBlock(decoded)[0]).toBe(76);
    }
    const elevation = encodeBlock(getBlock(standard, 'elevation:0:0'));
    expect(new DataView(elevation.buffer).getInt32(28, true)).toBe(-100);
    const geometry = getBlock(standard, 'geometry:1:1');
    expect(decodeBlock(encodeBlock(geometry), standard.manifest.spec)).toEqual(geometry);
    const cloned = cloneBlock(geometry) as GeometryBlock;
    cloned.xyQ[0]++; expect(await hashBlock(cloned)).not.toBe(await hashBlock(geometry));
    const renamed = { ...getBlock(standard, 'elevation:0:0'), bx: 1 };
    expect(await hashBlock(renamed)).not.toBe(await hashBlock(getBlock(standard, 'elevation:0:0')));
  });

  it('protects every manifest field with canonical text and rejects future or noncanonical encodings', async () => {
    const encoded = encodeManifest(standard.manifest), decoded = decodeManifest(encoded);
    expect(decoded).toEqual(standard.manifest); expect(await hashManifest(decoded)).toMatch(/^[a-f0-9]{64}$/);
    const changed = structuredClone(standard.manifest); changed.revision++; changed.name = '新名';
    expect(await hashManifest(changed)).not.toBe(await hashManifest(standard.manifest));
    const unknown = { ...standard.manifest, rulesVersion: 'pretend-engine' };
    expect(validateManifest(unknown)).toBe(false);
    expect(validateManifest({ ...standard.manifest, version: 2 })).toBe(false);
    expect(validateManifest({ ...standard.manifest, spec: { ...standard.manifest.spec, coordinateScale: 1024 } })).toBe(false);
    expect(() => decodeManifest(new TextEncoder().encode(` ${new TextDecoder().decode(encoded)}`))).toThrow('非规范');
    expect(() => decodeManifest(new Uint8Array([255]))).toThrow('UTF-8');
    expect(validateManifest({ ...standard.manifest, blockRefs: [...standard.manifest.blockRefs].reverse() })).toBe(false);
  });

  it('rejects unknown fields, accessors, shared buffers, bad owner IDs and damaged binary framing without executing accessors', () => {
    const block = getBlock(standard, 'geometry:0:0'), encoded = encodeBlock(block);
    for (const offset of [0, 4, 6, 7, 12, 16, 17]) { const bad = encoded.slice(); bad[offset] = 255; expect(() => decodeBlock(bad)).toThrow(); }
    expect(() => decodeBlock(encoded.slice(0, -1))).toThrow();
    expect(() => decodeBlock(new Uint8Array([...encoded, 0]))).toThrow('尾随');
    expect(validateBlock({ ...block, extra: 1 })).toBe(false);
    const wrongOwner = cloneBlock(block) as GeometryBlock; wrongOwner.vertexIds[0] = 100;
    expect(validateBlock(wrongOwner, standard.manifest.spec)).toBe(false);
    const shared = { ...getBlock(standard, 'elevation:0:0'), values: new Int32Array(new SharedArrayBuffer(4096)) };
    expect(validateBlock(shared)).toBe(false); expect(() => cloneBlock(shared as AtlasBlock)).toThrow();
    const extraArray = cloneBlock(getBlock(standard, 'elevation:0:0'));
    if (extraArray.layer !== 'geometry') Object.defineProperty(extraArray.values, 'secret', { value: 1 });
    expect(validateBlock(extraArray)).toBe(false);
    let calls = 0; const accessor = { ...block };
    Object.defineProperty(accessor, 'layer', { get: () => { calls++; return 'geometry'; }, enumerable: true });
    expect(validateBlock(accessor)).toBe(false); expect(calls).toBe(0);
  });

  it('keeps simulation membership independent from administrative leaves and validates real catalog references', async () => {
    const data = cloneAtlasDraft(standard), keys: BlockKey[] = [];
    data.manifest.catalogs = {
      simRegions: [{ id: 21, name: '聚合区甲' }, { id: 22, name: '聚合区乙' }],
      administration: [{ id: 10, name: '自定义上级', parentId: null, kind: 'branch' }, { id: 11, name: '叶甲', parentId: 10, kind: 'leaf' }, { id: 12, name: '叶乙', parentId: 10, kind: 'leaf' }],
    };
    for (const [cell, region, leaf] of [[0, 21, 11], [1, 21, 12], [2, 22, 12]]) {
      const sim = getCellLayerSlot(data, 'sim-membership', cell), admin = getCellLayerSlot(data, 'admin-membership', cell);
      sim.block.values[sim.slot] = region; admin.block.values[admin.slot] = leaf; keys.push(sim.key, admin.key);
    }
    await refresh(data, keys); expect(validateAtlasDraft(data)).toBe(true); await verifyAtlasDraft(data, noWait);
    expect([0, 1, 2].map(cell => getSimRegion(data, cell))).toEqual([21, 21, 22]);
    expect([0, 1, 2].map(cell => getAdminLeaf(data, cell))).toEqual([11, 12, 12]);
    const beforeRegions = data.manifest.blockRefs.filter(ref => ref.key.startsWith('sim-membership:')).map(ref => ref.hash);
    const admin = getCellLayerSlot(data, 'admin-membership', 0); admin.block.values[admin.slot] = 12; await refresh(data, [admin.key]);
    expect(data.manifest.blockRefs.filter(ref => ref.key.startsWith('sim-membership:')).map(ref => ref.hash)).toEqual(beforeRegions);
    expect(getSimRegion(standard, 0)).toBeNull(); expect(getAdminLeaf(standard, 0)).toBeNull();
  }, 20000);

  it('rejects missing blocks, dangling memberships, cyclic catalogs and valid-looking tampered bytes without mutating source', async () => {
    const before = await hashManifest(standard.manifest), data = cloneAtlasDraft(standard), elevation = getCellLayerSlot(data, 'elevation', 0);
    elevation.block.values[elevation.slot] = -99;
    expect(validateAtlasDraft(data)).toBe(true); await expect(verifyAtlasDraft(data, noWait)).rejects.toThrow('摘要不符');
    const membership = getCellLayerSlot(data, 'admin-membership', 0); membership.block.values[membership.slot] = 2;
    expect(validateAtlasDraft(data)).toBe(false);
    data.blocks.delete('geometry:0:0'); expect(validateAtlasDraft(data)).toBe(false);
    expect(validateCatalogs({ simRegions: [], administration: [{ id: 1, name: '甲', parentId: 2, kind: 'branch' }, { id: 2, name: '乙', parentId: 1, kind: 'branch' }] })).toBe(false);
    expect(validateCatalogs({ simRegions: [], administration: [{ id: 1, name: '叶', parentId: null, kind: 'leaf' }, { id: 2, name: '子', parentId: 1, kind: 'leaf' }] })).toBe(false);
    expect(await hashManifest(standard.manifest)).toBe(before);
    expect(getCellLayerSlot(standard, 'elevation', 0).block.values[0]).toBe(-100);
  }, 20000);

  it('does not expose owned arrays through block or whole-draft clones', () => {
    const copy = cloneAtlasDraft(standard), originalVertex = getVertexSlot(standard, 100), copiedVertex = getVertexSlot(copy, 100);
    expect(copiedVertex.block.xyQ.buffer).not.toBe(originalVertex.block.xyQ.buffer);
    copiedVertex.block.xyQ[copiedVertex.slot * 2]++; copy.manifest.name = '副本';
    expect(copiedVertex.block.xyQ[copiedVertex.slot * 2]).not.toBe(originalVertex.block.xyQ[originalVertex.slot * 2]);
    expect(standard.manifest.name).toBe(options.name);
    expect(copy.blocks).not.toBe(standard.blocks);
  });

  it('rejects unsupported creation parameters and cancels a staged creation without publishing a draft', async () => {
    await expect(createAtlasDraft({ ...options, size: 64 as 128 }, noWait)).rejects.toThrow('128');
    await expect(createAtlasDraft({ ...options, draftId: 'legacy-run' }, noWait)).rejects.toThrow('UUID');
    const controller = new AbortController(); let progress = 0;
    await expect(createAtlasDraft(options, { signal: controller.signal, onProgress: () => { progress++; controller.abort(); }, yieldTask: async () => {} })).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress).toBe(1); expect(validateAtlasDraft(standard)).toBe(true);
  }, 20000);
});
