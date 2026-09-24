import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createGenerationDraft, hashAtlasManifest, type AtlasGenerationDocument } from './atlas-format';
import { atlasCellLockFlags, hashAtlasLockSet } from './generation-locks';
import { AtlasConstraintsSession, constraintsPreviewDigest, type ConstraintsConfirm, type ConstraintsPreviewInfo } from './constraints-session';
import { OwnedAtlasSession, type AtlasConstraintEdit, type AtlasPublishedRoot } from './transactions';

const fast = { yieldTask: async () => {} }, initialRoot = 'a'.repeat(64);
let base: AtlasGenerationDocument;
beforeAll(async () => { base = await createGenerationDraft({ size: 128, seed: 'constraints-session-synthetic', name: '纯合成区域锁会话' }, fast); });
async function opened() { const owner = await OwnedAtlasSession.open(base, initialRoot, fast); return { owner, session: new AtlasConstraintsSession(owner) }; }
function command(owner: OwnedAtlasSession): AtlasConstraintEdit {
  const head = owner.head;
  return { format: 'lieguoji-atlas-constraint-edit', version: 1, draftId: head.draftId, commandId: `edit-${crypto.randomUUID()}`, expectedRevision: head.revision, expectedRootDigest: head.rootDigest, rectangle: { column: 31, row: 31, columns: 3, rows: 3 }, mask: 3, action: 'set' };
}
const confirmation = (p: ConstraintsPreviewInfo): ConstraintsConfirm => ({ candidateId: p.candidateId, commandId: p.commandId, previewDigest: p.previewDigest, expectedRevision: p.baseRevision, expectedRootDigest: p.baseRootDigest });
/** Synthetic receipts exercise private session publication only. Real IDB
 * completion, CAS, quota and rollback are covered in constraints-storage. */
const receipt = (owner: OwnedAtlasSession, p: ConstraintsPreviewInfo): AtlasPublishedRoot => ({ draftId: owner.head.draftId, commandId: p.commandId, revision: p.revision, rootDigest: 'b'.repeat(64), manifestDigest: p.manifestDigest });

describe('PH06 private constraints preview and confirmation session', () => {
  it('previews exact lock cells without publication, confirms the candidate, and only clears after a matching publication', async () => {
    const { owner, session } = await opened(), before = owner.snapshot(), head = owner.head, p = await session.preview(command(owner), fast);
    expect(p).toMatchObject({ changedCellCount: 9, mask: 3, action: 'set', revision: 1, baseRevision: 0 }); expect(owner.head).toEqual(head); expect(owner.snapshot()).toEqual(before);
    expect(owner.replacementMode(p.candidateId)).toBe('constraints'); expect(p.previewDigest).toBe(await constraintsPreviewDigest(p));
    const confirmed = await session.confirm(confirmation(p), fast); expect(confirmed.preview).toEqual(p);
    expect(await hashAtlasManifest(confirmed.data.manifest)).toBe(p.manifestDigest); expect(await hashAtlasLockSet(confirmed.data.manifest.constraints, confirmed.data.manifest.spec)).toBe(p.afterLockSetDigest);
    expect(p.beforeLockSetDigest).not.toBe(p.afterLockSetDigest);
    for (const id of [31 * 128 + 31, 32 * 128 + 32, 33 * 128 + 33]) expect(atlasCellLockFlags(confirmed.data, id)).toBe(3);
    expect(atlasCellLockFlags(confirmed.data, 0)).toBe(0); expect(owner.head).toEqual(head); expect(session.pending).toEqual(p);
    expect(() => session.published(crypto.randomUUID())).toThrow('身份');
    expect(() => session.published(p.candidateId)).toThrow('尚未'); expect(session.pending).toEqual(p);
    owner.publishReplacement(p.candidateId, receipt(owner, p)); session.published(p.candidateId);
    expect(session.pending).toBeNull(); expect(owner.head.revision).toBe(1); expect(owner.head.undoCount).toBe(1); expect(owner.replacementPending).toBe(false);
    await expect(session.confirm(confirmation(p), fast)).rejects.toThrow('私有预览');
  });

  it('takes command ownership before the first yield and never accepts authority from returned metadata or document buffers', async () => {
    const { owner, session } = await opened(), raw = command(owner); let changed = false;
    const p = await session.preview(raw, { ...fast, onProgress: () => {
      if (changed) return; changed = true; raw.rectangle.column = 90; raw.rectangle.columns = 20; raw.mask = 1; raw.action = 'clear'; raw.expectedRootDigest = 'c'.repeat(64);
    } });
    expect(changed).toBe(true); expect(p).toMatchObject({ rectangle: { column: 31, row: 31, columns: 3, rows: 3 }, mask: 3, action: 'set', changedCellCount: 9 });
    const original = structuredClone(p), returned = session.pending!; returned.rectangle.column = 100; returned.changedCellCount = 1; p.mask = 1; p.afterLockSetDigest = 'f'.repeat(64);
    expect(session.pending).toEqual(original);
    const a = await session.confirm(confirmation(original), fast); a.data.locks.values().next().value!.flags.fill(0); a.preview.rectangle.rows = 100;
    const b = await session.confirm(confirmation(original), fast); expect(atlasCellLockFlags(b.data, 31 * 128 + 31)).toBe(3); expect(b.preview).toEqual(original); expect(owner.head.revision).toBe(0);
  });

  it('binds every prepared metadata field and selected operation in a canonical digest', async () => {
    const { owner, session } = await opened(), p = await session.preview(command(owner), fast), expected = await constraintsPreviewDigest(p);
    const mutations = [
      { candidateId: crypto.randomUUID() }, { commandId: `edit-${crypto.randomUUID()}` }, { baseRevision: 8 }, { baseRootDigest: 'c'.repeat(64) }, { baseManifestDigest: 'c'.repeat(64) },
      { revision: 8 }, { manifestDigest: 'c'.repeat(64) }, { reason: 'altered reason' }, { rectangle: { ...p.rectangle, row: 32 } },
      { mask: 1 as const }, { action: 'clear' as const }, { changedCellCount: 8 }, { beforeLockSetDigest: 'c'.repeat(64) }, { afterLockSetDigest: 'c'.repeat(64) },
    ];
    for (const change of mutations) expect(await constraintsPreviewDigest({ ...p, ...change })).not.toBe(expected);
    const reordered = { ...p, rectangle: { rows: p.rectangle.rows, columns: p.rectangle.columns, row: p.rectangle.row, column: p.rectangle.column } }; expect(await constraintsPreviewDigest(reordered)).toBe(expected);
    const forged = { ...p, mask: 1 as const }; forged.previewDigest = await constraintsPreviewDigest(forged);
    await expect(session.confirm(confirmation(forged), fast)).rejects.toThrow('私有预览'); expect(session.pending).toEqual(p); expect(owner.head.revision).toBe(0);
    await expect(session.confirm({ ...confirmation(p), expectedRootDigest: 'd'.repeat(64) }, fast)).rejects.toThrow('私有预览');
    let invoked = false; const accessor = confirmation(p); Object.defineProperty(accessor, 'previewDigest', { enumerable: true, get: () => { invoked = true; return p.previewDigest; } });
    await expect(session.confirm(accessor, fast)).rejects.toThrow('私有预览'); expect(invoked).toBe(false);
  });

  it('rechecks exported candidate manifest and lock-set digests before returning confirmation', async () => {
    const { owner, session } = await opened(), p = await session.preview(command(owner), fast), read = owner.replacementDocumentAsync.bind(owner);
    const spy = vi.spyOn(owner, 'replacementDocumentAsync').mockImplementation(async (...args) => { const data = await read(...args); data.manifest.name += ' corrupted'; return data; });
    await expect(session.confirm(confirmation(p), fast)).rejects.toThrow('摘要发生变化'); spy.mockRestore(); expect(owner.head.revision).toBe(0); expect(session.pending).toEqual(p);
    expect((await session.confirm(confirmation(p), fast)).preview).toEqual(p);
  });

  it.each(['计算选区锁定变化', '绑定区域锁预览摘要'] as const)('cleans a cancelled %s preview and admits a fresh command without altering the head', async stage => {
    const { owner, session } = await opened(), before = owner.head, controller = new AbortController(); let progressed = false;
    await expect(session.preview(command(owner), { ...fast, signal: controller.signal, onProgress: value => { if (value.stage === stage && value.completed > 0) { progressed = true; controller.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(progressed).toBe(true); expect(session.pending).toBeNull(); expect(owner.replacementPending).toBe(false); expect(owner.head).toEqual(before);
    const next = await session.preview(command(owner), fast); session.discard(next.candidateId); expect(owner.replacementPending).toBe(false);
  });

  it('retains a cancelled confirmation for retry/discard, rejects stale roots, and cannot discard another owner candidate', async () => {
    const { owner, session } = await opened(), p = await session.preview(command(owner), fast), controller = new AbortController(); let progressed = false;
    await expect(session.confirm(confirmation(p), { ...fast, signal: controller.signal, onProgress: value => { if (value.stage === '复核区域锁确认摘要') { progressed = true; controller.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(progressed).toBe(true); expect(owner.replacementPending).toBe(true); expect(session.pending).toEqual(p); expect(owner.head.revision).toBe(0);
    expect((await session.confirm(confirmation(p), fast)).preview).toEqual(p); session.discard(p.candidateId);
    const precancelled = await session.preview(command(owner), fast), alreadyAborted = new AbortController(); alreadyAborted.abort();
    await expect(session.confirm(confirmation(precancelled), { ...fast, signal: alreadyAborted.signal })).rejects.toMatchObject({ name: 'AbortError' }); expect(session.pending).toEqual(precancelled); expect(owner.replacementPending).toBe(true);
    expect((await session.confirm(confirmation(precancelled), fast)).preview).toEqual(precancelled); session.discard(precancelled.candidateId);
    const stale = await session.preview(command(owner), fast); owner.publishReplacement(stale.candidateId, receipt(owner, stale));
    await expect(session.confirm(confirmation(stale), fast)).rejects.toThrow('基线已变化'); session.discard(stale.candidateId); expect(session.pending).toBeNull(); expect(owner.head.revision).toBe(1);
    const geography = owner.snapshot(); geography.manifest.revision++; const other = await owner.prepareReplacement(geography, `edit-${crypto.randomUUID()}`, '既有地理候选', fast);
    await expect(session.preview(command(owner), fast)).rejects.toThrow('当前编辑预览'); expect(owner.replacementMode(other.candidateId)).toBe('geography');
    expect(() => session.discard(other.candidateId)).toThrow('失效'); expect(owner.replacementPending).toBe(true); owner.discardReplacement(other.candidateId);
  });

  it('blocks concurrent previews and mismatched discard without clearing the valid private candidate', async () => {
    const { owner, session } = await opened(), pending = session.preview(command(owner), fast);
    await expect(session.preview(command(owner), fast)).rejects.toThrow('当前编辑预览'); const p = await pending;
    expect(() => session.discard(crypto.randomUUID())).toThrow('失效'); expect(session.pending).toEqual(p); expect(owner.replacementPending).toBe(true);
    session.discard(p.candidateId); expect(session.pending).toBeNull(); expect(owner.replacementPending).toBe(false);
  });
});
