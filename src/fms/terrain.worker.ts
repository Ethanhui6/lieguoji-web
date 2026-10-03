import { naturalizeFmsTerrain } from './naturalize';
import { deriveFmsDrainage } from './hydrology';
import type { FmsTerrainRequest, FmsTerrainResponse } from './terrain-client';

/** Pure computation only: this Worker never opens IndexedDB or commits a revision. */
export function runFmsTerrainRequest(raw: unknown): FmsTerrainResponse {
  const value = raw && typeof raw === 'object' ? raw as Partial<FmsTerrainRequest> : {};
  const requestId = typeof value.requestId === 'number' && Number.isSafeInteger(value.requestId) ? value.requestId : 0;
  const worldId = typeof value.document?.worldId === 'string' ? value.document.worldId : '';
  const baseRevision = typeof value.document?.revision === 'number' ? value.document.revision : -1;
  try {
    if (Object.keys(value).length !== 4 || !['kind', 'requestId', 'document', 'options'].every(key => Object.hasOwn(value, key))
      || value.kind !== 'naturalize' || requestId <= 0 || !value.document || !value.options) throw new Error('地形线程请求格式无效。');
    const result = naturalizeFmsTerrain(value.document, value.options);
    const drainage = deriveFmsDrainage({ ...value.document, elevations: result.elevations });
    return { kind: 'naturalized', requestId, worldId, baseRevision, elevations: result.elevations, stats: result.stats, drainage };
  } catch (error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code.slice(0, 80) : 'generation-failed';
    return { kind: 'error', requestId, worldId, baseRevision, code, message: error instanceof Error ? error.message.slice(0, 500) : '地形生成失败，原地图未改变。' };
  }
}

if (typeof self !== 'undefined' && typeof document === 'undefined') {
  self.onmessage = event => {
    const response = runFmsTerrainRequest(event.data);
    // Only owned output arrays are transferred; input is a separate structured clone.
    const transfer = response.kind === 'naturalized' ? [response.elevations.buffer, response.drainage.receiver.buffer,
      response.drainage.accumulation.buffer, response.drainage.filledElevation.buffer, response.drainage.lakeDepth.buffer] : [];
    self.postMessage(response, { transfer });
  };
}
