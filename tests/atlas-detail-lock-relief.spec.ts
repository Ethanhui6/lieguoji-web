import { test, expect, type Page } from '@playwright/test';
import { audit, metrics, saved, type SavedSnapshot } from './helpers/atlas-shape-readonly';
import type { AtlasRenderer } from '../src/world/renderer';

// Staged for tests/atlas-detail-lock-relief.spec.ts. Actual UI input and read-only
// durable bytes only. No production generator, geometry or state setter imports.
const studio = (p: Page) => p.getByTestId('atlas-studio');
const ready = (p: Page, state = 'ready') => expect(studio(p)).toHaveAttribute('data-atlas-state', state, { timeout: 120000 });
const click = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
const panel = (p: Page, name: '地图' | '创世' | '编辑') => p.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();
const preview = (p: Page) => p.getByRole('region', { name: '山地生成预览' });
type XY = { x: number; y: number };
const contour = [[860, 1050], [1260, 810], [2020, 980], [2440, 1300], [2890, 1460], [3070, 1890], [2620, 2260], [2240, 2050], [1990, 2420], [1460, 2580], [1210, 2020], [780, 1840], [650, 1480]].map(([x, y]) => ({ x, y }));

async function frameReady(p: Page) {
  await expect.poll(async () => {
    const m = await metrics(p) as ReturnType<AtlasRenderer['metrics']>;
    return m.completedFrameSequence === m.frameSequence && m.gpu.state === 'ready';
  }, { timeout: 120000 }).toBe(true);
}
async function screen(p: Page, points: XY[]) {
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, m = await metrics(p);
  return points.map(q => ({ x: box.x + m.camera.x + q.x * m.camera.scale, y: box.y + m.camera.y + q.y * m.camera.scale }));
}
async function assertCanvasPoints(p: Page, points: XY[]) {
  expect(await p.evaluate(ps => ps.map(q => document.elementFromPoint(q.x, q.y)?.getAttribute('data-testid') ?? null), points)).toEqual(points.map(() => 'atlas-canvas'));
}
async function gesture(p: Page, points: XY[], touch: boolean) {
  await assertCanvasPoints(p, points);
  if (touch) {
    const cdp = await p.context().newCDPSession(p);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 1 }] });
      for (const q of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...q, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  } else {
    await p.mouse.move(points[0].x, points[0].y); await p.mouse.down();
    try { for (const q of points.slice(1)) await p.mouse.move(q.x, q.y); } finally { await p.mouse.up(); }
  }
}

/** Every current coarse/lock/fine record is fetched from actual readonly IDB
 * and checked against its content address. Coverage is canonicalized across
 * missing sea/uniform land/materialized samples, so a representation change
 * cannot hide a changed coverage value or create a false coverage mismatch. */
type FixedWitness = { probe: { x: number; y: number; cellId: number; rank: number }; regions: { mask: number; cellId: number; column: number; row: number }[] };
async function durableField(p: Page, id: string, witness?: FixedWitness) {
  return p.evaluate(async ({ id, witness }) => {
    type Ref = { bx: number; by: number; hash: string };
    type Manifest = { version: number; spec: { columns: number; rows: number }; blockRefs: { key: string; hash: string }[]; constraints: { lockRefs: Ref[] }; detailCoast: { refs: Ref[] } };
    type Row = { kind: 'coarse' | 'lock' | 'fine'; key?: string; bx?: number; by?: number; hash: string; bytes: Uint8Array };
    const { manifest, records, manifestBytes, manifestHash } = await new Promise<{ manifest: Manifest; records: Row[]; manifestBytes: Uint8Array; manifestHash: string }>((resolve, reject) => {
      const request = indexedDB.open('lieguoji-atlas-drafts-v4', 1);
      request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['roots', 'manifests', 'blocks'], 'readonly');
        let manifest: Manifest, manifestBytes: Uint8Array, manifestHash: string; const records: Row[] = [];
        const root = tx.objectStore('roots').get(id);
        root.onsuccess = () => {
          if (!(root.result instanceof Uint8Array)) { tx.abort(); return; }
          manifestHash = JSON.parse(new TextDecoder().decode(root.result)).currentManifest;
          const read = tx.objectStore('manifests').get(manifestHash);
          read.onsuccess = () => {
            if (!(read.result?.bytes instanceof Uint8Array)) { tx.abort(); return; }
            manifestBytes = read.result.bytes; manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
            if (manifest.version !== 4 || !manifest.detailCoast || !manifest.constraints) { tx.abort(); return; }
            const refs = [...manifest.blockRefs.map(ref => ({ ...ref, kind: 'coarse' as const })), ...manifest.constraints.lockRefs.map(ref => ({ ...ref, kind: 'lock' as const })), ...manifest.detailCoast.refs.map(ref => ({ ...ref, kind: 'fine' as const }))];
            for (const ref of refs) {
              const block = tx.objectStore('blocks').get(ref.hash);
              block.onsuccess = () => { if (!(block.result?.bytes instanceof Uint8Array)) tx.abort(); else records.push({ ...ref, bytes: block.result.bytes }); };
            }
          };
        };
        tx.oncomplete = () => { db.close(); resolve({ manifest, records, manifestBytes, manifestHash }); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing actual v4 durable record')); };
      };
    });
    const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(x => x.toString(16).padStart(2, '0')).join('');
    const textDigest = (value: unknown) => digest(new TextEncoder().encode(JSON.stringify(value)));
    if (await digest(manifestBytes) !== manifestHash) throw new Error('Manifest bytes differ from durable root hash');
    const tiles = new Map<string, { bx: number; by: number; mode: number; coverage: number[]; heights: number[]; coverageIdentity: string; heightHash: string; hash: string }>();
    const coarse: { key: string; hash: string }[] = [], locks: Ref[] = [];
    const vertices = new Map<number, { x: number; y: number }>();
    for (const r of records) {
      if (await digest(r.bytes) !== r.hash) throw new Error(`Content hash mismatch in ${r.kind}`);
      if (r.kind === 'coarse') {
        coarse.push({ key: r.key!, hash: r.hash });
        if (r.key!.startsWith('geometry:')) {
          const parts = r.key!.split(':'), bx = Number(parts[1]), by = Number(parts[2]), b = r.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength);
          if ([76, 71, 65, 66].some((x, i) => b[i] !== x) || v.getUint16(4, true) !== 1 || b[6] !== 0 || b[7] !== 2 || v.getUint16(8, true) !== bx || v.getUint16(10, true) !== by || v.getUint32(12, true)) throw new Error('Invalid actual geometry header');
          let offset = 16; const columns: number[][] = [];
          for (let column = 0; column < 2; column++) {
            const count = v.getUint32(offset + 4, true), bytes = v.getUint32(offset + 8, true);
            if (b[offset] !== column + 1 || b.slice(offset + 1, offset + 4).some(Boolean) || bytes !== count * 4 || offset + 12 + bytes > b.length) throw new Error('Invalid actual geometry column');
            offset += 12; const values: number[] = [];
            for (let i = 0; i < count; i++, offset += 4) values.push(column ? v.getInt32(offset, true) : v.getUint32(offset, true));
            columns.push(values);
          }
          const firstX = bx * 32 + Number(bx !== 0), firstY = by * 32 + Number(by !== 0), endX = (bx + 1) * 32, endY = (by + 1) * 32;
          if (offset !== b.length || columns[0].length !== (endX - firstX + 1) * (endY - firstY + 1) || columns[1].length !== columns[0].length * 2) throw new Error('Invalid actual geometry owner size');
          let slot = 0;
          for (let row = firstY; row <= endY; row++) for (let col = firstX; col <= endX; col++, slot++) {
            const id = row * (manifest.spec.columns + 1) + col;
            if (columns[0][slot] !== id || vertices.has(id)) throw new Error('Duplicate or incorrect actual vertex owner');
            vertices.set(id, { x: columns[1][slot * 2], y: columns[1][slot * 2 + 1] });
          }
        }
        continue;
      }
      if (r.kind === 'lock') { locks.push({ bx: r.bx!, by: r.by!, hash: r.hash }); continue; }
      const b = r.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength), bx = r.bx!, by = r.by!, count = v.getUint16(8, true), expected = (bx ? 32 : 33) * (by ? 32 : 33);
      if ([76, 71, 68, 67, 1].some((x, i) => b[i] !== x) || b[6] !== bx || b[7] !== by || b.slice(10, 16).some(Boolean) || b[5] > 1 || count !== (b[5] ? expected : 0) || b.length !== 16 + count * 4 || tiles.has(`${bx}:${by}`)) throw new Error('Malformed or duplicate fine owner');
      const coverage: number[] = [], heights: number[] = [];
      for (let i = 0; i < count; i++) {
        const c = v.getInt16(16 + i * 2, true), h = v.getInt16(16 + count * 2 + i * 2, true);
        if (c === -32768 || h < -12000 || h > 12000 || c > 0 && h < 0 || c < 0 && h >= 0 || c === 0 && h !== 0) throw new Error('Stored fine coverage/height mismatch');
        coverage.push(c); heights.push(h);
      }
      const coverageIdentity = !b[5] || coverage.every(c => c === 32767) ? 'land' : coverage.every(c => c === -32767) ? 'sea' : await digest(b.slice(16, 16 + count * 2));
      tiles.set(`${bx}:${by}`, { bx, by, mode: b[5], coverage, heights, coverageIdentity, heightHash: b[5] ? await digest(b.slice(16 + count * 2)) : 'implicit-base', hash: r.hash });
    }
    coarse.sort((a, b) => a.key.localeCompare(b.key)); locks.sort((a, b) => a.by - b.by || a.bx - b.bx);
    if (coarse.length !== 4 * (manifest.spec.columns / 32) * (manifest.spec.rows / 32) || new Set(coarse.map(r => r.key)).size !== coarse.length) throw new Error('Incomplete coarse blocks');
    const coverageIdentity: string[] = [];
    for (let by = 0; by < 64; by++) for (let bx = 0; bx < 64; bx++) coverageIdentity.push(tiles.get(`${bx}:${by}`)?.coverageIdentity ?? 'sea');
    const sample = (x: number, y: number) => {
      const bx = Math.floor(Math.max(0, x - 1) / 32), by = Math.floor(Math.max(0, y - 1) / 32), tile = tiles.get(`${bx}:${by}`);
      if (!tile?.mode) return null; // Probe only raw stored nodes, never an inferred Hbase height.
      const slot = (y - (by * 32 + (by ? 1 : 0))) * (bx ? 32 : 33) + x - (bx * 32 + (bx ? 1 : 0));
      return { coverage: tile.coverage[slot], height: tile.heights[slot] };
    };
    if (vertices.size !== (manifest.spec.columns + 1) * (manifest.spec.rows + 1)) throw new Error('Incomplete actual geometry vertices');
    const quad = (cellId: number) => {
      const x = cellId % manifest.spec.columns, y = Math.floor(cellId / manifest.spec.columns), nw = y * (manifest.spec.columns + 1) + x;
      return [nw, nw + 1, nw + manifest.spec.columns + 2, nw + manifest.spec.columns + 1].map(id => vertices.get(id)!);
    };
    // Independent convex-polygon/axis-aligned-square SAT. Touching cells are
    // included. Compare all four source nodes of each touching fine cell, so
    // a locked-quad sliver or a node owned by its west/north neighbour is covered.
    const footprint = (cellId: number) => {
      const q = quad(cellId), ids = new Set<number>();
      const left = Math.max(0, Math.ceil(Math.min(...q.map(p => p.x)) / 512) - 1), right = Math.min(2047, Math.floor(Math.max(...q.map(p => p.x)) / 512));
      const top = Math.max(0, Math.ceil(Math.min(...q.map(p => p.y)) / 512) - 1), bottom = Math.min(2047, Math.floor(Math.max(...q.map(p => p.y)) / 512));
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        const square = [{ x: x * 512, y: y * 512 }, { x: (x + 1) * 512, y: y * 512 }, { x: (x + 1) * 512, y: (y + 1) * 512 }, { x: x * 512, y: (y + 1) * 512 }];
        if (q.some((a, i) => { const b = q[(i + 1) % 4]; return square.every(p => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < 0); })) continue;
        ids.add(y * 2049 + x); ids.add(y * 2049 + x + 1); ids.add((y + 1) * 2049 + x); ids.add((y + 1) * 2049 + x + 1);
      }
      return [...ids].sort((a, b) => a - b).map(id => { const x = id % 2049, y = Math.floor(id / 2049), value = sample(x, y); return value ? { x, y, ...value } : null; });
    };
    const candidates: { x: number; y: number; cellId: number; rank: number }[] = [];
    for (let row = 12; row < manifest.spec.rows - 12; row++) for (let col = 12; col < manifest.spec.columns - 12; col++) {
      const cellId = row * manifest.spec.columns + col, q = quad(cellId), x = q.reduce((n, p) => n + p.x, 0) / 1024, y = q.reduce((n, p) => n + p.y, 0) / 1024, rank = (x - 1150) ** 2 + (y - 1480) ** 2;
      if (rank <= 384 ** 2) candidates.push({ x, y, cellId, rank });
    }
    candidates.sort((a, b) => a.rank - b.rank || a.cellId - b.cellId);
    let chosen: { probe: typeof candidates[number]; regions: { mask: number; cellId: number; column: number; row: number; nodes: { x: number; y: number; coverage: number; height: number }[] }[] } | null = null;
    // Fix the original real-cell witnesses across edits. Materializing implicit
    // tiles can make earlier candidates eligible without changing any lock;
    // selecting afresh would compare a different region after the edit.
    if (witness) {
      const regions = witness.regions.map(r => ({ ...r, nodes: footprint(r.cellId) }));
      if (regions.length !== 3 || regions.some(r => r.cellId !== r.row * manifest.spec.columns + r.column || !r.nodes.length || r.nodes.some(n => !n || n.coverage < 2048))) throw new Error('Original protected witness no longer has its complete real land-node footprint');
      chosen = { probe: witness.probe, regions: regions.map(r => ({ ...r, nodes: r.nodes.map(n => n!) })) };
    }
    for (const probe of witness ? [] : candidates) {
      const fx = Math.floor(probe.x / 2), fy = Math.floor(probe.y / 2);
      if ([[fx, fy], [fx + 1, fy], [fx + 1, fy + 1], [fx, fy + 1]].some(([x, y]) => (sample(x, y)?.coverage ?? -32767) < 2048)) continue;
      const col = probe.cellId % manifest.spec.columns, row = Math.floor(probe.cellId / manifest.spec.columns);
      const regions = [[1, -3, -3], [2, 3, 0], [3, 0, 3]].map(([mask, dx, dy]) => ({ mask, column: col + dx, row: row + dy, cellId: (row + dy) * manifest.spec.columns + col + dx }));
      const sampled = regions.map(r => ({ ...r, nodes: footprint(r.cellId) }));
      if (sampled.some(r => !r.nodes.length || r.nodes.some(n => !n || n.coverage < 2048))) continue;
      chosen = { probe, regions: sampled.map(r => ({ ...r, nodes: r.nodes.map(n => n!) })) }; break;
    }
    if (!chosen) throw new Error('Actual continent lacks the bounded three-region all-stored-node land witness; no synthetic replacement is allowed');
    const { probe, regions } = chosen;
    return { coarse, locks, coarseHash: await textDigest(coarse), lockHash: await textDigest(locks), coverageHash: await textDigest(coverageIdentity),
      fine: [...tiles.values()].sort((a, b) => a.by - b.by || a.bx - b.bx).map(t => ({ bx: t.bx, by: t.by, mode: t.mode, hash: t.hash, coverageIdentity: t.coverageIdentity, heightHash: t.heightHash })), probe, regions };
  }, { id, witness });
}
type Field = Awaited<ReturnType<typeof durableField>>;
function protectedDataEqual(before: Field, after: Field) {
  expect(after.coarse).toEqual(before.coarse); expect(after.coarseHash).toBe(before.coarseHash);
  expect(after.locks).toEqual(before.locks); expect(after.lockHash).toBe(before.lockHash);
  expect(after.coverageHash).toBe(before.coverageHash);
}
function changedStoredHeightTiles(before: Field, after: Field) {
  return before.fine.filter(a => a.mode === 1).flatMap(a => {
    const b = after.fine.find(b => b.bx === a.bx && b.by === a.by);
    return b?.mode === 1 && b.coverageIdentity === a.coverageIdentity && b.heightHash !== a.heightHash ? [{ bx: a.bx, by: a.by, before: a.heightHash, after: b.heightHash }] : [];
  });
}
async function pickLand(p: Page, point: Field['probe'], touch: boolean) {
  await panel(p, '地图'); await click(p, '全图'); await frameReady(p);
  const box = (await p.getByTestId('atlas-canvas').boundingBox())!, zoomMaximum = Math.min(box.width, box.height) / 4096 * .9 * 80, zoomTarget = Math.min(2, zoomMaximum);
  for (let i = 0; i < 16 && (await metrics(p)).camera.scale < zoomTarget - 1e-9; i++) {
    const before = (await metrics(p)).camera.scale; await click(p, '放大大世界地图'); await frameReady(p); expect((await metrics(p)).camera.scale).toBeGreaterThan(before);
  }
  expect((await metrics(p)).camera.scale).toBeGreaterThanOrEqual(zoomTarget - 1e-9);
  await panel(p, '编辑'); await p.getByLabel('定位地块编号', { exact: true }).fill(String(point.cellId)); await click(p, '定位');
  await panel(p, '地图'); await frameReady(p);
  const frame = (await p.getByTestId('atlas-canvas').boundingBox())!, q = (await screen(p, [point]))[0];
  const center = { x: frame.x + frame.width * .5, y: frame.y + frame.height * .55 }, end = { x: 2 * center.x - q.x, y: 2 * center.y - q.y };
  await gesture(p, Array.from({ length: 9 }, (_, i) => ({ x: center.x + (end.x - center.x) * i / 8, y: center.y + (end.y - center.y) * i / 8 })), touch);
  await frameReady(p); const target = (await screen(p, [point]))[0]; await assertCanvasPoints(p, [target]);
  if (touch) await p.touchscreen.tap(target.x, target.y); else await p.mouse.click(target.x, target.y);
  await expect(p.getByTestId('atlas-picked-surface')).toHaveAttribute('data-land', 'land');
  await panel(p, '编辑'); await expect(p.getByRole('button', { name: '仅重生成山地', exact: true })).toBeEnabled(); await click(p, '仅重生成山地');
  return { world: { x: point.x, y: point.y }, screen: target, zoomTarget, zoomMaximum, actualScale: (await metrics(p)).camera.scale };
}

type Lock = { cellId: number; flags: number };
type DetailManifest = SavedSnapshot['manifest'] & { detailCoast: { refs: { bx: number; by: number; hash: string }[] } };
function geographyUnchanged(before: SavedSnapshot, after: SavedSnapshot) {
  expect(after.manifest.blockRefs).toEqual(before.manifest.blockRefs);
  expect((after.manifest as DetailManifest).detailCoast).toEqual((before.manifest as DetailManifest).detailCoast);
  expect(after.manifest.generation).toEqual(before.manifest.generation);
}
async function lockState(p: Page, id: string) {
  const snapshot = await saved(p, id, 4);
  const flags = await p.evaluate(async source => {
    const hash = async (bytes: number[] | Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(x => x.toString(16).padStart(2, '0')).join('');
    if (await hash(source.manifestBytes) !== source.root.currentManifest) throw new Error('Lock snapshot manifest hash mismatch');
    const refs = source.manifest.constraints.lockRefs;
    const records = await new Promise<{ bx: number; by: number; hash: string; bytes: Uint8Array }[]>((resolve, reject) => {
      const open = indexedDB.open('lieguoji-atlas-drafts-v4', 1);
      open.onupgradeneeded = () => open.transaction!.abort(); open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('blocks', 'readonly'), records: { bx: number; by: number; hash: string; bytes: Uint8Array }[] = [];
        for (const ref of refs) { const read = tx.objectStore('blocks').get(ref.hash); read.onsuccess = () => { if (!(read.result?.bytes instanceof Uint8Array)) tx.abort(); else records.push({ ...ref, bytes: read.result.bytes }); }; }
        tx.oncomplete = () => { db.close(); resolve(records); }; tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing lock record')); };
      };
    });
    const flags: { cellId: number; flags: number }[] = [], seen = new Set<number>();
    for (const r of records) {
      const b = r.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength);
      if (await hash(b) !== r.hash || b.length !== 1040 || [76, 71, 65, 76].some((x, i) => b[i] !== x) || v.getUint16(4, true) !== 1 || v.getUint16(6, true) !== r.bx || v.getUint16(8, true) !== r.by || v.getUint16(10, true) !== 1024 || v.getUint32(12, true) || !b.slice(16).some(Boolean)) throw new Error('Invalid actual LGAL lock bytes');
      for (let slot = 0; slot < 1024; slot++) {
        const value = b[16 + slot]; if (value > 3) throw new Error('Unknown lock bit');
        if (!value) continue;
        const cellId = (r.by * 32 + Math.floor(slot / 32)) * source.manifest.spec.columns + r.bx * 32 + slot % 32;
        if (seen.has(cellId)) throw new Error('Duplicate lock cell'); seen.add(cellId); flags.push({ cellId, flags: value });
      }
    }
    return flags.sort((a, b) => a.cellId - b.cellId);
  }, snapshot);
  return { snapshot, flags };
}
const sortedLocks = (locks: Lock[]) => [...locks].sort((a, b) => a.cellId - b.cellId);
async function changeLock(p: Page, id: string, region: Field['regions'][number], mask: number, action: 'set' | 'clear', before: SavedSnapshot, expected: Lock[]) {
  await panel(p, '编辑'); await p.getByLabel('定位地块编号', { exact: true }).fill(String(region.cellId)); await click(p, '定位'); await click(p, '保护区域');
  const details = p.locator('details').filter({ has: p.getByText('精确调整保护范围', { exact: true }) });
  if (!await details.evaluate(e => (e as HTMLDetailsElement).open)) await p.getByText('精确调整保护范围', { exact: true }).click();
  await p.getByLabel('保护选区起始列', { exact: true }).fill(String(region.column)); await p.getByLabel('保护选区起始行', { exact: true }).fill(String(region.row));
  await p.getByLabel('保护选区宽度', { exact: true }).fill('1'); await p.getByLabel('保护选区高度', { exact: true }).fill('1');
  await p.getByLabel('区域锁保护内容', { exact: true }).selectOption(String(mask)); await p.getByLabel('区域锁操作', { exact: true }).selectOption(action);
  await click(p, '预览区域锁修改'); await expect(p.getByRole('region', { name: '区域锁修改预览' })).toBeVisible({ timeout: 120000 }); await ready(p);
  expect(Number((await p.getByTestId('region-protection-changed-cells').innerText()).replaceAll(',', ''))).toBe(1);
  expect(await saved(p, id, 4)).toEqual(before);
  await click(p, '确认区域锁并保存'); await ready(p);
  const state = await lockState(p, id);
  expect(state.snapshot.root).toMatchObject({ revision: before.root.revision + 1, backupManifest: before.root.currentManifest });
  expect(state.flags).toEqual(sortedLocks(expected)); geographyUnchanged(before, state.snapshot);
  return state.snapshot;
}

test('[detail-v4-lock-relief] native nonzero coast/elevation/both locks, allowed relief, single-bit clear, mixed undo and reload', async ({ page }, info) => {
  // One natural generation and one local preview, no reload/retry loops. This
  // remains a workflow check under the existing deadline, not a performance gate.
  test.setTimeout(450000);
  const began = Date.now(), response = await page.request.get('/build.json'); expect(response.ok()).toBe(true);
  const build = await response.json() as { version: string; naturalDetailGenerator: { sha256: string }; localDetailReliefGenerator: { sha256: string } };
  expect(build.localDetailReliefGenerator?.sha256).toMatch(/^[a-f0-9]{64}$/);
  const errors: string[] = [], touch = info.project.name !== 'desktop-chromium';
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?atlas=new&atlas-format=4'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill('区域保护 · 真实锁与山地'); await page.getByLabel('大世界生成种子', { exact: true }).fill('fine-local-relief-native');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('256'); await click(page, '新建空白海洋草稿'); await ready(page);
  const id = (await studio(page).getAttribute('data-atlas-id'))!;
  await panel(page, '创世'); await expect(page.getByLabel('大陆地形风格', { exact: true })).toHaveValue('2');
  await page.getByLabel('地貌种子', { exact: true }).fill('fine-local-relief-native'); await page.getByLabel('近岸岛链', { exact: true }).selectOption('0');
  await click(page, '画大陆'); await click(page, '全图'); await frameReady(page); await gesture(page, await screen(page, [...contour, contour[0]]), touch);
  await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await ready(page); await click(page, '确认生成并保存'); await ready(page);
  const first = await saved(page, id, 4), firstField = await durableField(page, id);
  expect(first.root.revision).toBe(1); expect(first.manifest.generation.lastApplied?.recipe.generator).toEqual({ id: 'shape-detail-landmass', version: 2, fingerprint: build.naturalDetailGenerator.sha256 });
  expect(firstField.fine.some(t => t.coverageIdentity !== 'land' && t.coverageIdentity !== 'sea'), 'The real continent must contain nonuniform coastal coverage').toBe(true);
  expect((await lockState(page, id)).flags).toEqual([]);
  const selection = await pickLand(page, firstField.probe, touch), [coast, elevation, both] = firstField.regions;
  const localSeed = 'local-relief-native-nonzero-locks';
  await page.getByLabel('局部山地种子', { exact: true }).fill(localSeed); await page.getByLabel('局部山地起伏', { exact: true }).fill('3600');
  await expect(page.getByTestId('local-relief-scope')).toContainText('16 × 16');
  const allLocks = firstField.regions.map(r => ({ cellId: r.cellId, flags: r.mask }));
  await info.attach('detail-lock-relief-input.json', { contentType: 'application/json', body: JSON.stringify({ actualBuild: build, first: first.root, selection, regions: firstField.regions, localSeed, reliefMeters: 3600, localScope: '16x16, default transition2', timeoutMs: 450000 }, null, 2) });
  const lockedCoast = await changeLock(page, id, coast, 1, 'set', first, allLocks.slice(0, 1));
  const lockedElevation = await changeLock(page, id, elevation, 2, 'set', lockedCoast, allLocks.slice(0, 2));
  const locked = await changeLock(page, id, both, 3, 'set', lockedElevation, allLocks);
  const lockedField = await durableField(page, id, firstField);
  expect(lockedField.coarse).toEqual(firstField.coarse); expect(lockedField.fine).toEqual(firstField.fine); expect(lockedField.regions).toEqual(firstField.regions);
  await click(page, '返回地貌创作'); await expect(page.getByLabel('局部山地种子', { exact: true })).toHaveValue(localSeed);
  await expect(page.getByLabel('局部山地起伏', { exact: true })).toHaveValue('3600'); await expect(page.getByTestId('local-relief-scope')).toContainText('16 × 16');
  await click(page, '预览山地变化'); await expect(preview(page)).toBeVisible({ timeout: 120000 }); await ready(page);
  const changedNodes = Number((await page.getByTestId('local-relief-changed-nodes').innerText()).replaceAll(',', '')); expect(changedNodes).toBeGreaterThan(0);
  expect(await saved(page, id, 4)).toEqual(locked); const candidate = await audit(page);
  await click(page, '确认生成并保存'); await ready(page);
  const edited = await saved(page, id, 4), editedField = await durableField(page, id, firstField);
  expect(edited.root).toMatchObject({ revision: 5, currentManifest: candidate.display.manifestDigest, backupManifest: locked.root.currentManifest });
  expect(edited.manifest.generation.lastApplied?.recipe).toMatchObject({ generator: { id: 'local-detail-relief', version: 1, fingerprint: build.localDetailReliefGenerator.sha256 }, seed: localSeed, parameters: { reliefMeters: 3600 } });
  expect((await lockState(page, id)).flags).toEqual(sortedLocks(allLocks)); protectedDataEqual(lockedField, editedField);
  const changedTiles = changedStoredHeightTiles(lockedField, editedField); expect(changedTiles.length).toBeGreaterThan(0);
  // Raw all-node footprint comparison is stronger than an unchanged tile hash:
  // allowed and protected nodes can share a west/north-owned fine tile.
  expect(editedField.regions.map(r => ({ cellId: r.cellId, mask: r.mask }))).toEqual(lockedField.regions.map(r => ({ cellId: r.cellId, mask: r.mask })));
  for (let i = 0; i < 3; i++) expect(editedField.regions[i].nodes.map(n => ({ x: n.x, y: n.y, coverage: n.coverage }))).toEqual(lockedField.regions[i].nodes.map(n => ({ x: n.x, y: n.y, coverage: n.coverage })));
  expect(editedField.regions[1].nodes).toEqual(lockedField.regions[1].nodes); expect(editedField.regions[2].nodes).toEqual(lockedField.regions[2].nodes);
  const changedCoastNodes = editedField.regions[0].nodes.filter((node, i) => node.height !== lockedField.regions[0].nodes[i].height);
  expect(changedCoastNodes.length, 'A real coast-only lock must not freeze its allowed land heights').toBeGreaterThan(0);
  await panel(page, '地图'); await frameReady(page); await page.screenshot({ path: info.outputPath('locked-local-relief.png'), fullPage: true });

  const cleared = await changeLock(page, id, both, 1, 'clear', edited, allLocks.map(l => l.cellId === both.cellId ? { ...l, flags: 2 } : l));
  expect(cleared.root.revision).toBe(6);
  await click(page, '撤销大世界编辑'); await ready(page); const undoClear = await lockState(page, id);
  expect(undoClear.snapshot.root).toMatchObject({ revision: 7, backupManifest: cleared.root.currentManifest }); expect(undoClear.flags).toEqual(sortedLocks(allLocks));
  expect(undoClear.snapshot.manifest.constraints).toEqual(edited.manifest.constraints); geographyUnchanged(edited, undoClear.snapshot);
  await click(page, '撤销大世界编辑'); await ready(page); const undoRelief = await lockState(page, id);
  expect(undoRelief.snapshot.root).toMatchObject({ revision: 8, backupManifest: undoClear.snapshot.root.currentManifest }); expect(undoRelief.flags).toEqual(sortedLocks(allLocks));
  geographyUnchanged(locked, undoRelief.snapshot); expect(await durableField(page, id, firstField)).toEqual(lockedField);
  await click(page, '撤销大世界编辑'); await ready(page); const undoBoth = await lockState(page, id);
  expect(undoBoth.snapshot.root).toMatchObject({ revision: 9, backupManifest: undoRelief.snapshot.root.currentManifest }); expect(undoBoth.flags).toEqual(sortedLocks(allLocks.slice(0, 2)));
  geographyUnchanged(lockedElevation, undoBoth.snapshot); expect(undoBoth.snapshot.manifest.constraints).toEqual(lockedElevation.manifest.constraints);
  await page.reload(); await ready(page);
  const restored = await lockState(page, id); expect(restored).toEqual(undoBoth);
  const restoredField = await durableField(page, id, firstField);
  expect(restoredField.coarse).toEqual(firstField.coarse); expect(restoredField.fine).toEqual(firstField.fine); expect(restoredField.regions).toEqual(firstField.regions); expect(restoredField.coverageHash).toBe(firstField.coverageHash);
  expect((await audit(page)).display).toMatchObject({ source: 'committed', version: 4, revision: 9, manifestDigest: restored.snapshot.root.currentManifest });
  await panel(page, '地图'); await click(page, '全图'); await frameReady(page); await page.screenshot({ path: info.outputPath('locks-mixed-undo-restored.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
  await info.attach('detail-lock-relief-observation.json', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, elapsedMs: Date.now() - began, input: touch ? 'native CDP touch and touchscreen tap + visible UI controls' : 'native mouse + visible UI controls', actualBuild: build,
    selection, lockedRegions: firstField.regions, allLocks: sortedLocks(allLocks), first: first.root, locked: locked.root, edited: edited.root, singleBitClear: cleared.root,
    undoClear: undoClear.snapshot.root, undoRelief: undoRelief.snapshot.root, undoBoth: undoBoth.snapshot.root, restored: restored.snapshot.root,
    coarseBlockCount: firstField.coarse.length, coverageHash: firstField.coverageHash, changedNodesInPreview: changedNodes, changedStoredHeightTiles: changedTiles, changedCoastNodes,
    scope: 'Actual nonzero 1/2/3 LGAL locks from UI; exact coarse/fine coverage identities; all stored source nodes touching three real coarse quads; allowed coast-only heights change, height/both locked footprints freeze; clear bit1 retains bit2; mixed undo and one reload. The selected cells are interior land, not a claim that this example edits a shoreline. Emulated devices only. No dense-lock performance, cancellation, hardware, natural visual or PH acceptance.'
  }, null, 2) });
});
