import type { HydrologyMacroPreview, MacroBranchStop } from './hydrology-macro-contract';
type FlowGraph = Pick<HydrologyMacroPreview, 'edges' | 'branches'>;

export const macroPosition = (id: number) => ({ x: id % 257 * 16, y: Math.floor(id / 257) * 16 });

/** Presentation follows only supplied adjacent edges. Shared downstream edges
 * are followed for highlighting, never replaced with an invented shortcut. */
export function macroBranchPath(preview: FlowGraph, index: number): number[] {
  const branch = preview.branches[index]; if (!branch) return [];
  const receivers = new Map(preview.edges.from.map((id, i) => [id, preview.edges.to[i]]));
  const visited = new Set<number>(), path: number[] = []; let at = branch.sourceNode;
  while (!visited.has(at) && path.length <= preview.edges.from.length) {
    visited.add(at); path.push(at); const next = receivers.get(at); if (next === undefined) break; at = next;
  }
  return path;
}

/** Tap tolerance is supplied in world units from the current camera scale.
 * Only each branch's own segment participates; shared downstream is not drawn
 * or hit-tested once per upstream branch. */
export function pickMacroBranch(preview: FlowGraph, point: { x: number; y: number }, tolerance: number): number | null {
  const receivers = new Map(preview.edges.from.map((id, i) => [id, preview.edges.to[i]]));
  let nearest = tolerance * tolerance, selected: number | null = null;
  for (let index = 0; index < preview.branches.length; index++) {
    const branch = preview.branches[index]; let at = branch.sourceNode, steps = 0;
    do {
      const next = at === branch.endNode ? undefined : receivers.get(at), a = macroPosition(at), b = macroPosition(next ?? at);
      const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
      const t = length2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2)) : 0;
      const distance2 = (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
      if (distance2 < nearest || selected === null && distance2 === nearest) { nearest = distance2; selected = index; }
      if (next === undefined) break; at = next;
    } while (++steps <= preview.edges.from.length);
  }
  return selected;
}

export const macroStopLabel: Record<MacroBranchStop, string> = {
  'sampled-sea': '汇入采样海域',
  depression: '止于地形低洼处',
  'world-edge-unresolved': '到达世界边缘',
  'joins-network': '汇入另一支水流',
  'display-limit': '到达本次显示上限',
};
export const macroStopReason: Record<MacroBranchStop, string> = {
  'sampled-sea': '下游采样点已进入海域；是否与外洋相连尚未判定。海陆之间的线段表示过渡范围。',
  depression: '此处在当前采样尺度下没有更低的去向。它是低洼地形，尚未计算积水、湖面或溢流。',
  'world-edge-unresolved': '下游到达地图外缘，没有范围之外的地形，暂不能判断后续去向。',
  'joins-network': '这支水流接入已经显示的下游；地图高亮会继续沿共享下游延伸。',
  'display-limit': '本次显示预算已用完，线条在实际采样点结束；后续地形没有被补画成直线。',
};
