import { OwnedAtlasSession } from './transactions';
import { generationExact } from './generation-contract';
import { type AtlasControl } from './model';
import { extractOwnedHydrologySnapshot, type HydrologySnapshot, type HydrologySnapshotHead } from './hydrology-snapshot';
import { buildHydrologyBoundaryPage, buildHydrologyPageReceivers, preflightHydrologyReceivers,
  type HydrologyBoundaryCore, type HydrologyBoundaryPage, type HydrologyPageReceivers } from './hydrology-boundary';
import type { HydrologyControl } from './hydrology-kernel';

/** A trusted Worker lease, not a raw document ingress. assertCurrent must reject
 * if the Worker switched its session/root or the operation is no longer active. */
export interface HydrologyBoundaryOwner { session: OwnedAtlasSession; assertCurrent: () => void }
export interface HydrologyOwnedReceiverRequest { expected: HydrologySnapshotHead; cores: readonly [HydrologyBoundaryCore, HydrologyBoundaryCore] }
export interface HydrologyOwnedReceiverResult {
  source: HydrologySnapshot['source'];
  preflight: ReturnType<typeof preflightHydrologyReceivers>;
  pages: { core: HydrologyBoundaryCore; rectangle: HydrologyBoundaryCore; boundary: HydrologySnapshot['boundary']; stats: HydrologySnapshot['stats'] }[];
  receivers: HydrologyPageReceivers;
  /** Boundary page builds + merged validation/receiver routing; source
   * snapshot/hash/extraction work is reported separately by the existing APIs. */
  kernelOperations: { pageBuilds: number; mergedReceivers: number; total: number; maximum: number };
}
const HEX = /^[a-f0-9]{64}$/;
const sameHead = (a: HydrologySnapshotHead, b: HydrologySnapshotHead) => a.draftId === b.draftId && a.revision === b.revision && a.manifestDigest === b.manifestDigest && a.rootDigest === b.rootDigest;

/** Sequential, read-only, two-page extraction from one private v4 session.
 * Private capability routing only; no persistent river state, UI or global cache. */
export async function extractOwnedHydrologyReceivers(owner: HydrologyBoundaryOwner, request: HydrologyOwnedReceiverRequest, control?: AtlasControl,
  options: { maximumTypedArrayBytes?: number } = {}): Promise<HydrologyOwnedReceiverResult> {
  if (!generationExact(owner, ['session', 'assertCurrent']) || !(owner.session instanceof OwnedAtlasSession) || typeof owner.assertCurrent !== 'function'
    || !generationExact(request, ['expected', 'cores']) || !generationExact(request.expected, ['draftId', 'revision', 'manifestDigest', 'rootDigest'])) throw new Error('两页水文私有会话或请求字段无效。');
  const session = owner.session, assertCurrent = owner.assertCurrent, expected = { ...request.expected }, signal = control?.signal;
  if (typeof expected.draftId !== 'string' || expected.draftId.length < 1 || expected.draftId.length > 200 || !Number.isSafeInteger(expected.revision) || expected.revision < 0
    || typeof expected.manifestDigest !== 'string' || !HEX.test(expected.manifestDigest) || typeof expected.rootDigest !== 'string' || !HEX.test(expected.rootDigest)
    || !Array.isArray(request.cores) || request.cores.length !== 2) throw new Error('两页水文来源身份或核心数量无效。');
  // All shape/absolute/worst-case budgets are checked before snapshotAsync.
  const plan = preflightHydrologyReceivers(request.cores, options);
  const check = () => {
    signal?.throwIfAborted(); assertCurrent(); signal?.throwIfAborted();
    if (session.format !== 4 || !sameHead(session.head, expected)) throw new Error('跨页水文来源会话已变化。');
  };
  const guarded: AtlasControl = { signal,
    onProgress: progress => { check(); control?.onProgress?.(progress); check(); },
    yieldTask: async () => { check(); if (control?.yieldTask) await control.yieldTask(); else await new Promise<void>(resolve => setTimeout(resolve, 0)); check(); },
  };
  const checkpoint = async (stage: string, completed: number, total: number) => {
    check(); guarded.onProgress?.({ stage, completed, total }); await guarded.yieldTask!(); check();
  };
  const boundaryControl = (label: string): HydrologyControl => ({ signal, yieldControl: guarded.yieldTask,
    onProgress: (phase, completed, total) => guarded.onProgress?.({ stage: `${label}：${phase}`, completed, total }),
  });
  check();
  const capabilities: HydrologyBoundaryPage[] = [], pages: HydrologyOwnedReceiverResult['pages'] = [];
  let source: HydrologySnapshot['source'] | undefined, pageBuildOperations = 0;
  for (let i = 0; i < plan.pages.length; i++) {
    const { core, rectangle } = plan.pages[i];
    await checkpoint('水文跨页：抽取页', i, plan.pages.length);
    const snapshot = await extractOwnedHydrologySnapshot(session, { expected, rectangle }, guarded); check();
    if (!sameHead(snapshot.source, expected) || snapshot.source.atlasId !== session.metadata.atlasId
      || source && (snapshot.source.atlasId !== source.atlasId || snapshot.source.lockSetDigest !== source.lockSetDigest)) throw new Error('跨页水文地理或锁身份不一致。');
    source ??= { ...snapshot.source };
    const page = await buildHydrologyBoundaryPage({ source: expected, core, samples: snapshot.kernelInput }, { maximumTypedArrayBytes: plan.maximumTypedArrayBytes }, boundaryControl(`水文跨页：第${i + 1}页`)); check();
    pageBuildOperations += page.summary.stats.operations;
    capabilities.push(page); pages.push({ core: { ...core }, rectangle: { ...rectangle }, boundary: { ...snapshot.boundary }, stats: { ...snapshot.stats } });
  }
  const receivers = await buildHydrologyPageReceivers(capabilities, { maximumTypedArrayBytes: plan.maximumTypedArrayBytes }, boundaryControl('水文跨页：合并')); check();
  const kernelOperations = { pageBuilds: pageBuildOperations, mergedReceivers: receivers.stats.operations, total: pageBuildOperations + receivers.stats.operations, maximum: plan.maximumKernelOperations };
  if (kernelOperations.total > kernelOperations.maximum) throw new Error('完整双页水文内核超过总操作预算。');
  await checkpoint('水文跨页：完成', plan.pages.length, plan.pages.length); check();
  if (!source) throw new Error('跨页水文未取得来源身份。');
  return { source, preflight: plan, pages, receivers, kernelOperations };
}
