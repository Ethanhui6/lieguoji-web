import { Icon } from '../ui/Icon';

type Props = {
  hasWorld: boolean; alreadyDrawn: boolean; readOnly: boolean; locked: boolean; busy: boolean;
  outlinePoints: number; seed: string; roughness: number; shelf: number; relief: number; islands: number;
  onSeed: (value: string) => void; onRoughness: (value: number) => void; onShelf: (value: number) => void;
  onRelief: (value: number) => void; onIslands: (value: number) => void;
  onDraw: () => void; onPreview: () => void; onConfirm: () => void; onCancel: () => void;
  preview: null | { landAreaQ2: number; worldAreaQ2: number; minElevationMeters: number; maxElevationMeters: number };
};

/** Only offers actions implemented by the fine-coast generation transaction. */
export function DetailCoastPanel(p: Props) {
  if (!p.hasWorld) return <div className="atlas-panel-content"><p className="atlas-help">先在草稿面板创建一片空白海洋。</p></div>;
  return <div className="atlas-panel-content">
    {p.preview ? <section className="atlas-preview" aria-label="大陆生成预览">
      <span className="atlas-eyebrow">尚未保存 · 生成预览</span><h3>看看这片新大陆</h3>
      <p>沿着你的轮廓生成海湾、半岛、近岸群岛和山地。可以关闭面板，放大查看海岸，再决定是否保存。</p>
      <dl className="atlas-cell-details"><div><dt>陆地面积</dt><dd>{(100 * p.preview.landAreaQ2 / p.preview.worldAreaQ2).toFixed(2)}%</dd></div><div><dt>高程范围</dt><dd>{p.preview.minElevationMeters} 至 {p.preview.maxElevationMeters} 米</dd></div></dl>
      <div className="atlas-actions"><button disabled={p.busy} onClick={p.onCancel}>取消生成</button><button className="atlas-primary" disabled={p.busy} onClick={p.onConfirm}>确认生成并保存</button></div>
    </section> : p.alreadyDrawn || p.readOnly ? <section><h3>浏览你的山海</h3><p className="atlas-help">拖动探索，放大海岸，轻点查看真实海陆与高程。当前细海岸版本已支持首片大陆、保存和恢复；继续添加大陆与地形笔刷仍在开发。可以撤销这次生成后重新绘制，或新建另一份草稿。</p></section> : <>
      <div className="atlas-create-intro"><span className="atlas-eyebrow">你的山海，从一笔开始</span><button className="atlas-draw-card" disabled={p.locked} onClick={p.onDraw}><Icon name="brush" size={28}/><span><strong>画一片大陆</strong><small>画出轮廓，让海湾与山脉自然形成</small></span></button></div>
      <fieldset className="atlas-edit-fields" disabled={p.locked}>
        <label className="atlas-field">地貌种子<input aria-label="地貌种子" maxLength={120} value={p.seed} onChange={e=>p.onSeed(e.target.value)}/></label>
        <label className="atlas-field">海岸曲折<input aria-label="手绘海岸曲折" type="range" min={0} max={64} step={4} value={p.roughness} onChange={e=>p.onRoughness(Number(e.target.value))}/><small>{p.roughness === 0 ? '保留原始轮廓' : `湾岬变化 · ${p.roughness}`}</small></label>
        <label className="atlas-field">近海宽度<input aria-label="手绘近海宽度" type="range" min={16} max={128} step={8} value={p.shelf} onChange={e=>p.onShelf(Number(e.target.value))}/><small>{p.shelf} 世界单位</small></label>
        <label className="atlas-field">内陆起伏（米）<input aria-label="内陆起伏" type="number" min={200} max={6000} step={100} value={p.relief} onChange={e=>p.onRelief(Number(e.target.value))}/></label>
        <label className="atlas-field">近岸岛链<select aria-label="近岸岛链" value={p.islands} onChange={e=>p.onIslands(Number(e.target.value))}><option value={0}>不添加</option><option value={1}>少量 · 1 条</option><option value={2}>分散 · 2 条</option><option value={3}>丰富 · 3 条</option></select></label>
        <p className="atlas-help">单指或鼠标画出闭合轮廓，松开后预览；双指可以调整视野。过窄或交叉的轮廓会提示修改。</p>
        {p.outlinePoints >= 3 && <button className="atlas-primary" disabled={p.locked || !p.seed.trim()} onClick={p.onPreview}>重新预览手绘大陆</button>}
      </fieldset>
    </>}
  </div>;
}
