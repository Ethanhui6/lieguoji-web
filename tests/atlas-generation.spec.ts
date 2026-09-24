import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Playwright supplies a fresh, nonpersistent context for every test/project.
// Browser-side inspection is read-only and never imports the game generator.
const studio = (page: Page) => page.getByTestId('atlas-studio');
const ready = (page: Page, state = 'ready') => expect(studio(page)).toHaveAttribute('data-atlas-state', state, { timeout: 90000 });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
const panel = (page: Page, name: '地图' | '创世' | '编辑' | '草稿') => page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();
interface ProgressObservation {
  id: string; operation: string; startedAt: number; trusted: boolean; seenBusy: boolean; finishedAt: number | null;
  finishedState: string | null; cancelRequestedAt: number | null; cancelTrusted: boolean | null;
  samples: { at: number; stage: string; completed: number; total: number }[];
}
const progressObservations = new WeakMap<Page, Map<string, ProgressObservation>>();
test.beforeEach(async ({ page }) => {
  const observations = new Map<string, ProgressObservation>(); progressObservations.set(page, observations);
  await page.exposeFunction('__atlasGenerationObserved', (value: ProgressObservation) => { observations.set(value.id, value); });
  await page.addInitScript(() => {
    const host = window as unknown as { __atlasGenerationActive?: ProgressObservation; __atlasGenerationObserved: (value: ProgressObservation) => Promise<void> };
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('button') : null, text = target?.textContent?.trim();
      if (text === '预览大陆生成' || text === '预览山系与盆地') host.__atlasGenerationActive = {
        id: crypto.randomUUID(), operation: text, startedAt: performance.now(), trusted: event.isTrusted, seenBusy: false,
        finishedAt: null, finishedState: null, cancelRequestedAt: null, cancelTrusted: null, samples: [],
      };
      else if (text === '取消操作' && host.__atlasGenerationActive?.finishedAt === null) {
        host.__atlasGenerationActive.cancelRequestedAt = performance.now(); host.__atlasGenerationActive.cancelTrusted = event.isTrusted;
      }
    }, true);
    const observe = () => {
      const record = host.__atlasGenerationActive; if (!record || record.finishedAt !== null) return;
      const root = document.querySelector('[data-testid="atlas-studio"]'), state = root?.getAttribute('data-atlas-state');
      if (state === 'busy') record.seenBusy = true;
      const text = document.querySelector('.inspector-notice span')?.textContent ?? '', match = text.match(/^(.*?) · (\d+)\/(\d+)$/);
      if (match) {
        const previous = record.samples.at(-1), stage = match[1], completed = Number(match[2]), total = Number(match[3]);
        if (!previous || previous.stage !== stage || previous.completed !== completed || previous.total !== total) record.samples.push({ at: performance.now(), stage, completed, total });
      }
      if (record.seenBusy && state && state !== 'busy' && !match) {
        record.finishedAt = performance.now(); record.finishedState = state; void host.__atlasGenerationObserved(record);
      }
    };
    const attach = () => new MutationObserver(observe).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-atlas-state', 'data-atlas-display'] });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true }); else attach();
  });
});
test.afterEach(async ({ page }, info) => {
  const observations = progressObservations.get(page)!;
  if (!page.isClosed()) {
    const last = await page.evaluate(() => (window as unknown as { __atlasGenerationActive?: ProgressObservation }).__atlasGenerationActive).catch(() => undefined);
    if (last) observations.set(last.id, last);
  }
  const runs = [...observations.values()].map(record => {
    const ticks = [record.startedAt, ...record.samples.map(sample => sample.at), ...(record.finishedAt === null ? [] : [record.finishedAt])];
    const gaps = ticks.slice(1).map((at, index) => at - ticks[index]), maximumGapMs = gaps.length ? Math.max(...gaps) : null;
    const cancellationResponseMs = record.cancelRequestedAt === null || record.finishedAt === null ? null : record.finishedAt - record.cancelRequestedAt;
    return { ...record, maximumGapMs, cancellationResponseMs, progress250msGate: record.finishedAt !== null && record.trusted && record.samples.length > 0 && maximumGapMs !== null && maximumGapMs <= 250,
      cancellation500msGate: cancellationResponseMs === null ? null : record.cancelTrusted === true && record.finishedState === 'ready' && cancellationResponseMs <= 500 };
  });
  await info.attach('generation-progress-response.json', { contentType: 'application/json', body: JSON.stringify({ measurement: 'Observed product DOM progress from trusted preview click through ready/fatal, including first and final gaps; cancellation ends when UI is ready. Independent of functional test timeout; no frame/per-device performance claim.', project: info.project.name, runs }, null, 2) });
});
interface SavedManifest {
  version: number; revision: number; atlasId: string; seed: string;
  spec: { columns: number; rows: number };
  blockRefs: { key: string; hash: string }[];
  origin?: { sourceFormat: number; sourceDraftId: string; sourceSlot: string; sourceManifestDigest: string; sourceManifestRevision: number; observedRootDigest: string } | null;
  generation?: { lastApplied: { recipe: { generator: { id: string; version: number; fingerprint: string }; seed: string; parameters: Record<string, number> }; appliedRevision: number } | null };
}
interface SavedSnapshot {
  rootBytes: number[]; manifestBytes: number[]; backupBytes: number[] | null;
  root: { revision: number; domain: string; rootDigest: string; currentManifest: string; backupManifest: string | null };
  manifest: SavedManifest; backup: SavedManifest | null;
}
async function saved(page: Page, id: string, format: 1 | 2): Promise<SavedSnapshot> {
  return page.evaluate(({ draftId, format }) => new Promise<SavedSnapshot>((resolve, reject) => {
    const request = indexedDB.open(`lieguoji-atlas-drafts-v${format}`, 1);
    request.onupgradeneeded = () => request.transaction!.abort();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['roots', 'manifests'], 'readonly'); let result: SavedSnapshot;
      const rootRequest = tx.objectStore('roots').get(draftId);
      rootRequest.onsuccess = () => {
        try {
          if (!(rootRequest.result instanceof Uint8Array)) throw new Error('Missing saved root bytes');
          const root = JSON.parse(new TextDecoder().decode(rootRequest.result)) as SavedSnapshot['root'];
          result = { root, rootBytes: [...rootRequest.result], manifestBytes: [], backupBytes: null, manifest: {} as SavedManifest, backup: null };
          const current = tx.objectStore('manifests').get(root.currentManifest);
          current.onsuccess = () => {
            if (!(current.result?.bytes instanceof Uint8Array)) { tx.abort(); return; }
            result.manifestBytes = [...current.result.bytes]; result.manifest = JSON.parse(new TextDecoder().decode(current.result.bytes));
          };
          if (root.backupManifest) {
            const backup = tx.objectStore('manifests').get(root.backupManifest);
            backup.onsuccess = () => {
              if (!(backup.result?.bytes instanceof Uint8Array)) { tx.abort(); return; }
              result.backupBytes = [...backup.result.bytes]; result.backup = JSON.parse(new TextDecoder().decode(backup.result.bytes));
            };
          }
        } catch (error) { reject(error); tx.abort(); }
      };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Read-only snapshot failed')); };
    };
  }), { draftId: id, format });
}
async function legacyDatabaseDigest(page: Page) {
  return page.evaluate(async () => {
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const request = indexedDB.open('lieguoji-atlas-drafts-v1', 1);
      request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, names = [...db.objectStoreNames].sort(), tx = db.transaction(names, 'readonly');
        const rows: { store: string; keys?: IDBValidKey[]; values?: unknown[] }[] = names.map(store => ({ store }));
        for (const row of rows) {
          const store = tx.objectStore(row.store), keys = store.getAllKeys(), values = store.getAll();
          keys.onsuccess = () => { row.keys = keys.result; }; values.onsuccess = () => { row.values = values.result; };
        }
        tx.oncomplete = () => { db.close(); resolve(rows); }; tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
    const bytes = new TextEncoder().encode(JSON.stringify(records, (_key, value) => value instanceof Uint8Array ? [...value] : value));
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    return { bytes: bytes.length, sha256: hash };
  });
}
async function savedTopography(page: Page, manifest: SavedManifest) {
  // Read and independently decode the documented LGAB fixed-width elevation
  // column. No game code or private Worker candidate is imported by the test.
  return page.evaluate(async ({ refs, columns, rows }) => {
    const records = await new Promise<{ key: string; expectedHash: string; bytes: Uint8Array }[]>((resolve, reject) => {
      const request = indexedDB.open('lieguoji-atlas-drafts-v2', 1);
      request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('blocks', 'readonly'), entries: { key: string; expectedHash: string; bytes: Uint8Array }[] = [];
        for (const ref of refs) {
          const read = tx.objectStore('blocks').get(ref.hash);
          read.onsuccess = () => { if (!(read.result?.bytes instanceof Uint8Array)) tx.abort(); else entries.push({ key: ref.key, expectedHash: ref.hash, bytes: read.result.bytes }); };
        }
        tx.oncomplete = () => { db.close(); resolve(entries); }; tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing elevation record')); };
      };
    });
    const hash = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(value => value.toString(16).padStart(2, '0')).join('');
    const heights = new Int32Array(columns * rows), seen = new Uint8Array(heights.length), land = new Uint8Array(heights.length);
    for (const { key, expectedHash, bytes } of records) {
      if (await hash(bytes) !== expectedHash) throw new Error('Persisted elevation hash mismatch');
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), [, bx, by] = key.split(':').map(Number);
      if (bytes.length !== 4124 || [76, 71, 65, 66].some((value, i) => bytes[i] !== value)
        || view.getUint16(4, true) !== 1 || bytes[6] !== 1 || bytes[7] !== 1 || view.getUint16(8, true) !== bx || view.getUint16(10, true) !== by
        || view.getUint32(12, true) !== 0 || view.getUint32(16, true) !== 2 || view.getUint32(20, true) !== 1024 || view.getUint32(24, true) !== 4096) throw new Error('Invalid LGAB elevation fixture');
      for (let slot = 0; slot < 1024; slot++) {
        const id = (by * 32 + Math.floor(slot / 32)) * columns + bx * 32 + slot % 32;
        if (id >= heights.length || seen[id]) throw new Error('Duplicate/outside real cell');
        heights[id] = view.getInt32(28 + slot * 4, true); seen[id] = 1; land[id] = heights[id] >= 0 ? 1 : 0;
      }
    }
    if (seen.some(value => value !== 1)) throw new Error('Incomplete real elevation coverage');
    return { heights: [...heights], landSha256: await hash(land), cellCount: heights.length };
  }, { refs: manifest.blockRefs.filter(ref => ref.key.startsWith('elevation:')), columns: manifest.spec.columns, rows: manifest.spec.rows });
}
interface Audit {
  ok: boolean; manifestDigest: string; draftId: string; revision: number; verifiedBlocks: number;
  display: { source: string; manifestDigest: string; revision: number; version: number; verifiedBlocks: number };
}
async function audit(page: Page): Promise<Audit> {
  return page.getByTestId('atlas-canvas').evaluate(element => new Promise<Audit>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { element.removeEventListener('atlas-audit-response', listener); reject(new Error('No read-only map audit')); }, 30000);
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail; if (detail.requestId !== requestId) return;
      clearTimeout(timer); element.removeEventListener('atlas-audit-response', listener);
      if (!detail.ok) reject(new Error(detail.error ?? 'Map audit rejected')); else resolve(detail);
    };
    element.addEventListener('atlas-audit-response', listener); element.dispatchEvent(new CustomEvent('atlas-audit-request', { detail: { requestId } }));
  }));
}
async function displayMetrics(page: Page) {
  return page.getByTestId('atlas-canvas').evaluate(element => new Promise<{ acceptedRevision: number; committedRevision: number; displayRevision: number; displaySource: string; displayVersion: number; displayCorrectFrameAt: number }>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { element.removeEventListener('atlas-metrics-response', listener); reject(new Error('No display metrics')); }, 10000);
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail; if (detail.requestId !== requestId) return;
      clearTimeout(timer); element.removeEventListener('atlas-metrics-response', listener); resolve(detail.metrics);
    };
    element.addEventListener('atlas-metrics-response', listener); element.dispatchEvent(new CustomEvent('atlas-metrics-request', { detail: { requestId } }));
  }));
}
async function create(page: Page, format: 1 | 2, name: string, size = '256') {
  await page.goto(format === 2 ? '/?atlas=new&atlas-format=2' : '/?atlas=new'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill(name);
  await page.getByLabel('大世界生成种子', { exact: true }).fill('PH06-browser-shared-geometry');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption(size); await button(page, '新建空白海洋草稿'); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-format', String(format));
  return (await studio(page).getAttribute('data-atlas-id'))!;
}
async function locate(page: Page, cell = 32896) {
  await panel(page, '编辑'); await page.getByLabel('定位地块编号', { exact: true }).fill(String(cell)); await button(page, '定位');
  await expect(studio(page)).toHaveAttribute('data-selectedcell', String(cell));
}
async function configureMacro(page: Page, continents = '6', coverage = '650') {
  await panel(page, '创世');
  await page.getByLabel('生成内容', { exact: true }).selectOption('macro');
  for (const [label, value] of [['地貌种子', '山海-72'], ['大陆数量', continents], ['陆地比例', coverage], ['海岸变化尺度', '384'], ['内陆起伏', '2600']]) await page.getByLabel(label, { exact: true }).fill(value);
}
async function cancelActiveGeneration(page: Page) {
  await configureMacro(page); await button(page, '预览大陆生成');
  await page.waitForFunction(() => {
    const observation = (window as unknown as { __atlasGenerationActive?: ProgressObservation }).__atlasGenerationActive;
    // A brief first phase can be coalesced by React. Require an actually
    // observed generation phase while the operation is still busy, rather
    // than waiting forever for that one exact phase after work has finished.
    return observation?.finishedAt === null && document.querySelector('[data-testid="atlas-studio"]')?.getAttribute('data-atlas-state') === 'busy'
      && observation.samples.some(sample => /真实共享地理|连续分枝|真实面积连通生成大陆|实际共享岸线|连续陆地与海底岸距|各大陆连续高程|私有连续高程候选|独立核验实际面积|独立遍历陆地|独立核验全部海陆/.test(sample.stage));
  }, undefined, { timeout: 15000 });
  await page.getByRole('button', { name: '取消操作', exact: true }).filter({ visible: true }).click({ timeout: 5000 });
  await ready(page); await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed');
  await expect(page.getByRole('region', { name: '大陆生成预览' })).toHaveCount(0);
}
async function preview(page: Page, continents = '6', coverage = '650') {
  await configureMacro(page, continents, coverage);
  await button(page, '预览大陆生成'); await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 90000 }); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-display', 'generation-preview');
  await expect(page.getByRole('region', { name: '大陆生成预览' })).toContainText(`${continents} 个大陆`);
}
async function localHeight(page: Page, value: number, revision: number, cell = 32896) {
  await locate(page, cell); await button(page, '高程'); await page.getByLabel('目标高程（米）', { exact: true }).fill(String(value));
  await page.getByLabel('高程编辑范围', { exact: true }).selectOption('1'); await button(page, '预览地理编辑');
  await expect(page.getByRole('region', { name: '地理编辑预览' })).toHaveAttribute('data-atlas-preview-cells', '1'); await ready(page);
  await button(page, '确认地理编辑'); await ready(page); await expect(studio(page)).toHaveAttribute('data-atlas-revision', String(revision));
  await expect(page.getByTestId('atlas-selected-height')).toHaveText(`${value} 米`);
}
async function mapScreenshot(page: Page, info: TestInfo, name: string) {
  await panel(page, '地图'); await button(page, '全图'); await page.screenshot({ path: info.outputPath(name), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('65k创世：真实候选、取消、确认保存、局部编辑与混合撤销均保持正确持久边界', async ({ page }, info) => {
  test.setTimeout(240000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const id = await create(page, 2, '山海创世验收'), before = await saved(page, id, 2), initialUrl = page.url();
  expect(before.root).toMatchObject({ revision: 0, domain: 'atlas-draft-v2', backupManifest: null });
  await locate(page); await expect(page.getByTestId('atlas-selected-height')).toHaveText('-100 米');
  await cancelActiveGeneration(page); expect(await saved(page, id, 2)).toEqual(before); expect(page.url()).toBe(initialUrl);
  await preview(page);
  const candidate = await audit(page), metrics = await displayMetrics(page);
  expect(candidate).toMatchObject({ ok: true, draftId: id, revision: 0, manifestDigest: before.root.currentManifest, verifiedBlocks: 256,
    display: { source: 'generation-preview', revision: 1, version: 2, verifiedBlocks: 256 } });
  expect(candidate.display.manifestDigest).not.toBe(before.root.currentManifest);
  expect(metrics).toMatchObject({ acceptedRevision: 0, committedRevision: 0, displayRevision: 1, displayVersion: 2, displaySource: 'generation-preview' });
  expect(metrics.displayCorrectFrameAt).toBeGreaterThan(0);
  expect(await saved(page, id, 2)).toEqual(before); expect(page.url()).toBe(initialUrl);
  await expect(studio(page)).toHaveAttribute('data-atlas-revision', '0'); await expect(studio(page)).toHaveAttribute('data-atlas-hash', before.root.currentManifest);
  await expect(page.getByRole('button', { name: '撤销大世界编辑' })).toBeDisabled();
  await mapScreenshot(page, info, 'generation-candidate-full-map.png');
  const canvasBounds = (await page.getByTestId('atlas-canvas').boundingBox())!;
  const pickPoint = { x: canvasBounds.x + canvasBounds.width * .5, y: canvasBounds.y + canvasBounds.height * .38 };
  if (info.project.name === 'desktop-chromium') await page.mouse.click(pickPoint.x, pickPoint.y);
  else await page.touchscreen.tap(pickPoint.x, pickPoint.y);
  await expect(page.getByRole('region', { name: '大陆生成预览' })).toContainText(/选中地块 #\d+：-?\d+ 米/);
  const candidatePick = (await page.getByRole('region', { name: '大陆生成预览' }).innerText()).match(/选中地块 #(\d+)：(-?\d+) 米/)!.slice(1).map(Number);
  expect(candidatePick[0]).toBeGreaterThanOrEqual(0); expect(candidatePick[0]).toBeLessThan(65536);
  expect(candidatePick[1]).toBeGreaterThanOrEqual(-3000); expect(candidatePick[1]).toBeLessThanOrEqual(2600);
  expect(await saved(page, id, 2)).toEqual(before);
  await panel(page, '创世'); await button(page, '取消生成'); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed'); expect(await saved(page, id, 2)).toEqual(before); expect(page.url()).toBe(initialUrl);
  expect((await audit(page)).display).toMatchObject({ source: 'committed', revision: 0, manifestDigest: before.root.currentManifest });
  await page.reload(); await ready(page); expect(await saved(page, id, 2)).toEqual(before);

  await preview(page); const secondCandidate = await audit(page); expect(secondCandidate.display.manifestDigest).toBe(candidate.display.manifestDigest);
  await button(page, '确认生成并保存'); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-revision', '1'); await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed');
  const generated = await saved(page, id, 2);
  expect(generated.root.currentManifest).toBe(secondCandidate.display.manifestDigest); expect(generated.root.backupManifest).toBe(before.root.currentManifest);
  expect(generated.manifest).toMatchObject({ version: 2, revision: 1, seed: before.manifest.seed,
    generation: { lastApplied: { appliedRevision: 1, recipe: { seed: '山海-72', parameters: { majorContinents: 6, landCoveragePermille: 650, coastWavelengthWorld: 384, reliefMeters: 2600 } } } } });
  const confirmed = await audit(page); expect(confirmed).toMatchObject({ revision: 1, manifestDigest: generated.root.currentManifest, display: { source: 'committed', revision: 1, manifestDigest: generated.root.currentManifest } });
  await locate(page); const generatedHeight = await page.getByTestId('atlas-selected-height').innerText();
  await mapScreenshot(page, info, 'generation-confirmed-full-map.png');
  // Keep the original session's mixed undo stack while independently proving
  // the generated map survives a new document and then a real refresh.
  const reopened = await page.context().newPage();
  try {
    await reopened.goto(page.url()); await ready(reopened); await reopened.reload(); await ready(reopened); await locate(reopened);
    await expect(reopened.getByTestId('atlas-selected-height')).toHaveText(generatedHeight); expect(await saved(reopened, id, 2)).toEqual(generated);
    expect((await audit(reopened)).display.manifestDigest).toBe(generated.root.currentManifest);
  } finally { await reopened.close(); }
  await localHeight(page, 4321, 2); await button(page, '撤销大世界编辑'); await ready(page);
  await expect(studio(page)).toHaveAttribute('data-atlas-revision', '3'); await expect(page.getByTestId('atlas-selected-height')).toHaveText(generatedHeight);
  expect((await saved(page, id, 2)).manifest.blockRefs).toEqual(generated.manifest.blockRefs);
  await button(page, '撤销大世界编辑'); await ready(page); await expect(studio(page)).toHaveAttribute('data-atlas-revision', '4');
  await expect(page.getByTestId('atlas-selected-height')).toHaveText('-100 米');
  const undone = await saved(page, id, 2); expect(undone.manifest.blockRefs).toEqual(before.manifest.blockRefs); expect(undone.manifest.generation?.lastApplied).toBeNull();
  await page.reload(); await ready(page); await locate(page); await expect(page.getByTestId('atlas-selected-height')).toHaveText('-100 米');
  expect(await saved(page, id, 2)).toEqual(undone); expect((await audit(page)).revision).toBe(4);
  await info.attach('generation-boundaries.json', { contentType: 'application/json', body: JSON.stringify({ candidate, metrics, candidatePick, confirmed, generatedHeight, undoRevision: 4, limitations: 'Mobile/tablet projects are emulation; screenshots require separate human visual acceptance.' }, null, 2) });
  expect(errors).toEqual([]);
});

test('山系盆地：预览不写根，真实抬升降低保留全部海岸和几何，确认刷新后可撤销', async ({ page }, info) => {
  test.setTimeout(300000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const id = await create(page, 2, '山河地貌验收'); await preview(page); await button(page, '确认生成并保存'); await ready(page);
  const macro = await saved(page, id, 2), baseline = await savedTopography(page, macro.manifest), url = page.url();
  const buildResponse = await page.request.get('/build.json'); expect(buildResponse.ok()).toBe(true);
  const build = await buildResponse.json() as { macroGenerator: { sha256: string }; landformGenerator: { sha256: string } };
  expect(macro.manifest.generation?.lastApplied?.recipe.generator.id).toBe('macro-landmass');
  expect(macro.manifest.generation?.lastApplied?.recipe.generator.fingerprint).toBe(build.macroGenerator.sha256);
  const previewLandforms = async () => {
    await panel(page, '创世'); await page.getByLabel('生成内容', { exact: true }).selectOption('landforms');
    for (const [label, value] of [['地貌种子', '高山与低谷-18'], ['山系数量', '3'], ['盆地数量', '2'], ['内陆起伏', '4200']]) await page.getByLabel(label, { exact: true }).fill(value);
    await button(page, '预览山系与盆地'); await ready(page);
    await expect(page.getByRole('region', { name: '大陆生成预览' })).toContainText('实际形成 3 条山系、2 处盆地', { timeout: 90000 });
    await expect(studio(page)).toHaveAttribute('data-atlas-display', 'generation-preview');
    return audit(page);
  };
  const first = await previewLandforms();
  expect(first).toMatchObject({ revision: 1, manifestDigest: macro.root.currentManifest, display: { source: 'generation-preview', revision: 2, verifiedBlocks: 256 } });
  expect(first.display.manifestDigest).not.toBe(macro.root.currentManifest); expect(await saved(page, id, 2)).toEqual(macro); expect(page.url()).toBe(url);
  await mapScreenshot(page, info, 'landforms-candidate-full-map.png');
  // Select dispersed real land cells through the UI until an actual changed
  // height is observed. The near image therefore shows a real candidate change.
  const landCells = baseline.heights.flatMap((height, cell) => height >= 0 ? [cell] : []);
  let candidatePick: { cell: number; before: number; candidate: number } | undefined;
  for (let sample = 0; sample < 64; sample++) {
    const cell = landCells[Math.floor(sample * landCells.length / 64)]; await locate(page, cell);
    const candidate = Number((await page.getByTestId('atlas-selected-height').innerText()).replace(' 米', ''));
    if (candidate !== baseline.heights[cell]) { candidatePick = { cell, before: baseline.heights[cell], candidate }; break; }
  }
  expect(candidatePick, 'A real changed candidate land cell must be visible').toBeDefined();
  await panel(page, '地图'); await page.screenshot({ path: info.outputPath('landforms-candidate-near-map.png'), fullPage: true });
  await panel(page, '创世'); await button(page, '取消生成'); await ready(page);
  expect(await saved(page, id, 2)).toEqual(macro); expect(page.url()).toBe(url); expect((await audit(page)).display.manifestDigest).toBe(macro.root.currentManifest);
  const second = await previewLandforms(); expect(second.display.manifestDigest).toBe(first.display.manifestDigest);
  await button(page, '确认生成并保存'); await ready(page);
  const forms = await saved(page, id, 2), changed = await savedTopography(page, forms.manifest);
  expect(forms.root).toMatchObject({ revision: 2, currentManifest: first.display.manifestDigest, backupManifest: macro.root.currentManifest });
  expect(forms.manifest.generation?.lastApplied).toMatchObject({ appliedRevision: 2, recipe: { generator: { id: 'landforms', version: 1 }, seed: '高山与低谷-18', parameters: { mountainRanges: 3, basins: 2, reliefMeters: 4200 } } });
  expect(forms.manifest.generation?.lastApplied?.recipe.generator.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(forms.manifest.generation?.lastApplied?.recipe.generator.fingerprint).toBe(build.landformGenerator.sha256);
  expect(build.landformGenerator.sha256).not.toBe(build.macroGenerator.sha256);
  expect(changed.cellCount).toBe(65536); expect(changed.landSha256).toBe(baseline.landSha256);
  expect(forms.manifest.blockRefs.filter(ref => !ref.key.startsWith('elevation:'))).toEqual(macro.manifest.blockRefs.filter(ref => !ref.key.startsWith('elevation:')));
  let raised = 0, lowered = 0, oceanChanged = 0, maximumRise = 0, focus = -1;
  for (let cell = 0; cell < changed.heights.length; cell++) {
    const difference = changed.heights[cell] - baseline.heights[cell];
    if (difference > 0) raised++; if (difference < 0) lowered++; if (baseline.heights[cell] < 0 && difference) oceanChanged++;
    if (difference > maximumRise) { maximumRise = difference; focus = cell; }
  }
  expect(raised).toBeGreaterThan(0); expect(lowered).toBeGreaterThan(0); expect(oceanChanged).toBe(0);
  expect(changed.heights[candidatePick!.cell]).toBe(candidatePick!.candidate);
  await mapScreenshot(page, info, 'landforms-confirmed-full-map.png'); await locate(page, focus);
  await expect(page.getByTestId('atlas-selected-height')).toHaveText(`${changed.heights[focus]} 米`);
  await panel(page, '地图'); await page.screenshot({ path: info.outputPath('landforms-confirmed-near-map.png'), fullPage: true });
  const reopened = await page.context().newPage();
  try {
    await reopened.goto(url); await ready(reopened); await reopened.reload(); await ready(reopened);
    expect(await saved(reopened, id, 2)).toEqual(forms); expect((await savedTopography(reopened, forms.manifest)).landSha256).toBe(baseline.landSha256);
    expect((await audit(reopened)).display).toMatchObject({ source: 'committed', revision: 2, manifestDigest: forms.root.currentManifest });
  } finally { await reopened.close(); }
  await panel(page, '编辑'); await button(page, '撤销大世界编辑'); await ready(page);
  const undone = await saved(page, id, 2); expect(undone.root.revision).toBe(3); expect(undone.manifest.blockRefs).toEqual(macro.manifest.blockRefs);
  expect(undone.manifest.generation?.lastApplied?.recipe).toEqual(macro.manifest.generation?.lastApplied?.recipe);
  await page.reload(); await ready(page); expect(await saved(page, id, 2)).toEqual(undone); expect((await audit(page)).display.manifestDigest).toBe(undone.root.currentManifest);
  await info.attach('landform-boundaries.json', { contentType: 'application/json', body: JSON.stringify({ first, second, candidatePick, raised, lowered, oceanChanged, sameSeaLandSha256: changed.landSha256, focus, maximumRise, undoRevision: undone.root.revision }, null, 2) });
  expect(errors).toEqual([]);
});

for (const size of ['128', '512']) test(`真实 ${size} 网格创世预览、确认和刷新`, async ({ page }, info) => {
  test.setTimeout(size === '512' ? 360000 : 240000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const id = await create(page, 2, `${size} 地理创世验收`, size), before = await saved(page, id, 2), blocks = 4 * (Number(size) / 32) ** 2;
  await cancelActiveGeneration(page); expect(await saved(page, id, 2)).toEqual(before);
  await preview(page); const candidate = await audit(page);
  expect(candidate).toMatchObject({ revision: 0, verifiedBlocks: blocks, manifestDigest: before.root.currentManifest, display: { source: 'generation-preview', revision: 1, verifiedBlocks: blocks } });
  expect(await saved(page, id, 2)).toEqual(before); await mapScreenshot(page, info, `generation-${size}-candidate-full-map.png`);
  await panel(page, '创世'); await button(page, '确认生成并保存'); await ready(page);
  const generated = await saved(page, id, 2); expect(generated.root).toMatchObject({ revision: 1, currentManifest: candidate.display.manifestDigest });
  expect(generated.manifest.spec).toMatchObject({ columns: Number(size), rows: Number(size) });
  await page.reload(); await ready(page); expect(await saved(page, id, 2)).toEqual(generated);
  expect((await audit(page)).display).toMatchObject({ source: 'committed', revision: 1, verifiedBlocks: blocks, manifestDigest: generated.root.currentManifest });
  await mapScreenshot(page, info, `generation-${size}-restored-full-map.png`); expect(errors).toEqual([]);
});

test('未知atlas-format拒绝启动草稿线程或写入任意Atlas保存空间', async ({ page }) => {
  const workers: string[] = []; page.on('worker', worker => workers.push(worker.url()));
  await page.goto('/?atlas=new&atlas-format=999'); await ready(page, 'fatal');
  await expect(page.getByRole('alert')).toContainText('未知草稿格式'); await expect(studio(page)).toHaveAttribute('data-atlas-id', '');
  await expect(studio(page)).toHaveAttribute('data-atlas-format', 'unknown'); await expect(page.getByTestId('atlas-canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新建空白海洋草稿', exact: true })).toBeDisabled();
  expect(new URL(page.url()).searchParams.get('atlas-format')).toBe('999'); expect(workers).toEqual([]);
  expect(await page.evaluate(async () => (await indexedDB.databases()).filter(db => db.name?.startsWith('lieguoji-atlas-drafts-')))).toEqual([]);
});

test('旧版备份明确复制到创世空间，生成与刷新不改原库任何记录', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const sourceId = await create(page, 1, '旧版固定时点', '128'); await localHeight(page, 240, 1, 8256);
  const source = await saved(page, sourceId, 1); expect(source.backup?.revision).toBe(0);
  await panel(page, '草稿'); await button(page, '查看备份 旧版固定时点');
  await page.getByRole('alertdialog').getByRole('button', { name: '读取只读备份', exact: true }).click(); await ready(page, 'readonly');
  await expect(studio(page)).toHaveAttribute('data-atlas-revision', '0'); await locate(page, 8256); await expect(page.getByTestId('atlas-selected-height')).toHaveText('-100 米');
  const sourceDatabase = await legacyDatabaseDigest(page);
  await panel(page, '创世'); await button(page, '创建创世副本');
  await page.getByRole('alertdialog').getByRole('button', { name: '创建创世副本', exact: true }).click(); await ready(page);
  const copyId = (await studio(page).getAttribute('data-atlas-id'))!; expect(copyId).not.toBe(sourceId);
  await expect(studio(page)).toHaveAttribute('data-atlas-format', '2'); await expect(studio(page)).toHaveAttribute('data-atlas-revision', '0');
  expect(new URL(page.url()).searchParams.get('atlas-format')).toBe('2'); expect(new URL(page.url()).searchParams.has('atlas-source')).toBe(false);
  const copied = await saved(page, copyId, 2);
  expect(copied.manifest.origin).toMatchObject({ sourceFormat: 1, sourceDraftId: sourceId, sourceSlot: 'backup', sourceManifestDigest: source.root.backupManifest, sourceManifestRevision: 0, observedRootDigest: source.root.rootDigest });
  expect(copied.manifest.blockRefs).toEqual(source.backup!.blockRefs); expect(copied.manifest.atlasId).toBe(source.manifest.atlasId);
  expect(await legacyDatabaseDigest(page)).toEqual(sourceDatabase);
  await preview(page, '3', '450'); await button(page, '确认生成并保存'); await ready(page);
  const committed = await saved(page, copyId, 2); expect(committed.root.revision).toBe(1);
  await page.reload(); await ready(page); expect(await saved(page, copyId, 2)).toEqual(committed);
  expect((await audit(page)).display).toMatchObject({ source: 'committed', version: 2, revision: 1, manifestDigest: committed.root.currentManifest });
  expect(await saved(page, sourceId, 1)).toEqual(source); expect(await legacyDatabaseDigest(page)).toEqual(sourceDatabase);
  await mapScreenshot(page, info, 'generation-from-legacy-backup.png');
  await info.attach('legacy-copy-boundary.json', { contentType: 'application/json', body: JSON.stringify({ origin: copied.manifest.origin, preservedLegacyDatabase: sourceDatabase, restoredCopyRevision: committed.root.revision }, null, 2) });
  expect(errors).toEqual([]);
});
