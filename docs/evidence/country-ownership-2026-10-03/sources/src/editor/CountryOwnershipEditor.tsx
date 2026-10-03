import type { CountryDocument } from '../world/politics/model';
import type { CountryOwnershipView } from '../world/politics/ownership-view';

export interface CountryOwnershipDraft { field: CountryOwnershipView; targetNationId: string }
interface Props {
  document: CountryDocument; nationId: string; disabled: boolean; draft: CountryOwnershipDraft | null; hasOutline: boolean;
  onChange: (draft: CountryOwnershipDraft | null) => void; onDraw: () => void; onPreview: () => void;
}
export function CountryOwnershipEditor({ document, nationId, disabled, draft, hasOutline, onChange, onDraw, onPreview }: Props) {
  const others = document.nations.filter(nation => nation.id !== nationId);
  const foreignControlled = document.territories.filter(t => t.legalNationId === nationId && t.controllingNationId !== nationId).length;
  const foreignLegal = document.territories.filter(t => t.controllingNationId === nationId && t.legalNationId !== nationId).length;
  return <section className="country-ownership" aria-label="领土归属">
    <h3>领土归属</h3>
    <dl className="country-facts"><div><dt>本国法理、他国实控</dt><dd data-testid="country-foreign-control-count">{foreignControlled}</dd></div><div><dt>本国实控、他国法理</dt><dd data-testid="country-foreign-legal-count">{foreignLegal}</dd></div></dl>
    {!draft ? <><p className="country-help">法理归属与实际控制可以不同。地图左上可切换查看。</p><button disabled={disabled || !others.length} onClick={() => onChange({ field: 'control', targetNationId: others[0].id })}>调整领土归属</button>{!others.length && <p className="country-help">建立另一个国家后，可以调整两国之间的归属。</p>}</> : <div className="country-fields">
      <label>调整内容<select aria-label="调整归属类型" disabled={disabled} value={draft.field} onChange={event => onChange({ ...draft, field: event.target.value as CountryOwnershipView })}><option value="control">实际控制</option><option value="legal">法理归属</option></select></label>
      <label>交给哪个国家<select aria-label="归属目标国家" disabled={disabled} value={draft.targetNationId} onChange={event => onChange({ ...draft, targetNationId: event.target.value })}>{others.map(nation => <option key={nation.id} value={nation.id}>{nation.name}</option>)}</select></label>
      <p className="country-help">圈出当前国家的{draft.field === 'control' ? '实控' : '法理'}领土，只修改这一项。未分配陆地与海域不变；城市、首都所在单元及最后一块法理领土受保护。这是手动世界编辑。</p>
      <button className="country-primary" disabled={disabled || !others.some(n => n.id === draft.targetNationId)} onClick={onDraw}>{hasOutline ? '重新圈选归属范围' : '手绘调整归属'}</button>
      {hasOutline && <button className="country-primary" disabled={disabled} onClick={onPreview}>预览归属调整</button>}
      <button disabled={disabled} onClick={() => onChange(null)}>取消归属编辑</button>
    </div>}
  </section>;
}
