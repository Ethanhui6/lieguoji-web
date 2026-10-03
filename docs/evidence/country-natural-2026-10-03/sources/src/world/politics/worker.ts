import type { AtlasDocument } from '../atlas-format';
import type { AtlasControl } from '../model';
import { applyCountryCommand, makeCountryCreationIds, validateCountryWorldGeography, type CountryCreationIds } from './core';
import { prepareCountryGeography, validateCountrySource } from './geography';
import { countryDocumentDigest } from './chunk-codec';
import { streamCountryResult } from './transfer';
import { COUNTRY_LIMITS, countryDigest, countryExact, countryHash, countryId, countryInteger, countryJsonBytes, countryName, validateCountryCommand,
  type CountryCommand, type CountryPreview, type CountrySource, type CountryState } from './model';
import { commitCountryWorld, copyCountryWorldToV2, copyCountryWorldToV3, countryUndoDocument, createCountryWorld, listCountryWorlds, openCountryWorld, readCountryGeography } from './storage';

export type CountryRequest = { id: number } & (
  | { type: 'create'; source: CountrySource; name: string }
  | { type: 'open'; worldId: string }
  | { type: 'copy-to-v2'; worldId: string; name: string }
  | { type: 'copy-to-v3'; worldId: string; name: string }
  | { type: 'list' }
  | { type: 'preview'; expected: { worldId: string; revision: number; rootDigest: string }; command: CountryCommand }
  | { type: 'confirm'; candidateId: string }
  | { type: 'cancel-preview' }
);
interface Candidate { preview: CountryPreview; base: CountryState; command: CountryCommand; ids: CountryCreationIds; commandId: string; requestDigest: string }
export function validateCountryRequest(raw: unknown): raw is CountryRequest {
  if (!raw || typeof raw !== 'object' || countryJsonBytes(raw).length > COUNTRY_LIMITS.packetBytes) return false;
  const r = raw as Record<string, unknown>;
  if (!countryInteger(r.id, 1, Number.MAX_SAFE_INTEGER)) return false;
  if (r.type === 'create') return countryExact(r, ['id', 'type', 'source', 'name']) && validateCountrySource(r.source) && countryName(r.name);
  if (r.type === 'open') return countryExact(r, ['id', 'type', 'worldId']) && countryId(r.worldId, 'country');
  if (r.type === 'copy-to-v2' || r.type === 'copy-to-v3') return countryExact(r, ['id', 'type', 'worldId', 'name']) && countryId(r.worldId, 'country') && countryName(r.name);
  if (r.type === 'list' || r.type === 'cancel-preview') return countryExact(r, ['id', 'type']);
  if (r.type === 'confirm') return countryExact(r, ['id', 'type', 'candidateId']) && countryId(r.candidateId, 'candidate');
  return r.type === 'preview' && countryExact(r, ['id', 'type', 'expected', 'command']) && countryExact(r.expected, ['worldId', 'revision', 'rootDigest'])
    && countryId(r.expected.worldId, 'country') && countryInteger(r.expected.revision, 0, Number.MAX_SAFE_INTEGER) && countryHash(r.expected.rootDigest) && validateCountryCommand(r.command);
}
/** One private geography and political head per Worker. No app/renderer state
 * authorizes writes. Confirmation repeats the real command against durable CAS. */
export class CountryRuntime {
  private state: CountryState | null = null;
  private geography: AtlasDocument | null = null;
  private candidate: Candidate | null = null;
  private active: AbortController | null = null;
  abort() { this.candidate = null; this.active?.abort(new DOMException('已取消国家世界操作；已完成的独立副本可从草稿列表找回。', 'AbortError')); }
  async handle(raw: unknown, onProgress?: AtlasControl['onProgress']): Promise<unknown> {
    if (!validateCountryRequest(raw)) throw new Error('国家世界请求字段、版本或消息容量无效。');
    if (this.active) throw new Error('国家世界正在执行操作，请等待或取消。');
    const request = structuredClone(raw), active = new AbortController(); this.active = active;
    const check = () => { active.signal.throwIfAborted(); if (this.active !== active) throw new Error('国家世界操作已失效。'); };
    const control: AtlasControl = { signal: active.signal, onProgress: progress => { check(); onProgress?.(progress); check(); }, yieldTask: async () => { check(); await new Promise<void>(resolve => setTimeout(resolve, 0)); check(); } };
    try {
      if (request.type === 'list') return await listCountryWorlds();
      if (request.type === 'cancel-preview') { this.candidate = null; return null; }
      if (request.type === 'create' || request.type === 'copy-to-v2' || request.type === 'copy-to-v3') {
        this.candidate = null;
        let state: CountryState;
        if (request.type === 'create') {
          const record = await prepareCountryGeography(request.source, control); check();
          control.onProgress?.({ stage: '保存独立国家世界与完整地理副本', completed: 0, total: 1 });
          state = await createCountryWorld(record, request.name, active.signal);
        } else state = request.type === 'copy-to-v2' ? await copyCountryWorldToV2(request.worldId, request.name, active.signal) : await copyCountryWorldToV3(request.worldId, request.name, control);
        // A commit that already won is not undone by a late abort/closed page.
        this.state = state; this.geography = null; check();
        this.geography = await readCountryGeography(state.document.worldId); check();
        await validateCountryWorldGeography(state.document, this.geography, control); check();
        return structuredClone(state);
      }
      if (request.type === 'open') {
        this.candidate = null;
        const state = await openCountryWorld(request.worldId); check();
        const geography = await readCountryGeography(request.worldId); check();
        await validateCountryWorldGeography(state.document, geography, control); check();
        this.state = state; this.geography = geography; return structuredClone(state);
      }
      const base = this.state, geography = this.geography;
      if (!base || !geography) throw new Error('请先打开一个已保存的国家世界。');
      if (base.readOnly) throw new Error('损坏主档的恢复备份保持只读，不能编辑或覆盖。');
      const current = await openCountryWorld(base.document.worldId); check();
      if (current.readOnly || current.rootDigest !== base.rootDigest || current.document.revision !== base.document.revision) throw new Error('国家世界已被另一标签修改或损坏，请重新打开。');
      if (request.type === 'preview') {
        this.candidate = null;
        if (request.expected.worldId !== base.document.worldId || request.expected.rootDigest !== base.rootDigest || request.expected.revision !== base.document.revision) throw new Error('国家预览没有绑定当前已保存世界。');
        const command = structuredClone(request.command), ids = makeCountryCreationIds(command);
        const result = command.type === 'undo' ? { document: await countryUndoDocument(base), description: '撤销最近一次国家编辑；实体身份和引用恢复到原来的状态。' }
          : await applyCountryCommand(base.document, command, geography, ids, control);
        if (command.type === 'undo') await validateCountryWorldGeography(result.document, geography, control);
        check(); await countryDocumentDigest(result.document); check();
        const preview: CountryPreview = { candidateId: `candidate-${crypto.randomUUID()}`, description: result.description, document: result.document };
        const requestDigest = await countryDigest(countryJsonBytes({ base: base.rootDigest, command, ids })); check();
        this.candidate = { preview, base: structuredClone(base), command, ids, commandId: `command-${crypto.randomUUID()}`, requestDigest };
        return structuredClone(preview);
      }
      const candidate = this.candidate;
      if (!candidate || request.candidateId !== candidate.preview.candidateId || candidate.base.rootDigest !== current.rootDigest) throw new Error('国家预览已取消或过期，请重新预览。');
      const next = candidate.command.type === 'undo' ? await countryUndoDocument(current)
        : (await applyCountryCommand(current.document, candidate.command, geography, candidate.ids, control)).document;
      if (candidate.command.type === 'undo') await validateCountryWorldGeography(next, geography, control);
      check();
      if (await countryDocumentDigest(next) !== await countryDocumentDigest(candidate.preview.document)) throw new Error('国家命令重验与预览不一致，未保存。');
      check(); const state = await commitCountryWorld(current, next, candidate.commandId, candidate.requestDigest, candidate.command.type === 'undo', active.signal);
      this.state = state; this.candidate = null; return structuredClone(state);
    } finally { if (this.active === active) this.active = null; }
  }
}

const isWorker = typeof self !== 'undefined' && typeof document === 'undefined' && typeof (self as unknown as { postMessage?: unknown }).postMessage === 'function';
if (isWorker) {
  const port = self as unknown as { postMessage: (value: unknown) => void; onmessage: ((event: MessageEvent) => void) | null }, runtime = new CountryRuntime();
  const post = (value: unknown) => { if (countryJsonBytes(value).length > COUNTRY_LIMITS.packetBytes) throw new Error('国家响应超过 512 KiB 消息上限，未传送截断结果。'); port.postMessage(value); };
  port.onmessage = event => {
    if (countryExact(event.data, ['type']) && event.data.type === 'abort') { runtime.abort(); return; }
    const id = event.data && typeof event.data === 'object' && countryInteger(event.data.id, 1, Number.MAX_SAFE_INTEGER) ? event.data.id as number : 0;
    void runtime.handle(event.data, progress => post({ id, kind: 'progress', progress })).then(async value => {
      const result = await streamCountryResult(value, (kind, part) => post({ id, kind, value: part }));
      post({ id, kind: 'complete', value: result });
    }).catch(error => {
      post({ id, kind: 'error', message: error instanceof Error ? error.message : String(error), name: error instanceof Error ? error.name : 'Error' });
    });
  };
}
