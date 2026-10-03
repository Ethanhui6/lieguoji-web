import { useEffect, useId, useRef, useState } from 'react';
import { ModalDialog } from '../ui/ModalDialog';
import { Icon } from '../ui/Icon';
import { AtlasRenderer } from '../world/renderer';
import { SeedTerrainClient } from '../world/seed-terrain-client';
import { SEED_TERRAIN_TEMPLATES, validSeedTerrainRequest, type SeedTerrainTemplate } from '../world/recovered-terrain/contract';
import type { SeedTerrainPreview } from '../world/seed-terrain-wire';
import type { AtlasCommitReceipt } from '../world/storage-types';
import type { AtlasProgress } from '../world/protocol';
import './seed-terrain-panel.css';

export type CreationRecord = { format: 'lieguoji-seed-terrain-record'; version: 1; generation: SeedTerrainPreview['generation']; identity: SeedTerrainPreview['terrain']['identity']; summary: SeedTerrainPreview['terrain']['summary']; receipt: AtlasCommitReceipt };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '新世界未能完成，请重试。';
function downloadRecord(record: CreationRecord) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `world-creation-${record.receipt.draftId}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function SeedTerrainDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (record: CreationRecord) => Promise<void> }) {
  const titleId = useId(), alive = useRef(true), busyRef = useRef(false), client = useRef<SeedTerrainClient | null>(null);
  const host = useRef<HTMLDivElement>(null), renderer = useRef<AtlasRenderer | null>(null);
  const [name, setName] = useState('新的山海'), [seed, setSeed] = useState('421730'), [template, setTemplate] = useState<SeedTerrainTemplate>('archipelago');
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [displayReady, setDisplayReady] = useState(false);
  const [preview, setPreview] = useState<SeedTerrainPreview | null>(null), [savedRecord, setSavedRecord] = useState<CreationRecord | null>(null);
  const [progress, setProgress] = useState<AtlasProgress | null>(null), [status, setStatus] = useState('选一种山海，再给这个世界一个名字。'), [error, setError] = useState('');
  useEffect(() => { alive.current = true; return () => { alive.current = false; client.current?.close(); renderer.current?.destroy(); renderer.current = null; }; }, []);
  useEffect(() => {
    if (!preview || !host.current) return;
    let valid = true, accepted = false;
    const map = new AtlasRenderer(host.current, {
      onPick: () => {},
      onProgress: next => { if (valid) setProgress(next); },
      onGraphicsState: state => { if (valid) setDisplayReady(accepted && state === 'ready'); },
      onFatal: failure => { if (valid) { setError(errorMessage(failure)); setDisplayReady(false); } },
    }); renderer.current = map;
    void (async () => {
      await map.init(); if (!valid) return; await map.accept(preview.terrain.data); if (!valid) return;
      accepted = true; setDisplayReady(true); setProgress(null); setStatus('山海已展开。拖动、滚轮或双指缩放，看看这里适不适合你的列国。');
    })().catch(failure => { if (valid) { setError(errorMessage(failure)); setProgress(null); } });
    return () => { valid = false; map.destroy(); if (renderer.current === map) renderer.current = null; };
  }, [preview]);
  async function generate() {
    const request = { seed: seed.trim(), template, layout: 'square-v1' as const };
    if (busyRef.current || preview || !name.trim() || name.trim().length > 80 || !validSeedTerrainRequest(request)) return;
    busyRef.current = true; setBusy(true); setError(''); setProgress(null); setStatus('正在生成山海，完成后先让你看看。');
    client.current?.close();
    try {
      const current = new SeedTerrainClient({ onProgress: next => { if (alive.current) setProgress(next); } }); client.current = current;
      const candidate = await current.preview(request, { name: name.trim() });
      if (!alive.current || client.current !== current) return; setPreview(candidate); setStatus('正在展开可编辑地图……');
    } catch (failure) { if (alive.current) { setError(errorMessage(failure)); setProgress(null); setStatus('本次生成没有保存，可以调整后重试。'); } }
    finally { if (alive.current) { busyRef.current = false; setBusy(false); } }
  }
  async function save() {
    if (busyRef.current || !preview || !displayReady || !client.current) return;
    busyRef.current = true; setBusy(true); setSaving(true); setError(''); setProgress(null); setStatus('正在保存新世界。完成后会打开它，原草稿仍保留。');
    try {
      const receipt = await client.current.confirm();
      const record: CreationRecord = { format: 'lieguoji-seed-terrain-record', version: 1, generation: preview.generation, identity: preview.terrain.identity, summary: preview.terrain.summary, receipt };
      if (!alive.current) return; setSavedRecord(record); setStatus('新世界已保存，正在打开地图……'); await onSaved(record);
    } catch (failure) { if (alive.current) { setError(errorMessage(failure)); setProgress(null); setStatus('尚未切换地图。如果保存阶段中断，请先在草稿目录核对新世界。'); } }
    finally { if (alive.current) { busyRef.current = false; setBusy(false); setSaving(false); } }
  }
  const requestValid = validSeedTerrainRequest({ seed: seed.trim(), template, layout: 'square-v1' }), selected = SEED_TERRAIN_TEMPLATES.find(item => item.id === template)!;
  return <ModalDialog titleId={titleId} className="seed-terrain-dialog" locked={saving} onDismiss={onClose}>
    <header><span className="seed-terrain-eyebrow">{savedRecord ? '新世界已保存' : preview ? '新世界预览 · 尚未保存' : '模板创世'}</span><h2 id={titleId}>{preview ? preview.terrain.data.manifest.name : '让山海，从这里开始'}</h2><p>{preview ? `${selected.label} · 种子 ${preview.generation.request.seed}` : '选择模板和种子，先看地图，再决定保存。'}</p></header>
    {!preview && <form className="seed-terrain-form" onSubmit={event => { event.preventDefault(); void generate(); }}>
      <fieldset disabled={busy}><legend>世界模样</legend><div className="seed-terrain-templates">{SEED_TERRAIN_TEMPLATES.map(item => <label key={item.id} className={template === item.id ? 'selected' : ''}><input type="radio" name="seed-terrain-template" aria-label={`地貌模板 ${item.label}`} value={item.id} checked={template === item.id} onChange={() => setTemplate(item.id)} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}</div></fieldset>
      <div className="seed-terrain-fields"><label>世界名称<input aria-label="模板世界名称" value={name} maxLength={80} disabled={busy} onChange={event => setName(event.target.value)} autoComplete="off" /></label><label>世界种子<input aria-label="模板世界种子" value={seed} maxLength={80} disabled={busy} onChange={event => setSeed(event.target.value)} autoComplete="off" /><small>保留这个种子，可以再生成相同的山海。</small></label></div>
      <button className="seed-terrain-primary" type="submit" disabled={busy || !name.trim() || !requestValid}>生成预览</button>
    </form>}
    {preview && <><div className="seed-terrain-map" ref={host} data-testid="seed-terrain-map" data-seed-display={displayReady ? 'ready' : 'preparing'} data-seed-draft={preview.terrain.identity.draftId} data-seed-manifest={preview.terrain.identity.manifestDigest} data-seed-source={preview.generation.sourceSha256} /><div className="seed-terrain-view-controls" role="group" aria-label="新世界地图视图"><button disabled={!displayReady || busy} aria-label="放大新世界" onClick={() => renderer.current?.zoom(1.5)}>＋</button><button disabled={!displayReady || busy} aria-label="缩小新世界" onClick={() => renderer.current?.zoom(1 / 1.5)}>−</button><button disabled={!displayReady || busy} onClick={() => renderer.current?.fit()}>全图</button><span>拖动浏览 · 双指缩放</span></div></>}
    <details className="seed-terrain-source"><summary>来源与版本</summary><p>来自已审查的高度生成模块，采用网页方形抖动三角网；不宣称恢复了原 Unity 拓扑。生成后转换为独立可编辑地形，保存后可继续调整山地和建立国家。</p>{preview && <><p>模板 {preview.generation.request.template} · 点网 {preview.generation.request.layout} · {preview.terrain.summary.pointCount.toLocaleString()} 个地形点。</p><p>{preview.terrain.summary.mapping.note}</p><p>生成器 {preview.generation.generatorId}<br />版本摘要 {preview.generation.fingerprint}<br />地形来源摘要 {preview.generation.sourceSha256}</p></>}<p>保存后可下载独立创世记录；它包含种子、版本、来源摘要和保存回执。刷新前请保留需要的记录。</p><a href="/terrain-licenses.txt" target="_blank" rel="noreferrer">查看模块许可</a></details>
    <div className="seed-terrain-feedback" aria-live="polite"><p role="status">{status}</p>{progress && <><progress aria-label="新世界生成进度" value={Math.min(progress.completed, progress.total)} max={Math.max(1, progress.total)} /><small>{progress.stage} · {progress.completed.toLocaleString()} / {progress.total.toLocaleString()}</small></>}{error && <p role="alert" className="seed-terrain-error">{error}</p>}</div>
    <footer><button disabled={saving} onClick={onClose}>{savedRecord ? '关闭' : '取消'}</button>{savedRecord ? <button onClick={() => downloadRecord(savedRecord)}>保存创世记录</button> : preview && <button className="seed-terrain-primary" disabled={!displayReady || busy || !!error} onClick={() => void save()}>保存新世界</button>}</footer>
  </ModalDialog>;
}

export function SeedTerrainRecord({ record }: { record: CreationRecord }) {
  return <section className="seed-terrain-entry"><p className="seed-terrain-record">最近一次创世记录保留在本次地理创作会话中，切换面板后仍可下载。刷新或离开地理创作前，请保存需要的记录。</p><button onClick={() => downloadRecord(record)}>保存创世记录</button></section>;
}

export function SeedTerrainPanel({ disabled, onSaved }: { disabled: boolean; onSaved: (record: CreationRecord) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return <section className="seed-terrain-entry"><span className="seed-terrain-eyebrow">模板创世</span><h3>从一片完整山海开始</h3><p>群岛、高岛或连绵大陆。选择种子，生成后独立保存，再画出自己的国家。</p><button className="seed-terrain-launch" disabled={disabled} onClick={() => setOpen(true)}><Icon name="world" /><span>按模板生成新世界</span></button>{open && <SeedTerrainDialog onClose={() => setOpen(false)} onSaved={async next => { await onSaved(next); setOpen(false); }} />}</section>;
}
