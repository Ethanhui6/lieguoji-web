import { Icon } from '../ui/Icon';

type Props = {
  hasWorld: boolean; alreadyDrawn: boolean; readOnly: boolean; locked: boolean;
  outlinePoints: number; seed: string; version: 1 | 2; structure: number; roughness: number; shelf: number; relief: number; islands: number; islandsPerChain: number;
  onSeed: (value: string) => void; onRoughness: (value: number) => void; onShelf: (value: number) => void;
  onRelief: (value: number) => void; onIslands: (value: number) => void;
  onVersion: (value: 1 | 2) => void; onStructure: (value: number) => void; onIslandsPerChain: (value: number) => void;
  onDraw: () => void; onPreview: () => void;
  preview: null | { addedLandAreaQ2?: number; landAreaQ2: number; worldAreaQ2: number; minElevationMeters: number; maxElevationMeters: number };
};

/** Only offers actions implemented by the fine-coast generation transaction. */
export function DetailCoastPanel(p: Props) {
  if (!p.hasWorld) return <div className="atlas-panel-content"><p className="atlas-help">先在草稿面板创建一片空白海洋。</p></div>;
  return <div className="atlas-panel-content">
    {p.preview ? <section className="atlas-preview" aria-label="大陆生成预览">
      <span className="atlas-eyebrow">尚未保存 · 生成预览</span><h3>{p.alreadyDrawn ? '看看要添上的这片大陆' : '看看这片新大陆'}</h3>
      <p>沿着你的轮廓生成海湾、半岛、近岸群岛和山地。可以关闭面板，放大查看海岸，再决定是否保存。</p>
      <dl className="atlas-cell-details"><div><dt>世界陆地面积</dt><dd>{(100 * p.preview.landAreaQ2 / p.preview.worldAreaQ2).toFixed(2)}%</dd></div>{p.preview.addedLandAreaQ2 !== undefined && <div><dt>本次新增陆地</dt><dd>{(100 * p.preview.addedLandAreaQ2 / p.preview.worldAreaQ2).toFixed(2)}% 世界面积</dd></div>}<div><dt>高程范围</dt><dd>{p.preview.minElevationMeters} 至 {p.preview.maxElevationMeters} 米</dd></div></dl>
    </section> : p.readOnly ? <section><h3>浏览这份备份</h3><p className="atlas-help">拖动探索、放大海岸、轻点查看真实海陆与高程。备份保持只读；返回并打开当前草稿后可以继续画大陆。</p></section> : <>
      <div className="atlas-create-intro"><span className="atlas-eyebrow">你的山海，从一笔开始</span><button className="atlas-draw-card" disabled={p.locked} onClick={p.onDraw}><Icon name="brush" size={28}/><span><strong>{p.alreadyDrawn ? '再画一片大陆' : '画一片大陆'}</strong><small>{p.alreadyDrawn ? '在海面继续绘制，保留已有山河' : '画出轮廓，让海湾与山脉自然形成'}</small></span></button></div>
      <fieldset className="atlas-edit-fields" disabled={p.locked}>
        <label className="atlas-field">地貌种子<input aria-label="地貌种子" maxLength={120} value={p.seed} onChange={e=>p.onSeed(e.target.value)}/></label>
        <label className="atlas-field">地形风格<select aria-label="大陆地形风格" value={p.version} onChange={e=>p.onVersion(Number(e.target.value) as 1 | 2)}><option value={2}>自然湾岬与山脉</option><option value={1}>沿用原有地貌</option></select><small>{p.version === 1 ? '沿用原有地貌；可以选择自然风格绘制下一片大陆。' : '生成低地、山脉和宽窄变化的陆架；已有大陆保持原样。'}</small></label>
        {p.version === 2 && <label className="atlas-field">主要湾岬<input aria-label="主要湾岬变化" type="range" min={0} max={160} step={8} value={p.structure} onChange={e=>p.onStructure(Number(e.target.value))}/><small>{p.structure === 0 ? '保留轮廓的主要走向' : '大尺度海湾与岬角 · ' + p.structure}</small></label>}
        <label className="atlas-field">海岸曲折<input aria-label="手绘海岸曲折" type="range" min={0} max={64} step={4} value={p.roughness} onChange={e=>p.onRoughness(Number(e.target.value))}/><small>{p.roughness === 0 ? '关闭小尺度曲折' : `小尺度海岸细节 · ${p.roughness}`}</small></label>
        <label className="atlas-field">近海宽度<input aria-label="手绘近海宽度" type="range" min={16} max={128} step={8} value={p.shelf} onChange={e=>p.onShelf(Number(e.target.value))}/><small>{p.shelf} 世界单位</small></label>
        <label className="atlas-field">内陆起伏（米）<input aria-label="内陆起伏" type="number" min={200} max={6000} step={100} value={p.relief} onChange={e=>p.onRelief(Number(e.target.value))}/></label>
        <label className="atlas-field">近岸岛链<select aria-label="近岸岛链" value={p.islands} onChange={e=>p.onIslands(Number(e.target.value))}><option value={0}>不添加</option><option value={1}>少量 · 1 条</option><option value={2}>分散 · 2 条</option><option value={3}>丰富 · 3 条</option></select></label>
        {p.islands > 0 && <label className="atlas-field">每条岛链岛屿数<input aria-label="每条岛链岛屿数" type="number" min={2} max={6} value={p.islandsPerChain} onChange={e=>p.onIslandsPerChain(Number(e.target.value))}/><small>实际可放置数量取决于海岸与间隔，预览以真实生成结果为准。</small></label>}
        <p className="atlas-help">单指或鼠标画出闭合轮廓，松开后预览；双指可以调整视野。过窄或交叉的轮廓会提示修改。{p.alreadyDrawn && '请与已有陆地留出海面间隔；接触、重叠或进入保护区时会提示调整，不覆盖旧大陆。'}</p>
        {p.outlinePoints >= 3 && <button className="atlas-primary" disabled={p.locked || !p.seed.trim()} onClick={p.onPreview}>重新预览手绘大陆</button>}
      </fieldset>
    </>}
  </div>;
}
