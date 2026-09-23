import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ScaleBridge } from './bridge';
import { ScaleRenderer, type ScaleCamera, type ScaleFrameSample, type ScaleLayer, type ScalePick, type ScaleQuality, type RepaintHint } from './renderer';
import { cellPolygon, elevationAt, digestFixture } from './fixture';
import { readScaleSnapshot, saveScaleSnapshot, SCALE_BENCH_DB, type ScaleSnapshotSource } from './storage';
import type { ScaleOptions, ScaleProgress, ScaleTransaction } from './types';
import type { ScaleResult, ScaleSnapshot } from './protocol';
import './bench.css';

const DEFAULT_OPTIONS: ScaleOptions = { geoProfile: 'basic', entityProfile: 'basic', scenario: 'continent', seed: 'ph03-repeatable-001' };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const elapsed = (start: number) => Math.round((performance.now() - start) * 100) / 100;
type WorkerMeasureOptions = { historyLengths?: number[]; querySamples?: number; transactionSamples?: number; persistHistory?: boolean };
type BenchView = { ready: boolean; busy: boolean; error: string; status: string; progress: ScaleProgress | null; snapshot: ReturnType<ScaleBenchController['inspect']> | null };

class ScaleBenchController {
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
  private async operation<T>(label: string, action: () => Promise<T>): Promise<T> {
    if (this.closed) throw new Error('实验台已关闭。');
    if (this.renderFailure) throw new Error(this.renderFailure);
    if (this.busy) throw new Error('已有实验操作执行中，请等待完成或取消。');
    this.busy = true; this.publish({ busy: true, error: '', status: label, progress: null });
    try { const result = await action(); this.update(); return result; }
    catch (error) { this.publish({ error: message(error), status: '操作未完成，请查看原因。' }); throw error; }
    finally { this.busy = false; this.publish({ busy: false, progress: null }); }
  }
  private accept(result: ScaleResult, hint?: RepaintHint) {
    const changedRun = this.result?.runId !== result.runId;
    this.result = result;
    try { this.renderer.setFixture(result.fixture, hint); }
    catch (error) {
      this.renderFailure = `线程已完成操作，但渲染失败；本次测量无效，请刷新实验页后恢复已保存记录。${message(error)}`;
      this.publish({ ready: false, error: this.renderFailure });
      throw new Error(this.renderFailure, { cause: error });
    }
    if (changedRun || this.selected && this.selected.cellId >= result.fixture.atlas.land.length) this.selected = null;
    if (!this.selected) this.renderer.select(null);
    if (this.selected) this.selectCell(this.selected.cellId);
    this.publish({ status: result.summary });
    this.update();
    return this.inspect();
  }
  generate(options: ScaleOptions = DEFAULT_OPTIONS) {
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
    return this.operation('正在保存到隔离实验库…', async () => {
      if (!this.result || this.result.readOnly) throw new Error('请先生成样本并返回记录头，或从历史位置创建独立分支。');
      if (this.storageLocked) throw new Error('当前来自备份恢复，原主备受到保护；请创建独立实验分支后保存。');
      const snapshotResult = await this.bridge.snapshot(true);
      if (!snapshotResult.snapshot) throw new Error('未获得实验历史快照。');
      const start = performance.now();
      const saved = await saveScaleSnapshot(snapshotResult.runId, snapshotResult.snapshot, { expectedRevision: this.revisions.get(snapshotResult.runId) ?? 0, payloadHash: snapshotResult.hash });
      this.revisions.set(snapshotResult.runId, saved.revision);
      this.lastStorage = { operation: 'save', database: SCALE_BENCH_DB, runId: snapshotResult.runId, elapsedMs: elapsed(start), ...saved };
      const url = new URL(window.location.href); url.searchParams.set('run', snapshotResult.runId); window.history.replaceState(null, '', url);
      this.publish({ status: '实验主档已提交；上次主档保留为备份。逻辑容量不是物理磁盘占用。' });
      return { ...saved, runId: snapshotResult.runId, hash: snapshotResult.hash, elapsedMs: this.lastStorage.elapsedMs };
    });
  }
  restore(runId: string, source: ScaleSnapshotSource = 'current') {
    return this.operation('正在读取隔离实验快照…', async () => {
      const readStart = performance.now(), saved = await readScaleSnapshot<ScaleSnapshot>(runId, { source });
      const readMs = elapsed(readStart);
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
      ready: !!result, build: __BENCH_BUILD__, options: result?.fixture.options ?? null,
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
    return this.operation('正在采样真实镜头路径，期间不要切换或隐藏页面…', async () => {
      const before = await this.verifyState();
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
  cancel() { this.entityControl?.abort(); this.bridge.cancel(); this.renderer.cancelCameraPath(); this.publish({ status: '已请求取消，等待当前可取消阶段结束；原已提交状态保留。' }); }
  close() { this.closed = true; this.entityControl?.abort(); this.bridge.close(); this.renderer.destroy(); }
}

export type ScaleBenchApi = Pick<ScaleBenchController, 'generate' | 'edit' | 'undo' | 'seek' | 'live' | 'branch' | 'getSnapshot' | 'verifyState' | 'exportSnapshot' | 'inspectStoredPackage' | 'save' | 'restore' | 'setCamera' | 'camera' | 'fit' | 'zoom' | 'setQuality' | 'setLayer' | 'pick' | 'pickCell' | 'inspect' | 'sampleCameraPath' | 'benchmarkWorker' | 'benchmarkEntities' | 'snapshotTransport' | 'cancel'>;
declare global { interface Window { scaleBench?: ScaleBenchApi } }

function App() {
  const host = useRef<HTMLDivElement>(null), controller = useRef<ScaleBenchController | null>(null);
  const [view,setView] = useState<BenchView>({ ready: false, busy: false, error: '', status: '正在初始化独立实验渲染器…', progress: null, snapshot: null });
  const [options,setOptions] = useState<ScaleOptions>(DEFAULT_OPTIONS), [quality,setQuality] = useState<ScaleQuality>('high'), [layer,setLayer] = useState<ScaleLayer>('terrain');
  const [runId,setRunId] = useState(new URL(window.location.href).searchParams.get('run') ?? ''), [sequence,setSequence] = useState('0'), [adminId,setAdminId] = useState('');
  useEffect(() => {
    const instance = new ScaleBenchController(host.current!, patch => setView(previous => ({ ...previous,...patch })));
    controller.current = instance;
    void instance.init().then(() => { window.scaleBench = instance; }).catch(error => setView(previous => ({ ...previous,error:message(error),status:'实验渲染初始化失败。' })));
    return () => { if (window.scaleBench === instance) delete window.scaleBench; instance.close(); controller.current = null; };
  }, []);
  const call = (action: (api: ScaleBenchController) => Promise<unknown> | unknown) => { const api=controller.current; if(api) void Promise.resolve().then(() => action(api)).catch(error => setView(previous => ({ ...previous,error:message(error) }))); };
  const snapshot=view.snapshot, selected=snapshot?.selected, disabled=!view.ready||view.busy, mutable=disabled||!snapshot?.ready||snapshot.readOnly;
  const updateOption = <K extends keyof ScaleOptions>(key:K,value:ScaleOptions[K]) => setOptions(previous=>({...previous,[key]:value}));
  return <main className="scale-bench">
    <header className="scale-header"><div><h1>列国纪 · 规模实验台</h1><p>PH03 本地结构与性能实验 · 不属于正式游戏 · 尚无完整社会规则</p></div><span>只写隔离实验库</span></header>
    <aside className="scale-controls">
      <section><h2>真实样本负载</h2><div className="scale-field-grid">
        <label>地理采样<select aria-label="地理规模" value={options.geoProfile} disabled={disabled} onChange={event=>updateOption('geoProfile',event.target.value as ScaleOptions['geoProfile'])}><option value="basic">16,384 · 基础</option><option value="standard">65,536 · 标准</option><option value="extended">262,144 · 扩展</option></select></label>
        <label>结构实体<select aria-label="实体规模" value={options.entityProfile} disabled={disabled} onChange={event=>updateOption('entityProfile',event.target.value as ScaleOptions['entityProfile'])}><option value="basic">基础实体</option><option value="standard">标准实体</option><option value="extended">扩展实体</option></select></label>
        <label>地理场景<select aria-label="地理场景" value={options.scenario} disabled={disabled} onChange={event=>updateOption('scenario',event.target.value as ScaleOptions['scenario'])}><option value="continent">连续大陆</option><option value="archipelago">群岛</option><option value="mountains">山地</option></select></label>
        <label>固定种子<input aria-label="实验种子" value={options.seed} maxLength={120} disabled={disabled} onChange={event=>updateOption('seed',event.target.value)} /></label>
      </div><button className="scale-primary" disabled={disabled} onClick={()=>call(api=>api.generate(options))}>生成完整样本</button><p className="scale-help">所有档位生成真实地理和关联实体；低画质只降低显示成本。</p></section>
      <section><h2>视图与采样</h2><div className="scale-field-grid"><label>画质<select aria-label="实验画质" disabled={disabled} value={snapshot?.renderer.quality ?? quality} onChange={event=>{const next=event.target.value as ScaleQuality;setQuality(next);call(api=>api.setQuality(next));}}><option value="high">高 · DPR≤2 / 较多标签</option><option value="low">低 · DPR1 / 较少标签</option></select></label><label>图层<select aria-label="实验图层" disabled={disabled} value={snapshot?.renderer.layer ?? layer} onChange={event=>{const next=event.target.value as ScaleLayer;setLayer(next);call(api=>api.setLayer(next));}}><option value="terrain">真实高程与湿度</option><option value="administration">行政归属</option></select></label></div>
        <div className="scale-actions"><button disabled={disabled||!snapshot?.ready} onClick={()=>call(api=>api.zoom(1.5))}>放大</button><button disabled={disabled||!snapshot?.ready} onClick={()=>call(api=>api.zoom(1/1.5))}>缩小</button><button disabled={disabled||!snapshot?.ready} onClick={()=>call(api=>api.fit())}>全图</button></div>
        <button disabled={disabled||!snapshot?.ready} onClick={()=>call(api=>api.sampleCameraPath({durationMs:60000,quality}))}>采样 60 秒镜头路径</button>
        <button disabled={disabled||!snapshot?.ready} onClick={()=>call(api=>api.benchmarkWorker())}>测量查询、事务与历史</button>
        <button disabled={disabled||!snapshot?.ready} onClick={()=>call(api=>api.benchmarkEntities())}>测量独立实体预算</button>
        {view.busy&&<button onClick={()=>call(api=>api.cancel())}>取消当前实验</button>}
      </section>
      <section><h2>局部结构操作</h2><p className="scale-help">点地图选择真实样本。地理格、模拟区与行政实体分开；改隶不增加或删除实体。</p>
        <div className="scale-actions"><button disabled={mutable||!selected} onClick={()=>call(api=>api.edit({type:'elevation',cellIds:[selected!.cellId],delta:.1}))}>高程 +0.1</button><button disabled={mutable||!selected} onClick={()=>call(api=>api.edit({type:'elevation',cellIds:[selected!.cellId],delta:-.1}))}>高程 −0.1</button></div>
        <label>目标基层行政单位<select aria-label="目标行政单位" value={adminId} disabled={mutable} onChange={event=>setAdminId(event.target.value)}><option value="">选择真实单位</option>{controller.current?.administrationOptions().map(admin=><option key={admin.id} value={admin.id}>{admin.name} · 国#{admin.nationId}</option>)}</select></label>
        <button disabled={mutable||selected?.regionId==null||adminId===''} onClick={()=>call(api=>api.edit({type:'administration',regionId:selected!.regionId!,adminId:Number(adminId)}))}>确认所选模拟区改隶</button>
        <div className="scale-actions"><button disabled={mutable} onClick={()=>call(api=>api.edit({type:'structure-batch',count:1}))}>结构批次 +1</button><button disabled={mutable||!snapshot?.historyLength} onClick={()=>call(api=>api.undo())}>撤销最近事务</button></div>
        <p className="scale-help">结构批次仅测试关系与状态读写，不代表已完成经济、信仰、继承或战争。</p>
      </section>
      <section><h2>结构历史与分支</h2><p>位置 {snapshot?.sequence??0} / {snapshot?.historyLength??0} · {snapshot?.readOnly?'只读定位':'记录头'}</p><label>记录序号<input aria-label="实验历史序号" type="number" min="0" max={snapshot?.historyLength??0} value={sequence} disabled={disabled} onChange={event=>setSequence(event.target.value)} /></label><div className="scale-actions"><button disabled={disabled||!snapshot?.ready} onClick={()=>call(api=>api.seek(Number(sequence)))}>只读定位</button><button disabled={disabled||!snapshot?.ready} onClick={()=>call(api=>api.live())}>返回记录头</button></div><button disabled={disabled||!snapshot?.ready} onClick={()=>call(api=>api.branch(snapshot?.sequence))}>从当前位置建立独立分支</button></section>
      <section><h2>隔离保存与恢复</h2><p className="scale-run-id">{snapshot?.runId??'尚未生成实验'}</p><button disabled={mutable||snapshot?.storageLocked} onClick={()=>call(async api=>{const result=await api.save();setRunId(result.runId);})}>保存实验快照</button><label>实验运行 ID<input aria-label="恢复实验运行ID" value={runId} disabled={disabled} onChange={event=>setRunId(event.target.value)} /></label><div className="scale-actions"><button disabled={disabled||!runId} onClick={()=>call(api=>api.restore(runId,'current'))}>恢复主档</button><button disabled={disabled||!runId} onClick={()=>call(api=>api.restore(runId,'backup'))}>明确读取备份</button></div><p className="scale-help">仅访问 {SCALE_BENCH_DB}。备份恢复不修写原档，后续保存需创建分支；此包不能导入正式游戏。</p></section>
    </aside>
    <section className="scale-map-stage" aria-label="规模实验地图"><div ref={host} className="scale-map-host" /><div className="scale-status" role="status">{view.status}{view.progress&&<span>{view.progress.stage} · {view.progress.completed}/{view.progress.total}</span>}</div>{view.error&&<div className="scale-error" role="alert"><span>{view.error}</span><button onClick={()=>setView(previous=>({...previous,error:''}))}>关闭提示</button></div>}</section>
    <aside className="scale-results"><h2>实际结果</h2>{snapshot?.counts?<><dl className="scale-counts">{Object.entries(snapshot.counts).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value.toLocaleString()}</dd></div>)}</dl><h3>所选样本与关联</h3>{selected?<pre>{JSON.stringify(selected,null,2)}</pre>:<p>点击地图可查看稳定 cell ID、模拟区、行政链与关联实体。</p>}<h3>最近操作计时</h3><pre>{JSON.stringify({worker:snapshot.worker,renderer:snapshot.renderer,storage:snapshot.storage,lastSample:snapshot.lastSample},null,2)}</pre><details><summary>结构限制与来源</summary><ul>{snapshot.limitations.map(item=><li key={item}>{item}</li>)}</ul><p className="scale-run-id">当前摘要 {snapshot.hash}</p><p className="scale-run-id">本地源 {__BENCH_BUILD__.sourceFingerprint}</p></details></>:<p>生成后显示实际数量、主线程与 Worker 分别计时，不预设通过结论。</p>}<p className="scale-help">截图和本机浏览器仿真不能替代手机／平板真机验收。GPU 信息由当前 WebGL 上下文报告。</p></aside>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
