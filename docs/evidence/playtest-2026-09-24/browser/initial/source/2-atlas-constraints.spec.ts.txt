import { expect, test, type Page } from '@playwright/test';

// The same product scenario runs in the configured desktop, mobile and tablet
// browser projects. All writes use visible controls; IndexedDB is read-only.
// Mobile/tablet emulation is not physical-device acceptance.
const studio = (page: Page) => page.getByTestId('atlas-studio');
const ready = (page: Page, state = 'ready') => expect(studio(page)).toHaveAttribute('data-atlas-state', state, { timeout: 90000 });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
const panel = (page: Page, name: '地图' | '创世' | '编辑') => page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();
const rectangle = { column: 31, row: 30, columns: 12, rows: 9 };
interface Manifest {
  version: number; revision: number; spec: { columns: number; rows: number };
  blockRefs: { key: string; hash: string }[];
  constraints: { lockRefs: { bx: number; by: number; hash: string }[] };
  generation: { lastApplied: { recipe: { generator: { id: string } }; appliedRevision: number } | null };
}
interface Saved {
  rootBytes: number[]; manifestBytes: number[];
  root: { domain: string; revision: number; rootDigest: string; currentManifest: string; backupManifest: string | null };
  manifest: Manifest; geographyHashes: Record<string, string>; masks: number[];
}
interface StoredRead {
  rootBytes: Uint8Array; manifestBytes: Uint8Array; root: Saved['root']; manifest: Manifest;
  records: { key: string; hash: string; kind: string; bytes: Uint8Array }[];
}
async function saved(page: Page, draftId: string): Promise<Saved> {
  return page.evaluate(async id => {
    const read = await new Promise<StoredRead>((resolve, reject) => {
      const request = indexedDB.open('lieguoji-atlas-drafts-v2', 1);
      request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['roots', 'manifests', 'blocks'], 'readonly'); let result: StoredRead;
        const root = tx.objectStore('roots').get(id);
        root.onsuccess = () => {
          if (!(root.result instanceof Uint8Array)) { tx.abort(); return; }
          const parsed = JSON.parse(new TextDecoder().decode(root.result)) as Saved['root'], manifest = tx.objectStore('manifests').get(parsed.currentManifest);
          manifest.onsuccess = () => {
            if (!(manifest.result?.bytes instanceof Uint8Array)) { tx.abort(); return; }
            const value = JSON.parse(new TextDecoder().decode(manifest.result.bytes)) as Manifest;
            result = { rootBytes: root.result, manifestBytes: manifest.result.bytes, root: parsed, manifest: value, records: [] };
            const refs = [...value.blockRefs.map(ref => ({ ...ref, kind: 'block' })), ...value.constraints.lockRefs.map(ref => ({ key: `lock:${ref.bx}:${ref.by}`, hash: ref.hash, kind: 'lock' }))];
            for (const ref of refs) {
              const record = tx.objectStore('blocks').get(ref.hash);
              record.onsuccess = () => {
                if (!(record.result?.bytes instanceof Uint8Array) || record.result.domain !== 'atlas-draft-v2' || record.result.kind !== ref.kind || record.result.digest !== ref.hash) { tx.abort(); return; }
                result.records.push({ ...ref, bytes: record.result.bytes });
              };
            }
          };
        };
        tx.oncomplete = () => { db.close(); resolve(result); }; tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Read-only saved constraints snapshot failed')); };
      };
    });
    const sha256 = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(value => value.toString(16).padStart(2, '0')).join('');
    if (await sha256(read.manifestBytes) !== read.root.currentManifest) throw new Error('Actual saved manifest SHA mismatch');
    const masks = new Uint8Array(read.manifest.spec.columns * read.manifest.spec.rows), geographyHashes: Record<string, string> = {}, seen = new Set<string>();
    for (const record of read.records) {
      const hash = await sha256(record.bytes); if (hash !== record.hash || seen.has(record.key)) throw new Error('Actual saved content SHA/identity mismatch'); seen.add(record.key);
      if (record.kind === 'block') { geographyHashes[record.key] = hash; continue; }
      const view = new DataView(record.bytes.buffer, record.bytes.byteOffset, record.bytes.byteLength), [, bx, by] = record.key.split(':').map(Number);
      if (record.bytes.length !== 1040 || [76, 71, 65, 76].some((value, i) => record.bytes[i] !== value) || view.getUint16(4, true) !== 1
        || view.getUint16(6, true) !== bx || view.getUint16(8, true) !== by || view.getUint16(10, true) !== 1024 || view.getUint32(12, true) !== 0
        || bx < 0 || by < 0 || bx >= read.manifest.spec.columns / 32 || by >= read.manifest.spec.rows / 32) throw new Error('Invalid independent LGAL lock encoding');
      let nonzero = false;
      for (let slot = 0; slot < 1024; slot++) {
        const flag = record.bytes[16 + slot]; if (flag & ~3) throw new Error('Unknown lock bit'); nonzero ||= flag !== 0;
        masks[(by * 32 + Math.floor(slot / 32)) * read.manifest.spec.columns + bx * 32 + slot % 32] = flag;
      }
      if (!nonzero) throw new Error('Empty lock block was not removed');
    }
    for (const layer of ['geometry', 'elevation', 'sim-membership', 'admin-membership']) for (let by = 0; by < read.manifest.spec.rows / 32; by++) for (let bx = 0; bx < read.manifest.spec.columns / 32; bx++) if (!seen.has(`${layer}:${bx}:${by}`)) throw new Error('Incomplete persisted geography');
    return { rootBytes: [...read.rootBytes], manifestBytes: [...read.manifestBytes], root: read.root, manifest: read.manifest, geographyHashes, masks: [...masks] };
  }, draftId);
}
function expectMask(snapshot: Saved, value: number) {
  const size = snapshot.manifest.spec.columns;
  expect(snapshot.masks).toEqual(Array.from({ length: size * snapshot.manifest.spec.rows }, (_, id) => {
    const x = id % size, y = Math.floor(id / size);
    return x >= rectangle.column && x < rectangle.column + rectangle.columns && y >= rectangle.row && y < rectangle.row + rectangle.rows ? value : 0;
  }));
}
async function configureLocks(page: Page, mask: string, action: string) {
  await panel(page, '创世'); await page.getByLabel('显示区域锁选区', { exact: true }).check();
  for (const [label, value] of [['选区起始列', rectangle.column], ['选区起始行', rectangle.row], ['选区宽度', rectangle.columns], ['选区高度', rectangle.rows]] as const) await page.getByLabel(label, { exact: true }).fill(String(value));
  await page.getByLabel('区域锁保护内容', { exact: true }).selectOption(mask); await page.getByLabel('区域锁操作', { exact: true }).selectOption(action);
}
async function previewLocks(page: Page) {
  await button(page, '预览区域锁修改'); await expect(page.getByRole('region', { name: '区域锁修改预览' })).toContainText('实际改变 108 个地块', { timeout: 90000 });
  await ready(page); await expect(studio(page)).toHaveAttribute('data-atlas-display', 'constraints-preview');
}
async function commitLocks(page: Page) { await button(page, '确认区域锁并保存'); await ready(page); await expect(studio(page)).toHaveAttribute('data-atlas-display', 'committed'); }

test('区域锁：真实大陆上的取消、保存、单bit解除、混合撤销与刷新恢复', async ({ page }, info) => {
  test.setTimeout(240000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?atlas=new&atlas-format=2'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill(`PH06区域锁-${info.project.name}`); await page.getByLabel('大世界生成种子', { exact: true }).fill('PH06-constraints-browser-grid');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128'); await button(page, '新建空白海洋草稿'); await ready(page);
  const id = (await studio(page).getAttribute('data-atlas-id'))!; expect(id).toMatch(/^atlas-/);
  await panel(page, '创世'); await page.getByLabel('生成内容', { exact: true }).selectOption('macro');
  for (const [label, value] of [['地貌种子', '山海-72'], ['大陆数量', '3'], ['陆地比例', '450'], ['海岸变化尺度', '384'], ['内陆起伏', '2600']]) await page.getByLabel(label, { exact: true }).fill(value);
  await button(page, '预览大陆生成'); await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 90000 }); await ready(page);
  await button(page, '确认生成并保存'); await ready(page); const macro = await saved(page, id); expect(macro.manifest.generation.lastApplied!.recipe.generator.id).toBe('macro-landmass');

  // One genuine local patch precedes the whole-lock entries, so undo must
  // retain and eventually restore the earlier patch history as well.
  await panel(page, '编辑'); await page.getByLabel('定位地块编号', { exact: true }).fill('0'); await button(page, '定位'); await button(page, '高程');
  await page.getByLabel('目标高程（米）', { exact: true }).fill('321'); await page.getByLabel('高程编辑范围', { exact: true }).selectOption('1'); await button(page, '预览地理编辑');
  await expect(page.getByRole('region', { name: '地理编辑预览' })).toBeVisible(); await ready(page); await button(page, '确认地理编辑'); await ready(page);
  const edited = await saved(page, id), stableURL = page.url(); expect(edited.geographyHashes).not.toEqual(macro.geographyHashes);
  await page.getByLabel('定位地块编号', { exact: true }).fill(String(34 * 128 + 37)); await button(page, '定位');
  await panel(page, '地图'); for (let zoom = 0; zoom < 3; zoom++) await button(page, '放大大世界地图');
  await configureLocks(page, '3', 'set'); await previewLocks(page);
  expect(await saved(page, id)).toEqual(edited); expect(page.url()).toBe(stableURL);
  await page.screenshot({ path: info.outputPath('constraints-blue-region-preview.png'), fullPage: true });
  await button(page, '取消区域锁修改'); await ready(page); expect(await saved(page, id)).toEqual(edited); expect(page.url()).toBe(stableURL);

  await previewLocks(page); await commitLocks(page); const locked = await saved(page, id); expectMask(locked, 3); expect(locked.geographyHashes).toEqual(edited.geographyHashes); expect(locked.manifest.generation).toEqual(macro.manifest.generation);
  await configureLocks(page, '1', 'clear'); await previewLocks(page); expect(await saved(page, id)).toEqual(locked); await commitLocks(page);
  const clearedCoast = await saved(page, id); expectMask(clearedCoast, 2); expect(clearedCoast.geographyHashes).toEqual(edited.geographyHashes);
  await button(page, '撤销大世界编辑'); await ready(page); const restoredLocks = await saved(page, id); expectMask(restoredLocks, 3); expect(restoredLocks.geographyHashes).toEqual(edited.geographyHashes);
  await button(page, '撤销大世界编辑'); await ready(page); const removedLocks = await saved(page, id); expectMask(removedLocks, 0); expect(removedLocks.geographyHashes).toEqual(edited.geographyHashes);
  await button(page, '撤销大世界编辑'); await ready(page); const restoredGeography = await saved(page, id); expectMask(restoredGeography, 0); expect(restoredGeography.geographyHashes).toEqual(macro.geographyHashes);

  await configureLocks(page, '2', 'set'); await previewLocks(page); await commitLocks(page); const final = await saved(page, id); expectMask(final, 2); expect(final.geographyHashes).toEqual(macro.geographyHashes);
  await page.reload(); await ready(page); expect(await saved(page, id)).toEqual(final); expect(page.url()).toBe(stableURL); await expect(page.getByRole('button', { name: '撤销大世界编辑', exact: true })).toBeDisabled();
  await configureLocks(page, '2', 'set'); await page.screenshot({ path: info.outputPath('constraints-restored-blue-region.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
  await info.attach('constraints-persistence.json', { contentType: 'application/json', body: JSON.stringify({ project: info.project.name, physicalDeviceTest: false, draftId: id, rectangle, actualCheckedCells: final.masks.length, verifiedGeographyBlocks: Object.keys(final.geographyHashes).length, revisions: [macro, edited, locked, clearedCoast, restoredLocks, removedLocks, restoredGeography, final].map(state => state.root.revision), finalRoot: final.root, errors }, null, 2) });
});
