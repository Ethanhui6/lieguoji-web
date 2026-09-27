import { describe, expect, it } from 'vitest';
import { buildHydrologyBoundaryPage, buildHydrologyPageReceivers, type HydrologyBoundaryCore, type HydrologyBoundaryInput, type HydrologyPageReceivers } from './hydrology-boundary';
import { HYDROLOGY_RECEIVER_PATH_LIMIT, projectHydrologyReceiverPath } from './hydrology-receiver-path';

const source = { draftId: 'receiver-path-synthetic', revision: 3, manifestDigest: 'a'.repeat(64), rootDigest: 'b'.repeat(64) };
const fast = { yieldControl: async () => {} };
const node = (x: number, y: number) => y * 2049 + x;
const pair = (): [HydrologyBoundaryCore, HydrologyBoundaryCore] => [{ originColumn: 20, originRow: 20, columns: 8, rows: 8 }, { originColumn: 28, originRow: 20, columns: 8, rows: 8 }];
type Terrain = (x: number, y: number) => { c: number; h: number };
function input(core: HydrologyBoundaryCore, terrain: Terrain): HydrologyBoundaryInput {
  const originColumn = Math.max(0, core.originColumn - 1), originRow = Math.max(0, core.originRow - 1);
  const columns = Math.min(2049, core.originColumn + core.columns + 1) - originColumn, rows = Math.min(2049, core.originRow + core.rows + 1) - originRow;
  const coverageQ = new Int16Array(columns * rows), groundMeters = new Int16Array(columns * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) { const value = terrain(originColumn + x, originRow + y), id = y * columns + x; coverageQ[id] = value.c; groundMeters[id] = value.h; }
  return { source: { ...source }, core: { ...core }, samples: { originColumn, originRow, columns, rows, coverageQ, groundMeters } };
}
async function receivers(terrain: Terrain, cores = pair()) {
  const pages = await Promise.all(cores.map(core => buildHydrologyBoundaryPage(input(core, terrain), {}, fast)));
  return buildHydrologyPageReceivers(pages, {}, fast);
}
const slope: Terrain = x => x >= 35 ? { c: -512, h: -100 } : { c: 512, h: 1000 - x };
const at = (result: HydrologyPageReceivers, id: number) => result.nodeIds.indexOf(id);

describe('bounded projection of actual two-page receivers, separate from the old single-domain trace', () => {
  it('follows every real seam edge to its coast and copies identity/data without mutating or aliasing the receiver', async () => {
    const result = await receivers(slope), before = structuredClone(result), path = projectHydrologyReceiverPath(result, node(20, 23));
    expect(path.format).toBe('lieguoji-hydrology-receiver-path'); expect(path.algorithm).toBe('fine-two-page-receivers-v1'); expect(path.source).toEqual(source);
    expect(path.path.map(row => row.nodeId)).toEqual(Array.from({ length: 15 }, (_, i) => node(20 + i, 23)));
    expect(path.path[7].nodeId).toBe(node(27, 23)); expect(path.path[8].nodeId).toBe(node(28, 23));
    for (const row of path.path) {
      const index = at(result, row.nodeId);
      expect(row).toEqual({ nodeId: row.nodeId, xQ: row.nodeId % 2049 * 512, yQ: Math.floor(row.nodeId / 2049) * 512,
        groundMeters: result.groundMeters[index], contributingSamples: result.contributingSamples[index], contributingSamplesIncomplete: result.contributingSamplesIncomplete[index] === 1 });
    }
    expect(path.terminal).toEqual({ kind: 'coast', nodeId: node(34, 23), coastPointQ: { xQ: 69 * 256, yQ: 23 * 512 } });
    // Crop uncertainty in the contributing samples does not change a real coast
    // to unresolved, or upgrade that coast to a global ocean connection.
    expect(path.contributingSamplesIncomplete).toBe(true); expect(result).toEqual(before);
    path.path[0].groundMeters = 9999; path.source.revision = 99; path.cores[0].columns = 1;
    if (path.terminal.kind === 'coast') path.terminal.coastPointQ.xQ = 0;
    expect(result).toEqual(before); expect(projectHydrologyReceiverPath(result, node(20, 23)).source.revision).toBe(3);
  });

  it('keeps both channel banks separate, excludes sea from drawable paths, and preserves a zero-node coast endpoint', async () => {
    const channel = await receivers(x => x >= 26 && x <= 31 ? { c: -512, h: -200 } : { c: 512, h: 300 });
    const west = projectHydrologyReceiverPath(channel, node(20, 24)), east = projectHydrologyReceiverPath(channel, node(35, 24));
    expect(west.terminal.kind).toBe('coast'); expect(east.terminal.kind).toBe('coast');
    expect(west.path.every(row => row.nodeId % 2049 < 26)).toBe(true); expect(east.path.every(row => row.nodeId % 2049 > 31)).toBe(true);
    const sea = projectHydrologyReceiverPath(channel, node(29, 24));
    expect(sea.path).toEqual([]); expect(sea.terminal).toEqual({ kind: 'excluded', nodeId: node(29, 24) }); expect(sea.contributingSamplesIncomplete).toBe(false);
    const zero = await receivers((x, y) => x === 22 && y === 22 ? { c: 0, h: 0 } : x === 21 && y === 21 ? { c: -512, h: -100 } : { c: 512, h: 100 });
    const shore = projectHydrologyReceiverPath(zero, node(22, 22));
    expect(shore.path).toHaveLength(1); expect(shore.terminal).toEqual({ kind: 'coast', nodeId: node(22, 22), coastPointQ: { xQ: 22 * 512, yQ: 22 * 512 } });
  });

  it('distinguishes natural depression, a real external halo witness and the world boundary without making a lake or ocean', async () => {
    const bowl = await receivers((x, y) => ({ c: 512, h: 100 + 20 * (Math.abs(x - 27) + Math.abs(y - 24)) }));
    const depression = projectHydrologyReceiverPath(bowl, node(32, 23));
    expect(depression.terminal).toEqual({ kind: 'depression', nodeId: node(27, 24) }); expect(depression.contributingSamplesIncomplete).toBe(true);
    const downhill = await receivers(x => ({ c: 512, h: 1000 - x }));
    const external = projectHydrologyReceiverPath(downhill, node(20, 24));
    expect(external.path.at(-1)?.nodeId).toBe(node(35, 24));
    expect(external.terminal).toEqual({ kind: 'unresolved', nodeId: node(35, 24), reason: 'external-land', boundaryTargetNodeId: node(36, 24) });
    expect(external.path.some(row => row.nodeId === node(36, 24))).toBe(false); expect(external.contributingSamplesIncomplete).toBe(true);
    const edge = await receivers(() => ({ c: 512, h: 100 }), [{ originColumn: 0, originRow: 0, columns: 8, rows: 8 }, { originColumn: 8, originRow: 0, columns: 8, rows: 8 }]);
    const unresolved = projectHydrologyReceiverPath(edge, node(10, 4));
    expect(unresolved.terminal).toEqual({ kind: 'unresolved', nodeId: 0, reason: 'world-boundary', boundaryTargetNodeId: null });
    expect(unresolved.path.at(-1)?.nodeId).toBe(0);
  });

  it('rejects corrupted visited chains rather than skipping nodes, reversing slopes or fabricating a valid terminal', async () => {
    const result = await receivers(slope), first = at(result, node(20, 23)), second = at(result, node(21, 23)), end = at(result, node(34, 23));
    const corruptions: { change: (value: HydrologyPageReceivers) => void; error: RegExp }[] = [
      { change: value => { value.receiverNodeIds[second] = node(20, 23); }, error: /循环/ },
      { change: value => { value.receiverNodeIds[first] = node(22, 23); }, error: /四邻接/ },
      { change: value => { value.groundMeters[second] = value.groundMeters[first] + 1; }, error: /逆坡/ },
      { change: value => { value.receiverNodeIds[first] = node(19, 23); }, error: /缺少/ },
      { change: value => { value.nodeIds[second] = node(22, 23); }, error: /缺少/ },
      { change: value => { value.contributingSamples[second] = value.contributingSamples[first]; }, error: /累计/ },
      { change: value => { value.contributingSamplesIncomplete[first] = 1; value.contributingSamplesIncomplete[second] = 0; }, error: /不完整/ },
      { change: value => { value.terminalNodeIds[second] = node(33, 23); }, error: /冲突终点/ },
      { change: value => { value.coastXQ[end] += 512; }, error: /岸口/ },
      { change: value => { value.receiverNodeIds[first] = -99; }, error: /终点/ },
    ];
    for (const { change, error } of corruptions) { const changed = structuredClone(result); change(changed); expect(() => projectHydrologyReceiverPath(changed, node(20, 23))).toThrow(error); }
    expect(() => projectHydrologyReceiverPath(result, node(19, 23))).toThrow(/缺少/);
    expect(() => projectHydrologyReceiverPath(result, NaN)).toThrow(/起点/);
  });

  it('caps a real long downhill corridor at exactly4096 nodes, but retains a real terminal reached on node4096', async () => {
    const cores: [HydrologyBoundaryCore, HydrologyBoundaryCore] = [{ originColumn: 20, originRow: 20, columns: 64, rows: 128 }, { originColumn: 84, originRow: 20, columns: 64, rows: 128 }];
    const corridor: number[] = [];
    for (let y = 21, lane = 0; y <= 145; y += 2, lane++) {
      for (let step = 0; step < 125; step++) corridor.push(node(lane % 2 ? 145 - step : 21 + step, y));
      if (y < 145) corridor.push(node(lane % 2 ? 21 : 145, y + 1));
    }
    const heights = new Map(corridor.map((id, index) => [id, 8000 - index]));
    const result = await receivers((x, y) => x < 20 || x > 147 || y < 20 || y > 147 || x === 146 && y === 145
      ? { c: -512, h: -200 } : { c: 512, h: heights.get(node(x, y)) ?? 12000 }, cores);
    const projected = projectHydrologyReceiverPath(result, corridor[0]);
    expect(corridor.length).toBeGreaterThan(HYDROLOGY_RECEIVER_PATH_LIMIT);
    expect(projected.path.map(row => row.nodeId)).toEqual(corridor.slice(0, 4096));
    expect(new Set(projected.path.map(row => row.nodeId)).size).toBe(4096);
    expect(projected.terminal).toEqual({ kind: 'truncated', nodeId: corridor[4095], nextNodeId: corridor[4096] });
    expect(projected.contributingSamplesIncomplete).toBe(false); // Display budget is not missing upstream terrain.
    const tail = projectHydrologyReceiverPath(result, corridor[corridor.length - 4096]);
    expect(tail.path).toHaveLength(4096); expect(tail.path.at(-1)?.nodeId).toBe(corridor.at(-1)); expect(tail.terminal.kind).toBe('coast');
  }, 30000);
});
