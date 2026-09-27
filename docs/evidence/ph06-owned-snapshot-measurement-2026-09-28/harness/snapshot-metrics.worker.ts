import { OwnedAtlasSession } from '../v4-owned-snapshot-staging/src/world/transactions';
import { cloneVerifiedAtlasDocument, hashAtlasManifest } from '../../../src/world/atlas-format';
import { yieldAtlasWorkerTask } from '../../../src/world/worker-yield';
import { detailCoastKey } from '../../../src/world/detail-coast-types';
import type { AtlasDetailCoastDocument } from '../../../src/world/generation-contract';
import { createDenseFixture } from './fixture';

type Mode = 'private-snapshot' | 'public-raw-clone';
type Progress = { stage: string; completed: number; total: number };
type Active = { id: string; controller: AbortController; start: number; cancelReceivedMs: number | null };
let raw: AtlasDetailCoastDocument, session: OwnedAtlasSession<AtlasDetailCoastDocument>, dimensions: Awaited<ReturnType<typeof createDenseFixture>>['dimensions'];
let active: Active | undefined, initializing = false;
const copyStages = new Set(['复制生成草稿分层与锁', '复制草稿区域锁', '复制草稿细海岸']);
const now = () => performance.now();
const post = (value: unknown) => self.postMessage(value);
const phase = (stage: string | null) => stage !== null && copyStages.has(stage) ? 'copy' : 'verification';

self.addEventListener('message', (event: MessageEvent<{ type: string; id?: string; mode?: Mode }>) => {
  const message = event.data;
  if (message.type === 'cancel') {
    if (active?.id === message.id && active.cancelReceivedMs === null) {
      active.cancelReceivedMs = now() - active.start; active.controller.abort();
    }
    return;
  }
  if (message.type === 'initialize' && !initializing && !session) {
    initializing = true;
    void initialize().catch(error => post({ type: 'fatal', message: String(error), stack: error?.stack }));
    return;
  }
  if (message.type === 'run') {
    if (!session || active || typeof message.id !== 'string' || !['private-snapshot', 'public-raw-clone'].includes(message.mode ?? '')) {
      post({ type: 'fatal', message: 'Invalid, early or overlapping measurement request.' }); return;
    }
    void measure(message.id, message.mode!).catch(error => post({ type: 'fatal', message: String(error), stack: error?.stack }));
  }
});

async function initialize() {
  const begin = now(), fixture = await createDenseFixture(); raw = fixture.data; dimensions = fixture.dimensions;
  const fixtureMs = now() - begin, openBegin = now();
  // Public ownership and its full verification are SETUP, outside all private
  // snapshot windows. Keep their actual duration visible, never subtract it
  // from a supposed end-to-end product result.
  session = await OwnedAtlasSession.open(raw, 'a'.repeat(64), { yieldTask: yieldAtlasWorkerTask });
  const publicSessionOpenMs = now() - openBegin;
  post({ type: 'ready', dimensions, setup: { fixtureMs, publicSessionOpenMs },
    scheduler: typeof (globalThis as typeof globalThis & { scheduler?: { postTask?: unknown } }).scheduler?.postTask === 'function'
      ? 'scheduler.postTask(background)' : 'setTimeout(0)',
    workerTimeOrigin: performance.timeOrigin, head: session.head });
}

async function measure(id: string, mode: Mode) {
  const headBefore = session.head, start = now();
  const operation: Active = { id, controller: new AbortController(), start, cancelReceivedMs: null }; active = operation;
  const progress: Array<Progress & { atMs: number }> = [];
  const yields: Array<{ stage: string | null; phase: string; enteredMs: number; resumedMs: number | null; activeGapMs: number }> = [];
  let previousResume = 0, latestStage: string | null = null, output: AtlasDetailCoastDocument | null = null;
  let callReturnedMs: number | null = null, errorName: string | null = null, errorMessage: string | null = null;
  post({ type: 'measurement-started', id, mode });
  const control = {
    signal: operation.controller.signal,
    onProgress: (value: Progress) => {
      const atMs = now() - start; latestStage = value.stage; progress.push({ ...value, atMs });
      post({ type: 'progress', id, ...value, workerAtMs: atMs });
    },
    yieldTask: async () => {
      const enteredMs = now() - start;
      const sample = { stage: latestStage, phase: phase(latestStage), enteredMs, resumedMs: null as number | null, activeGapMs: enteredMs - previousResume };
      yields.push(sample); await yieldAtlasWorkerTask(); sample.resumedMs = now() - start; previousResume = sample.resumedMs;
    },
  };
  try {
    const promise = mode === 'private-snapshot' ? session.snapshotAsync(control) : cloneVerifiedAtlasDocument(raw, control);
    callReturnedMs = now() - start; output = await promise;
  } catch (error) { errorName = error instanceof Error ? error.name : 'UnknownError'; errorMessage = String(error); }
  const settledMs = now() - start;
  // Tell the main thread immediately, before any post-measurement audit. Its
  // cancel-send -> settled-receive interval includes Worker queue/delivery.
  post({ type: 'settled', id, errorName, settledMs });
  const cancelReceivedMs = operation.cancelReceivedMs;
  active = undefined;
  const endpoints = [0, ...progress.map(item => item.atMs), settledMs];
  const progressGaps = endpoints.slice(1).map((value, index) => value - endpoints[index]);
  const yieldEndpoints = [0, ...yields.map(item => item.enteredMs), settledMs];
  const yieldEntryIntervals = yieldEndpoints.slice(1).map((value, index) => value - yieldEndpoints[index]);
  const fineCopy = progress.filter(item => item.stage === '复制草稿细海岸');
  const fullVerifiedCopy = output !== null && errorName === null;
  let outputAudit: unknown = null;
  if (output) {
    let samples = 0, nodes = 0, bytes = 0;
    for (const tile of output.detailCoast.values()) if (tile.mode === 'samples') {
      samples++; nodes += tile.coverageQ.length; bytes += tile.coverageQ.byteLength + tile.elevationMeters.byteLength;
    }
    const sameManifest = await hashAtlasManifest(output.manifest) === headBefore.manifestDigest;
    const first = output.detailCoast.get(detailCoastKey(0, 0))!, input = raw.detailCoast.get(detailCoastKey(0, 0))!;
    if (first.mode !== 'samples' || input.mode !== 'samples') throw new Error('Dense fixture lost sampled tile.');
    const inputDetached = first.coverageQ.buffer !== input.coverageQ.buffer && first.elevationMeters.buffer !== input.elevationMeters.buffer;
    first.elevationMeters[0] = -1100;
    const privateFirst = session.readDetailCoast([detailCoastKey(0, 0)])[0];
    const privateUnchanged = privateFirst.mode === 'samples' && privateFirst.elevationMeters[0] === -1200 && input.elevationMeters[0] === -1200;
    outputAudit = { fineTiles: output.detailCoast.size, samples, nodes, bytes, sameManifest, inputDetached, privateUnchanged,
      passed: output.detailCoast.size === 4096 && samples === 4096 && nodes === 2049 ** 2 && bytes === 2049 ** 2 * 4 && sameManifest && inputDetached && privateUnchanged };
    output = null;
  }
  const headUnchanged = JSON.stringify(headBefore) === JSON.stringify(session.head);
  const finite = [settledMs, callReturnedMs, ...progressGaps, ...yieldEntryIntervals, ...yields.flatMap(item => [item.enteredMs, item.resumedMs, item.activeGapMs])]
    .every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const max = (values: number[]) => values.length ? Math.max(...values) : null;
  const firstProgressMs = progress[0]?.atMs ?? null;
  const fineCopySequenceExact = fineCopy.length === 256 && fineCopy.every((item, index) => item.total === 4096 && item.completed === (index + 1) * 16);
  post({ type: 'result', id, mode, dimensions, fullVerifiedCopy, headUnchanged, outputAudit, errorName, errorMessage,
    timing: { settledMs, synchronousCallPrefixMs: callReturnedMs, firstProgressMs, maxProgressGapMs: max(progressGaps),
      maxYieldEntryIntervalMs: max(yieldEntryIntervals), maxActiveGapMs: max([...yields.map(item => item.activeGapMs), settledMs - previousResume]),
      tailAfterLastYieldMs: settledMs - previousResume, cancelReceivedMs,
      cancelReceivedToSettledMs: cancelReceivedMs === null ? null : settledMs - cancelReceivedMs },
    finite, fineCopySequenceExact,
    workerProgressGatePassed: finite && firstProgressMs !== null && firstProgressMs <= 250 && max(progressGaps)! <= 250,
    progress, yields, progressGaps, yieldEntryIntervals,
    scope: 'Actual dedicated Worker calls frozen snapshot candidate or unchanged public raw clone; not Atlas protocol end-to-end or physical-device acceptance.' });
}
