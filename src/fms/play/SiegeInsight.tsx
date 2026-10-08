import type {Ports44} from './war44-ports';
import {blockadedPort44,landAttackMultiplier44,provinceDamage44} from './war44-blockade';
import type {FiscalState} from './fiscal15-state';
import type {UpperCombat} from './upper14-state';
import type {TerrainContext} from './terrain13-context';
import type {World} from '../../sim/types';
import type {UnitAssignments} from './military-profile';
import {siegeInsight} from './siege-insight';
import type {OccupationState} from './occupation';

export function SiegeInsight({finance,upperCombat,terrainContext,world,provinceId,units,timing,selectArmy,occupation,ports}:{finance?:FiscalState;upperCombat?:UpperCombat;terrainContext?:TerrainContext;world:World;provinceId:string;units:UnitAssignments;timing:{rounds:Record<string,number>;tick:number};selectArmy?:(id:string)=>void;occupation?:OccupationState;ports?:Ports44}){
  const report=siegeInsight(world,provinceId,units,timing.rounds,timing.tick,occupation,terrainContext,upperCombat,finance);if(!report)return null;
  const {province,attack,defense,forces,fort}=report;
  for(const a of forces)a.perPulse=provinceDamage44(a.perPulse,landAttackMultiplier44(world,ports,province.id,a.nationId));
  const blockaded=blockadedPort44(world,ports,province.id);
  const land=terrainContext?.provinces[provinceId],terrainLabel=land?(land.mountain?'山地':land.plateau?'高原':'非山地'):({plain:'平原',forest:'森林',mountain:'山地'})[province.terrain];
  const next=forces.filter(a=>a.nextDays!==null).sort((a,b)=>a.nextDays!-b.nextDays!)[0];
  return <div className="play-siege-insight" aria-label="围攻战况与军粮">
    {blockaded&&<p className="play-blockade" data-blockade="active">海港被封锁 · 攻方对军伤害与抵抗削减 ×2；守军回补不加成。</p>}
    <p className="play-siege-state">{!attack.length?'进攻已中断':defense.length?'攻守拉锯 · 守军会回补抵抗':'持续削减抵抗 · 无守军回补'}</p>
    <div className="play-siege-facts"><span>{terrainLabel}{upperCombat?` · 通用防御 ×${report.genericDefense!.toFixed(2)}`:fort>0?` · 城防 ${fort}`:' · 无城防加成'}</span><span>{attack.length} 支进攻 / {defense.length} 支守军</span></div>
    <p>{next?`下一次行动：${next.name}，约 ${next.nextDays!.toFixed(2)} 日后。`:'尚无待结算行动；继续时间后按实际驻军更新。'}</p>
    <small>各军分别行动，攻方削减、守方回补；{upperCombat?'兵种、地貌、政体、国运与核心领土决定每次贡献':'兵种、地形、士气和断粮会改变每次贡献'}，不能据此保证攻下日期。下方为当前规则计算值。</small>
    <details className="play-siege-forces"><summary>攻守贡献与军粮（{forces.length} 支）</summary>
      {forces.map(a=><article key={a.id} data-force-id={a.id}>
        <div className="play-siege-force-title"><strong>{a.name}</strong><span>{a.defending?'守方':'攻方'} · {a.unit}</span></div>
        <p>{a.troops.toLocaleString('zh-CN')} 人 · 每次{a.defending?'回补':'削减'} {a.perPulse.toFixed(1)} 抵抗</p>
        <p className={a.supplies<=0?'play-siege-warning':undefined}>{a.supplies<=0?(upperCombat?'已经断粮 · 日结将持续减员':'已经断粮 · 作战效率受到抑制'):`军粮 ${a.supplies.toFixed(0)} · 当前每日消耗 ${a.consumption}，不计补充将在第 ${world.day+a.daysWithoutRefill} 日结算时耗尽`}</p>
        {selectArmy&&<button onClick={()=>selectArmy(a.id)}>查看{a.name}</button>}
      </article>)}
      <small>作战和敌境驻军不能从此地正常补粮；可查看部队，预览脱离交锋或撤回本国休整。控制权改变、援军和日结会重新计算此表。</small>
    </details>
  </div>;
}
