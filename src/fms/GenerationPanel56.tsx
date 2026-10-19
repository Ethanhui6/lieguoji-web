import {ORIGINAL_GRIDS,type OriginalGridId} from './original/original-grid';
import {SEED_TERRAIN_TEMPLATES,type SeedTerrainTemplate} from '../world/seed-terrain';
import './generation56.css';

type Props={grid:OriginalGridId|'square';template:SeedTerrainTemplate;seed:string;disabled:boolean;onGrid:(v:OriginalGridId|'square')=>void;onTemplate:(v:SeedTerrainTemplate)=>void;onSeed:(v:string)=>void;onGenerate:()=>void;onLocal:()=>void;onDraw:()=>void;onClose:()=>void};
/** Layout follows level0 EditPanel/MapSize's separate size list and footer.
 * Seed/template controls are existing WEB options, not a recovered Unity UI.
 * No unsupported 80k mode, world-reset, or decorative generation callbacks. */
export function GenerationPanel56(p:Props){
 const valid=/^\d{1,10}$/.test(p.seed)&&Number(p.seed)<=0xffffffff;
 return <section className="fms-generation" aria-label="生成地图设置">
  <header><h2>生成地图</h2><button aria-label="关闭生成地图" onClick={p.onClose}>×</button></header>
  <div className="fms-generation-body">
   <fieldset disabled={p.disabled}><legend>地图尺寸</legend>
    <div className="fms-grid-list" role="radiogroup" aria-label="整图格网">{(Object.keys(ORIGINAL_GRIDS) as OriginalGridId[]).map(id=><label key={id} className={p.grid===id?'selected':''}><input type="radio" name="generation-grid" value={id} checked={p.grid===id} onChange={()=>p.onGrid(id)}/><strong>{ORIGINAL_GRIDS[id].desired/10000} 万格</strong><span>1600 × 900</span></label>)}</div>
    <details className="fms-grid-legacy"><summary>兼容地图</summary><label><input type="radio" name="generation-grid" checked={p.grid==='square'} onChange={()=>p.onGrid('square')}/>旧方形网格</label></details>
   </fieldset>
   <fieldset disabled={p.disabled}><legend>地形</legend>
    <label className="fms-generation-row"><span>地形模板</span><select aria-label="整图版图" value={p.template} onChange={e=>p.onTemplate(e.target.value as SeedTerrainTemplate)}>{SEED_TERRAIN_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
    <p className="fms-template-description">{SEED_TERRAIN_TEMPLATES.find(t=>t.id===p.template)!.description}</p>
    <label className="fms-generation-row"><span>地图种子</span><input aria-label="整图种子" aria-invalid={!valid} inputMode="numeric" maxLength={10} value={p.seed} onChange={e=>p.onSeed(e.target.value)}/></label>
    {!valid&&<p role="alert" className="fms-generation-error">请输入0至4294967295之间的整数。</p>}
   </fieldset>
   <details className="fms-generation-manual"><summary>手绘地图</summary><p>闭合轮廓、海陆笔刷，或从一片大陆开始。</p><div><button onClick={p.onDraw} disabled={p.disabled}>绘制轮廓</button><button onClick={p.onLocal} disabled={p.disabled||!valid}>生成大陆</button></div></details>
  </div>
  <footer><button className="fms-generation-submit" onClick={p.onGenerate} disabled={p.disabled||!valid}>预览整张地图</button><small>预览后确认 · 可取消与撤销</small></footer>
 </section>;
}
