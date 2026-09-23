import type { AtlasDraftData, AtlasGridSpec, BlockCoordinate, BlockKey } from './model';

export interface AtlasPoint { x: number; y: number }
export interface AtlasPointQ { xQ: number; yQ: number }
export type AtlasEdgeAxis = 'horizontal' | 'vertical';
export interface GeometryAffectedBlocks {
  ownerBlocks: BlockCoordinate[];
  cellBlocks: BlockCoordinate[];
  displayBlocks: BlockCoordinate[];
}

function integer(value: number, max: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= max) throw new Error(`${label}超出地理拓扑范围。`);
}
export function cellIdAt(spec: AtlasGridSpec, col: number, row: number): number {
  integer(col, spec.columns, '地块列'); integer(row, spec.rows, '地块行'); return row * spec.columns + col;
}
export function vertexIdAt(spec: AtlasGridSpec, col: number, row: number): number {
  integer(col, spec.columns + 1, '顶点列'); integer(row, spec.rows + 1, '顶点行'); return row * (spec.columns + 1) + col;
}
export function edgeIdAt(spec: AtlasGridSpec, axis: AtlasEdgeAxis, col: number, row: number): number {
  if (axis === 'horizontal') { integer(col, spec.columns, '水平边列'); integer(row, spec.rows + 1, '水平边行'); return row * spec.columns + col; }
  if (axis !== 'vertical') throw new Error('共享边方向无效。');
  integer(col, spec.columns + 1, '垂直边列'); integer(row, spec.rows, '垂直边行');
  return spec.columns * (spec.rows + 1) + row * (spec.columns + 1) + col;
}
export function cellVertexIds(spec: AtlasGridSpec, cellId: number): number[] {
  integer(cellId, spec.columns * spec.rows, '地块ID');
  const col = cellId % spec.columns, row = Math.floor(cellId / spec.columns), a = row * (spec.columns + 1) + col;
  return [a, a + 1, a + spec.columns + 1, a + spec.columns + 2];
}
export function cellEdgeIds(spec: AtlasGridSpec, cellId: number): number[] {
  integer(cellId, spec.columns * spec.rows, '地块ID'); const x = cellId % spec.columns, y = Math.floor(cellId / spec.columns);
  return [edgeIdAt(spec, 'horizontal', x, y), edgeIdAt(spec, 'vertical', x + 1, y), edgeIdAt(spec, 'horizontal', x, y + 1), edgeIdAt(spec, 'vertical', x, y)].sort((a, b) => a - b);
}
export function cellNeighbors(spec: AtlasGridSpec, cellId: number): number[] {
  integer(cellId, spec.columns * spec.rows, '地块ID'); const x = cellId % spec.columns, y = Math.floor(cellId / spec.columns), ids: number[] = [];
  if (y > 0) ids.push(cellId - spec.columns); if (x > 0) ids.push(cellId - 1);
  if (x + 1 < spec.columns) ids.push(cellId + 1); if (y + 1 < spec.rows) ids.push(cellId + spec.columns);
  return ids;
}
export function incidentCellIds(spec: AtlasGridSpec, vertexId: number): number[] {
  integer(vertexId, (spec.columns + 1) * (spec.rows + 1), '顶点ID');
  const x = vertexId % (spec.columns + 1), y = Math.floor(vertexId / (spec.columns + 1)), ids: number[] = [];
  for (const row of [y - 1, y]) for (const col of [x - 1, x]) if (row >= 0 && row < spec.rows && col >= 0 && col < spec.columns) ids.push(row * spec.columns + col);
  return ids;
}
export function cellBlock(spec: AtlasGridSpec, cellId: number): BlockCoordinate {
  integer(cellId, spec.columns * spec.rows, '地块ID');
  return { bx: Math.floor((cellId % spec.columns) / spec.blockCells), by: Math.floor(Math.floor(cellId / spec.columns) / spec.blockCells) };
}
export function vertexOwnerBlock(spec: AtlasGridSpec, vertexId: number): BlockCoordinate {
  integer(vertexId, (spec.columns + 1) * (spec.rows + 1), '顶点ID');
  const x = vertexId % (spec.columns + 1), y = Math.floor(vertexId / (spec.columns + 1));
  return { bx: Math.floor(Math.min(spec.columns - 1, Math.max(0, x - 1)) / spec.blockCells), by: Math.floor(Math.min(spec.rows - 1, Math.max(0, y - 1)) / spec.blockCells) };
}
export function edgeVertexIds(spec: AtlasGridSpec, edgeId: number): [number, number] {
  const horizontal = spec.columns * (spec.rows + 1);
  integer(edgeId, horizontal + (spec.columns + 1) * spec.rows, '共享边ID');
  if (edgeId < horizontal) { const a = vertexIdAt(spec, edgeId % spec.columns, Math.floor(edgeId / spec.columns)); return [a, a + 1]; }
  const local = edgeId - horizontal, a = vertexIdAt(spec, local % (spec.columns + 1), Math.floor(local / (spec.columns + 1)));
  return [a, a + spec.columns + 1];
}
export function edgeOwnerBlock(spec: AtlasGridSpec, edgeId: number): BlockCoordinate {
  const vertices = edgeVertexIds(spec, edgeId), incident = incidentCellIds(spec, vertices[0]).filter(id => cellVertexIds(spec, id).includes(vertices[1]));
  return cellBlock(spec, incident[0]);
}

export function ownedVertexIds(spec: AtlasGridSpec, bx: number, by: number): Uint32Array {
  integer(bx, spec.columns / spec.blockCells, '顶点块列'); integer(by, spec.rows / spec.blockCells, '顶点块行');
  const startX = bx * spec.blockCells + (bx === 0 ? 0 : 1), startY = by * spec.blockCells + (by === 0 ? 0 : 1);
  const endX = (bx + 1) * spec.blockCells, endY = (by + 1) * spec.blockCells;
  const ids = new Uint32Array((endX - startX + 1) * (endY - startY + 1)); let cursor = 0;
  for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) ids[cursor++] = vertexIdAt(spec, x, y);
  return ids;
}

export function vertexSlotLocation(spec: AtlasGridSpec, vertexId: number): { key: BlockKey; slot: number } {
  const { bx, by } = vertexOwnerBlock(spec, vertexId), x = vertexId % (spec.columns + 1), y = Math.floor(vertexId / (spec.columns + 1));
  const startX = bx * spec.blockCells + (bx === 0 ? 0 : 1), startY = by * spec.blockCells + (by === 0 ? 0 : 1), width = spec.blockCells + (bx === 0 ? 1 : 0);
  return { key: `geometry:${bx}:${by}`, slot: (y - startY) * width + x - startX };
}
export function getVertexPositionQ(data: AtlasDraftData, vertexId: number): AtlasPointQ {
  const { key, slot } = vertexSlotLocation(data.manifest.spec, vertexId), block = data.blocks.get(key);
  if (!block || block.layer !== 'geometry' || block.vertexIds[slot] !== vertexId) throw new Error('共享顶点的权威所有者缺失或引用不一致。');
  return { xQ: block.xyQ[slot * 2], yQ: block.xyQ[slot * 2 + 1] };
}
/** Returned in clockwise screen-coordinate winding; IDs elsewhere are sorted. */
export function getCellQuad(data: AtlasDraftData, cellId: number): AtlasPoint[] {
  const ids = cellVertexIds(data.manifest.spec, cellId), scale = data.manifest.spec.coordinateScale;
  return [ids[0], ids[1], ids[3], ids[2]].map(id => { const { xQ, yQ } = getVertexPositionQ(data, id); return { x: xQ / scale, y: yQ / scale }; });
}
export function affectedGeometryCells(spec: AtlasGridSpec, vertexIds: readonly number[]): number[] {
  return [...new Set(vertexIds.flatMap(id => incidentCellIds(spec, id)))].sort((a, b) => a - b);
}
function uniqueBlocks(blocks: BlockCoordinate[]): BlockCoordinate[] {
  const unique = new Map(blocks.map(block => [`${block.bx}:${block.by}`, block]));
  return [...unique.values()].sort((a, b) => a.by - b.by || a.bx - b.bx);
}
export function affectedGeometryBlocks(spec: AtlasGridSpec, vertexIds: readonly number[]): GeometryAffectedBlocks {
  const cellBlocks = uniqueBlocks(affectedGeometryCells(spec, vertexIds).map(id => cellBlock(spec, id)));
  return { ownerBlocks: uniqueBlocks(vertexIds.map(id => vertexOwnerBlock(spec, id))), cellBlocks, displayBlocks: cellBlocks.map(block => ({ ...block })) };
}
/** Owned candidate refs must already describe its immutable geometry blocks. */
export function getGeometryDependencyKey(data: AtlasDraftData): string {
  const m = data.manifest, s = m.spec;
  return JSON.stringify([m.atlasId, s.kind, s.columns, s.rows, s.width, s.height, s.coordinateScale, s.blockCells,
    m.blockRefs.filter(ref => ref.key.startsWith('geometry:')).map(ref => [ref.key, ref.hash]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)]);
}
/** Fixed-topology edits remain within a quarter of their creation-grid spacing. */
export function validateVertexPositionQ(spec: AtlasGridSpec, vertexId: number, xQ: number, yQ: number): void {
  integer(vertexId, (spec.columns + 1) * (spec.rows + 1), '顶点ID');
  if (!Number.isSafeInteger(xQ) || !Number.isSafeInteger(yQ)) throw new Error('顶点必须使用整数定点坐标。');
  const col = vertexId % (spec.columns + 1), row = Math.floor(vertexId / (spec.columns + 1)), step = spec.width * spec.coordinateScale / spec.columns;
  const x = col * step, y = row * step, limit = Math.floor(step / 4);
  if (xQ < 0 || yQ < 0 || xQ > spec.width * spec.coordinateScale || yQ > spec.height * spec.coordinateScale || Math.abs(xQ - x) > limit || Math.abs(yQ - y) > limit) throw new Error('顶点超出固定拓扑的有界移动范围。');
  if ((col === 0 || col === spec.columns) && xQ !== x || (row === 0 || row === spec.rows) && yQ !== y) throw new Error('世界外边界顶点不能越过或移动外边界。');
}
export function validateLocalGeometry(data: AtlasDraftData, vertexIds: readonly number[]): void {
  const spec = data.manifest.spec, cells = affectedGeometryCells(spec, vertexIds);
  for (const cell of cells) {
    const ids = cellVertexIds(spec, cell), points = [ids[0], ids[1], ids[3], ids[2]].map(id => {
      const p = getVertexPositionQ(data, id); validateVertexPositionQ(spec, id, p.xQ, p.yQ); return p;
    });
    for (let i = 0; i < 4; i++) {
      const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
      const cross = (b.xQ - a.xQ) * (c.yQ - b.yQ) - (b.yQ - a.yQ) * (c.xQ - b.xQ);
      if (cross <= 0) throw new Error(`地块 ${cell} 的共享几何发生退化、反向或局部交叉。`);
    }
  }
}
