import { createServer, loadConfigFromFile } from 'vite';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const stage = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(stage, '../../..');
const label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label) || process.argv[3] !== '--execute') throw new Error('Explicit fresh label and --execute required; run only in an authorized idle CPU/browser window.');
if (path.resolve(process.cwd()) !== root) throw new Error('Run from this project root.');
const folder = path.join(stage, 'checks', label);
if (existsSync(folder)) throw new Error('Evidence exists; preserve it and choose a fresh explicit label.');
mkdirSync(folder, { recursive: true });
const save = (name, value) => writeFileSync(path.join(folder, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const ready = JSON.parse(readFileSync(path.join(stage, 'ready-manifest.json'), 'utf8'));
const snapshot = () => ready.boundFiles.map(item => ({ path: item.path, sha256: hash(path.join(root, item.path)) }));
let browser, server, page; const events = [], cases = [];
const before = snapshot(); save('source-before.json', before);
const report = { scope: 'Frozen candidate Owned.snapshotAsync in real Chromium dedicated Worker, 4096 sampled fine tiles and coarse 512; isolated established-session measurement, not game end-to-end or physical-device acceptance.',
  gates: { progressMs: 250, cancelResponseMs: 500 }, startedAt: new Date().toISOString(), setup: null, cases, events,
  candidateSnapshotGatesPassed: false, publicRawDiagnosticGatesPassed: null, acceptance: { productEndToEnd: false, realDevice: false, wholePH06: false } };
try {
  for (const item of before) {
    const expected = ready.boundFiles.find(row => row.path === item.path);
    if (!expected.allowedSha256.includes(item.sha256)) throw new Error(`Bound source changed: ${item.path}; review/rebind explicitly, do not overwrite first evidence.`);
  }
  const frozenRoot = path.resolve(root, '.autopilot/ph06/v4-owned-snapshot-staging/src/world');
  const resolveFrozen = { name: 'frozen-owned-snapshot-dependencies', enforce: 'pre', resolveId(source, importer) {
    if (!importer || !path.resolve(importer.split('?')[0]).startsWith(frozenRoot + path.sep) || !source.startsWith('.')) return;
    const local = path.resolve(path.dirname(importer.split('?')[0]), source) + '.ts';
    if (existsSync(local)) return local;
    const production = path.resolve(root, 'src/world', source) + '.ts';
    if (existsSync(production)) return production;
  } };
  // Use genuine current fingerprint defines. Do not invent source fingerprints
  // or run the application's build/plugin output path.
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, path.join(root, 'vite.config.ts'));
  if (!loaded?.config.define) throw new Error('Real build definitions unavailable.');
  server = await createServer({ configFile: false, root, define: loaded.config.define, plugins: [resolveFrozen],
    cacheDir: path.join(stage, 'vite-cache'), logLevel: 'warn', server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/*'] } } });
  await server.listen(); const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback port.');
  const baseUrl = `http://127.0.0.1:${address.port}/.autopilot/ph06/v4-owned-snapshot-metrics-staging`;
  browser = await chromium.launch({ headless: true }); page = await browser.newPage(); report.browserVersion = browser.version();
  page.on('pageerror', error => events.push({ type: 'pageerror', text: error.stack ?? error.message }));
  page.on('console', message => { if (message.type() === 'error') events.push({ type: 'console-error', text: message.text() }); });
  page.on('requestfailed', request => events.push({ type: 'requestfailed', url: request.url(), error: request.failure()?.errorText }));
  await page.goto(`${baseUrl}/harness.html`); report.userAgent = await page.evaluate(() => navigator.userAgent);
  report.setup = await page.evaluate(async workerUrl => {
    const worker = new Worker(workerUrl, { type: 'module' });
    let initResolve, initReject, pending = null; const failures = [];
    const initialized = new Promise((resolve, reject) => { initResolve = resolve; initReject = reject; });
    const initTimer = setTimeout(() => { worker.terminate(); initReject(new Error('120s fixture/setup harness deadline; no performance PASS.')); }, 120000);
    const fail = error => {
      failures.push({ message: String(error), id: pending?.id ?? null, progress: pending?.progress ?? [], cancelSentMs: pending?.cancelSentMs ?? null,
        settledReceivedMs: pending?.settledReceivedMs ?? null });
      clearTimeout(initTimer); initReject(error);
      if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null; }
    };
    worker.onerror = event => fail(new Error(`Worker error ${event.message} at ${event.filename}:${event.lineno}`));
    worker.onmessage = event => {
      const value = event.data;
      if (value.type === 'ready') { clearTimeout(initTimer); initResolve(value); return; }
      if (value.type === 'fatal') { fail(new Error(`${value.message}\n${value.stack ?? ''}`)); return; }
      if (!pending || value.id !== pending.id) return;
      const elapsed = performance.now() - pending.sentAt;
      const sendCancel = () => {
        if (pending.cancelSentMs !== null) return;
        pending.cancelSentMs = performance.now() - pending.sentAt; worker.postMessage({ type: 'cancel', id: pending.id });
      };
      if (value.type === 'measurement-started') { pending.startedReceivedMs = elapsed; if (pending.cancelWhen === 'start') sendCancel(); }
      if (value.type === 'progress') {
        pending.progress.push({ stage: value.stage, completed: value.completed, total: value.total, receivedMs: elapsed, workerAtMs: value.workerAtMs });
        if (pending.cancelWhen === 'fine-copy' && value.stage === '复制草稿细海岸' && value.completed >= 16
          || pending.cancelWhen === 'fine-verification' && value.stage === '核验细海岸内容摘要' && value.completed >= 16) sendCancel();
      }
      if (value.type === 'settled') pending.settledReceivedMs = elapsed;
      if (value.type === 'result') {
        const current = pending; pending = null; clearTimeout(current.timer);
        const ends = [0, ...current.progress.map(item => item.receivedMs), current.settledReceivedMs];
        const gaps = ends.slice(1).map((number, index) => number === null || ends[index] === null ? null : number - ends[index]);
        const finite = current.settledReceivedMs !== null && gaps.every(number => typeof number === 'number' && Number.isFinite(number) && number >= 0);
        const firstProgressMs = current.progress[0]?.receivedMs ?? null;
        current.resolve({ ...value, cancelWhen: current.cancelWhen, main: { startedReceivedMs: current.startedReceivedMs,
          settledReceivedMs: current.settledReceivedMs, firstProgressMs, progress: current.progress, gaps,
          maxProgressGapMs: finite ? Math.max(...gaps) : null, cancelSentMs: current.cancelSentMs,
          cancelSendToSettledReplyMs: current.cancelSentMs === null || current.settledReceivedMs === null ? null : current.settledReceivedMs - current.cancelSentMs,
          progressGatePassed: finite && firstProgressMs !== null && firstProgressMs <= 250 && Math.max(...gaps) <= 250 } });
      }
    };
    window.denseSnapshotProbe = {
      close: () => worker.terminate(),
      diagnostics: () => failures,
      run: (id, mode, cancelWhen) => new Promise((resolve, reject) => {
        if (pending) { reject(new Error('Probe is already busy.')); return; }
        pending = { id, mode, cancelWhen, resolve, reject, sentAt: performance.now(), startedReceivedMs: null, settledReceivedMs: null,
          cancelSentMs: null, progress: [], timer: setTimeout(() => { worker.terminate(); fail(new Error('120s case harness deadline; no performance PASS.')); }, 120000) };
        worker.postMessage({ type: 'run', id, mode });
      }),
    };
    worker.postMessage({ type: 'initialize' }); return await initialized;
  }, `${baseUrl}/snapshot-metrics.worker.ts`);
  save('setup.json', report.setup);
  for (const [id, mode, cancelWhen] of [
    ['private-full', 'private-snapshot', null], ['public-raw-full', 'public-raw-clone', null],
    ['private-cancel-start', 'private-snapshot', 'start'], ['private-cancel-copy', 'private-snapshot', 'fine-copy'],
    ['private-cancel-verify', 'private-snapshot', 'fine-verification'],
  ]) {
    const result = await page.evaluate(async args => await window.denseSnapshotProbe.run(...args), [id, mode, cancelWhen]);
    const dense = result.dimensions?.coarseSize === 512 && result.dimensions.fineTiles === 4096 && result.dimensions.sampledTiles === 4096
      && result.dimensions.ownedFineNodes === 2049 ** 2 && result.dimensions.fineArrayBytes === 2049 ** 2 * 4;
    const cancelled = result.errorName === 'AbortError' && !result.fullVerifiedCopy && result.main.cancelSentMs !== null
      && Number.isFinite(result.main.cancelSendToSettledReplyMs) && result.main.cancelSendToSettledReplyMs >= 0 && result.main.cancelSendToSettledReplyMs <= 500
      && Number.isFinite(result.timing.cancelReceivedMs) && Number.isFinite(result.timing.cancelReceivedToSettledMs)
      && result.timing.cancelReceivedToSettledMs >= 0 && result.timing.cancelReceivedToSettledMs <= 500;
    result.denseFixtureConfirmed = dense;
    result.acceptedScopePassed = dense && result.finite && result.headUnchanged && (cancelWhen === null
      ? result.fullVerifiedCopy && result.outputAudit?.passed && result.workerProgressGatePassed && result.main.progressGatePassed
        && Number.isFinite(result.timing.maxYieldEntryIntervalMs) && result.timing.maxYieldEntryIntervalMs <= 250
        && (mode !== 'private-snapshot' || result.fineCopySequenceExact)
      : cancelled);
    cases.push(result); save(`${id}.raw.json`, result);
    writeFileSync(path.join(folder, 'partial.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ id, acceptedScopePassed: result.acceptedScopePassed, timing: result.timing, main: {
      firstProgressMs: result.main.firstProgressMs, maxProgressGapMs: result.main.maxProgressGapMs, cancelSendToSettledReplyMs: result.main.cancelSendToSettledReplyMs } }));
  }
  report.candidateSnapshotGatesPassed = cases.filter(item => item.mode === 'private-snapshot').length === 4
    && cases.filter(item => item.mode === 'private-snapshot').every(item => item.acceptedScopePassed);
  report.publicRawDiagnosticGatesPassed = cases.find(item => item.mode === 'public-raw-clone')?.acceptedScopePassed === true;
} catch (error) {
  report.error = { message: String(error), stack: error?.stack };
  try { report.probeFailureDetails = await page?.evaluate(() => window.denseSnapshotProbe?.diagnostics()); } catch { /* Preserve the original browser/Worker failure. */ }
}
finally {
  try { await page?.evaluate(() => window.denseSnapshotProbe?.close()); } catch { /* Browser may already have failed; preserve the first error. */ }
  await browser?.close(); await server?.close();
  const after = snapshot(); save('source-after.json', after); report.sourceStable = JSON.stringify(before) === JSON.stringify(after);
  report.candidateSnapshotGatesPassed &&= report.sourceStable && events.length === 0 && !report.error;
  report.endedAt = new Date().toISOString(); save('verification.json', report);
  process.exitCode = report.candidateSnapshotGatesPassed ? 0 : 1;
  console.log(JSON.stringify({ candidateSnapshotGatesPassed: report.candidateSnapshotGatesPassed, publicRawDiagnosticGatesPassed: report.publicRawDiagnosticGatesPassed,
    sourceStable: report.sourceStable, exitCode: process.exitCode, scope: report.scope }));
}
