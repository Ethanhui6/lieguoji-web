import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { audit, metrics, saved } from '../../tests/helpers/atlas-shape-readonly';
const dir = `.autopilot/ph07/${process.env.FLOW_TOUCH_LABEL ?? 'touch-consumed-confirm'}`;
const studio = (p: Page) => p.getByTestId('atlas-studio');
const ready = (p: Page, state = 'ready') => expect(studio(p)).toHaveAttribute('data-atlas-state', state, { timeout: 120000 });
test('one native confirmation tap, passive event observation only', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/?atlas=new&atlas-format=4'); await ready(page, 'empty');
  await page.getByLabel('大世界草稿名称', { exact: true }).fill('触控确认诊断'); await page.getByLabel('大世界生成种子', { exact: true }).fill('hydrology-native-128');
  await page.getByLabel('大世界地理规模', { exact: true }).selectOption('128'); await page.getByRole('button', { name: '新建空白海洋草稿', exact: true }).tap(); await ready(page);
  await page.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name: '创世', exact: true }).tap();
  await page.getByLabel('地貌种子', { exact: true }).fill('hydrology-native-128'); await page.getByLabel('近岸岛链', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '画大陆', exact: true }).tap(); await page.getByRole('button', { name: '全图', exact: true }).tap();
  await expect.poll(async () => { const m = await metrics(page) as Awaited<ReturnType<typeof metrics>> & { frameSequence: number }; return m.completedFrameSequence === m.frameSequence; }).toBe(true);
  const contour = [[650, 1300], [950, 1120], [1200, 1260], [1440, 1590], [1310, 1850], [1010, 1980], [760, 1790], [580, 1580], [650, 1300]], box = (await page.getByTestId('atlas-canvas').boundingBox())!, m = await metrics(page);
  const points = contour.map(([x, y]) => ({ x: box.x + m.camera.x + x * m.camera.scale, y: box.y + m.camera.y + y * m.camera.scale }));
  const cdp = await page.context().newCDPSession(page);
  try { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points[0], id: 1 }] }); for (const point of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } finally { await cdp.detach(); }
  await expect(page.getByRole('region', { name: '大陆生成预览' })).toBeVisible({ timeout: 120000 }); await ready(page);
  const before = { audit: await audit(page), metrics: await metrics(page), saved: await saved(page, (await studio(page).getAttribute('data-atlas-id'))!, 4) };
  await page.evaluate(() => {
    type RecordEntry = Record<string, unknown>;
    const log: RecordEntry[] = [], ids = new WeakMap<EventTarget, number>(); let nextId = 1;
    const identify = (target: EventTarget | null) => {
      if (!target) return null; if (!ids.has(target)) ids.set(target, nextId++);
      return target instanceof Element ? { id: ids.get(target), tag: target.tagName, className: target.className, text: target.textContent?.slice(0, 70), role: target.getAttribute('role') } : { id: ids.get(target) };
    };
    const confirm = () => [...document.querySelectorAll('button')].find(b => b.textContent === '确认生成并保存');
    const state = () => { const b = confirm(), r = b?.getBoundingClientRect(), main = document.querySelector('[data-testid="atlas-studio"]'); return { button: identify(b ?? null), rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null, active: identify(document.activeElement), scrollTop: document.querySelector('.inspector-body')?.scrollTop, revision: main?.getAttribute('data-atlas-revision'), status: main?.getAttribute('data-atlas-state'), gpu: main?.getAttribute('data-atlas-gpu') }; };
    const record = (e: Event, phase: string) => { if (log.length >= 1000) return; const q = e instanceof MouseEvent ? e : e instanceof TouchEvent ? e.changedTouches[0] : null;
      log.push({ event: e.type, phase, time: performance.now(), trusted: e.isTrusted, cancelable: e.cancelable, prevented: e.defaultPrevented, primary: e instanceof PointerEvent ? e.isPrimary : null, touches: e instanceof TouchEvent ? e.touches.length : null, target: identify(e.target), x: q?.clientX, y: q?.clientY,
        atPoint: q ? identify(document.elementFromPoint(q.clientX, q.clientY)) : null, ...state() }); };
    for (const event of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'click', 'focusin', 'focusout', 'scroll', 'scrollend']) {
      document.addEventListener(event, e => record(e, 'capture'), { capture: true, passive: true }); document.addEventListener(event, e => record(e, 'bubble'), { passive: true });
      window.addEventListener(event, e => { record(e, 'window-bubble'); queueMicrotask(() => record(e, 'after-dispatch')); }, { passive: true });
    }
    (window as unknown as { flowTouchObservation: { log: RecordEntry[]; state: () => unknown } }).flowTouchObservation = { log, state };
    log.push({ event: 'installed', time: performance.now(), ...state() });
  });
  if (process.env.FLOW_TOUCH_SETTLE === '1') {
    await page.evaluate(() => {
      const body = document.querySelector('.inspector-body')!, state = { scrollSeen: false, ended: false, settled: false };
      (window as unknown as { flowScrollObservation: typeof state }).flowScrollObservation = state;
      body.addEventListener('scroll', () => { state.scrollSeen = true; }, { once: true, passive: true });
      body.addEventListener('scrollend', () => { state.ended = true; requestAnimationFrame(() => { const y = body.scrollTop; requestAnimationFrame(() => { state.settled = state.scrollSeen && body.scrollTop === y; }); }); }, { once: true, passive: true });
    });
    await page.getByRole('button', { name: '确认生成并保存', exact: true }).scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (window as unknown as { flowScrollObservation: { settled: boolean } }).flowScrollObservation.settled, undefined, { timeout: 10000 });
  }
  await page.getByRole('button', { name: '确认生成并保存', exact: true }).tap();
  let durableFailure: string | null = null;
  try { await expect(studio(page)).toHaveAttribute('data-atlas-revision', '1', { timeout: 120000 }); await ready(page); }
  catch (failure) { durableFailure = String(failure); }
  const observation = await page.evaluate(() => { const capture = (window as unknown as { flowTouchObservation: { log: unknown[]; state: () => unknown } }).flowTouchObservation; return { log: capture.log, final: capture.state() }; });
  writeFileSync(`${dir}/events.json`, JSON.stringify({ before, observation, durableFailure }, null, 2));
  await page.screenshot({ path: `${dir}/after-single-tap.png`, fullPage: true });
});

