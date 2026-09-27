import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cloneAtlasDocument, createGenerationCopy, createGenerationDraft, decodeAtlasManifest, encodeAtlasManifest, hashAtlasManifest, validateAtlasManifest, verifyAtlasDocument, type AtlasCopyOrigin, type AtlasGenerationDocument } from './atlas-format';
import { getCellLayerSlot, hashBlock } from './model';
import { generationCanonical } from './generation-contract';
import { assertAtlasConstraintsOnly, assertAtlasLocksPreserved, hashAtlasCellLockBlock, lockKey, type LOCK_COAST } from './generation-locks';
import { ATLAS_SURFACE_DB, getAtlasStorage, type AtlasStoredRoot } from './storage';
import { OwnedAtlasSession, type AtlasEditCommand } from './transactions';
import { applyAtlasDelta } from './delta';

const fast = { yieldTask: async () => {} }, api = getAtlasStorage(3), rootDigest = 'a'.repeat(64);
let base: AtlasGenerationDocument<3>, old: AtlasGenerationDocument<2>;
beforeAll(async () => {
  const options = { size: 128 as const, seed: 'surface-format-synthetic', name: '连续海岸存档合成测试', draftId: 'atlas-55555555-5555-4555-8555-555555555555', atlasId: 'geo-55555555-5555-4555-8555-555555555555' };
  old = await createGenerationDraft(options, fast); base = await createGenerationDraft(options, fast, 3);
});
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
async function prepare(data: AtlasGenerationDocument<3>, root: AtlasStoredRoot | null = null) {
  const p = await api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: data.manifest, expectedRoot: root }, fast);
  const contents = [...data.blocks.values(), ...data.locks.values()];
  for (let i = 0; i < contents.length; i += 16) await api.stageAtlasBlocks(p.preparationId, contents.slice(i, i + 16), fast);
  return p;
}
async function publish(data = base, root: AtlasStoredRoot | null = null) { return api.commitAtlasPreparation((await prepare(data, root)).preparationId, fast); }
async function restored(source: 'current' | 'backup' = 'current') {
  const handle = (await api.openAtlasDraft(base.manifest.draftId, { ...fast, source }))!;
  const data: AtlasGenerationDocument<3> = { manifest: handle.manifest, blocks: new Map(), locks: new Map() };
  let cursor: number | null = 0;
  do {
    const page = await api.readAtlasBlockPage(handle, cursor, fast);
    for (const block of page.blocks) data.blocks.set(`${block.layer}:${block.bx}:${block.by}`, block);
    for (const lock of page.locks!) data.locks.set(lockKey(lock.bx, lock.by), lock);
    cursor = page.nextCursor;
  } while (cursor !== null);
  await verifyAtlasDocument(data, fast); return { data, handle };
}
async function edit(data: AtlasGenerationDocument<3>, cell: number, value: number) {
  const next = cloneAtlasDocument(data), slot = getCellLayerSlot(next, 'elevation', cell);
  slot.block.values[slot.slot] = value; next.manifest.blockRefs.find(r => r.key === slot.key)!.hash = await hashBlock(slot.block); next.manifest.revision++;
  return { next, block: slot.block };
}
async function locked(mask: typeof LOCK_COAST | 2, cell = 31 * 128 + 31) {
  const data = cloneAtlasDocument(base), col = cell % 128, row = Math.floor(cell / 128), bx = Math.floor(col / 32), by = Math.floor(row / 32);
  const block = { format: 'lieguoji-atlas-cell-locks' as const, version: 1 as const, bx, by, flags: new Uint8Array(1024) };
  block.flags[row % 32 * 32 + col % 32] = mask; data.locks.set(lockKey(bx, by), block); data.manifest.constraints.lockRefs = [{ bx, by, hash: await hashAtlasCellLockBlock(block) }]; return data;
}
async function origin(data: AtlasGenerationDocument): Promise<AtlasCopyOrigin> {
  return { format: 'lieguoji-atlas-copy-origin', version: 1, sourceFormat: data.manifest.version, sourceDraftId: data.manifest.draftId, sourceSlot: 'backup', sourceManifestDigest: await hashAtlasManifest(data.manifest), sourceManifestRevision: data.manifest.revision, observedRootDigest: rootDigest };
}
function command(owner: OwnedAtlasSession, cell = 10, value = 600): AtlasEditCommand {
  return { format: 'lieguoji-atlas-edit', version: 1, draftId: owner.head.draftId, commandId: `edit-${crypto.randomUUID()}`, expectedRevision: owner.head.revision, expectedRootDigest: owner.head.rootDigest, reason: '真实地表编辑', patch: { elevation: { ids: new Uint32Array([cell]), values: new Int32Array([value]) } } };
}
async function writeManifestBlob(digest: string, transform: (value: { bytes: Uint8Array }) => void) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(ATLAS_SURFACE_DB); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('manifests', 'readwrite'), r = tx.objectStore('manifests').get(digest);
    r.onsuccess = () => { const value = r.result as { bytes: Uint8Array }; transform(value); tx.objectStore('manifests').put(value, digest); };
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}

describe('explicit v3 surface contract, isolated storage and same-format edits', () => {
  it('keeps default v2 source bytes and binds only explicit v3 surface to manifest digest', async () => {
    expect(old.manifest.version).toBe(2); expect(Object.hasOwn(old.manifest, 'surface')).toBe(false);
    expect(base.manifest.surface).toEqual({ kind: 'land-mask-fan-v1', coordinateScale: 256 });
    expect(base.blocks).toEqual(old.blocks); expect(base.manifest.blockRefs).toEqual(old.manifest.blockRefs);
    const encoded = encodeAtlasManifest(base.manifest); expect(decodeAtlasManifest(encoded)).toEqual(base.manifest);
    expect(await hashAtlasManifest(base.manifest)).not.toBe(await hashAtlasManifest(old.manifest));
    await expect(createGenerationDraft({ size: 128, seed: 'x', name: 'x' }, fast, 5 as 3)).rejects.toThrow('未知');
  });

  it('rejects absent/unknown surface fields, future envelope and a v2 document claiming new surface semantics', () => {
    for (const surface of [undefined, null, { kind: 'land-mask-fan-v2', coordinateScale: 256 }, { kind: 'land-mask-fan-v1', coordinateScale: 512 }, { ...base.manifest.surface, future: 1 }]) {
      const m = { ...base.manifest, surface }; expect(validateAtlasManifest(m)).toBe(false);
      expect(() => decodeAtlasManifest(new TextEncoder().encode(generationCanonical(m)))).toThrow();
    }
    expect(validateAtlasManifest({ ...old.manifest, surface: base.manifest.surface })).toBe(false);
    expect(validateAtlasManifest({ ...base.manifest, version: 4 })).toBe(false);
    let invoked = false; const m = { ...base.manifest }; Object.defineProperty(m, 'surface', { enumerable: true, get: () => { invoked = true; return base.manifest.surface; } });
    expect(validateAtlasManifest(m)).toBe(false); expect(invoked).toBe(false);
  });

  it('copies to a new explicit v3 identity with exact source provenance and never downgrades v3', async () => {
    const sourceBytes = encodeAtlasManifest(old.manifest), sourceOrigin = await origin(old);
    const copy = await createGenerationCopy(old, sourceOrigin, { draftId: `atlas-${crypto.randomUUID()}`, format: 3 }, fast);
    expect(copy.manifest).toMatchObject({ version: 3, surface: base.manifest.surface, origin: sourceOrigin, revision: 0, generation: { lastApplied: null } });
    expect(copy.blocks).toEqual(old.blocks); expect(encodeAtlasManifest(old.manifest)).toEqual(sourceBytes);
    const v3Origin = await origin(base);
    await expect(createGenerationCopy(base, v3Origin, { draftId: `atlas-${crypto.randomUUID()}` }, fast)).rejects.toThrow('降格');
    const nextCopy = await createGenerationCopy(base, v3Origin, { draftId: `atlas-${crypto.randomUUID()}`, format: 3 }, fast);
    expect(nextCopy.manifest.origin?.sourceFormat).toBe(3); expect(nextCopy.manifest.surface).toEqual(base.manifest.surface);
    expect(validateAtlasManifest({ ...old.manifest, origin: v3Origin })).toBe(false);
    await expect(createGenerationCopy(base, v3Origin, { draftId: base.manifest.draftId, format: 3 }, fast)).rejects.toThrow('原身份');
  });

  it('opens only the explicit v3 database, leaving same-identity v2 records byte-for-byte untouched', async () => {
    const oldApi = getAtlasStorage(2), p = await oldApi.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: old.manifest, expectedRoot: null }, fast);
    const blocks = [...old.blocks.values()]; for (let i = 0; i < blocks.length; i += 16) await oldApi.stageAtlasBlocks(p.preparationId, blocks.slice(i, i + 16), fast);
    const oldReceipt = await oldApi.commitAtlasPreparation(p.preparationId, fast), before = await oldApi.exportAtlasRawBackup(old.manifest.draftId);
    expect(await api.openAtlasDraft(base.manifest.draftId, fast)).toBeNull(); const receipt = await publish();
    expect(receipt.root.domain).toBe('atlas-draft-v3'); expect(api.database).toBe(ATLAS_SURFACE_DB);
    expect(await oldApi.exportAtlasRawBackup(old.manifest.draftId)).toEqual(before); expect((await restored()).data).toEqual(base);
    await expect(api.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: base.manifest, expectedRoot: oldReceipt.root }, fast)).rejects.toThrow();
    expect(() => getAtlasStorage(5 as 3)).toThrow('未知');
  });

  it('keeps v3 contract in local edits, real receipt replay, backup and stale-root rejection', async () => {
    const first = await publish(), a = (await api.openAtlasStorageSession(base.manifest.draftId, fast))!, b = (await api.openAtlasStorageSession(base.manifest.draftId, fast))!;
    try {
      const { next, block } = await edit(base, 10, 600), request = { candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: next.manifest, expectedRoot: first.root, dirtyBlocks: [block] };
      const result = await a.commitLocal(request, fast);
      expect(result.root.domain).toBe('atlas-draft-v3'); expect((await restored()).data).toEqual(next); expect((await restored('backup')).data).toEqual(base);
      expect((await api.findAtlasReceipt(base.manifest.draftId, request.commandId))?.rootDigest).toBe(result.rootDigest);
      await expect(b.commitLocal({ ...request, candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}` }, fast)).rejects.toThrow('CAS');
    } finally { a.close(); b.close(); }
  });

  it('publishes a pure-lock v3 transaction but refuses any surface mutation', async () => {
    const first = await publish(), next = await locked(1); next.manifest.revision = 1;
    expect(() => assertAtlasConstraintsOnly(base, next)).not.toThrow();
    const p = await prepare(next, first.root), receipt = await api.commitAtlasConstraintsPreparation(p.preparationId, fast);
    expect((await restored()).data).toEqual(next); expect(receipt.root.domain).toBe('atlas-draft-v3');
    const bad = cloneAtlasDocument(next); Object.assign(bad.manifest.surface, { coordinateScale: 512 }); bad.manifest.revision++;
    expect(() => assertAtlasConstraintsOnly(next, bad)).toThrow('地表');
    expect(() => assertAtlasLocksPreserved(next, bad)).toThrow('地表');
    await expect(prepare(bad, receipt.root)).rejects.toThrow();
  });

  it('protects a locked coast against neighboring sign changes through both full and local durable commit paths', async () => {
    const data = await locked(1), lockedLand = getCellLayerSlot(data, 'elevation', 31 * 128 + 31);
    lockedLand.block.values[lockedLand.slot] = 500; data.manifest.blockRefs.find(r => r.key === lockedLand.key)!.hash = await hashBlock(lockedLand.block);
    const first = await publish(data), neighbor = 31 * 128 + 32, { next, block } = await edit(data, neighbor, 500);
    expect(() => assertAtlasLocksPreserved(data, next, [neighbor], [])).toThrow('实际裁切海岸');
    const p = await prepare(next, first.root); await expect(api.commitAtlasPreparation(p.preparationId, fast)).rejects.toThrow('实际裁切海岸');
    const session = (await api.openAtlasStorageSession(base.manifest.draftId, fast))!;
    try { await expect(session.commitLocal({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: next.manifest, expectedRoot: first.root, dirtyBlocks: [block] }, fast)).rejects.toThrow('实际裁切海岸'); }
    finally { session.close(); }
    expect((await restored()).data).toEqual(data);
  });

  it('protects the actual continuous height of a locked cell against an unlocked neighboring height edit', async () => {
    const data = await locked(2), neighbor = 31 * 128 + 32, { next } = await edit(data, neighbor, -500);
    expect(getCellLayerSlot(data, 'elevation', 31 * 128 + 31).block.values[31 * 32 + 31]).toBe(-100);
    expect(() => assertAtlasLocksPreserved(data, next, [neighbor], [])).toThrow('裁切地表高度');
    const owner = await OwnedAtlasSession.open(data, rootDigest, fast); await expect(owner.prepare(command(owner, neighbor, -500), fast)).rejects.toThrow('裁切地表高度');
    expect(owner.snapshot()).toEqual(data);
  });

  it('preserves v3 contract through owned edit publication and independently verified delta application', async () => {
    const owner = await OwnedAtlasSession.open(base, rootDigest, fast), p = await owner.prepare(command(owner), fast);
    const receipt = { draftId: owner.head.draftId, commandId: p.commandId, revision: p.revision, rootDigest: 'b'.repeat(64), manifestDigest: p.manifestDigest };
    const delta = owner.publish(p.candidateId, receipt), received = await applyAtlasDelta(base, rootDigest, delta);
    expect(received).toEqual(owner.snapshot()); expect(received.manifest.surface).toEqual(base.manifest.surface);
    expect(await hashAtlasManifest(received.manifest)).toBe(receipt.manifestDigest);
  });

  it('locks writing and backup recovery for an unknown stored surface without changing raw evidence', async () => {
    const first = await publish(), { next } = await edit(base, 10, 600), latest = await publish(next, first.root);
    await writeManifestBlob(latest.manifestDigest, value => {
      const manifest = JSON.parse(new TextDecoder().decode(value.bytes)); manifest.surface.kind = 'land-mask-fan-v99';
      value.bytes = new TextEncoder().encode(generationCanonical(manifest));
    });
    const before = await api.exportAtlasRawBackup(base.manifest.draftId);
    await expect(api.openAtlasDraft(base.manifest.draftId, fast)).rejects.toThrow('未来版本');
    await expect(api.openAtlasDraft(base.manifest.draftId, { ...fast, source: 'backup' })).rejects.toThrow('未来版本');
    await expect(api.openAtlasStorageSession(base.manifest.draftId, fast)).rejects.toThrow('未来版本');
    expect(await api.exportAtlasRawBackup(base.manifest.draftId)).toEqual(before);
  });
});
