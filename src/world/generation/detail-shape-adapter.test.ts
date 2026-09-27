import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { fingerprintDetailShapeGenerator } from '../../../scripts/generator-fingerprint';
import { cloneAtlasDocument, createGenerationDraft, encodeAtlasManifest, validateAtlasManifest, verifyAtlasDocument, type AtlasDetailCoastDocument } from '../atlas-format';
import { encodeGenerationRecipe, validateDetailShapeRecipe, validateGenerationOperation, type DetailShapeRecipe } from '../generation-contract';
import { createAtlasDraft, encodeBlock, getCellLayerSlot, getVertexSlot, hashBlock } from '../model';
import { cellVertexIds, getVertexPositionQ } from '../topology';
import { hashAtlasCellLockBlock, lockKey } from '../generation-locks';
import { encodeDetailCoastTile, hashDetailCoastTile } from '../detail-coast-codec';
import { summarizeDetailCoast } from '../detail-coast-geometry';
import { extractDetailCoastBase } from '../detail-coast-base';
import { DETAIL_SHAPE_GENERATOR_FINGERPRINT, SHAPE_GENERATOR_FINGERPRINT } from './fingerprint';
import { generateDetailShapeAtlas, type DetailShapeAdapterOutput } from './detail-shape-adapter';

const fast = { yieldTask: async () => {} };
const recipe = (): DetailShapeRecipe => ({ format: 'lieguoji-atlas-recipe', version: 1,
  generator: { id: 'shape-detail-landmass', version: 1, fingerprint: DETAIL_SHAPE_GENERATOR_FINGERPRINT }, seed: 'adapter-real-quads',
  parameters: { pointsQ: [[1200, 1200], [1360, 1200], [1360, 1360], [1300, 1360], [1300, 1260], [1260, 1260], [1260, 1360], [1200, 1360]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })), coastRoughnessWorld: 8, reliefMeters: 1800, shelfWidthWorld: 96, islandChainCount: 0, islandsPerChain: 3 } });
let base: AtlasDetailCoastDocument, generated: DetailShapeAdapterOutput;
beforeAll(async () => { base = await createGenerationDraft({ size: 128, seed: 'adapter-quad-fixture', name: '真实细岸适配器' }, fast, 4); generated = await generateDetailShapeAtlas({ base, recipe: recipe() }, fast); }, 30000);
const content = (data: AtlasDetailCoastDocument) => ({ manifest: encodeAtlasManifest(data.manifest), blocks: [...data.blocks].map(([key, block]) => [key, encodeBlock(block)]), detail: [...data.detailCoast].map(([key, tile]) => [key, encodeDetailCoastTile(tile)]) });

describe('registered empty-v4 detail-shape adapter', () => {
  it('binds its fingerprint to the actual complete runtime graph including field, extraction and validators', () => {
    const actual = fingerprintDetailShapeGenerator(); expect(DETAIL_SHAPE_GENERATOR_FINGERPRINT).toBe(actual.sha256);
    for (const file of ['src/world/generation/detail-shape-adapter.ts', 'src/world/generation/detail-shape.ts', 'src/world/generation/detail-shape-distance.ts', 'src/world/generation/detail-shape-height.ts', 'src/world/detail-coast-base.ts', 'src/world/detail-coast-geometry.ts', 'src/world/generation-contract.ts', 'src/world/generation-format.ts']) expect(actual.files).toContain(file);
    const changed = fingerprintDetailShapeGenerator(file => readFileSync(file, 'utf8') + (file.endsWith('/detail-shape-height.ts') ? '\n// hypothetical audited runtime change\n' : '')); expect(changed.sha256).not.toBe(actual.sha256);
    expect(actual.sha256).not.toBe(SHAPE_GENERATOR_FINGERPRINT);
  });

  it('strictly persists all kernel parameters and rejects old/crossed identities in both validation modes', () => {
    const value = recipe(); expect(JSON.parse(new TextDecoder().decode(encodeGenerationRecipe(value)))).toEqual(value);
    for (const mode of ['storage', 'execute'] as const) {
      expect(validateDetailShapeRecipe(value, base.manifest.spec, mode)).toBe(true);
      expect(validateDetailShapeRecipe({ ...value, generator: { ...value.generator, fingerprint: SHAPE_GENERATOR_FINGERPRINT } }, base.manifest.spec, mode)).toBe(false);
      expect(validateDetailShapeRecipe({ ...value, generator: { ...value.generator, id: 'shape-landmass' } }, base.manifest.spec, mode)).toBe(false);
      expect(validateDetailShapeRecipe({ ...value, generator: { ...value.generator, version: 2 } }, base.manifest.spec, mode)).toBe(false);
    }
    expect(validateGenerationOperation(value, { kind: 'cell-rectangle', column: 0, row: 0, columns: 64, rows: 64, transitionCells: 8 }, base.manifest.spec)).toBe(false);
    for (const parameters of [{ ...value.parameters, coastRoughnessWorld: 65 }, { ...value.parameters, shelfWidthWorld: 129 }, { ...value.parameters, shelfWidthWorld: 15 }, { ...value.parameters, islandsPerChain: 1 }, { ...value.parameters, islandChainCount: 4 }, { ...value.parameters, coastWavelengthWorld: 192 }, { ...value.parameters, pointsQ: [...value.parameters.pointsQ, value.parameters.pointsQ[0]] }]) expect(validateDetailShapeRecipe({ ...value, parameters })).toBe(false);
    const crossed = recipe(); crossed.parameters.pointsQ = [[1200, 1200], [1360, 1360], [1360, 1200], [1200, 1360]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 })); expect(validateDetailShapeRecipe(crossed)).toBe(false);
    let calls = 0; const getter = recipe(); Object.defineProperty(getter.parameters, 'reliefMeters', { enumerable: true, get() { calls++; return 1800; } }); expect(validateDetailShapeRecipe(getter)).toBe(false); expect(calls).toBe(0);
  });

  it('stores the new lastApplied only in v4 and keeps old origins and recipes from claiming the fine format', async () => {
    const last = { recipe: recipe(), scope: { kind: 'world' }, baseManifestDigest: await hashDetailCoastTile([...generated.data.detailCoast.values()][0]), baseRootDigest: 'a'.repeat(64), baseRevision: 0, lockSetDigest: 'b'.repeat(64), appliedRevision: 1 };
    const manifest = { ...base.manifest, revision: 1, generation: { ...base.manifest.generation, lastApplied: last } }; expect(validateAtlasManifest(manifest)).toBe(true);
    for (const format of [2, 3] as const) { const old = await createGenerationDraft({ size: 128, seed: 'old-provenance', name: '旧配方不降格' }, fast, format); expect(validateAtlasManifest({ ...old.manifest, revision: 1, generation: { ...old.manifest.generation, lastApplied: last } })).toBe(false); }
    expect(validateAtlasManifest({ ...manifest, origin: { format: 'lieguoji-atlas-copy-origin', version: 1, sourceFormat: 4, sourceDraftId: base.manifest.draftId, sourceSlot: 'current', sourceManifestDigest: last.baseManifestDigest, sourceManifestRevision: 0, observedRootDigest: last.baseRootDigest } })).toBe(false);
    expect(validateAtlasManifest({ ...manifest, generation: { ...manifest.generation, lastApplied: { ...last, recipe: { ...last.recipe, generator: { id: 'shape-landmass', version: 1, fingerprint: SHAPE_GENERATOR_FINGERPRINT }, parameters: { pointsQ: last.recipe.parameters.pointsQ, coastRoughnessWorld: 0, coastWavelengthWorld: 192, reliefMeters: 1800, shelfWidthWorld: 128 } } } } })).toBe(false);
  });

  it('derives the shared base sampler input from real quad area centroids, not vertex averages or nominal centers', async () => {
    const altered = cloneAtlasDocument(base), id = 40 * 128 + 40, vertex = getVertexSlot(altered, 41 * 129 + 41); vertex.block.xyQ[vertex.slot * 2] += 256; vertex.block.xyQ[vertex.slot * 2 + 1] += 128; altered.manifest.blockRefs.find(ref => ref.key === vertex.key)!.hash = await hashBlock(vertex.block);
    await verifyAtlasDocument(altered, fast); const extracted = await extractDetailCoastBase(altered, fast), xy = new Int32Array(extracted.centersQ), ids = cellVertexIds(altered.manifest.spec, id), p = [ids[0], ids[1], ids[3], ids[2]].map(v => getVertexPositionQ(altered, v));
    let area = 0, x = 0, y = 0;
    for (const [a, b, c] of [[p[0], p[1], p[2]], [p[0], p[2], p[3]]]) { const weight = (b.xQ - a.xQ) * (c.yQ - a.yQ) - (b.yQ - a.yQ) * (c.xQ - a.xQ); area += weight; x += weight * (a.xQ + b.xQ + c.xQ); y += weight * (a.yQ + b.yQ + c.yQ); }
    expect([xy[id * 2], xy[id * 2 + 1]]).toEqual([Math.round(x / (3 * area)), Math.round(y / (3 * area))]);
    expect([xy[id * 2], xy[id * 2 + 1]]).not.toEqual([Math.round(p.reduce((sum, point) => sum + point.xQ, 0) / 4), Math.round(p.reduce((sum, point) => sum + point.yQ, 0) / 4)]);
    expect(extracted.worldAreaTwiceQ2).toBe(2 * (4096 * 256) ** 2); expect(extracted.centersQ.byteLength).toBe(128 * 128 * 2 * 4);
  });

  it('produces complete persisted hashes, real clipped area and editable coarse heights while preserving every nonheight byte', async () => {
    await verifyAtlasDocument(generated.data, fast); const area = await summarizeDetailCoast(generated.data.detailCoast, { yieldControl: fast.yieldTask });
    expect(generated.summary.landAreaQ2).toBe(area.landAreaTwiceQ2); expect(generated.summary.worldAreaQ2).toBe(area.totalAreaTwiceQ2); expect(generated.summary.detailShape.componentBasis).toBe('coarse-center-4-neighbor');
    let changed = 0; for (const [key, original] of base.blocks) { const next = generated.data.blocks.get(key)!; if (original.layer !== 'elevation') expect(encodeBlock(next)).toEqual(encodeBlock(original)); else { if (next.layer !== 'elevation') throw new Error('wrong layer'); changed += original.values.filter((value, index) => value !== next.values[index]).length; } }
    expect(changed).toBeGreaterThan(0); expect(generated.summary.changedCellCount).toBe(changed); expect(generated.data.manifest.generation.lastApplied).toBeNull(); expect(base.detailCoast.size).toBe(0);
    for (const ref of generated.data.manifest.detailCoast.refs) expect(ref.hash).toBe(await hashDetailCoastTile(generated.data.detailCoast.get(`coast:${ref.bx}:${ref.by}`)!));
  }, 30000);

  it('owns both input recipe and actual geography before the first yield', async () => {
    const source = cloneAtlasDocument(base), selected = recipe(); let changed = false;
    const replay = await generateDetailShapeAtlas({ base: source, recipe: selected }, { yieldTask: async () => { if (!changed) { changed = true; selected.parameters.pointsQ[0].xQ = 0; selected.seed = 'caller-mutation'; const height = getCellLayerSlot(source, 'elevation', 0); height.block.values[height.slot] = 12000; } } });
    expect(content(replay.data)).toEqual(content(generated.data)); expect(replay.summary).toEqual(generated.summary);
  }, 30000);

  it('rejects actual old formats, old land, explicit fine content, entities and locks instead of trusting absence flags', async () => {
    const old = await createAtlasDraft({ size: 128, seed: 'old', name: '旧世界' }, fast); await expect(generateDetailShapeAtlas({ base: old, recipe: recipe() }, fast)).rejects.toThrow('第四版');
    await expect(generateDetailShapeAtlas({ base: generated.data, recipe: recipe() }, fast)).rejects.toThrow('空世界');
    const land = cloneAtlasDocument(base), cell = getCellLayerSlot(land, 'elevation', 0); cell.block.values[cell.slot] = 0; land.manifest.blockRefs.find(ref => ref.key === cell.key)!.hash = await hashBlock(cell.block); await expect(generateDetailShapeAtlas({ base: land, recipe: recipe() }, fast)).rejects.toThrow('已有陆地');
    const entities = cloneAtlasDocument(base); entities.manifest.catalogs.simRegions.push({ id: 7, name: '已有地区' }); await expect(generateDetailShapeAtlas({ base: entities, recipe: recipe() }, fast)).rejects.toThrow('实体');
    const locked = cloneAtlasDocument(base), lock = { format: 'lieguoji-atlas-cell-locks' as const, version: 1 as const, bx: 0, by: 0, flags: new Uint8Array(1024) }; lock.flags[0] = 1; locked.locks.set(lockKey(0, 0), lock); locked.manifest.constraints.lockRefs.push({ bx: 0, by: 0, hash: await hashAtlasCellLockBlock(lock) }); await expect(generateDetailShapeAtlas({ base: locked, recipe: recipe() }, fast)).rejects.toThrow('地块锁');
    await expect(generateDetailShapeAtlas({ base, recipe: recipe(), locksPresent: false } as never, fast)).rejects.toThrow('空草稿');
  });

  it('cancels real generation without mutating the caller or returning partial content', async () => {
    const before = content(base), aborter = new AbortController(); let reached = false;
    await expect(generateDetailShapeAtlas({ base, recipe: recipe() }, { ...fast, signal: aborter.signal, onProgress(value) { if (value.stage === '细大陆：write-true-distance') { reached = true; aborter.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(reached).toBe(true); expect(content(base)).toEqual(before);
  }, 30000);
});
