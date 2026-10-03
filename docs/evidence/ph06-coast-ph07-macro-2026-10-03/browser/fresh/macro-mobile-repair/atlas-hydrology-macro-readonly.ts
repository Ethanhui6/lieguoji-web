import type { Page } from '@playwright/test';

/** Independent durable LGDC verification, adapted from the existing native
 * hydrology acceptance. It imports no app sampler and never writes to IDB. */
export async function savedMacroTerrain(page: Page, draftId: string, displayedIds: number[]) {
  return page.evaluate(async ({ draftId, displayedIds }) => {
    type Ref = { bx: number; by: number; hash: string };
    const source = await new Promise<{ refs: Ref[]; records: (Ref & { bytes: Uint8Array })[]; manifestDigest: string }>((resolve, reject) => {
      const request = indexedDB.open('lieguoji-atlas-drafts-v4', 1);
      request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['roots', 'manifests', 'blocks'], 'readonly');
        let refs: Ref[], manifestDigest: string; const records: (Ref & { bytes: Uint8Array })[] = [];
        const root = tx.objectStore('roots').get(draftId);
        root.onsuccess = () => {
          if (!(root.result instanceof Uint8Array)) { tx.abort(); return; }
          manifestDigest = JSON.parse(new TextDecoder().decode(root.result)).currentManifest;
          const read = tx.objectStore('manifests').get(manifestDigest);
          read.onsuccess = () => {
            if (!(read.result?.bytes instanceof Uint8Array)) { tx.abort(); return; }
            const manifest = JSON.parse(new TextDecoder().decode(read.result.bytes));
            if (manifest.version !== 4 || !manifest.detailCoast || manifest.spec.columns !== 128 || manifest.spec.rows !== 128) { tx.abort(); return; }
            refs = manifest.detailCoast.refs;
            for (const ref of refs) {
              const block = tx.objectStore('blocks').get(ref.hash);
              block.onsuccess = () => { if (!(block.result?.bytes instanceof Uint8Array)) tx.abort(); else records.push({ ...ref, bytes: block.result.bytes }); };
            }
          };
        };
        tx.oncomplete = () => { db.close(); resolve({ refs, records, manifestDigest }); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing saved macro source')); };
      };
    });
    const tiles = new Map<string, { mode: number; view: DataView; count: number; hash: string }>(); let explicitFineNodes = 0;
    for (const record of source.records) {
      const bytes = record.bytes, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(n => n.toString(16).padStart(2, '0')).join('');
      if (hash !== record.hash || bytes.length < 16 || [76, 71, 68, 67, 1].some((n, i) => bytes[i] !== n)
        || bytes[6] !== record.bx || bytes[7] !== record.by || bytes[5] > 1 || bytes.slice(10, 16).some(Boolean)
        || record.bx < 0 || record.bx > 63 || record.by < 0 || record.by > 63) throw new Error('Invalid saved LGDC identity/hash');
      const count = view.getUint16(8, true), expected = (record.bx ? 32 : 33) * (record.by ? 32 : 33), key = `${record.bx}:${record.by}`;
      if (count !== (bytes[5] ? expected : 0) || bytes.length !== 16 + count * 4 || tiles.has(key)) throw new Error('Invalid fine owner layout');
      tiles.set(key, { mode: bytes[5], view, count, hash }); explicitFineNodes += count;
    }
    if (source.refs.length !== tiles.size) throw new Error('Incomplete saved fine owner set');
    const sample = (id: number) => {
      if (!Number.isInteger(id) || id < 0 || id >= 66049) throw new Error('Macro node outside complete grid');
      const column = id % 257 * 8, row = Math.floor(id / 257) * 8;
      const bx = Math.floor(Math.max(0, column - 1) / 32), by = Math.floor(Math.max(0, row - 1) / 32), key = `${bx}:${by}`, tile = tiles.get(key);
      // Omitted owners are known sea; mode 0 is uniform land. Their heights
      // require Hbase. Displayed edges below deliberately require actual
      // explicit fine samples, never a reconstructed height or app sampler.
      if (!tile || !tile.mode) return { id, column, row, owner: key, hash: tile?.hash ?? null, slot: null, coverage: tile ? 32767 : -32767, height: null };
      const slot = (row - (by * 32 + (by ? 1 : 0))) * (bx ? 32 : 33) + column - (bx * 32 + (bx ? 1 : 0));
      if (slot < 0 || slot >= tile.count) throw new Error('Fine node outside its unique owner');
      const coverage = tile.view.getInt16(16 + slot * 2, true), height = tile.view.getInt16(16 + tile.count * 2 + slot * 2, true);
      if (coverage === -32768 || height < -12000 || height > 12000 || coverage > 0 && height < 0
        || coverage < 0 && height >= 0 || coverage === 0 && height !== 0) throw new Error('Saved fine coverage/height mismatch');
      return { id, column, row, owner: key, hash: tile.hash, slot, coverage, height };
    };
    let landNodes = 0, sampledSeaNodes = 0, explicitMacroNodes = 0, uniformLandNodes = 0, omittedSeaNodes = 0;
    for (let id = 0; id < 66049; id++) {
      const node = sample(id); if (node.coverage >= 0) landNodes++; else sampledSeaNodes++;
      if (node.height !== null) explicitMacroNodes++; else if (node.coverage >= 0) uniformLandNodes++; else omittedSeaNodes++;
    }
    return { manifestDigest: source.manifestDigest, ownerCount: tiles.size, explicitFineNodes,
      completeGrid: { sampledNodes: 66049, firstFineNode: { column: 0, row: 0 }, lastFineNode: { column: 2048, row: 2048 }, landNodes, sampledSeaNodes, explicitMacroNodes, uniformLandNodes, omittedSeaNodes },
      ownerHashes: source.refs.map(ref => ({ ...ref })).sort((a, b) => a.by - b.by || a.bx - b.bx), displayed: displayedIds.map(sample) };
  }, { draftId, displayedIds });
}

/** Observe existing DOM progress attributes only. No Worker interception,
 * clock override, result injection, or application state mutation. */
export async function observeMacroProgress(page: Page) {
  return page.evaluate(() => new Promise<{ stage: string; completed: number; total: number }[]>((resolve, reject) => {
    const main = document.querySelector('[data-testid="atlas-studio"]');
    if (!main) { reject(new Error('Missing atlas studio')); return; }
    const samples: { stage: string; completed: number; total: number }[] = []; let started = false;
    const observer = new MutationObserver(() => {
      const state = main.getAttribute('data-atlas-state'), stage = main.getAttribute('data-atlas-progress-stage') ?? '';
      if (state === 'busy') started = true;
      if (started && stage.startsWith('宏观')) {
        const sample = { stage, completed: Number(main.getAttribute('data-atlas-progress-completed')), total: Number(main.getAttribute('data-atlas-progress-total')) };
        const prior = samples[samples.length - 1];
        if (!prior || prior.stage !== sample.stage || prior.completed !== sample.completed) samples.push(sample);
      }
      if (started && (state === 'ready' || state === 'fatal')) {
        clearTimeout(timer); observer.disconnect();
        if (state === 'fatal') reject(new Error('Fatal state during macro progress')); else resolve(samples);
      }
    });
    const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Macro operation did not finish within the original operation ceiling')); }, 120000);
    observer.observe(main, { attributes: true, attributeFilter: ['data-atlas-state', 'data-atlas-progress-stage', 'data-atlas-progress-completed', 'data-atlas-progress-total'] });
  }));
}

/** Install before starting the operation. The handle returns only after the
 * observer is armed, so even progress between native touch-down/up is kept.
 * Capture one immutable DOM snapshot; never read changing attributes later
 * and call them the cancellation point. No application events are injected. */
export async function armMacroCancellation(page: Page) {
  const handle = await page.evaluateHandle(() => {
    const main = document.querySelector('[data-testid="atlas-studio"]');
    if (!main || main.getAttribute('data-atlas-state') !== 'ready') throw new Error('Cancellation observer requires a ready saved atlas');
    type Work = Readonly<{ stage: string; completed: number; total: number }>;
    let resolveFirst!: (value: { work: Work | null; error: string | null }) => void;
    const first = new Promise<{ work: Work | null; error: string | null }>(resolve => { resolveFirst = resolve; });
    let settled = false, started = false;
    const finish = (work: Work | null, error: string | null) => {
      if (settled) return;
      settled = true; observer.disconnect(); clearTimeout(timer); resolveFirst({ work, error });
    };
    const observer = new MutationObserver(() => {
      const state = main.getAttribute('data-atlas-state'); if (state === 'busy') started = true;
      const stage = main.getAttribute('data-atlas-progress-stage') ?? '';
      const completed = Number(main.getAttribute('data-atlas-progress-completed')), total = Number(main.getAttribute('data-atlas-progress-total'));
      // Owner inspection is first in the real reader. Height sampling is a
      // later valid fallback only if no owner progress reached the DOM.
      if (state === 'busy' && (stage === '宏观水文读取器：读取实际节点所有者' || stage === '宏观水文读取器：采样权威细地形')
        && total === 66049 && completed > 0 && completed < total) finish(Object.freeze({ stage, completed, total }), null);
      else if (started && (state === 'ready' || state === 'fatal')) finish(null, 'Macro operation finished before partial reader work was observed');
    });
    const timer = setTimeout(() => finish(null, 'No actual partial macro reader work within the original operation ceiling'), 120000);
    observer.observe(main, { attributes: true, attributeFilter: ['data-atlas-state', 'data-atlas-progress-stage', 'data-atlas-progress-completed', 'data-atlas-progress-total'] });
    return { first, dispose: () => finish(null, 'Cancellation observer disposed') };
  });
  return {
    async capture() {
      const result = await handle.evaluate(armed => armed.first);
      if (!result.work) throw new Error(result.error ?? 'Missing macro reader cancellation evidence');
      return Object.freeze(result.work);
    },
    async dispose() { try { await handle.evaluate(armed => armed.dispose()); } finally { await handle.dispose(); } },
  };
}
