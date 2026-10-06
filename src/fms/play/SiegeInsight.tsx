import type {World} from '../../sim/types';
import type {UnitAssignments} from './military-profile';
import {siegeInsight} from './siege-insight';
import type {OccupationState} from './occupation';

export function SiegeInsight({world,provinceId,units,timing,selectArmy,occupation}:{world:World;provinceId:string;units:UnitAssignments;timing:{rounds:Record<string,number>;tick:number};selectArmy?:(id:string)=>void;occupation?:OccupationState}){
  const report=siegeInsight(world,provinceId,units,timing.rounds,timing.tick,occupation);if(!report)return null;
  const {province,attack,defense,forces,fort}=report;
  const next=forces.filter(a=>a.nextDays!==null).sort((a,b)=>a.nextDays!-b.nextDays!)[0];
  return <div className="play-siege-insight" aria-label="围攻战况与军粮">
    <p className="play-siege-state">{!attack.length?'进攻已中断':defense.length?'攻守拉锯 · 守军会回补抵抗':'持续削减抵抗 · 无守军回补'}</p>
    <div className="play-siege-facts"><span>{({plain:'平原',forest:'森林',mountain:'山地'})[province.terrain]}{fort>0?` · 城防 ${fort}`:' · 无城防加成'}</span><span>{attack.length} 支进攻 / {defense.length} 支守军</span></div>
    <p>{next?`下一次行动：${next.name}，约 ${next.nextDays!.toFixed(2)} 日后。`:'尚无待结算行动；继续时间后按实际驻军更新。'}</p>
    <small>各军分别行动，攻方削减、守方回补；兵种、地形、士气和断粮会改变每次贡献，不能据此保证攻下日期。下方为当前规则计算值。</small>
    <details className="play-siege-forces"><summary>攻守贡献与军粮（{forces.length} 支）</summary>
      {forces.map(a=><article key={a.id} data-force-id={a.id}>
        <div className="play-siege-force-title"><strong>{a.name}</strong><span>{a.defending?'守方':'攻方'} · {a.unit}</span></div>
        <p>{a.troops.toLocaleString('zh-CN')} 人 · 每次{a.defending?'回补':'削减'} {a.perPulse.toFixed(1)} 抵抗</p>
        <p className={a.supplies<=0?'play-siege-warning':undefined}>{a.supplies<=0?'已经断粮 · 作战效率受到抑制':`军粮 ${a.supplies.toFixed(0)} · 当前每日消耗 ${a.consumption}，不计补充将在第 ${world.day+a.daysWithoutRefill} 日结算时耗尽`}</p>
        {selectArmy&&<button onClick={()=>selectArmy(a.id)}>查看{a.name}</button>}
      </article>)}
      <small>作战和敌境驻军不能从此地正常补粮；可查看部队，预览脱离交锋或撤回本国休整。控制权改变、援军和日结会重新计算此表。</small>
    </details>
  </div>;
}
