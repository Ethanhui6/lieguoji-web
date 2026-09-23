import { ScaleBridge } from './bridge';
import { ScaleRenderer, type ScaleCamera, type ScaleFrameSample, type ScaleLayer, type ScalePick, type ScaleQuality, type RepaintHint } from './renderer';
import { cellPolygon, elevationAt, digestFixture } from './fixture';
import { readScaleSnapshot, saveScaleSnapshot, SCALE_BENCH_DB, type ScaleSnapshotSource } from './storage';
import type { ScaleOptions, ScaleProgress, ScaleTransaction } from './types';
import type { ScaleResult, ScaleSnapshot } from './protocol';

export const DEFAULT_SCALE_OPTIONS: ScaleOptions = { geoProfile: 'basic', entityProfile: 'basic', scenario: 'continent', seed: 'ph03-repeatable-001' };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const elapsed = (start: number) => Math.round((performance.now() - start) * 100) / 100;
export type WorkerMeasureOptions = { historyLengths?: number[]; querySamples?: number; transactionSamples?: number; persistHistory?: boolean };
export type BenchView = { ready: boolean; busy: boolean; error: string; status: string; progress: ScaleProgress | null; snapshot: ReturnType<ScaleBenchController['inspect']> | null };

export class ScaleBenchController {
  private bridge = new ScaleBridge();
  private renderer: ScaleRenderer;
  private result?: ScaleResult;
  private selected: ScalePick | null = null;
  private revisions = new Map<string, number>();
  private storageLocked = false;
  private busy = false;
  private closed = false;
  private renderFailure: string | null = null;
  private entityControl?: AbortController;
  private operationControl?: AbortController;
  private lastStorage: Record<string, number | string | null> | null = null;
  private lastSample: ScaleFrameSample | null = null;
  private lastMeasurements: unknown;
  constructor(host: HTMLElement, private publish: (patch: Partial<BenchView>) => void) {
    this.renderer = new ScaleRenderer(host);
    this.bridge.onProgress = progress => publish({ progress });
    this.renderer.setPickHandler(pick => { this.selected = pick; this.update(); });
  }
  async init() { await this.renderer.init(); if (!this.closed) this.publish({ ready: true, status: '实验台已就绪；选择真实负载后生成。' }); }
  private update() { if (!this.closed) this.publish({ snapshot: this.inspect() }); }
  private async operation<T>(label: string, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.closed) throw new Error('实验台已关闭。');
    if (this.renderFailure) throw new Error(this.renderFailure);
    if (this.busy) throw new Error('已有实验操作执行中，请等待完成或取消。');
    const control = new AbortController(); this.operationControl = control;
    this.busy = true; this.publish({ busy: true, error: '', status: label, progress: null });
    // A successful action may already have committed in the Worker or IDB.
    // Cancellation is checked before those boundaries, never retroactively.
    try { const result = await action(control.signal); this.update(); return result; }
    catch (error) { this.publish({ error: message(error), status: '操作未完成，请查看原因。' }); throw error; }
    finally { if (this.operationControl === control) this.operationControl = undefined; this.busy = false; this.publish({ busy: false, progress: null }); }
  }
  private accept(result: ScaleResult, hint?: RepaintHint) {
    const changedRun = this.result?.runId !== result.runId;
    this.result = result;
    try {
      this.renderer.setFixture(result.fixture, hint);
      if (changedRun || this.selected && this.selected.cellId >= result.fixture.atlas.land.length) this.selected = null;
      if (!this.selected) this.renderer.select(null);
      if (this.selected) this.selectCell(this.selected.cellId);
    }
    catch (error) {
      this.renderFailure = `线程已完成操作，但渲染失败；本次测量无效，请刷新实验页后恢复已保存记录。${message(error)}`;
      this.publish({ ready: false, error: this.renderFailure });
      throw new Error(this.renderFailure, { cause: error });
    }
    this.publish({ status: result.summary });
    this.update();
    return this.inspect();
  }
  generate(options: ScaleOptions = DEFAULT_SCALE_OPTIONS) {
    return this.operation('正在生成真实地理与结构实体…', async () => {
      const result = await this.bridge.generate(options);
      this.storageLocked = false;
      return this.accept(result);
    });
  }
  edit(input: ScaleTransaction) {
    return this.operation('正在应用结构编辑…', async () => {
      if (this.result?.readOnly) throw new Error('历史定位处只读，请返回记录头或建立独立实验分支。');
      const result = await this.bridge.edit(input);
      const hint = input.type === 'elevation' ? { cellIds: input.cellIds } : input.type === 'administration' ? { regionIds: [input.regionId] } : input.type === 'structure-batch' ? { cellIds: [], regionIds: [] } : undefined;
      return this.accept(result, hint);
    });
  }
  undo() { return this.operation('正在撤销最近的结构事务…', async () => this.accept(await this.bridge.undo())); }
  seek(sequence: number) { return this.operation('正在定位只读结构历史…', async () => this.accept(await this.bridge.seek(sequence))); }
  live() { return this.operation('正在返回结构记录头…', async () => this.accept(await this.bridge.live())); }
  branch(sequence = this.result?.sequence ?? 0) {
    return this.operation('正在创建独立实验分支…', async () => {
      const next = await this.bridge.branch(sequence); this.storageLocked = false;
      return this.accept(next);
    });
  }
  async getSnapshot() { return (await this.bridge.snapshot()).fixture; }
  async verifyState() {
    if (!this.result) throw new Error('请先生成样本。');
    const rendererHash = await digestFixture(this.result.fixture), workerHash = (await this.bridge.snapshot()).hash;
    if (rendererHash !== workerHash) throw new Error('渲染副本与权威线程状态不一致，测量无效。');
    return { rendererHash, workerHash };
  }
  async exportSnapshot() { const result = await this.bridge.snapshot(true); if (!result.snapshot) throw new Error('线程没有返回结构历史快照。'); return result.snapshot; }
  inspectStoredPackage(runId: string) {
    return this.operation('正在只读核验完整实验主备包装…', async () => {
      const { inspectScaleStoredPackage } = await import('./history-storage-measure');
      return inspectScaleStoredPackage(runId);
    });
  }
  save() {
    return this.operation('正在保存到隔离实验库…', async signal => {
      if (!this.result || this.result.readOnly) throw new Error('请先生成样本并返回记录头，或从历史位置创建独立分支。');
      if (this.storageLocked) throw new Error('当前来自备份恢复，原主备受到保护；请创建独立实验分支后保存。');
      const snapshotResult = await this.bridge.snapshot(true);
      signal.throwIfAborted();
      if (!snapshotResult.snapshot) throw new Error('未获得实验历史快照。');
      const start = performance.now();
      const saved = await saveScaleSnapshot(snapshotResult.runId, snapshotResult.snapshot, { expectedRevision: this.revisions.get(snapshotResult.runId) ?? 0, payloadHash: snapshotResult.hash, signal });
      this.revisions.set(snapshotResult.runId, saved.revision);
      this.lastStorage = { operation: 'save', database: SCALE_BENCH_DB, runId: snapshotResult.runId, elapsedMs: elapsed(start), ...saved };
      const url = new URL(window.location.href); url.searchParams.set('run', snapshotResult.runId); window.history.replaceState(null, '', url);
      this.publish({ status: signal.aborted ? '取消请求到达时存储事务已经启动并成功提交；未回滚，主档与备份保持实际提交结果。' : '实验主档已提交；上次主档保留为备份。逻辑容量不是物理磁盘占用。' });
      return { ...saved, runId: snapshotResult.runId, hash: snapshotResult.hash, elapsedMs: this.lastStorage.elapsedMs };
    });
  }
  restore(runId: string, source: ScaleSnapshotSource = 'current') {
    return this.operation('正在读取隔离实验快照…', async signal => {
      const readStart = performance.now(), saved = await readScaleSnapshot<ScaleSnapshot>(runId, { source });
      const readMs = elapsed(readStart);
      signal.throwIfAborted();
      if (!saved.payload) throw new Error('此实验运行没有可读的' + (source === 'backup' ? '备份' : '主档') + '；没有创建或改写存储。');
      if (saved.payload.history?.runId !== runId) throw new Error('实验快照运行标识与存储位置不同；没有替换线程或修改存储。');
      // The worker verifies the complete history and supplied tail hash before commit.
      if (!saved.payloadHash) throw new Error('实验快照缺少末态摘要，未替换当前实验。');
      const loadStart = performance.now();
      const loaded = await this.bridge.load(saved.payload, saved.payloadHash);
      this.revisions.set(runId, saved.revision); this.storageLocked = source === 'backup';
      this.lastStorage = { operation: 'restore', database: SCALE_BENCH_DB, runId, source, readMs, verificationAndLoadMs: elapsed(loadStart), workerMs: loaded.metrics.workerMs, roundTripMs: loaded.metrics.roundTripMs, revision: saved.revision, payloadBytes: saved.payloadBytes, pairPayloadBytes: saved.pairPayloadBytes };
      const output = this.accept(loaded);
      this.publish({ status: source === 'backup' ? '已明确读取备份；原主备未修写。继续保存前请建立独立分支。' : '已完整校验并恢复实验结构历史，原存储未写入。' });
      return output;
    });
  }
  setCamera(camera: ScaleCamera) { if (this.busy) throw new Error('操作执行中，相机由采样或初始化控制。'); this.renderer.setCamera(camera); return this.renderer.metrics(); }
  camera() { return this.renderer.getCamera(); }
  fit() { if (this.busy) throw new Error('采样或事务执行中不能重置相机。'); this.renderer.fit(); return this.renderer.metrics(); }
  zoom(factor: number) { if (this.busy) throw new Error('采样或事务执行中不能缩放相机。'); this.renderer.zoomBy(factor); return this.renderer.metrics(); }
  async setQuality(quality: ScaleQuality) { if (this.busy) throw new Error('采样或事务执行中不能切换画质。'); await this.renderer.setQuality(quality); this.update(); return this.inspect(); }
  setLayer(layer: ScaleLayer) { if (this.busy) throw new Error('采样或事务执行中不能切换图层。'); this.renderer.setLayer(layer); this.update(); return this.inspect(); }
  pick(screenX: number, screenY: number) { const pick = this.renderer.pick(screenX, screenY); this.selected = pick; this.renderer.select(pick?.cellId ?? null); this.update(); return pick; }
  pickCell(cellId: number) { this.selectCell(cellId); this.update(); return this.selected; }
  private selectCell(cellId: number) {
    if (!this.result) throw new Error('请先生成样本。');
    const polygon = cellPolygon(this.result.fixture, cellId);
    const center = { x: polygon.reduce((sum,point) => sum+point.x,0)/polygon.length, y: polygon.reduce((sum,point) => sum+point.y,0)/polygon.length };
    const screen = this.renderer.worldToScreen(center.x, center.y);
    this.selected = this.renderer.pick(screen.x, screen.y); this.renderer.select(this.selected?.cellId ?? null);
  }
  inspect() {
    const result = this.result;
    return {
      ready: !!result && !this.renderFailure, build: __BENCH_BUILD__, options: result?.fixture.options ?? null,
      runId: result?.runId ?? null, hash: result?.hash ?? null, sequence: result?.sequence ?? 0,
      historyLength: result?.historyLength ?? 0, readOnly: result?.readOnly ?? false,
      counts: result?.fixture.counts ?? null, limitations: result?.fixture.limitations ?? [],
      storageLocked: this.storageLocked, worker: result?.metrics ?? null, renderer: this.renderer.metrics(),
      selected: this.selectionSummary(), storage: this.lastStorage,
      lastSample: this.lastSample ? { elapsedMs: this.lastSample.elapsedMs, p95: this.lastSample.p95, max: this.lastSample.max, count: this.lastSample.count, valid: this.lastSample.valid, quality: this.lastSample.quality } : null,
      measurements: this.lastMeasurements,
    };
  }
  selectionSummary() {
    if (!this.result || !this.selected) return null;
    const fixture = this.result.fixture, pick = this.selected, cityIds = new Set(pick.cityIds);
    const groups = fixture.entities.groups.filter(group => cityIds.has(group.cityId)), groupIds = new Set(groups.map(group => group.id));
    const people = fixture.entities.people.filter(person => groupIds.has(person.groupId));
    const organizations = fixture.entities.organizations.filter(organization => cityIds.has(organization.cityId));
    const armies = fixture.entities.armies.filter(army => cityIds.has(army.homeCityId));
    const adminId = pick.regionId === null ? null : fixture.state.regionAdmin[pick.regionId];
    const administration = adminId === null ? null : fixture.entities.administration[adminId];
    const ancestry: { id: number; name: string }[] = [];
    let current = administration ?? undefined;
    while (current) { ancestry.push({ id: current.id, name: current.name }); current = current.parentId === null ? undefined : fixture.entities.administration[current.parentId]; }
    return { ...pick, land: !!fixture.atlas.land[pick.cellId], elevation: elevationAt(fixture,pick.cellId), adminId, ancestry,
      nationName: pick.nationId === null ? null : fixture.entities.nations[pick.nationId]?.name,
      cityNames: fixture.entities.cities.filter(city => cityIds.has(city.id)).map(city => city.name),
      groups: groups.length, people: people.length, families: new Set(people.map(person => person.familyId)).size, organizations: organizations.length, armies: armies.length };
  }
  administrationOptions() { return this.result?.fixture.entities.administration.filter(admin => admin.leaf).map(admin => ({ id: admin.id, name: admin.name, nationId: admin.nationId })) ?? []; }
  sampleCameraPath(options: { durationMs?: number; quality?: ScaleQuality } = {}) {
    return this.operation('正在采样真实镜头路径，期间不要切换或隐藏页面…', async signal => {
      const before = await this.verifyState();
      signal.throwIfAborted();
      const sample = await this.renderer.sampleCameraPath(options); this.lastSample = sample;
      const after = await this.verifyState();
      this.publish({ status: sample.valid ? '镜头采样完成；记录的是本机与当前浏览器，不能当作真机性能承诺。' : '采样被取消或页面曾隐藏；此结果不能作为有效性能通过证据。' });
      return { ...sample, hashBefore: before.workerHash, hashAfter: after.workerHash, rendererHashBefore: before.rendererHash, rendererHashAfter: after.rendererHash, renderer: this.renderer.metrics(), build: __BENCH_BUILD__ };
    });
  }
  benchmarkWorker(options: WorkerMeasureOptions = {}) {
    return this.operation('正在测量 Worker 查询、事务与结构历史…', async () => {
      const result = await this.bridge.measure(options); this.lastMeasurements = result.measurements;
      this.publish({ status: 'Worker 实测已返回；此处是结构事务，不是完整社会推演。' });
      return { measurements: result.measurements, metrics: result.metrics, hash: result.hash, build: __BENCH_BUILD__ };
    });
  }
  benchmarkEntities() {
    return this.operation('正在测量独立实体预算，当前地图与存档保持不变…', async () => {
      const control = new AbortController(); this.entityControl = control;
      try {
        const { runEntityBudgetMeasurement } = await import('./entity-budget-bridge');
        const measured = await runEntityBudgetMeasurement({ signal: control.signal, onProgress: progress => this.publish({ progress }) });
        this.lastMeasurements = measured;
        this.publish({ status: '独立实体预算实测完成；这些上限不能拼接为同时支持的世界。' });
        return { ...measured, build: __BENCH_BUILD__ };
      } finally { if (this.entityControl === control) this.entityControl = undefined; }
    });
  }
  async snapshotTransport(transport: 'clone' | 'transfer') { const result = await this.bridge.snapshot(false,transport); return { hash: result.hash, metrics: result.metrics }; }
  cancel() { this.operationControl?.abort(); this.entityControl?.abort(); this.bridge.cancel(); this.renderer.cancelCameraPath(); this.publish({ status: '已请求取消，等待当前可取消阶段结束；原已提交状态保留。' }); }
  close() { this.closed = true; this.operationControl?.abort(); this.entityControl?.abort(); this.bridge.close(); this.renderer.destroy(); }
}

export type ScaleBenchApi = Pick<ScaleBenchController, 'generate' | 'edit' | 'undo' | 'seek' | 'live' | 'branch' | 'getSnapshot' | 'verifyState' | 'exportSnapshot' | 'inspectStoredPackage' | 'save' | 'restore' | 'setCamera' | 'camera' | 'fit' | 'zoom' | 'setQuality' | 'setLayer' | 'pick' | 'pickCell' | 'inspect' | 'sampleCameraPath' | 'benchmarkWorker' | 'benchmarkEntities' | 'snapshotTransport' | 'cancel'>;
