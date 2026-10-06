import type {Army,World,Province} from '../../compat/v0_4/sim/types';
import {nationsAtWar,transferEconomy} from '../../compat/v0_4/sim/statecraft';
import {unitProfile,type UnitAssignments} from './military-profile';

/** Native contract: per-province battleScore, attacks subtract and the holding
 * state's troops replenish it; control changes only at zero. Web land polygons
 * have no native cell count, so capacity and time/efficiency conversion below
 * are an explicit adaptation, not recovered original numerical equivalence. */
export interface Siege {provinceId:string;controller:string;attacker:string;resistance:number;maximum:number;started:number;pulse:number}
export interface OccupationState {version:1;sieges:Siege[]}
export const initialOccupation=():OccupationState=>({version:1,sieges:[]});
export const holdsNode=(a:Army)=>a.troops>0&&a.status!=='destroyed'&&a.status!=='retreating'&&a.progress===0;
export const underSiege=(w:World,id:string)=>{const p=w.provinces.find(p=>p.id===id);return !!p&&w.armies.some(a=>holdsNode(a)&&a.provinceId===id&&nationsAtWar(w,a.nationId,p.controller));};
const area=(p:Province)=>Math.abs(p.polygon.reduce((s,a,i)=>{const b=p.polygon[(i+1)%p.polygon.length];return s+a.x*b.y-b.x*a.y;},0))/2;
/** Native average score = 200 * simulateFactor (default 2), apportioned by
 * cell count. Web provinces use their real polygon area as the size proxy.
 * Capitals do not get an invented resilience multiplier. */
export const resistanceCapacity=(w:World,p:Province)=>Math.max(1,400*area(p)*w.provinces.length/Math.max(1,w.provinces.reduce((s,p)=>s+area(p),0)));
const power=(a:Army,units:UnitAssignments)=>a.troops/1000*unitProfile(units[a.id]).power*(.35+a.morale*.0065)*(a.supplies>0?1:.5);
const log=(w:World,kind:'battle'|'occupation',text:string,reason:string)=>{w.events.push({id:w.nextEventId++,day:w.day,kind,text,reason});if(w.events.length>160)w.events.splice(0,w.events.length-160);};
export function siegeForces(w:World,p:Province,units:UnitAssignments){
  const armies=w.armies.filter(a=>holdsNode(a)&&a.provinceId===p.id),attackers=new Map<string,number>();let defense=0;
  // Native defensive efficiency multiplies defenders and divides attackers.
  // Reuse the web terrain/fort scale until native profiles are fully restored.
  const modifier={plain:1,forest:1.15,mountain:1.3}[p.terrain]*(1+Math.max(0,...w.cities.filter(c=>c.provinceId===p.id).map(c=>c.fort))*.12);
  for(const a of armies){if(a.nationId===p.controller)defense+=power(a,units)*modifier;else if(nationsAtWar(w,a.nationId,p.controller))attackers.set(a.nationId,(attackers.get(a.nationId)??0)+power(a,units)/modifier);}
  // Rival invaders don't pool their attacks: the strongest active invading
  // state contests control. Stable IDs resolve ties, never array iteration.
  const ranked=[...attackers].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  return {attacker:ranked[0]?.[0]??null,attack:ranked[0]?.[1]??0,defense};
}
/** Diplomacy may cancel a siege, but no command or load advances resistance. */
export function reconcileOccupation(w:World,state:OccupationState){
  return {occupation:{version:1 as const,sieges:state.sieges.filter(s=>{const p=w.provinces.find(p=>p.id===s.provinceId);return p&&p.controller===s.controller&&nationsAtWar(w,s.attacker,s.controller);})}};
}
export function advanceOccupation(world:World,state:OccupationState,units:UnitAssignments,tick:number){
  const w=structuredClone({...world,provinces:[]}) as World;w.provinces=world.provinces.map(p=>({...p}));
  const s=structuredClone(reconcileOccupation(w,state).occupation);
  for(const p of w.provinces){
    const forces=siegeForces(w,p,units);let siege=s.sieges.find(s=>s.provinceId===p.id);
    if(!siege&&forces.attacker){const max=resistanceCapacity(w,p);siege={provinceId:p.id,controller:p.controller,attacker:forces.attacker,resistance:max,maximum:max,started:tick,pulse:tick};s.sieges.push(siege);log(w,'battle',`${p.name}进入围攻`, '驻军持续削减本省抵抗；守方驻军同时回补。分数归零才转移该省实控，其他领土与国家继续存在。');}
    if(!siege)continue;
    if(forces.attacker)siege.attacker=forces.attacker;
    if(tick-siege.pulse<60)continue;
    siege.pulse=tick;
    // One half-day pulse. Defensive replenishment requires actual owner troops;
    // abandonment alone does not magically restore a damaged province.
    siege.resistance=Math.max(0,Math.min(siege.maximum,siege.resistance-(forces.attack-forces.defense)*5));
    if(siege.resistance===0&&forces.attacker){
      const old=p.controller,next=forces.attacker;
      transferEconomy(w,p.id,old,next);p.controller=next;
      const owner=w.nations.find(n=>n.id===old)!,invader=w.nations.find(n=>n.id===next)!;
      const capital=w.cities.some(c=>c.id===owner.capitalId&&c.provinceId===p.id);
      log(w,'occupation',`${invader.name}攻下${p.name}`,`持续围攻耗尽 ${Math.round(siege.maximum)} 抵抗，只有本省实控从${owner.name}转移；法理归属未变。${capital?'首都失守，其他省份与国家仍保留；原作按月处置首都事件尚未移植。':''}`);
      s.sieges=s.sieges.filter(v=>v!==siege);
    }else if(!forces.attacker&&siege.resistance===siege.maximum)s.sieges=s.sieges.filter(v=>v!==siege);
  }
  return {world:w,occupation:s};
}
export function assertOccupation(s:OccupationState,w:World,tick:number){
  const exact=(o:object,keys:string[])=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
  const fail=()=>{throw Error('围攻进度无效或含未知字段，已保留原档。');};
  if(!exact(s,['version','sieges'])||s.version!==1||!Array.isArray(s.sieges)||s.sieges.length>w.provinces.length)fail();
  const ids=new Set<string>();
  for(const v of s.sieges){const p=w.provinces.find(p=>p.id===v.provinceId);
    if(!exact(v,['provinceId','controller','attacker','resistance','maximum','started','pulse'])||!p||ids.has(v.provinceId)||p.controller!==v.controller||!nationsAtWar(w,v.attacker,v.controller)||!w.nations.some(n=>n.id===v.attacker)||!Number.isFinite(v.resistance)||v.resistance<=0||v.resistance>v.maximum||v.maximum!==resistanceCapacity(w,p)||!Number.isSafeInteger(v.started)||v.started<0||v.started>tick||!Number.isSafeInteger(v.pulse)||v.pulse<v.started||v.pulse>tick)fail();
    ids.add(v.provinceId);
  }
}
