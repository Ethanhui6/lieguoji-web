import { FMS_SEA_LEVEL, type FmsDocument } from './model';

export const FMS_DRAINAGE_ALGORITHM = 'land-area-runoff-v2' as const;
export const FMS_MIN_CATCHMENT_AREA = 512;

/** Validated document only. Uniform runoff per square world unit, not rainfall
 * volume. Clip each rendered float32 triangle at h20 and divide its land area
 * equally among its land corners. Sea corners contribute zero. This conservative
 * lumping removes site-count inflation; routing and local shares can still change
 * when the mesh is refined. It does not claim remeshing-invariant river paths. */
export function deriveFmsRunoff(doc: Pick<FmsDocument, 'points' | 'triangles' | 'elevations'>): Float64Array {
  const runoff = new Float64Array(doc.points.length);
  for (let offset = 0; offset < doc.triangles.length; offset += 3) {
    const ids = [doc.triangles[offset], doc.triangles[offset + 1], doc.triangles[offset + 2]];
    const land = ids.filter(id => doc.elevations[id] >= FMS_SEA_LEVEL);
    if (!land.length) continue;
    const [a, b, c] = ids.map(id => doc.points[id].map(Math.fround));
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    let fraction = 1;
    if (land.length === 1) {
      const h = doc.elevations[land[0]], sea = ids.filter(id => doc.elevations[id] < FMS_SEA_LEVEL);
      fraction = ((h - FMS_SEA_LEVEL) / (h - doc.elevations[sea[0]]))
        * ((h - FMS_SEA_LEVEL) / (h - doc.elevations[sea[1]]));
    } else if (land.length === 2) {
      const h = doc.elevations[ids.find(id => doc.elevations[id] < FMS_SEA_LEVEL)!];
      fraction = 1 - ((FMS_SEA_LEVEL - h) / (doc.elevations[land[0]] - h))
        * ((FMS_SEA_LEVEL - h) / (doc.elevations[land[1]] - h));
    }
    const share = area * Math.max(0, Math.min(1, fraction)) / land.length;
    for (const id of land) runoff[id] += share;
  }
  return runoff;
}

export const defaultFmsCatchmentArea = (landArea: number): number => Math.max(FMS_MIN_CATCHMENT_AREA, landArea * .003);
