import type { HydrologyMacroPreview } from '../world/hydrology-macro-contract';
import { macroBranchPath, macroStopLabel, macroStopReason } from '../world/hydrology-macro-view';

type Props = {
  preview: HydrologyMacroPreview | null; selected: number | null;
  disabled: boolean; unavailable: string | null;
  onAnalyze: () => void; onSelect: (index: number) => void; onClear: () => void; onMap: () => void;
};
export function MacroHydrologyPanel({ preview, selected, disabled, unavailable, onAnalyze, onSelect, onClear, onMap }: Props) {
  const branch = selected === null ? undefined : preview?.branches[selected];
  const start = branch && preview ? preview.nodes.ids.indexOf(branch.sourceNode) : -1;
  const path = branch && preview && selected !== null ? macroBranchPath(preview, selected) : [];
  return <div className="atlas-panel-content atlas-macro-water">
    {branch && preview ? <section className="atlas-macro-detail" aria-label="汇流分支详情">
      <h4>支流 {selected! + 1} · {macroStopLabel[branch.stop]}</h4>
      <p>{macroStopReason[branch.stop]}</p>
      <dl>
        <div><dt>起点高程</dt><dd>{preview.nodes.groundMeters[start]} 米</dd></div>
        <div><dt>起点汇水样本</dt><dd>{preview.nodes.contributingSamples[start]}</dd></div>
        <div><dt>已显示下游</dt><dd>{Math.max(0, path.length - 1) * 16} 世界单位</dd></div>
      </dl>
    </section> : <div className="atlas-macro-intro">
      <h3>{preview ? '选择一支，查看下游' : '看见大陆的汇流'}</h3>
      <p className="atlas-help">{preview ? '点选地图上的线条或下方列表，查看它的去向与终点。' : '从已保存的山地和平原，查看主要汇流方向。'}</p>
    </div>}
    {preview && <div className="atlas-actions"><button disabled={disabled} onClick={onMap}>回地图看汇流</button><button disabled={disabled} onClick={onClear}>关闭大陆汇流</button></div>}
    <button className={branch ? undefined : 'atlas-primary'} disabled={disabled || !!unavailable} onClick={onAnalyze}>{preview ? '重新分析大陆汇流' : '查看大陆汇流'}</button>
    {unavailable && <p className="atlas-help" role="status">{unavailable}</p>}
    {preview && !branch && <div className="atlas-macro-summary"><strong>{preview.branches.length}<small>支已显示</small></strong><span>{preview.displayTruncated ? '已达显示上限' : '当前显示范围完整'}<small>符合阈值 {preview.stats.eligibleBranches} 支</small></span></div>}
    <details className="world-metadata">
      <summary>精度与说明</summary>
      <p>每隔 16 世界单位读取一次已保存地形。线条可能跨过两点之间的小山沟或窄海峡，表示大致汇流方向；本次查看不改变地图。</p>
      <p>汇水样本表示地形汇集关系，不是降水量或河流流量。地形低洼处尚未计算积水、湖面或溢流，采样海域也尚未判定是否连通外洋。</p>
      {preview && branch && <p>已显示 {preview.branches.length} 支，符合显示条件 {preview.stats.eligibleBranches} 支。{preview.displayTruncated ? '本次已达显示上限。' : '当前显示范围完整。'}</p>}
    </details>
    {preview && <>
      {!preview.branches.length && <p role="status">当前地形没有达到显示阈值的主支流。可以继续绘制大陆或调整地形后再查看。</p>}
      <div className="atlas-macro-branches" role="group" aria-label="大陆汇流分支">{preview.branches.map((b, index) => <button key={b.sourceNode} disabled={disabled} aria-pressed={selected === index} onClick={() => onSelect(index)}><span>支流 {index + 1}</span><small>{macroStopLabel[b.stop]}</small><span aria-hidden="true">›</span></button>)}</div>
    </>}
  </div>;
}
