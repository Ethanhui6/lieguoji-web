import type {War26Run} from './war26-model';
import type {World} from '../../sim/types';
export function War26Panel({run,world,locate}:{run:War26Run;world:World;locate:(id:string)=>void}){
 const campaigns=run.warfare.campaigns.filter(c=>c.endedTick===null),names=new Map(world.nations.map(n=>[n.id,n.name])),places=new Map(world.provinces.map(p=>[p.id,p]));
 return <section className="play-war-overview" aria-label="战争目标"><h3>战争目标</h3>
 {!campaigns.length&&<p>当前没有战争。宣战后，各方会围绕固定战区调动；和平边界不会吸引进攻部队。</p>}
 {campaigns.map(c=><article className="play-war-country" key={c.id}><h4>{names.get(c.a)} · {names.get(c.b)}</h4><p className="play-muted">第 {c.sinceDay} 日开战 · 目标在开战时确定</p>{c.goals.map(g=>{
  const held=g.provinceIds.filter(id=>places.get(id)?.controller===g.nationId).length;
  return <div key={g.nationId}><strong>{names.get(g.nationId)}：{held} / {g.provinceIds.length} 处目标已控制</strong>
   <p>{g.entry==='unavailable'?'没有合法陆地或海岸入口，保留防务。':held===g.provinceIds.length?'已控制本次目标，停止另选弱城；继续守备和补给。':g.entry==='sea'?'围绕目标海岸集结，按真实运力和海路派遣。':'沿连续战区推进，先救援受攻击的本国地区。'}</p>
   {g.provinceIds.length>0&&<details><summary>查看与定位目标</summary><div className="play-army-shortcuts">{g.provinceIds.map(id=><button key={id} onClick={()=>locate(id)}>{places.get(id)!.name} · {places.get(id)!.controller===g.nationId?'已控制':'未控制'}</button>)}</div></details>}
  </div>;
 })}</article>)}
 <p className="play-muted">目标进展按实际控制计算；不是战争分或胜负判定。自动和约与厌战结算尚未接入，可在政治页面停战。</p>
 </section>;
}
