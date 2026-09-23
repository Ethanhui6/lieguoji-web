import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ScaleBenchController, DEFAULT_SCALE_OPTIONS as DEFAULT_OPTIONS, type BenchView, type ScaleBenchApi } from './controller';
import type { ScaleLayer, ScaleQuality } from './renderer';
import { SCALE_BENCH_DB } from './storage';
import type { ScaleOptions } from './types';
import './bench.css';

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
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
