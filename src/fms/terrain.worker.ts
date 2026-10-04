import { naturalizeFmsTerrain } from './naturalize';
import { deriveFmsDrainage } from './hydrology';
import { generateFmsHill } from './hill';
import { generateFmsLocalTemplate } from './local-template';
import type { FmsGenerationRequest, FmsGenerationResponse } from './terrain-client';

/** Pure computation only: this Worker never opens IndexedDB or commits a revision. */
export function runFmsTerrainRequest(raw: unknown): FmsGenerationResponse {
  const value = raw && typeof raw === 'object' ? raw as Partial<FmsGenerationRequest> : {};
  const requestId = typeof value.requestId === 'number' && Number.isSafeInteger(value.requestId) ? value.requestId : 0;
  const worldId = typeof value.document?.worldId === 'string' ? value.document.worldId : '';
  const baseRevision = typeof value.document?.revision === 'number' ? value.document.revision : -1;
  try {
    if (Object.keys(value).length !== 4 || !['kind', 'requestId', 'document', 'options'].every(key => Object.hasOwn(value, key))
      || !['naturalize', 'hill'].includes(value.kind ?? '') || requestId <= 0 || !value.document || !value.options) throw new Error('地形线程请求格式无效。');
    if (value.kind === 'hill') {
      const result = generateFmsHill(value.document, value.options);
      const drainage = deriveFmsDrainage({ ...value.document, elevations: result.elevations });
      return { kind: 'hill-generated', requestId, worldId, baseRevision, ...result, drainage };
    }
    if (value.kind !== 'naturalize') throw new Error('地形请求类型无效。');
    const result = naturalizeFmsTerrain(value.document, value.options);
    const drainage = deriveFmsDrainage({ ...value.document, elevations: result.elevations });
    return { kind: 'naturalized', requestId, worldId, baseRevision, elevations: result.elevations, stats: result.stats, drainage };
  } catch (error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code.slice(0, 80) : 'generation-failed';
    return { kind: 'error', requestId, worldId, baseRevision, code, message: error instanceof Error ? error.message.slice(0, 500) : '地形生成失败，原地图未改变。' };
  }
}

export async function runFmsTemplateRequest(raw: unknown): Promise<FmsGenerationResponse> {
  const value = raw && typeof raw === 'object' ? raw as Partial<FmsGenerationRequest> : {};
  const requestId = typeof value.requestId === 'number' && Number.isSafeInteger(value.requestId) ? value.requestId : 0;
  const worldId = typeof value.document?.worldId === 'string' ? value.document.worldId : '';
  const baseRevision = typeof value.document?.revision === 'number' ? value.document.revision : -1;
  try {
    if (Object.keys(value).length !== 4 || !['kind', 'requestId', 'document', 'options'].every(key => Object.hasOwn(value, key))
      || value.kind !== 'template' || requestId <= 0 || !value.document || !value.options) throw new Error('局部地形线程请求格式无效。');
    const result = await generateFmsLocalTemplate(value.document, value.options);
    return { kind: 'template-generated', requestId, worldId, baseRevision, ...result, drainage: deriveFmsDrainage({ ...value.document, elevations: result.elevations }) };
  } catch (error) {
    return { kind: 'error', requestId, worldId, baseRevision, code: 'generation-failed', message: error instanceof Error ? error.message.slice(0, 500) : '局部地形生成失败，原地图未改变。' };
  }
}

if (typeof self !== 'undefined' && typeof document === 'undefined') {
  self.onmessage = async event => {
    const response = event.data?.kind === 'template' ? await runFmsTemplateRequest(event.data) : runFmsTerrainRequest(event.data);
    // Only owned output arrays are transferred; input is a separate structured clone.
    const transfer = response.kind !== 'error' ? [response.elevations.buffer, response.drainage.receiver.buffer,
      response.drainage.runoff.buffer, response.drainage.accumulation.buffer, response.drainage.filledElevation.buffer, response.drainage.lakeDepth.buffer] : [];
    self.postMessage(response, { transfer });
  };
}
