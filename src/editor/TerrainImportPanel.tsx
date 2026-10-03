import { useEffect, useId, useRef, useState } from 'react';
import { ModalDialog } from '../ui/ModalDialog';
import { AtlasRenderer } from '../world/renderer';
import { TerrainImportClient } from '../world/terrain-import-bridge';
import { TERRAIN_IMPORT_MAX_BYTES, type TerrainImportPreview } from '../world/terrain-import-wire';
import type { AtlasCommitReceipt } from '../world/storage-types';
import './terrain-import-panel.css';

const message = (error: unknown) => error instanceof Error ? error.message : '地形导入失败。';
type ImportRecord = { format: 'lieguoji-terrain-import-record'; version: 1; identity: TerrainImportPreview['identity']; summary: TerrainImportPreview['summary']; receipt: AtlasCommitReceipt };

function downloadRecord(record: ImportRecord) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `terrain-import-${record.identity.draftId}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function TerrainImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (record: ImportRecord) => Promise<void> }) {
  const title = useId(), alive = useRef(true), client = useRef<TerrainImportClient | null>(null), host = useRef<HTMLDivElement>(null), renderer = useRef<AtlasRenderer | null>(null);
  const busyRef = useRef(false), [busy, setBusy] = useState(false), [committing, setCommitting] = useState(false), [error, setError] = useState('');
  const [name, setName] = useState('导入的山海'), [status, setStatus] = useState('选择本地研究地形 JSON 后，先查看转换后的真实地图。');
  const [preview, setPreview] = useState<TerrainImportPreview | null>(null), [displayReady, setDisplayReady] = useState(false);
  const [savedRecord, setSavedRecord] = useState<ImportRecord | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; client.current?.close(); renderer.current?.destroy(); renderer.current = null; }; }, []);
  useEffect(() => {
    if (!preview || !host.current) return;
    let valid = true;
    const map = new AtlasRenderer(host.current, {
      onPick: () => {},
      onProgress: progress => { if (valid) setStatus(`${progress.stage} · ${progress.completed}/${progress.total}`); },
      onGraphicsState: state => { if (valid && state !== 'ready') setDisplayReady(false); },
      onFatal: failure => { if (valid) { setError(message(failure)); setDisplayReady(false); } },
    });
    renderer.current = map;
    void (async () => {
      await map.init(); if (!valid) return; await map.accept(preview.data); if (!valid) return;
      setDisplayReady(true); setStatus('导入预览 · 尚未保存。拖动、滚轮或双指缩放检查海岸和山地。');
    })().catch(failure => { if (valid) setError(message(failure)); });
    return () => { valid = false; map.destroy(); if (renderer.current === map) renderer.current = null; };
  }, [preview]);
  async function read(file?: File) {
    if (!file || busyRef.current || preview) return;
    if (!name.trim()) { setError('请先填写新草稿名称。'); return; }
    if (!file.size || file.size > TERRAIN_IMPORT_MAX_BYTES) { setError('请选择 12 MiB 以内的研究地形 JSON。'); return; }
    busyRef.current = true; setBusy(true); setError(''); setStatus('正在读取本地地形文件……');
    client.current?.close();
    try {
      const importer = new TerrainImportClient({ onProgress: progress => { if (alive.current) setStatus(`${progress.stage} · ${progress.completed}/${progress.total}`); } });
      client.current = importer;
      const bytes = new Uint8Array(await file.arrayBuffer()); if (!alive.current || client.current !== importer) return;
      const candidate = await importer.preview(bytes, { name: name.trim(), size: 128 });
      if (!alive.current || client.current !== importer) return; setPreview(candidate);
    } catch (failure) { if (alive.current) { setError(message(failure)); setStatus('文件未形成可确认预览，现有草稿保持原样。'); } }
    finally { if (alive.current) { busyRef.current = false; setBusy(false); } }
  }
  async function confirm() {
    if (busyRef.current || !preview || !displayReady || !client.current) return;
    busyRef.current = true; setBusy(true); setCommitting(true); setError('');
    setStatus('正在确认并保存独立新草稿；保存完成后自动打开。');
    try {
      const receipt = await client.current.confirm();
      const record: ImportRecord = { format: 'lieguoji-terrain-import-record', version: 1, identity: preview.identity, summary: preview.summary, receipt };
      if (!alive.current) return; setSavedRecord(record);
      // Only this verified durable receipt authorizes changing the visible route.
      await onImported(record);
    } catch (failure) { if (alive.current) { setError(message(failure)); setStatus('未切换当前草稿。如确认阶段中断，请从草稿目录核对同名独立草稿，勿重复导入。'); } }
    finally { if (alive.current) { busyRef.current = false; setBusy(false); setCommitting(false); } }
  }
  const summary = preview?.summary;
  return <ModalDialog titleId={title} className="terrain-import-dialog" locked={committing} onDismiss={onClose}>
    <header><h2 id={title}>导入研究地形</h2><p>创建独立山海草稿 · 确认前不保存</p></header>
    {!preview && <div className="terrain-import-form"><label>新草稿名称<input aria-label="导入地形草稿名称" maxLength={80} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label><label>本地地形 JSON<input aria-label="选择研究地形 JSON" type="file" accept=".json,application/json" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void read(file); }} /></label><p>支持研究页导出的 fms-terrain-research v2，最大 12 MiB。地图按真实三角形高程重采样为可编辑地形；基础规模为 16,384 地块，细海岸使用独立精度。</p><p>该研究数据由原算法配合网页测试 Delaunay 邻接生成。它不是原 Unity 拓扑的等价恢复，也不包含国家、城市或游戏存档。</p></div>}
    {preview && <><div className="terrain-import-map" ref={host} data-testid="terrain-import-map" data-import-display={displayReady ? 'ready' : 'preparing'} data-import-draft={preview.identity.draftId} data-import-manifest={preview.identity.manifestDigest} /><div className="terrain-import-map-controls"><button disabled={!displayReady || busy} aria-label="放大导入地图" onClick={() => renderer.current?.zoom(1.5)}>＋</button><button disabled={!displayReady || busy} aria-label="缩小导入地图" onClick={() => renderer.current?.zoom(1 / 1.5)}>−</button><button disabled={!displayReady || busy} onClick={() => renderer.current?.fit()}>查看导入全图</button></div><details className="terrain-import-source"><summary>来源与转换说明</summary><p>{summary!.pointCount.toLocaleString()} 个地形点 · {summary!.triangleCount.toLocaleString()} 个三角形。源范围 {summary!.width} × {summary!.height}。采用网页测试邻接，并非原 Unity 地图拓扑。</p><p>{summary!.mapping.note}</p><p>来源摘要 {summary!.sourceSha256}</p><p>确认后仅保存转换的可编辑地形。来源说明不写入旧存档格式；可另存导入记录，刷新前请保留原 JSON。</p></details></>}
    <p className="terrain-import-status" role="status">{status}</p>{error && <p className="terrain-import-error" role="alert">{error}</p>}
    <footer><button disabled={committing} onClick={onClose}>{savedRecord ? '关闭导入' : '取消导入'}</button>{savedRecord ? <button onClick={() => downloadRecord(savedRecord)}>保存导入记录</button> : preview && <button className="atlas-primary" disabled={!displayReady || busy || !!error} onClick={() => void confirm()}>确认导入并保存新草稿</button>}</footer>
  </ModalDialog>;
}

export function TerrainImportPanel({ disabled, onImported }: { disabled: boolean; onImported: (receipt: AtlasCommitReceipt) => Promise<void> }) {
  const [open, setOpen] = useState(false), [record, setRecord] = useState<ImportRecord | null>(null);
  return <section className="terrain-import-entry"><h3>从本地地形开始</h3><p className="atlas-help">导入研究地形，预览海陆与山地，再另存为独立可编辑草稿。当前草稿和只读备份均保留。</p><button disabled={disabled} onClick={() => setOpen(true)}>导入研究地形 JSON</button>{record && <p className="atlas-help">本次导入来源说明仅在此面板保留。<button onClick={() => downloadRecord(record)}>保存导入记录</button></p>}{open && <TerrainImportDialog onClose={() => setOpen(false)} onImported={async next => { setRecord(next); await onImported(next.receipt); setOpen(false); }} />}</section>;
}
