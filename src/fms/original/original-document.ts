import { Delaunay } from 'd3-delaunay';
import { assertFmsDocument, FmsEditHistory, FmsModelError, type FmsDocument } from '../model';
import { buildOriginalGrid, decodeOriginalSites, ORIGINAL_GRIDS, ORIGINAL_MAP_HEIGHT, ORIGINAL_MAP_WIDTH, type OriginalGrid, type OriginalGridId } from './original-grid';

/** A playable FMS document on one of the original's BasicMap grids. The
 * triangle mesh is the Delaunay dual of the original sites, so every existing
 * geography, settlement and simulation module consumes it unchanged. */
export async function createFmsOriginalDocument(id: OriginalGridId, base?: Pick<FmsDocument, 'worldId' | 'revision' | 'version'>): Promise<FmsDocument> {
  const points = decodeOriginalSites((await ORIGINAL_GRIDS[id].load()).sites);
  const delaunay = Delaunay.from(points);
  const document: FmsDocument = {
    format: 'lieguoji-fms-world', version: base?.version ?? 1, worldId: base?.worldId ?? crypto.randomUUID(), revision: base?.revision ?? 0,
    width: ORIGINAL_MAP_WIDTH, height: ORIGINAL_MAP_HEIGHT, points: points.map(p => [p[0], p[1]]), triangles: Uint32Array.from(delaunay.triangles),
    neighbors: points.map((_, i) => [...delaunay.neighbors(i)]), elevations: new Int32Array(points.length),
  };
  if (document.version === 2) document.terrainLocks = new Uint8Array(points.length);
  assertFmsDocument(document);
  return document;
}

const gridCache = new Map<OriginalGridId, Promise<[number, number][]>>();
const sitesOf = (id: OriginalGridId) => {
  let sites = gridCache.get(id);
  if (!sites) { sites = ORIGINAL_GRIDS[id].load().then(m => decodeOriginalSites(m.sites)); gridCache.set(id, sites); }
  return sites;
};

/** Exact identity with an original grid: size and every site coordinate. */
export async function originalGridIdOf(doc: Pick<FmsDocument, 'width' | 'height' | 'points'>): Promise<OriginalGridId | null> {
  if (doc.width !== ORIGINAL_MAP_WIDTH || doc.height !== ORIGINAL_MAP_HEIGHT) return null;
  for (const id of Object.keys(ORIGINAL_GRIDS) as OriginalGridId[]) {
    const sites = await sitesOf(id);
    if (sites.length === doc.points.length && sites.every((p, i) => p[0] === doc.points[i][0] && p[1] === doc.points[i][1])) return id;
  }
  return null;
}

export async function originalGridFor(doc: Pick<FmsDocument, 'width' | 'height' | 'points'>): Promise<OriginalGrid | null> {
  const id = await originalGridIdOf(doc);
  return id ? buildOriginalGrid(id, await sitesOf(id)) : null;
}

/** Swap an untouched ocean for another blank grid. Old engines read
 * model.ts live, so this does not extend FmsEditHistory; the switch starts a
 * fresh history at the next revision (there is no drawing to undo). */
export function switchBlankGrid(history: FmsEditHistory, next: FmsDocument): FmsEditHistory {
  const current = history.document, blank = (doc: FmsDocument) => doc.elevations.every(h => h === 0) && !doc.terrainLocks?.some(Boolean);
  if (!blank(current) || !blank(next) || next.worldId !== current.worldId || next.revision !== current.revision + 1 || next.version !== current.version) {
    throw new FmsModelError('invalid-edit', '只有空白海洋可以更换格网。');
  }
  assertFmsDocument(next);
  return new FmsEditHistory(next);
}
