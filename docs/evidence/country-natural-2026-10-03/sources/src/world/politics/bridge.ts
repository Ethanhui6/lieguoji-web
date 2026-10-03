import { validateCountrySource, type CountrySource } from './geography';
import { countryDocumentDigest } from './chunk-codec';
import { CountryTransferReader } from './transfer';
import { COUNTRY_LIMITS, countryArray, countryExact, countryHash, countryId, countryInteger, countryJsonBytes, countryName, validateCountryCommand, validateCountryDocument, validateCountryState,
  type CountryCommand, type CountryListEntry, type CountryPreview, type CountryState } from './model';
export type { CountryCommand, CountryDocument, CountryListEntry, CountryPreview, CountryState, CountrySource } from './model';
type Operation = { type: 'create'; source: CountrySource; name: string } | { type: 'open'; worldId: string } | { type: 'list' } | { type: 'cancel-preview' }
  | { type: 'copy-to-v2'; worldId: string; name: string }
  | { type: 'copy-to-v3'; worldId: string; name: string }
  | { type: 'preview'; command: CountryCommand; expected: { worldId: string; revision: number; rootDigest: string } } | { type: 'confirm'; candidateId: string };
interface Pending { id: number; operation: Operation; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; settled: Promise<void>; finish: () => void }
export interface CountryClientOptions { onProgress?: (progress: { stage: string; completed: number; total: number }) => void; timeoutMs?: number }
const sameSource = (a: CountrySource, b: CountrySource) => a.draftId === b.draftId && a.revision === b.revision && a.rootDigest === b.rootDigest && a.manifestDigest === b.manifestDigest && a.atlasFormat === b.atlasFormat;

export class CountryClient {
  private readonly worker: Worker;
  private pending: Pending | null = null;
  private serial = 0;
  private state: CountryState | null = null;
  private candidate: CountryPreview | null = null;
  private closed = false;
  private transfer: CountryTransferReader | null = null;
  private receives: Promise<void> = Promise.resolve();
  constructor(private readonly options: CountryClientOptions = {}) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = event => { this.receives = this.receives.then(() => this.receive(event.data)).catch(error => this.fail(error instanceof Error ? error : new Error(String(error)))); };
    this.worker.onerror = () => this.fail(new Error('国家线程中断；请重新打开草稿核对已保存状态，勿重复创建副本。'));
    this.worker.onmessageerror = () => this.fail(new Error('国家线程回执无法读取，请重新打开已保存草稿。'));
  }
  private fail(error: Error) { const pending = this.pending; this.pending = null; this.transfer = null; this.closed = true; this.worker.terminate(); if (pending) { clearTimeout(pending.timer); pending.finish(); pending.reject(error); } }
  private request<T>(operation: Operation): Promise<T> {
    if (this.closed) return Promise.reject(new Error('国家线程已关闭，请重新打开。'));
    if (this.pending) return Promise.reject(new Error('国家世界正在执行操作。'));
    const id = ++this.serial, body = { id, ...operation };
    if (countryJsonBytes(body).length > COUNTRY_LIMITS.packetBytes) return Promise.reject(new Error('国家请求超过消息容量。'));
    return new Promise<T>((resolve, reject) => {
      let finish!: () => void; const settled = new Promise<void>(done => { finish = done; });
      const timer = setTimeout(() => this.fail(new Error('国家操作长时间无回执；可能已保存，请重新打开草稿列表核对。')), this.options.timeoutMs ?? 120000);
      this.pending = { id, operation: structuredClone(operation), resolve: value => resolve(value as T), reject, timer, settled, finish };
      try { this.worker.postMessage(body); } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    });
  }
  private async receive(raw: unknown) {
    const p = this.pending;
    try {
      if (!p || !raw || typeof raw !== 'object' || countryJsonBytes(raw).length > COUNTRY_LIMITS.packetBytes) throw new Error('国家回执没有对应请求或超过容量。');
      const message = raw as Record<string, unknown>;
      if (message.id !== p.id) throw new Error('国家回执属于其他操作。');
      if (message.kind === 'transfer-start') {
        if (!countryExact(message, ['id', 'kind', 'value']) || this.transfer || !['create', 'copy-to-v2', 'copy-to-v3', 'open', 'confirm', 'preview'].includes(p.operation.type)) throw new Error('国家分块回执起始无效。');
        this.transfer = new CountryTransferReader(message.value, p.operation.type === 'preview' ? 'preview' : 'state'); return;
      }
      if (message.kind === 'transfer-page') {
        if (!countryExact(message, ['id', 'kind', 'value']) || !this.transfer) throw new Error('国家分块回执缺少起始清单。');
        this.transfer.append(message.value); return;
      }
      if (message.kind === 'progress') {
        if (!countryExact(message, ['id', 'kind', 'progress']) || !countryExact(message.progress, ['stage', 'completed', 'total']) || typeof message.progress.stage !== 'string'
          || !countryInteger(message.progress.completed, 0, Number.MAX_SAFE_INTEGER) || !countryInteger(message.progress.total, 0, Number.MAX_SAFE_INTEGER)) throw new Error('国家进度格式无效。');
        this.options.onProgress?.(message.progress as unknown as { stage: string; completed: number; total: number }); return;
      }
      if (message.kind === 'error') {
        if (!countryExact(message, ['id', 'kind', 'message', 'name']) || typeof message.message !== 'string' || typeof message.name !== 'string') throw new Error('国家错误回执无效。');
        const error = new Error(message.message); error.name = message.name;
        this.pending = null; this.transfer = null; clearTimeout(p.timer); p.finish(); p.reject(error); return;
      }
      if (message.kind !== 'complete' || !countryExact(message, ['id', 'kind', 'value'])) throw new Error('国家完成回执格式无效。');
      const value = this.transfer ? await this.transfer.finish(message.value) : message.value, op = p.operation;
      if (this.pending !== p || this.closed) return;
      this.transfer = null;
      if (op.type === 'create' || op.type === 'copy-to-v2' || op.type === 'copy-to-v3' || op.type === 'open' || op.type === 'confirm') {
        if (!validateCountryState(value)) throw new Error('国家状态回执字段、引用或摘要无效。');
        if (op.type === 'open' && value.document.worldId !== op.worldId
          || op.type === 'create' && (value.document.version !== 3 || value.document.revision !== 0 || !sameSource(value.document.source, op.source) || value.document.name !== op.name)
          || op.type === 'copy-to-v2' && (value.document.version !== 2 || value.document.worldId === op.worldId || value.document.name !== op.name || value.document.revision !== 0)
          || op.type === 'copy-to-v3' && (value.document.version !== 3 || value.document.worldId === op.worldId || value.document.name !== op.name || value.document.revision !== 0)
          || op.type === 'confirm' && (!this.candidate || this.candidate.candidateId !== op.candidateId || await countryDocumentDigest(value.document) !== await countryDocumentDigest(this.candidate.document))) throw new Error('国家状态回执未绑定本次操作。');
        if (this.pending !== p || this.closed) return;
        this.state = structuredClone(value); this.candidate = null;
      } else if (op.type === 'preview') {
        if (!countryExact(value, ['candidateId', 'description', 'document']) || !countryId(value.candidateId, 'candidate') || typeof value.description !== 'string' || value.description.length > 1000
          || !validateCountryDocument(value.document) || value.document.worldId !== op.expected.worldId || value.document.revision !== op.expected.revision + 1
          || !this.state || this.state.rootDigest !== op.expected.rootDigest || !sameSource(value.document.source, this.state.document.source)) throw new Error('国家预览没有绑定当前来源。');
        this.candidate = structuredClone(value as unknown as CountryPreview);
      } else if (op.type === 'cancel-preview') { if (value !== null) throw new Error('取消预览回执无效。'); this.candidate = null; }
      else {
        if (!countryArray(value, 10000) || value.some(row => !countryExact(row, ['worldId', 'name', 'revision', 'readOnly', 'recovered', 'nationCount', 'cityCount']) || !countryId(row.worldId, 'country')
          || !countryName(row.name) || !countryInteger(row.revision, 0, Number.MAX_SAFE_INTEGER) || typeof row.readOnly !== 'boolean' || typeof row.recovered !== 'boolean'
          || !countryInteger(row.nationCount, 0, COUNTRY_LIMITS.nations) || !countryInteger(row.cityCount, 0, COUNTRY_LIMITS.cities))) throw new Error('国家草稿列表回执无效。');
      }
      this.pending = null; clearTimeout(p.timer); p.finish(); p.resolve(structuredClone(value));
    } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
  }
  create(source: CountrySource, name: string): Promise<CountryState> {
    if (!validateCountrySource(source) || !countryName(name)) return Promise.reject(new Error('建国来源或名称无效。'));
    return this.request({ type: 'create', source: { ...source }, name });
  }
  open(worldId: string): Promise<CountryState> { if (!countryId(worldId, 'country')) return Promise.reject(new Error('国家世界 ID 无效。')); return this.request({ type: 'open', worldId }); }
  copyToV2(worldId: string, name: string): Promise<CountryState> { if (!countryId(worldId, 'country') || !countryName(name)) return Promise.reject(new Error('旧档身份或副本名称无效。')); return this.request({ type: 'copy-to-v2', worldId, name }); }
  copyToV3(worldId: string, name: string): Promise<CountryState> { if (!countryId(worldId, 'country') || !countryName(name)) return Promise.reject(new Error('旧档身份或自然国界副本名称无效。')); return this.request({ type: 'copy-to-v3', worldId, name }); }
  list(): Promise<CountryListEntry[]> { return this.request({ type: 'list' }); }
  preview(command: CountryCommand): Promise<CountryPreview> {
    if (!this.state || this.state.readOnly || !validateCountryCommand(command)) return Promise.reject(new Error('请打开可编辑国家世界，并提交有效命令。'));
    const expected = { worldId: this.state.document.worldId, revision: this.state.document.revision, rootDigest: this.state.rootDigest };
    if (!countryHash(expected.rootDigest)) return Promise.reject(new Error('国家世界摘要无效。'));
    return this.request({ type: 'preview', expected, command: structuredClone(command) });
  }
  confirm(): Promise<CountryState> { if (!this.candidate) return Promise.reject(new Error('没有可确认的国家预览。')); return this.request({ type: 'confirm', candidateId: this.candidate.candidateId }); }
  async cancelPreview(): Promise<void> {
    const pending = this.pending;
    if (pending) { this.worker.postMessage({ type: 'abort' }); await pending.settled; }
    await this.request({ type: 'cancel-preview' });
  }
  async undo(): Promise<CountryState> { await this.preview({ type: 'undo' }); return this.confirm(); }
  close() { this.fail(new Error('国家世界页面已关闭；已提交的独立草稿可从列表重新打开。')); }
}
