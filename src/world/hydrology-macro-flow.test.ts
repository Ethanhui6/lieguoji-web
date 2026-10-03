import { describe, expect, it, vi } from 'vitest';
import { buildMacroFlowPreview } from './hydrology-macro-flow';
import { MACRO_FLOW, MACRO_GRID, MACRO_SEMANTICS, macroAdjacent, macroPacketBytes, validateMacroPreview, validateMacroRequest,
  type HydrologyMacroGrid, type HydrologyMacroPreview, type HydrologyMacroRequest } from './hydrology-macro-contract';

// Synthetic routing/packet fixtures. Real persisted terrain is tested separately by the owned reader.
const source = { version: 4 as const, atlasId: 'synthetic-macro-atlas', draftId: 'synthetic-macro-draft', revision: 2,
  manifestDigest: 'a'.repeat(64), rootDigest: 'b'.repeat(64), lockSetDigest: 'c'.repeat(64), rootBinding: 'current-owned-session-head' as const };
const expected = { draftId: source.draftId, revision: source.revision, manifestDigest: source.manifestDigest, rootDigest: source.rootDigest };
const request = (): HydrologyMacroRequest => ({ expected: { ...expected }, maxBranches: 64, maxEdges: 8192, minimumContributingSamples: 16 });
const fast = { yieldControl: async () => {} }, center = 128 * 257 + 128;
function grid(): HydrologyMacroGrid {
  return { format: 'lieguoji-hydrology-macro-grid', version: 1, grid: { ...MACRO_GRID }, source: { ...source },
    locks: { semantics: 'read-preserve-geography-not-flow-barriers', lockedCoarseCells: 2, refs: [{ bx: 0, by: 0, hash: 'd'.repeat(64) }] },
    coverageQ: new Int16Array(MACRO_FLOW.nodes).fill(512), groundMeters: new Int16Array(MACRO_FLOW.nodes).fill(100),
    stats: { sampledNodes: 66049, explicitFineNodes: 66049, uniformLandNodes: 0, implicitSeaNodes: 0, baseSamplerPrepared: false, outputTypedArrayBytes: 264196, sourceCoarseCells: 65536 },
    operation: { sequence: 1, sampledNodes: 66049, maxPages: 1, maxSampledNodes: 66049, baseSamplerPreparations: 0 } };
}
function draining() { const value = grid(); value.coverageQ[center] = -512; value.groundMeters[center] = -300; return value; }

describe('whole-world 16-world macro drainage preview', () => {
  it('routes deterministic flat confluences continuously to sampled sea and emits shared downstream edges once', async () => {
    const a = await buildMacroFlowPreview(draining(), request(), fast), b = await buildMacroFlowPreview(draining(), request(), fast);
    expect(a).toEqual(b); expect(a.branches.some(branch => branch.stop === 'sampled-sea' && branch.endNode === center)).toBe(true);
    expect(a.branches.some(branch => branch.stop === 'joins-network')).toBe(true);
    expect(new Set(a.edges.from).size).toBe(a.edges.from.length); expect(a.edges.from.length).toBeGreaterThan(100);
    for (let i = 0; i < a.edges.from.length; i++) expect(macroAdjacent(a.edges.from[i], a.edges.to[i])).toBe(true);
    expect(a.nodes.contributingSamples[a.nodes.ids.indexOf(center)]).toBe(66048);
    expect(a.semantics.sea).toBe('sampled-sea-not-open-ocean'); expect(a.semantics.coast).toBe('macro-transition-edge-not-fine-coast-mouth');
    expect(a.stats.sampledNodes).toBe(66049); expect(macroPacketBytes(a)).toBeLessThanOrEqual(512 * 1024);
  });

  it('keeps lowlands dry and routes a closed boundary flat to an unresolved real world-edge node', async () => {
    const lowland = grid(); lowland.groundMeters[center] = 0;
    const before = lowland.groundMeters.slice(), result = await buildMacroFlowPreview(lowland, request(), fast);
    expect(lowland.groundMeters).toEqual(before); expect(result.branches.some(branch => branch.stop === 'depression' && branch.endNode === center)).toBe(true);
    expect(result.branches.some(branch => branch.stop === 'sampled-sea')).toBe(false); expect(result.semantics.lowland).toBe('natural-depression-not-lake-water');
    const edge = await buildMacroFlowPreview(grid(), request(), fast);
    expect(edge.branches.some(branch => branch.stop === 'world-edge-unresolved' && branch.endNode === 0)).toBe(true);
    expect(edge.branches.some(branch => branch.stop === 'depression')).toBe(false);
  });

  it('copies the complete source before callbacks, leaves all-sea input empty, and reports real display truncation', async () => {
    const original = draining(), mutableRequest = request(); let mutate = true;
    const actual = await buildMacroFlowPreview(original, mutableRequest, { ...fast, onProgress: () => {
      if (!mutate) return; mutate = false; original.coverageQ.fill(-512); original.groundMeters.fill(-20); original.source.revision = 99;
      original.locks.lockedCoarseCells = 99; mutableRequest.maxEdges = 1; mutableRequest.expected.revision = 99;
    } });
    expect(actual.source.revision).toBe(2); expect(actual.locks.lockedCoarseCells).toBe(2); expect(actual.edges.from.length).toBeGreaterThan(1);
    const sea = grid(); sea.coverageQ.fill(-512); sea.groundMeters.fill(-20);
    const empty = await buildMacroFlowPreview(sea, request(), fast); expect(empty.nodes.ids).toEqual([]); expect(empty.branches).toEqual([]); expect(empty.displayTruncated).toBe(false);
    const truncated = await buildMacroFlowPreview(draining(), { ...request(), maxEdges: 3, maxBranches: 2 }, fast);
    expect(truncated.edges.from).toHaveLength(3); expect(truncated.displayTruncated).toBe(true); expect(truncated.branches.some(branch => branch.stop === 'display-limit')).toBe(true);
  });

  it('honours abort, operation and allocation limits and refuses wrong geometry and source identities', async () => {
    for (const phase of ['macro-capture', 'macro-flat-routing', 'macro-project']) {
      const controller = new AbortController();
      await expect(buildMacroFlowPreview(draining(), request(), { ...fast, signal: controller.signal, onProgress: current => { if (current === phase) controller.abort(); } })).rejects.toThrow();
    }
    await expect(buildMacroFlowPreview(draining(), request(), fast, { maximumOperations: 1 })).rejects.toThrow('操作预算');
    await expect(buildMacroFlowPreview(draining(), request(), fast, { maximumTypedArrayBytes: 1 })).rejects.toThrow('数组预算');
    const shape = draining(); Object.assign(shape.grid, { stepWorld: 2 }); await expect(buildMacroFlowPreview(shape, request(), fast)).rejects.toThrow('16-world');
    const foreign = draining(); foreign.source.rootDigest = 'e'.repeat(64); await expect(buildMacroFlowPreview(foreign, request(), fast)).rejects.toThrow('来源身份');
    const bad = draining(); bad.coverageQ[0] = -32768; await expect(buildMacroFlowPreview(bad, request(), fast)).rejects.toThrow('海陆与高程');
  });

  it('strictly rejects forged packet structure, identities, discontinuities, aliases and terminal claims', async () => {
    const good = await buildMacroFlowPreview(draining(), request(), fast);
    for (const change of [
      (p: HydrologyMacroPreview) => { p.source.revision++; },
      (p: HydrologyMacroPreview) => { Object.assign(p, { extra: true }); },
      (p: HydrologyMacroPreview) => { p.edges.to[0] = p.edges.from[0]; },
      (p: HydrologyMacroPreview) => { p.edges.from.push(p.edges.from[0]); p.edges.to.push(p.edges.to[0]); },
      (p: HydrologyMacroPreview) => { p.nodes.ids.push(p.nodes.ids[0]); },
      (p: HydrologyMacroPreview) => { p.branches[0].stop = 'depression'; },
      (p: HydrologyMacroPreview) => { p.stats.sampledNodes = 66048 as 66049; },
      (p: HydrologyMacroPreview) => { Object.assign(p.grid, { coverage: 'crop' }); },
      (p: HydrologyMacroPreview) => { Object.assign(p, { coastPointQ: { xQ: 0, yQ: 0 } }); },
    ]) { const changed = structuredClone(good); change(changed); expect(() => validateMacroPreview(changed, request())).toThrow(); }
    // Two visible tributaries have disjoint upstream samples. A terminal may
    // include additional hidden tributaries, so validate a lower bound, not equality.
    for (const sea of [false, true]) {
      const fork: HydrologyMacroPreview = { ...structuredClone(good),
        nodes: { ids: [center - 1, center - 257, center], coverageQ: [512, 512, sea ? -512 : 512],
          groundMeters: [10, 10, sea ? -10 : 5], contributingSamples: [16, 18, 40] },
        edges: { from: [center - 1, center - 257], to: [center, center] },
        branches: [{ sourceNode: center - 1, endNode: center, stop: sea ? 'sampled-sea' : 'depression' },
          { sourceNode: center - 257, endNode: center, stop: sea ? 'sampled-sea' : 'depression' }], displayTruncated: false,
        stats: { ...good.stats, landNodes: sea ? 66048 : 66049, sampledSeaNodes: sea ? 1 : 0, eligibleBranches: 2, displayedBranches: 2, displayedEdges: 2 },
      };
      expect(validateMacroPreview(fork, request()).nodes.contributingSamples[2]).toBe(40);
      fork.nodes.contributingSamples[2] = sea ? 33 : 34;
      expect(() => validateMacroPreview(fork, request())).toThrow('可见上游样本数不守恒');
    }
    const getter = vi.fn(() => good.source), access = structuredClone(good); Object.defineProperty(access, 'source', { enumerable: true, get: getter });
    expect(() => validateMacroPreview(access, request())).toThrow(); expect(getter).not.toHaveBeenCalled();
    const copy = validateMacroPreview(good, request()); copy.nodes.ids[0] = 0; copy.source.revision = 99;
    expect(good.source.revision).toBe(2); expect(copy.nodes.ids).not.toBe(good.nodes.ids);
    expect(() => validateMacroRequest({ ...request(), maxBranches: 65 })).toThrow();
  });

  it('round-trips a maximum 8192-edge plain-JSON packet within the actual 512-KiB serialization budget', () => {
    const ids: number[] = [];
    for (let row = 0; ids.length < 8193; row++) for (let x = 0; x < 257 && ids.length < 8193; x++) ids.push(row * 257 + (row % 2 ? 256 - x : x));
    const value: HydrologyMacroPreview = { format: 'lieguoji-hydrology-macro-preview', version: 1, algorithm: 'macro-four-neighbour-drainage-v1', source: { ...source }, grid: { ...MACRO_GRID },
      semantics: { ...MACRO_SEMANTICS }, locks: { semantics: 'read-preserve-geography-not-flow-barriers', lockedCoarseCells: 0 },
      nodes: { ids, coverageQ: ids.map(() => 512), groundMeters: ids.map(() => 100), contributingSamples: ids.map((_, i) => i + 1) },
      edges: { from: ids.slice(0, -1), to: ids.slice(1) }, branches: [{ sourceNode: ids[0], endNode: ids.at(-1)!, stop: 'display-limit' }], displayTruncated: true,
      stats: { sampledNodes: 66049, landNodes: 66049, sampledSeaNodes: 0, eligibleBranches: 1, displayedBranches: 1, displayedEdges: 8192,
        operations: 1, typedArrayBytes: MACRO_FLOW.nodes * MACRO_FLOW.bytesPerNode, maximumOperations: MACRO_FLOW.nodes * MACRO_FLOW.maxOperationsPerNode } };
    const narrowRequest = { ...request(), minimumContributingSamples: 1 };
    expect(macroPacketBytes(value)).toBeLessThan(512 * 1024);
    expect(validateMacroPreview(JSON.parse(JSON.stringify(value)), narrowRequest)).toEqual(value);
  });
});
