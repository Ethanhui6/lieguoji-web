import type { AtlasCellRectangle } from '../world/generation-contract';
import type { ConstraintsPreviewInfo } from '../world/constraints-session';

type Props = {
  locked: boolean; busy: boolean; readOnly: boolean; rectangle: AtlasCellRectangle; valid: boolean;
  maxColumns: number; maxRows: number; mask: 1 | 2 | 3; action: 'set' | 'clear';
  preview: Pick<ConstraintsPreviewInfo, 'rectangle' | 'mask' | 'action' | 'changedCellCount'> | null;
  onRectangle: (value: AtlasCellRectangle) => void; onMask: (value: 1 | 2 | 3) => void; onAction: (value: 'set' | 'clear') => void;
  onChooseRange: () => void; onPreview: () => void; onConfirm: () => void; onCancel: () => void; onReturn: () => void;
};
export function RegionProtectionPanel(p: Props) {
  const r = p.preview?.rectangle ?? p.rectangle;
  return <div className="atlas-panel-content">
    {p.preview ? <section className="atlas-preview" aria-label="区域锁修改预览">
      <span className="atlas-eyebrow">尚未保存 · 区域保护预览</span><h3>{p.preview.action === 'set' ? '保护这一带山河' : '解除所选保护'}</h3>
      <p>{p.preview.action === 'set' ? '锁定' : '解除'}{p.preview.mask === 3 ? '海岸与高程' : p.preview.mask === 1 ? '海岸' : '高程'}。实际改变 <strong data-testid="region-protection-changed-cells">{p.preview.changedCellCount.toLocaleString()}</strong> 个地块的保护状态。</p>
      <p>列 {r.column} 起、行 {r.row} 起，{r.columns} × {r.rows} 地块。蓝线标出本次范围；地形和已有生成记录保持原样。</p>
      <p className="atlas-help">可以关闭面板查看地图。确认后自动保存，也可使用顶部的撤销恢复本次修改。</p>
      <div className="atlas-actions"><button disabled={p.busy} onClick={p.onCancel}>取消区域锁修改</button><button className="atlas-primary" disabled={p.busy || p.preview.changedCellCount <= 0} onClick={p.onConfirm}>确认区域锁并保存</button></div>
    </section> : <>
      <span className="atlas-eyebrow">保留喜欢的山河</span><h3>保护区域</h3>
      <p className="atlas-help">蓝线圈出保护范围。海岸锁保留真实海陆边界，高程锁保留范围内的实际地形高度；海域也可以保护。</p>
      {p.readOnly ? <p className="atlas-help">这份备份仅供查看。打开当前草稿后才能修改保护。</p> : <fieldset className="atlas-edit-fields" disabled={p.locked}>
        <button onClick={p.onChooseRange}>在地图上选择保护范围</button>
        <p data-testid="region-protection-scope">当前范围 {r.columns} × {r.rows} 基础地块，共 {(r.columns * r.rows).toLocaleString()} 个。预览后显示实际改变数量。</p>
        <details className="atlas-advanced"><summary>精确调整保护范围</summary><div className="atlas-two-fields">{(['column', 'row', 'columns', 'rows'] as const).map(key => <label className="atlas-field" key={key}>{({ column: '起始列', row: '起始行', columns: '选区宽度', rows: '选区高度' })[key]}<input aria-label={({ column: '保护选区起始列', row: '保护选区起始行', columns: '保护选区宽度', rows: '保护选区高度' })[key]} type="number" min={key === 'column' || key === 'row' ? 0 : 1} max={key === 'column' || key === 'columns' ? p.maxColumns : p.maxRows} step={1} value={r[key]} onChange={event => p.onRectangle({ ...p.rectangle, [key]: Number(event.target.value) })}/></label>)}</div></details>
        {!p.valid && <p role="alert">保护范围越界或尺寸无效。请调整后再预览，不会自动改为整图。</p>}
        <div className="atlas-two-fields"><label className="atlas-field">保护内容<select aria-label="区域锁保护内容" value={p.mask} onChange={event => p.onMask(Number(event.target.value) as 1 | 2 | 3)}><option value={3}>海岸与高程</option><option value={1}>仅海岸</option><option value={2}>仅高程</option></select></label><label className="atlas-field">锁定操作<select aria-label="区域锁操作" value={p.action} onChange={event => p.onAction(event.target.value === 'clear' ? 'clear' : 'set')}><option value="set">锁定选区</option><option value="clear">解除所选保护</option></select></label></div>
        <p className="atlas-help">解除一种保护会保留另一种。已有相同状态不会重复修改；系统会说明没有变化。为保持边界连续，邻接的共享地形也会遵守保护。</p>
        <button className="atlas-primary" disabled={p.locked || !p.valid} onClick={p.onPreview}>预览区域锁修改</button>
      </fieldset>}
      <button disabled={p.busy} onClick={p.onReturn}>返回地貌创作</button>
    </>}
  </div>;
}
