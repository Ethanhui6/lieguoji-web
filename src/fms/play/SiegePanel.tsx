import type {World} from '../../sim/types';
import {siegeForces,type OccupationState} from './occupation';
import type {UnitAssignments} from './military-profile';
export function SiegePanel({world,occupation,units,provinceId}:{world:World;occupation:OccupationState;units:UnitAssignments;provinceId:string|null}){
  const siege=occupation.sieges.find(s=>s.provinceId===provinceId),p=world.provinces.find(p=>p.id===provinceId);if(!siege||!p)return null;
  const f=siegeForces(world,p,units),net=(f.attack-f.defense)*10,percent=(1-siege.resistance/siege.maximum)*100;
  return <section className="play-siege" aria-label="围攻进度"><h3>{p.name} · {f.attacker?'持续围攻':f.defense?'守军修复':'围攻中断'}</h3><p>{world.nations.find(n=>n.id===siege.attacker)?.name}进攻 · {world.nations.find(n=>n.id===siege.controller)?.name}仍控制</p><progress aria-label="本省占领进度" max={100} value={percent}/><strong>{percent.toFixed(1)}% · 抵抗 {Math.ceil(siege.resistance)} / {Math.round(siege.maximum)}</strong><p>{net>0?`按当前兵力，约还需 ${(siege.resistance/net).toFixed(1)} 日；战损、补给与援军会改变速度。`:net<0?'守军正在回补抵抗，攻方暂时无法推进。':f.attacker?'攻守相持，抵抗暂时不变。':'驻军已离开；损坏仍保留，尚未转移控制。'}</p><small>只有本省抵抗归零才变更实控，其他领土不会随之吞并。连续路线等待本省攻下后再继续。</small></section>;
}
