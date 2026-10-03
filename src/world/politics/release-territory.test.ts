import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGenerationDraft, verifyAtlasDocument, type AtlasDetailCoastDocument, type AtlasDocument } from '../atlas-format';
import { hashDetailCoastTile } from '../detail-coast-codec';
import { detailCoastKey, detailCoastOwnerLayout } from '../detail-coast-types';
import { hashBlock } from '../model';
import { getAtlasStorage } from '../storage';
import { applyCountryCommand, validateCountryWorldGeography } from './core';
import { selectCountryPolygon } from './country-selection';
import { countryCellLandPolygons, countryGeographySource, countryLandAt, countryPoliticalMesh, decodeCountryGeography, prepareCountryGeography, type CountryGeographyRecord } from './geography';
import { pointInsideCountryLand } from './label-placement';
import { countryGeometry, validateCountryCommand, type CountryCommand, type CountryDocument, type CountryPoint, type CountryPreview, type CountryState } from './model';
import { openCountryWorld } from './storage';
import * as v2 from './storage-v2';
import * as v3 from './storage-v3';
import { CountryRuntime } from './worker';

const fast = { yieldTask: async () => {} };
let record: CountryGeographyRecord, geography: AtlasDocument;
const rectangle = (left: number, top: number, right: number, bottom: number): CountryPoint[] => [
  { xQ: left * 256, yQ: top * 256 }, { xQ: right * 256, yQ: top * 256 },
  { xQ: right * 256, yQ: bottom * 256 }, { xQ: left * 256, yQ: bottom * 256 },
];
const around = (p: CountryPoint) => rectangle((p.xQ - 1) / 256, (p.yQ - 1) / 256, (p.xQ + 1) / 256, (p.yQ + 1) / 256);
const expected = (state: CountryState) => ({ worldId: state.document.worldId, revision: state.document.revision, rootDigest: state.rootDigest });
const commandId = () => `command-${crypto.randomUUID()}`;

beforeAll(async () => {
  globalThis.indexedDB = new IDBFactory();
  // Actual verified atlas-v4 fine-field fixture, following geography.test.ts.
  // The positive coarse height deliberately disagrees with the fine sea bay.
  // No geography, selection, point ownership, codec or Worker adapter is mocked.
  const fixture: AtlasDetailCoastDocument = await createGenerationDraft({ size: 128, name: '移除领土真实细海湾夹具', seed: 'release-country-fine-bay' }, fast, 4);
  for (const block of fixture.blocks.values()) {
    if (block.layer === 'elevation') block.values.fill(500);
    if (block.layer === 'geometry') for (let slot = 0; slot < block.vertexIds.length; slot++) {
      const id = block.vertexIds[slot]; block.xyQ[slot * 2] = id % 129 * 32 * 256; block.xyQ[slot * 2 + 1] = Math.floor(id / 129) * 32 * 256;
    }
  }
  for (const ref of fixture.manifest.blockRefs) ref.hash = await hashBlock(fixture.blocks.get(ref.key)!);
  const layout = detailCoastOwnerLayout(0, 0), coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
  for (let index = 0; index < layout.count; index++) {
    const x = index % layout.width, y = Math.floor(index / layout.width), sea = x > 16 || x >= 6 && x <= 10 && y >= 4 && y <= 12;
    coverageQ[index] = x === 16 ? 0 : sea ? -512 : 512; elevationMeters[index] = x === 16 ? 0 : sea ? -180 : 720;
  }
  const coast = { format: 'lieguoji-detail-coast-tile', version: 1, bx: 0, by: 0, mode: 'samples', coverageQ, elevationMeters } as const;
  const tiles = [coast, ...[2, 4].map(bx => ({ format: 'lieguoji-detail-coast-tile', version: 1, bx, by: 0, mode: 'land' } as const))];
  for (const tile of tiles) { fixture.detailCoast.set(detailCoastKey(tile.bx, tile.by), tile); fixture.manifest.detailCoast.refs.push({ bx: tile.bx, by: tile.by, hash: await hashDetailCoastTile(tile) }); }
  await verifyAtlasDocument(fixture, fast);
  const api = getAtlasStorage(4), prepared = await api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: fixture.manifest, expectedRoot: null }, fast);
  const blocks = [...fixture.blocks.values(), ...fixture.locks.values(), ...fixture.detailCoast.values()];
  for (let offset = 0; offset < blocks.length; offset += 16) await api.stageAtlasBlocks(prepared.preparationId, blocks.slice(offset, offset + 16), fast);
  const receipt = await api.commitAtlasPreparation(prepared.preparationId, fast);
  record = await prepareCountryGeography({ draftId: receipt.draftId, revision: receipt.revision, rootDigest: receipt.rootDigest, manifestDigest: receipt.manifestDigest, atlasFormat: 4 }, fast);
  geography = await decodeCountryGeography(record, fast);
}, 30000);
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

async function baseDocument(version: 2 | 3, foreign = false): Promise<CountryDocument> {
  const empty: CountryDocument = { format: 'lieguoji-country-document', version, worldId: `country-${crypto.randomUUID()}`, name: '移除领土验证', source: countryGeographySource(geography), revision: 0, nations: [], regimes: [], territories: [], cities: [] };
  let document = (await applyCountryCommand(empty, { type: 'create-nation', name: '海湾国', color: '#446688', cellIds: [0, 4, 5] }, geography, undefined, fast)).document;
  if (foreign) document = (await applyCountryCommand(document, { type: 'create-nation', name: '邻国', color: '#997755', cellIds: [8] }, geography, undefined, fast)).document;
  await validateCountryWorldGeography(document, geography, fast); return document;
}
const release = (document: CountryDocument, outlineQ: CountryPoint[]): CountryCommand => ({ type: 'release-territory-shape', nationId: document.nations[0].id, outlineQ });
async function center(version: 2 | 3, cellId: number): Promise<CountryPoint> {
  return version === 3 ? (await countryPoliticalMesh(geography, fast)).centerQ(cellId)
    : { xQ: (cellId % 128 * 32 + 16) * 256, yQ: (Math.floor(cellId / 128) * 32 + 16) * 256 };
}
async function savedWorld(version: 2 | 3) {
  const store = version === 2 ? v2 : v3, initial = await store.createCountryWorld(record, `持久世界 v${version}`);
  const document = (await applyCountryCommand(initial.document, { type: 'create-nation', name: '海湾国', color: '#446688', cellIds: [0, 4, 5] }, geography, undefined, fast)).document;
  return store.commitCountryWorld(initial, document, commandId(), 'a'.repeat(64));
}

describe('release territory uses the existing authoritative whole-cell rule', () => {
  it.each([2, 3] as const)('v%i removes the exact selected owned land while retaining entities, geometry and the source', async version => {
    const base = await baseDocument(version), before = structuredClone(base), sourceBefore = structuredClone(record), outlineQ = rectangle(128, 0, 256, 32);
    const chosen = await selectCountryPolygon(geography, { source: base.source, pointsQ: outlineQ, geometry: countryGeometry(base) }, fast);
    const removed = base.territories.filter(t => chosen.cellIds.includes(t.cellId)); expect(removed.map(t => t.cellId)).toEqual([4, 5]);
    const result = await applyCountryCommand(base, release(base, outlineQ), geography, undefined, fast);
    expect(result.document).toEqual({ ...base, revision: base.revision + 1, territories: base.territories.filter(t => !chosen.cellIds.includes(t.cellId)) });
    expect(result.description).toBe('从「海湾国」移除 2 个地块内的实际陆地，恢复为未分配；城市、首都与海域保持不变。');
    expect(base).toEqual(before); expect(record).toEqual(sourceBefore); expect(result.document.version).toBe(version);
    await validateCountryWorldGeography(result.document, geography, fast);
    expect(await countryLandAt(geography, 16 * 256, 16 * 256, fast, countryGeometry(base))).toMatchObject({ land: false, height: -180 });
  });

  it.each([2, 3] as const)('v%i protects capital and ordinary city cells even when a city is outside the drawn ring', async version => {
    let base = await baseDocument(version);
    const seed = await center(version, 5), positionQ = { xQ: seed.xQ + 128, yQ: seed.yQ };
    expect(await countryLandAt(geography, positionQ.xQ, positionQ.yQ, fast, countryGeometry(base))).toMatchObject({ cellId: 5, land: true });
    base = (await applyCountryCommand(base, { type: 'create-city', nationId: base.nations[0].id, name: '东城', positionQ }, geography, undefined, fast)).document;
    const capitalPoint = pointInsideCountryLand(await countryCellLandPolygons(geography, 0, fast, countryGeometry(base)))!;
    const capitalPositionQ = { xQ: Math.round(capitalPoint.xQ), yQ: Math.round(capitalPoint.yQ) };
    expect(await countryLandAt(geography, capitalPositionQ.xQ, capitalPositionQ.yQ, fast, countryGeometry(base))).toMatchObject({ cellId: 0, land: true });
    base = (await applyCountryCommand(base, { type: 'create-city', nationId: base.nations[0].id, name: '湾都', positionQ: capitalPositionQ }, geography, undefined, fast)).document;
    base = (await applyCountryCommand(base, { type: 'set-capital', nationId: base.nations[0].id, cityId: base.cities[1].id }, geography, undefined, fast)).document;
    const before = structuredClone(base);
    await expect(applyCountryCommand(base, release(base, around(seed)), geography, undefined, fast)).rejects.toThrow('城市「东城」');
    await expect(applyCountryCommand(base, release(base, rectangle(0, 0, 32, 32)), geography, undefined, fast)).rejects.toThrow('首都「湾都」');
    expect(base).toEqual(before); await validateCountryWorldGeography(base, geography, fast);
  });

  it('rejects foreign legal/control ownership, empty edits and loss of the last owned land atomically', async () => {
    const base = await baseDocument(3, true), before = structuredClone(base);
    await expect(applyCountryCommand(base, release(base, rectangle(128, 0, 288, 32)), geography, undefined, fast)).rejects.toThrow('其他国家');
    const occupied = structuredClone(base); occupied.territories.find(t => t.cellId === 4)!.controllingNationId = base.nations[1].id;
    await expect(applyCountryCommand(occupied, release(occupied, rectangle(128, 0, 160, 32)), geography, undefined, fast)).rejects.toThrow('其他国家');
    for (const ring of [rectangle(288, 0, 320, 32), rectangle(3200, 3200, 3232, 3232)]) {
      await expect(applyCountryCommand(base, release(base, ring), geography, undefined, fast)).rejects.toThrow('没有需要提交的变化');
    }
    await expect(applyCountryCommand(base, release(base, rectangle(0, 0, 192, 32)), geography, undefined, fast)).rejects.toThrow('全部领土');
    expect(base).toEqual(before);
  });

  it('rejects legacy-v1 use, malformed/self-crossing outlines and cancellation without mutating the source', async () => {
    const base = await baseDocument(3), before = structuredClone(base), command = release(base, rectangle(128, 0, 160, 32));
    if (base.version !== 3) throw new Error('This legacy compatibility case requires a v3 world.');
    expect(validateCountryCommand(command)).toBe(true); expect(validateCountryCommand({ ...command, force: true })).toBe(false);
    expect(validateCountryCommand({ ...command, outlineQ: [{ xQ: 0.5, yQ: 0 }, { xQ: 256, yQ: 0 }, { xQ: 0, yQ: 256 }] })).toBe(false);
    await expect(applyCountryCommand({ ...base, version: 1 }, command, geography, undefined, fast)).rejects.toThrow('旧档保持原规则');
    const crossed = [{ xQ: 0, yQ: 0 }, { xQ: 8192, yQ: 8192 }, { xQ: 0, yQ: 8192 }, { xQ: 8192, yQ: 0 }];
    await expect(applyCountryCommand(base, release(base, crossed), geography, undefined, fast)).rejects.toThrow('自交');
    const abort = new AbortController();
    await expect(applyCountryCommand(base, command, geography, undefined, { ...fast, signal: abort.signal, onProgress: () => abort.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(base).toEqual(before);
  });

  it.each([2, 3] as const)('v%i Worker previews without saving, recomputes confirmation and restores persisted territory through undo', async version => {
    const initial = await savedWorld(version), runtime = new CountryRuntime(); await runtime.handle({ id: 1, type: 'open', worldId: initial.document.worldId });
    const originalRecord = await (version === 2 ? v2.readCountryGeographyRecordV2 : v3.readCountryGeographyRecordV3)(initial.document.worldId);
    let selections = 0; const progress = (p: { stage: string; completed: number }) => { if (p.stage === '按地理单元中心圈地' && p.completed === 128) selections++; };
    const preview = await runtime.handle({ id: 2, type: 'preview', expected: expected(initial), command: release(initial.document, rectangle(128, 0, 160, 32)) }, progress) as CountryPreview;
    expect(await openCountryWorld(initial.document.worldId)).toEqual(initial); expect(selections).toBe(1);
    expect(preview.document.territories.map(t => t.cellId)).toEqual([0, 5]); preview.document.territories = [];
    const saved = await runtime.handle({ id: 3, type: 'confirm', candidateId: preview.candidateId }, progress) as CountryState;
    expect(selections).toBe(2); expect(saved.document.territories.map(t => t.cellId)).toEqual([0, 5]); expect(saved.document.version).toBe(version);
    const refresh = new CountryRuntime(); expect(await refresh.handle({ id: 4, type: 'open', worldId: saved.document.worldId })).toEqual(saved);
    const undo = await refresh.handle({ id: 5, type: 'preview', expected: expected(saved), command: { type: 'undo' } }) as CountryPreview;
    const restored = await refresh.handle({ id: 6, type: 'confirm', candidateId: undo.candidateId }) as CountryState;
    expect(restored.document).toEqual({ ...initial.document, revision: saved.document.revision + 1 });
    expect(await openCountryWorld(initial.document.worldId)).toEqual(restored);
    expect(await (version === 2 ? v2.readCountryGeographyRecordV2 : v3.readCountryGeographyRecordV3)(initial.document.worldId)).toEqual(originalRecord);
  }, 30000);

  it('Worker cancellation and a competing durable edit cannot commit a stale removal', async () => {
    const initial = await savedWorld(3), runtime = new CountryRuntime(); await runtime.handle({ id: 1, type: 'open', worldId: initial.document.worldId });
    const request = { id: 2, type: 'preview', expected: expected(initial), command: release(initial.document, rectangle(128, 0, 160, 32)) };
    await expect(runtime.handle(request, p => { if (p.stage === '按地理单元中心圈地') runtime.abort(); })).rejects.toMatchObject({ name: 'AbortError' });
    expect(await openCountryWorld(initial.document.worldId)).toEqual(initial);
    const cancelled = await runtime.handle(request) as CountryPreview; await runtime.handle({ id: 3, type: 'cancel-preview' });
    await expect(runtime.handle({ id: 4, type: 'confirm', candidateId: cancelled.candidateId })).rejects.toThrow('取消或过期');
    expect(await openCountryWorld(initial.document.worldId)).toEqual(initial);
    const stale = await runtime.handle(request) as CountryPreview, other = new CountryRuntime(); await other.handle({ id: 5, type: 'open', worldId: initial.document.worldId });
    const rename = await other.handle({ id: 6, type: 'preview', expected: expected(initial), command: { type: 'rename-nation', nationId: initial.document.nations[0].id, name: '新海湾国' } }) as CountryPreview;
    const current = await other.handle({ id: 7, type: 'confirm', candidateId: rename.candidateId }) as CountryState;
    await expect(runtime.handle({ id: 8, type: 'confirm', candidateId: stale.candidateId })).rejects.toThrow('另一标签');
    expect(await openCountryWorld(initial.document.worldId)).toEqual(current); expect(current.document.territories).toEqual(initial.document.territories);
  }, 30000);
});
