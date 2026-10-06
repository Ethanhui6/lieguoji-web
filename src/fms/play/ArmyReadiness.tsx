import type {World} from '../../sim/types';
import type {BattleState} from './battle';
import type {UnitAssignments} from './military-profile';
import {armyReadiness} from './siege-insight';
import type {OccupationState} from './occupation';
export function ArmyReadiness({world,id,units,timing,battles,occupation}:{world:World;id:string;units:UnitAssignments;timing:{tick:number;rounds:Record<string,number>};battles:BattleState;occupation?:OccupationState}){
  const r=armyReadiness(world,id,units,timing.rounds,timing.tick,battles,occupation);if(!r)return null;
  return <div className="play-army-readiness" aria-label="部队战况与补给"><p>{r.unit} · {r.atNode?'当地地形与城防已计入':'位于路段，不计两端地形与城防'} · 当前效率 {r.efficiency.toFixed(2)}</p>
    <p>{r.nextDays===null?'当前没有排定攻击轮次':`下次行动约 ${r.nextDays.toFixed(2)} 日后`}</p>
    <p>{r.supplies<=0?'已经断粮':`军粮 ${r.supplies.toFixed(0)}`} · 当前每日消耗 {r.consumption}</p><small>{r.supplyReason}{r.grain!==undefined?` 本地粮储 ${Math.round(r.grain).toLocaleString('zh-CN')}。`:''}</small>
  </div>;
}
