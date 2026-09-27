import type { AtlasCellRectangle } from '../world/generation-contract';

export interface LocalReliefPreviewSummary {
  changedFineNodeCount: number; raisedFineNodeCount: number; loweredFineNodeCount: number; changedFineTileCount: number;
}
type Props = {
  locked: boolean; busy: boolean; readOnly: boolean; seed: string; reliefMeters: number;
  rectangle: AtlasCellRectangle; transitionCells: number; maxColumns: number; maxRows: number; validScope: boolean;
  preview: LocalReliefPreviewSummary | null;
  onSeed: (value: string) => void; onRelief: (value: number) => void;
  onRectangle: (value: AtlasCellRectangle) => void; onTransition: (value: number) => void;
  onChooseRange: () => void; onPreview: () => void; onConfirm: () => void; onCancel: () => void; onDrawMode: () => void;
};

export function LocalReliefPanel(p: Props) {
  return <div className="atlas-panel-content">
    {p.preview ? <section className="atlas-preview" aria-label="山地生成预览">
      <span className="atlas-eyebrow">尚未保存 · 山地预览</span><h3>看看这一带的新山地</h3>
      <p>只调整选区内允许修改的陆地细高程。海岸、海域和已有保护保持原样。可以关闭面板，放大查看后再决定。</p>
      <dl className="atlas-cell-details">
        <div><dt>将改变的细高程节点</dt><dd data-testid="local-relief-changed-nodes">{p.preview.changedFineNodeCount.toLocaleString()}</dd></div>
        <div><dt>抬升节点</dt><dd>{p.preview.raisedFineNodeCount.toLocaleString()}</dd></div>
        <div><dt>降低节点</dt><dd>{p.preview.loweredFineNodeCount.toLocaleString()}</dd></div>
        <div><dt>改变的细高程分块</dt><dd>{p.preview.changedFineTileCount.toLocaleString()}</dd></div>
      </dl>
      {p.preview.changedFineNodeCount === 0 && <p role="status">这次没有可保存的高程变化。可以取消，调整范围、种子或起伏后再预览。</p>}
      <p>范围：{p.rectangle.columns} × {p.rectangle.rows} 基础地块，边缘过渡 {p.transitionCells} 格。范围大小不是实际修改数量。</p>
      <div className="atlas-actions"><button disabled={p.busy} onClick={p.onCancel}>取消生成</button><button className="atlas-primary" disabled={p.busy || p.preview.changedFineNodeCount === 0} onClick={p.onConfirm}>确认生成并保存</button></div>
    </section> : <>
      <span className="atlas-eyebrow">保留海岸 · 调整已有山河</span><h3>仅重生成山地</h3>
      <p className="atlas-help">蓝色外框是本次范围，内框之间逐渐过渡。只在已有陆地生成山地，不添加大陆；先预览，再确认保存。</p>
      {p.readOnly ? <p className="atlas-help">这份备份仅供查看。打开当前草稿后才能修改山地。</p> : <fieldset className="atlas-edit-fields" disabled={p.locked}>
        <button onClick={p.onChooseRange}>在地图上重新选择范围</button>
        <p data-testid="local-relief-scope">当前范围 {p.rectangle.columns} × {p.rectangle.rows} 基础地块，过渡 {p.transitionCells} 格。</p>
        <details className="atlas-advanced"><summary>精确调整范围</summary>
          <div className="atlas-two-fields">{(['column', 'row', 'columns', 'rows'] as const).map(key => <label className="atlas-field" key={key}>{({ column: '起始列', row: '起始行', columns: '选区宽度', rows: '选区高度' })[key]}<input aria-label={({ column: '山地选区起始列', row: '山地选区起始行', columns: '山地选区宽度', rows: '山地选区高度' })[key]} type="number" min={key === 'column' || key === 'row' ? 0 : 1} max={key === 'column' || key === 'columns' ? p.maxColumns : p.maxRows} step={1} value={p.rectangle[key]} onChange={event => p.onRectangle({ ...p.rectangle, [key]: Number(event.target.value) })}/></label>)}</div>
          <label className="atlas-field">边缘过渡宽度<input aria-label="山地过渡宽度" type="number" min={1} max={16} step={1} value={p.transitionCells} onChange={event => p.onTransition(Number(event.target.value))}/><small>至少 1 格，范围需宽于两侧过渡带。</small></label>
        </details>
        {!p.validScope && <p role="alert">选区越界或过窄。请扩大范围，或减小过渡宽度；不会改为整图生成。</p>}
        <label className="atlas-field">山地种子<input aria-label="局部山地种子" maxLength={120} value={p.seed} onChange={event => p.onSeed(event.target.value)}/></label>
        <label className="atlas-field">山地起伏（米）<input aria-label="局部山地起伏" type="number" min={200} max={6000} step={100} value={p.reliefMeters} onChange={event => p.onRelief(Number(event.target.value))}/></label>
        <p className="atlas-help">完成预览后，会显示真实改变、抬升和降低的细高程节点数量。已锁定的区域不会被自动解锁。</p>
        <button className="atlas-primary" disabled={p.locked || !p.validScope || !p.seed.trim() || !Number.isInteger(p.reliefMeters) || p.reliefMeters < 200 || p.reliefMeters > 6000} onClick={p.onPreview}>预览山地变化</button>
      </fieldset>}
      <button disabled={p.busy} onClick={p.onDrawMode}>返回画大陆</button>
    </>}
  </div>;
}
