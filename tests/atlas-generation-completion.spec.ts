import { expect, test, type CDPSession, type Page, type TestInfo } from '@playwright/test';
import { audit, databaseDigest, geography, metrics, saved, type Geography, type SavedSnapshot } from './helpers/atlas-shape-readonly';

// All mutations use the public UI and native mouse/CDP touch. Diagnostics,
// progress DOM and IndexedDB are read-only observations, never generator calls.
const studio = (page: Page) => page.getByTestId('atlas-studio');
const candidate = (page: Page) => page.getByRole('region', { name: '大陆生成预览' });
const ready = (page: Page, state = 'ready') => expect(studio(page)).toHaveAttribute('data-atlas-state', state, { timeout: 90000 });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
const panel = (page: Page, name: '地图' | '创世' | '编辑') => page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();
type Rectangle = { column: number; row: number; columns: number; rows: number };
type XY = { x: number; y: number };
interface Observation {
  id: string; operation: 'shape' | 'ocean'; startedAt: number; trusted: boolean; seenBusy: boolean;
  finishedAt: number | null; finishedState: string | null; cancelRequestedAt: number | null; cancelTrusted: boolean | null;
  samples: { at: number; stage: string; completed: number; total: number }[];
  cancelSnapshot?: { state: string | null; candidateVisible: boolean; stage: string; completed: number; total: number; algorithmRunning: boolean };
}
interface ObserverHost { __completionActive?: Observation; __completionRecords: Observation[]; __completionInputs: { type: string; trusted: boolean; pointerType: string }[] }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const host = window as unknown as ObserverHost; host.__completionRecords = []; host.__completionInputs = [];
    const start = (operation: Observation['operation'], event: Event) => {
      const record: Observation = { id: crypto.randomUUID(), operation, startedAt: performance.now(), trusted: event.isTrusted, seenBusy: false,
        finishedAt: null, finishedState: null, cancelRequestedAt: null, cancelTrusted: null, samples: [] };
      host.__completionActive = record; host.__completionRecords.push(record);
    };
    document.addEventListener('click', event => {
      const label = event.target instanceof Element ? event.target.closest('button')?.textContent?.trim() : '';
      if (label === '预览海床生成') start('ocean', event);
      else if (label === '取消操作' && host.__completionActive?.finishedAt === null) {
        const record = host.__completionActive, state = document.querySelector('[data-testid="atlas-studio"]')?.getAttribute('data-atlas-state') ?? null;
        const match = (document.querySelector('.inspector-notice span')?.textContent ?? '').match(/^(.*?) · (\d+)\/(\d+)$/);
        const stage = match?.[1] ?? '', completed = Number(match?.[2] ?? 0), total = Number(match?.[3] ?? 0);
        const stages = record.operation === 'shape' ? /量测手绘轮廓|读取手绘区域|从闭合轮廓生成/ : /读取海床真实|识别世界边界海水|沿真实共享边识别外海/;
        const candidateVisible = !!document.querySelector('[aria-label="大陆生成预览"]');
        record.cancelRequestedAt = performance.now(); record.cancelTrusted = event.isTrusted;
        record.cancelSnapshot = { state, candidateVisible, stage, completed, total, algorithmRunning: state === 'busy' && !candidateVisible && stages.test(stage) && completed > 0 && completed < total };
      }
    }, true);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) document.addEventListener(type, event => {
      if (!(event.target instanceof Element) || event.target.getAttribute('data-testid') !== 'atlas-canvas') return;
      const pointer = event as PointerEvent;
      if (pointer.type === 'pointermove' && !pointer.buttons) return;
      host.__completionInputs.push({ type, trusted: pointer.isTrusted, pointerType: pointer.pointerType });
      if (type === 'pointerup' && document.querySelector('[data-testid="atlas-studio"]')?.getAttribute('data-atlas-tool') === 'outline') start('shape', event);
    }, true);
    const observe = () => {
      const record = host.__completionActive; if (!record || record.finishedAt !== null) return;
      const state = document.querySelector('[data-testid="atlas-studio"]')?.getAttribute('data-atlas-state');
      if (state === 'busy') record.seenBusy = true;
      const match = (document.querySelector('.inspector-notice span')?.textContent ?? '').match(/^(.*?) · (\d+)\/(\d+)$/);
      if (match) {
        const last = record.samples.at(-1), stage = match[1], completed = Number(match[2]), total = Number(match[3]);
        if (!last || last.stage !== stage || last.completed !== completed || last.total !== total) record.samples.push({ at: performance.now(), stage, completed, total });
      }
      if (record.seenBusy && state && state !== 'busy' && !match) { record.finishedAt = performance.now(); record.finishedState = state; }
    };
    const attach = () => new MutationObserver(observe).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-atlas-state', 'data-atlas-display'] });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true }); else attach();
  });
});

async function observations(page: Page) {
  const records = await page.evaluate(() => (window as unknown as ObserverHost).__completionRecords ?? []);
  return records.map(record => {
    const ticks = [record.startedAt, ...record.samples.map(sample => sample.at), ...(record.finishedAt === null ? [] : [record.finishedAt])];
    const maximumGapMs = ticks.length > 1 ? Math.max(...ticks.slice(1).map((at, index) => at - ticks[index])) : null;
    const cancellationResponseMs = record.finishedAt === null || record.cancelRequestedAt === null ? null : record.finishedAt - record.cancelRequestedAt;
    return { ...record, maximumGapMs, cancellationResponseMs,
      progress250msGate: record.trusted && record.finishedState === 'ready' && record.samples.length > 0 && maximumGapMs !== null && maximumGapMs <= 250,
      cancellation500msGate: cancellationResponseMs === null ? null : record.cancelTrusted === true && record.cancelSnapshot?.algorithmRunning === true && record.finishedState === 'ready' && cancellationResponseMs <= 500 };
  });
}
test.afterEach(async ({ page }, info) => {
  if (page.isClosed()) return;
  const runs = await observations(page).catch(() => []);
  const inputs = await page.evaluate(() => (window as unknown as ObserverHost).__completionInputs ?? []).catch(() => []);
  await info.attach('completion-progress-response.json', { contentType: 'application/json', body: JSON.stringify({ project: info.project.name,
    measurement: 'Native outline pointerup / preview button click to ready, including first and final DOM progress gaps. Cancellation from trusted cancel click to ready. Original 250/500 ms gates. No frame-rate or physical-device claim.', runs, inputs }, null, 2) });
});

function errorsOn(page: Page) {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); }); return errors;
}
async function create(page: Page, size: '256' | '512', name: string) {
  await page.goto('/?atlas=new&atlas-format=2'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill(name); await page.getByLabel('大世界生成种子', { exact: true }).fill('PH06-completion');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption(size); await button(page, '新建空白海洋草稿'); await ready(page);
  return (await studio(page).getAttribute('data-atlas-id'))!;
}
async function fields(page: Page, values: [string, string][]) { for (const [label, value] of values) await page.getByLabel(label, { exact: true }).fill(value); }
async function regionTools(page: Page) {
  const tools = page.getByTestId('atlas-region-tools'); if (!await tools.evaluate(element => (element as HTMLDetailsElement).open)) await tools.locator('summary').click();
}
async function setRectangle(page: Page, rect: Rectangle) {
  await fields(page, [['选区起始列', String(rect.column)], ['选区起始行', String(rect.row)], ['选区宽度', String(rect.columns)], ['选区高度', String(rect.rows)]]);
}
async function awaitCandidate(page: Page) { await expect(candidate(page)).toBeVisible({ timeout: 90000 }); await ready(page); await expect(studio(page)).toHaveAttribute('data-atlas-display', 'generation-preview'); }
async function confirm(page: Page) { await button(page, '确认生成并保存'); await ready(page); }
async function restored(page: Page, id: string, snapshot: SavedSnapshot, expected: Geography) {
  await page.reload(); await ready(page); expect(await saved(page, id)).toEqual(snapshot); expect(await geography(page, snapshot.manifest)).toEqual(expected);
  expect((await audit(page)).display).toMatchObject({ source: 'committed', revision: snapshot.root.revision, manifestDigest: snapshot.root.currentManifest });
}
const distance = (id: number, columns: number, r: Rectangle) => Math.min(id % columns - r.column, r.column + r.columns - 1 - id % columns, Math.floor(id / columns) - r.row, r.row + r.rows - 1 - Math.floor(id / columns));
function neighbors(id: number, size: number) { const x = id % size, y = Math.floor(id / size); return [x ? id - 1 : -1, x + 1 < size ? id + 1 : -1, y ? id - size : -1, y + 1 < size ? id + size : -1].filter(next => next >= 0); }
function localFixture(data: Geography, size: number) {
  let best: { rect: Rectangle; score: number; coastal: number[] } | undefined;
  const coast = data.heights.map((h, id) => neighbors(id, size).some(next => (data.heights[next] >= 0) !== (h >= 0)));
  for (let row = 16; row + 96 < size; row += 16) for (let column = 16; column + 96 < size; column += 16) {
    const rect = { column, row, columns: 96, rows: 96 }, coastal: number[] = []; let land = 0, bandCoast = 0, bandLand = 0;
    for (let y = row; y < row + 96; y++) for (let x = column; x < column + 96; x++) {
      const id = y * size + x, edge = distance(id, size, rect);
      if (data.heights[id] >= 0) { land++; if (edge <= 8) bandLand++; }
      if (coast[id]) { if (edge > 16) coastal.push(id); if (edge > 0 && edge <= 8) bandCoast++; }
    }
    if (land < 1500 || land > 8000 || bandLand < 100 || bandCoast < 15 || !coastal.length) continue;
    const score = coastal.length + bandCoast * 2;
    if (!best || score > best.score) best = { rect, score, coastal };
  }
  if (!best) throw new Error('Actual generated geography has no non-vacuous mixed 96-cell local/transition fixture');
  const center = best.coastal[Math.floor(best.coastal.length / 2)], locks = { column: center % size - 3, row: Math.floor(center / size) - 3, columns: 8, rows: 8 };
  return { rect: best.rect, locks, transition: 8 };
}
async function readLocks(page: Page, snapshot: SavedSnapshot) {
  return page.evaluate(async ({ refs, size }) => {
    const rows = await new Promise<{ bx: number; by: number; hash: string; bytes: Uint8Array }[]>((resolve, reject) => {
      const request = indexedDB.open('lieguoji-atlas-drafts-v2', 1); request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('blocks', 'readonly'), records: { bx: number; by: number; hash: string; bytes: Uint8Array }[] = [];
        for (const ref of refs) { const query = tx.objectStore('blocks').get(ref.hash); query.onsuccess = () => { if (!(query.result?.bytes instanceof Uint8Array) || query.result.kind !== 'lock') { tx.abort(); return; } records.push({ ...ref, bytes: query.result.bytes }); }; }
        tx.oncomplete = () => { db.close(); resolve(records); }; tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing actual lock block')); };
      };
    });
    const masks = new Uint8Array(size * size);
    for (const row of rows) {
      const bytes = row.bytes, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(value => value.toString(16).padStart(2, '0')).join('');
      if (digest !== row.hash || bytes.length !== 1040 || [76, 71, 65, 76].some((value, index) => bytes[index] !== value) || view.getUint16(4, true) !== 1 || view.getUint16(6, true) !== row.bx || view.getUint16(8, true) !== row.by || view.getUint16(10, true) !== 1024 || view.getUint32(12, true)) throw new Error('Independent LGAL identity/SHA/header mismatch');
      for (let slot = 0; slot < 1024; slot++) { if (bytes[16 + slot] & ~3) throw new Error('Unknown real lock bits'); masks[(row.by * 32 + Math.floor(slot / 32)) * size + row.bx * 32 + slot % 32] = bytes[16 + slot]; }
    }
    return [...masks];
  }, { refs: snapshot.manifest.constraints.lockRefs, size: snapshot.manifest.spec.columns });
}
function verifyLocal(before: Geography, after: Geography, size: number, rect: Rectangle, locks: number[], transition: number, operation: 'landforms' | 'coast') {
  const changedCells: number[] = [], changedVertices: number[] = [], transitionChanges: number[] = [], coreChanges: number[] = [];
  for (let id = 0; id < before.heights.length; id++) {
    const d = distance(id, size, rect), changed = before.heights[id] !== after.heights[id];
    if (changed) changedCells.push(id);
    if (changed && (operation === 'coast' || d <= 0 || locks[id] || before.heights[id] < 0)) throw new Error(`Protected actual height changed at ${id}`);
    if ((after.heights[id] >= 0) !== (before.heights[id] >= 0)) throw new Error(`Actual sea/land class changed at ${id}`);
    if (changed) (d < transition ? transitionChanges : coreChanges).push(id);
  }
  for (let id = 0; id < before.xyQ.length / 2; id++) {
    const x = id % (size + 1), y = Math.floor(id / (size + 1)), cells: number[] = [];
    for (const dy of [-1, 0]) for (const dx of [-1, 0]) if (x + dx >= 0 && x + dx < size && y + dy >= 0 && y + dy < size) cells.push((y + dy) * size + x + dx);
    const changed = before.xyQ[id * 2] !== after.xyQ[id * 2] || before.xyQ[id * 2 + 1] !== after.xyQ[id * 2 + 1];
    if (changed) changedVertices.push(id);
    if (changed && (operation === 'landforms' || cells.some(cell => distance(cell, size, rect) <= 0 || locks[cell]))) throw new Error(`Protected actual shared vertex changed at ${id}`);
    if (changed) (cells.some(cell => distance(cell, size, rect) < transition) ? transitionChanges : coreChanges).push(id);
  }
  // Independent final shared quad topology; no generator/topology module used.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = y * (size + 1) + x, ids = [a, a + 1, a + size + 2, a + size + 1];
    for (let corner = 0; corner < 4; corner++) {
      const p = ids[corner], q = ids[(corner + 1) % 4], r = ids[(corner + 2) % 4];
      const cross = (after.xyQ[q * 2] - after.xyQ[p * 2]) * (after.xyQ[r * 2 + 1] - after.xyQ[q * 2 + 1]) - (after.xyQ[q * 2 + 1] - after.xyQ[p * 2 + 1]) * (after.xyQ[r * 2] - after.xyQ[q * 2]);
      if (cross <= 0 || !Number.isSafeInteger(cross)) throw new Error(`Invalid actual quad ${y * size + x}`);
    }
  }
  expect(operation === 'landforms' ? changedCells.length : changedVertices.length).toBeGreaterThan(10);
  expect(coreChanges.length, 'Real full-strength interior changes').toBeGreaterThan(0);
  expect(transitionChanges.length, 'Real changes inside the transition band, with its outer ring exact').toBeGreaterThan(0);
  return { changedCells: changedCells.length, changedVertices: changedVertices.length, transitionChanges: transitionChanges.length, coreChanges: coreChanges.length, protectedCells: locks.filter(Boolean).length, checkedQuads: size * size };
}
function verifyCoastTransition(before: Geography, after: Geography, size: number, rect: Rectangle, locks: number[], transition: number) {
  // Independent mathematical oracle for the planned smoothstep transition:
  // read the persisted sea/land shared-edge graph and actual owned vertices,
  // then check ONE 200-permille midpoint relaxation. The small displacement
  // stays strictly inside the untouched grid's convexity/quarter-cell limits.
  // No production generator/seed/topology helper is imported. Q12 rounding can
  // differ from the real-valued smoothstep by at most one Q8 coordinate unit.
  const adjacent = new Map<number, number[]>(), edge = (a: number, b: number) => {
    adjacent.set(a, [...(adjacent.get(a) ?? []), b]); adjacent.set(b, [...(adjacent.get(b) ?? []), a]);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cell = y * size + x, land = before.heights[cell] >= 0;
    if (x + 1 < size && land !== (before.heights[cell + 1] >= 0)) { const a = y * (size + 1) + x + 1; edge(a, a + size + 1); }
    if (y + 1 < size && land !== (before.heights[cell + size] >= 0)) { const a = (y + 1) * (size + 1) + x; edge(a, a + 1); }
  }
  let bandCorners = 0, interiorCorners = 0, maximumCoordinateErrorQ = 0;
  const bandDistances = new Set<number>();
  for (let vertex = 0; vertex < before.xyQ.length / 2; vertex++) {
    const x = vertex % (size + 1), y = Math.floor(vertex / (size + 1)), incident: number[] = [];
    for (const dy of [-1, 0]) for (const dx of [-1, 0]) if (x + dx >= 0 && x + dx < size && y + dy >= 0 && y + dy < size) incident.push((y + dy) * size + x + dx);
    const neighbors = adjacent.get(vertex) ?? [], d = Math.min(...incident.map(cell => distance(cell, size, rect)));
    const eligible = neighbors.length === 2 && x > 0 && x < size && y > 0 && y < size && d > 0 && incident.every(cell => !locks[cell]);
    let desiredX = 0, desiredY = 0;
    if (eligible) {
      const t = Math.min(1, d / transition), weight = t * t * (3 - 2 * t);
      const midpointX = (before.xyQ[neighbors[0] * 2] + before.xyQ[neighbors[1] * 2]) / 2;
      const midpointY = (before.xyQ[neighbors[0] * 2 + 1] + before.xyQ[neighbors[1] * 2 + 1]) / 2;
      desiredX = (midpointX - before.xyQ[vertex * 2]) * 0.1 * weight;
      desiredY = (midpointY - before.xyQ[vertex * 2 + 1]) * 0.1 * weight;
      if (Math.abs(desiredX) + Math.abs(desiredY) > 2) {
        if (d < transition) { bandCorners++; bandDistances.add(d); } else interiorCorners++;
      }
    }
    const actualX = after.xyQ[vertex * 2] - before.xyQ[vertex * 2], actualY = after.xyQ[vertex * 2 + 1] - before.xyQ[vertex * 2 + 1];
    const error = Math.max(Math.abs(actualX - desiredX), Math.abs(actualY - desiredY)); maximumCoordinateErrorQ = Math.max(maximumCoordinateErrorQ, error);
    if (error > (eligible ? 1 : 0)) throw new Error(`Persisted coast transition differs from independent single-round smoothstep oracle at vertex ${vertex}, distance ${d}: actual (${actualX},${actualY}), oracle (${desiredX},${desiredY})`);
  }
  expect(bandCorners).toBeGreaterThan(5); expect(interiorCorners).toBeGreaterThan(5); expect(bandDistances.size).toBeGreaterThan(1);
  return { oracle: 'Actual shared-coast graph; one 200-permille midpoint relaxation times cubic smoothstep d/8; <=1 Q8-unit quantization tolerance', bandCorners, interiorCorners, bandDistances: [...bandDistances].sort((a, b) => a - b), maximumCoordinateErrorQ };
}

test('局部生成闭环：真实山系与细海岸保持范围外、区域锁与过渡带，保存刷新一致', async ({ page }, info) => {
  test.setTimeout(360000); const errors = errorsOn(page), id = await create(page, '256', `PH06局部完成门-${info.project.name}`);
  await panel(page, '创世'); await page.getByLabel('生成内容', { exact: true }).selectOption('macro');
  await fields(page, [['地貌种子', '山海-01'], ['大陆数量', '2'], ['陆地比例', '350'], ['海岸变化尺度', '384'], ['内陆起伏', '2200']]);
  await button(page, '预览大陆生成'); await awaitCandidate(page); await confirm(page);
  const macro = await saved(page, id), original = await geography(page, macro.manifest), fixture = localFixture(original, 256);
  await regionTools(page); await page.getByLabel('显示区域锁选区', { exact: true }).check(); await setRectangle(page, fixture.locks);
  await page.getByLabel('区域锁保护内容', { exact: true }).selectOption('3'); await page.getByLabel('区域锁操作', { exact: true }).selectOption('set');
  await button(page, '预览区域锁修改'); await expect(page.getByRole('region', { name: '区域锁修改预览' })).toBeVisible({ timeout: 90000 }); await ready(page);
  await button(page, '确认区域锁并保存'); await ready(page);
  let baseline = await saved(page, id), before = await geography(page, baseline.manifest); const locks = await readLocks(page, baseline);
  expect(locks).toEqual(Array.from({ length: 256 * 256 }, (_, cell) => distance(cell, 256, fixture.locks) >= 0 ? 3 : 0));
  expect(before).toEqual(original); const reports: unknown[] = [];
  for (const operation of ['landforms', 'coast'] as const) {
    await panel(page, '创世'); await page.getByLabel('生成内容', { exact: true }).selectOption(operation); await regionTools(page);
    await page.getByLabel('地貌生成范围', { exact: true }).selectOption('local'); await setRectangle(page, fixture.rect);
    await page.getByLabel('过渡带宽度', { exact: true }).fill(String(fixture.transition));
    if (operation === 'landforms') await fields(page, [['地貌种子', 'PH06-local-terrain'], ['山系数量', '3'], ['盆地数量', '1'], ['内陆起伏', '2400']]);
    else await fields(page, [['目标平滑强度', '200'], ['细化轮数', '1']]);
    const database = await databaseDigest(page);
    await button(page, operation === 'landforms' ? '预览山系与盆地' : '预览海岸细化'); await awaitCandidate(page);
    await expect(candidate(page)).toContainText('局部生成：'); expect(await saved(page, id)).toEqual(baseline); expect(await databaseDigest(page)).toEqual(database);
    await page.screenshot({ path: info.outputPath(`${operation}-actual-local-candidate.png`), fullPage: true });
    await confirm(page); const committed = await saved(page, id), after = await geography(page, committed.manifest);
    const last = committed.manifest.generation.lastApplied as NonNullable<typeof committed.manifest.generation.lastApplied> & { scope: Rectangle & { kind: string; transitionCells: number } };
    expect(last.scope).toEqual({ kind: 'cell-rectangle', ...fixture.rect, transitionCells: fixture.transition });
    expect(committed.root.revision).toBe(baseline.root.revision + 1); expect(committed.manifest.constraints).toEqual(baseline.manifest.constraints); expect(await readLocks(page, committed)).toEqual(locks);
    const changedLayer = operation === 'landforms' ? 'elevation:' : 'geometry:';
    expect(committed.manifest.blockRefs.filter(ref => !ref.key.startsWith(changedLayer))).toEqual(baseline.manifest.blockRefs.filter(ref => !ref.key.startsWith(changedLayer)));
    reports.push({ operation, fixture, ...verifyLocal(before, after, 256, fixture.rect, locks, fixture.transition, operation),
      transitionOracle: operation === 'coast' ? verifyCoastTransition(before, after, 256, fixture.rect, locks, fixture.transition) : null, revision: committed.root.revision, recipe: last });
    await restored(page, id, committed, after); baseline = committed; before = after;
  }
  await info.attach('local-independent-persistence.json', { contentType: 'application/json', body: JSON.stringify({ project: info.project.name, reports, errors, physicalDeviceTest: false }, null, 2) });
  expect(errors).toEqual([]);
});

async function draw(page: Page, cdp: CDPSession, touch: boolean) {
  await button(page, '画大陆'); await button(page, '全图');
  const world = [[900, 900], [2200, 900], [2200, 1300], [1400, 1300], [1400, 1700], [2850, 1700], [2850, 1860], [1400, 1860], [1400, 2600], [900, 2600], [900, 900]];
  const frame = await metrics(page), bounds = await page.getByTestId('atlas-canvas').boundingBox(); if (!bounds) throw new Error('No actual canvas bounds');
  const points = world.map(([x, y]) => ({ x: bounds.x + frame.camera.x + x * frame.camera.scale, y: bounds.y + frame.camera.y + y * frame.camera.scale }));
  const exposed = await page.evaluate(points => points.every(point => document.elementFromPoint(point.x, point.y)?.getAttribute('data-testid') === 'atlas-canvas'), points); expect(exposed).toBe(true);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: XY) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1, radiusX: 3, radiusY: 3, force: 1 }] : [] });
  if (touch) { await send('touchStart', points[0]); for (const point of points.slice(1)) await send('touchMove', point); await send('touchEnd'); }
  else { await page.mouse.move(points[0].x, points[0].y); await page.mouse.down(); for (const point of points.slice(1)) await page.mouse.move(point.x, point.y); await page.mouse.up(); }
}
async function ocean(page: Page) {
  await panel(page, '创世'); await page.getByLabel('生成内容', { exact: true }).selectOption('ocean');
  await fields(page, [['地貌种子', 'PH06-completion-ocean'], ['平均海深', '3600'], ['海底起伏', '1000'], ['陆架宽度', '320']]); await button(page, '预览海床生成');
}
async function runningCancel(page: Page, operation: Observation['operation']) {
  await page.waitForFunction(operation => {
    const record = (window as unknown as ObserverHost).__completionActive, state = document.querySelector('[data-testid="atlas-studio"]')?.getAttribute('data-atlas-state');
    const stages = operation === 'shape' ? /量测手绘轮廓|读取手绘区域|从闭合轮廓生成/ : /读取海床真实|识别世界边界海水|沿真实共享边识别外海/;
    const match = (document.querySelector('.inspector-notice span')?.textContent ?? '').match(/^(.*?) · (\d+)\/(\d+)$/);
    return state === 'busy' && record?.operation === operation && record.finishedAt === null && !!match && stages.test(match[1]) && Number(match[2]) > 0 && Number(match[2]) < Number(match[3]);
  }, operation, { timeout: 15000 });
  await expect(candidate(page)).toHaveCount(0); await button(page, '取消操作'); await ready(page); await expect(candidate(page)).toHaveCount(0);
  await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed'); await expect(page.getByLabel('草稿操作反馈')).toContainText('取消');
}
async function longTaskScenario(page: Page, info: TestInfo, size: '256' | '512') {
  test.setTimeout(360000); const errors = errorsOn(page), id = await create(page, size, `PH06长任务-${size}-${info.project.name}`);
  const cdp = await page.context().newCDPSession(page), baseline = await saved(page, id), database = await databaseDigest(page);
  try {
    for (const operation of ['shape', 'ocean'] as const) {
      const start = () => operation === 'shape' ? draw(page, cdp, info.project.name !== 'desktop-chromium') : ocean(page);
      await start(); await awaitCandidate(page); expect(await saved(page, id)).toEqual(baseline); expect(await databaseDigest(page)).toEqual(database);
      await button(page, '取消生成'); await ready(page); expect(await databaseDigest(page)).toEqual(database);
      await start(); await runningCancel(page, operation); expect(await saved(page, id)).toEqual(baseline); expect(await databaseDigest(page)).toEqual(database);
      expect((await audit(page)).display).toMatchObject({ source: 'committed', revision: 0, manifestDigest: baseline.root.currentManifest });
    }
    const runs = await observations(page); expect(runs).toHaveLength(4);
    for (const operation of ['shape', 'ocean'] as const) {
      const records = runs.filter(run => run.operation === operation); expect(records).toHaveLength(2); expect(records.filter(run => run.cancelRequestedAt !== null)).toHaveLength(1);
      for (const run of records) {
        expect.soft(run.progress250msGate, `${size} ${operation} maximum observed progress gap ${run.maximumGapMs} ms`).toBe(true);
        if (run.cancelRequestedAt !== null) expect.soft(run.cancellation500msGate, `${size} ${operation} actual running cancellation ${run.cancellationResponseMs} ms`).toBe(true);
      }
    }
    const inputs = await page.evaluate(() => (window as unknown as ObserverHost).__completionInputs);
    expect(inputs.length).toBeGreaterThan(20); expect(inputs.every(input => input.trusted)).toBe(true);
    expect(inputs.some(input => input.pointerType === (info.project.name === 'desktop-chromium' ? 'mouse' : 'touch'))).toBe(true);
    await info.attach('long-task-unchanged-database.json', { contentType: 'application/json', body: JSON.stringify({ size, project: info.project.name, baselineRoot: baseline.root, wholeDatabase: database, finalWholeDatabase: await databaseDigest(page), sourceUnchangedAfterBothRunningCancellations: true, errors }, null, 2) });
    expect(errors).toEqual([]);
  } finally { await cdp.detach(); }
}
test('标准256长任务：手绘和海床真实运行中取消，250ms进度与500ms取消保持源库', async ({ page }, info) => { await longTaskScenario(page, info, '256'); });
test('桌面512长任务：手绘和海床真实运行中取消，250ms进度与500ms取消保持源库', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'The existing bound is 512 on desktop; standard 256 runs on all three projects.');
  await longTaskScenario(page, info, '512');
});
