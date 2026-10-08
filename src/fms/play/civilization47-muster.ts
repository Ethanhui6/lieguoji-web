import type {World} from '../../sim/types';
import type {TacticsState} from './tactics-model';
import {sourceLegionStrength} from './muster21-rules';
import {unitProfiles,type UnitKey} from './military-profile';
import {nationsAtWar} from './realtime-statecraft';
import {holdsNode} from './occupation';

export type Recruitment47={armyId:string;nationId:string;homeId:string;troops:number;populationCost:number};
export type InitialMuster47={world:World;units:Record<string,UnitKey>;tactics:TacticsState};
export function emptyTactics47(w:World):TacticsState{return {version:1,nextArmyId:1,seed:147901,rounds:{},unopposed:'takeover',forces:{},mobilizations:Object.fromEntries(w.nations.map(n=>[n.id,{lastMonth:null,recent:[]}]))};}
/** Initial regularMuster21 branch on the caller's isolated new-world candidate.
 * No fake old run/version, population reset, cargo or emergency-muster inputs.
 * This entry explicitly requires day-zero empty Armies; monthly replacement
 * must later use actual47 location/presence, not this creation-only routine. */
export function musterFoundingArmies47(r:InitialMuster47):Recruitment47[]{
  if(r.world.day!==0||r.world.armies.length||Object.keys(r.tactics.forces).length||Object.keys(r.units).length||!r.world.statecraft)throw Error('初始征募只能运行一次。');
  const receipts:Recruitment47[]=[];
  for(const n of r.world.nations){
    const land=r.world.provinces.filter(p=>p.controller===n.id&&p.legalOwner===n.id),target=land.length?Math.max(1,Math.floor(land.length*Math.fround(2/3))):0;let formed=0,costs=0;
    for(const p of land){
      if(formed>=target||r.world.armies.length>=500)break;
      if(r.world.armies.some(a=>holdsNode(a)&&a.provinceId===p.id&&nationsAtWar(r.world,a.nationId,n.id))||r.world.armies.some(a=>a.troops>0&&a.status!=='destroyed'&&r.tactics.forces[a.id].homeId===p.id))continue;
      const data=r.world.statecraft.provinces.find(v=>v.provinceId===p.id)!;
      const populations=r.world.statecraft.provinces.map(p=>p.population).sort((a,b)=>a-b),mid=populations.length>>1,median=populations.length%2?populations[mid]:(populations[mid-1]+populations[mid])/2;
      const troops=sourceLegionStrength(data.population,median),cost=Math.round(troops/10);if(data.population<cost)continue;
      let id:string;do{if(!Number.isSafeInteger(r.tactics.nextArmyId)||r.tactics.nextArmyId<1||r.tactics.nextArmyId>=2147483647)throw Error('军队编号已达上限。');id='force-'+r.tactics.nextArmyId++;}while(Object.hasOwn(r.tactics.forces,id));
      const unit=unitProfiles[(r.tactics.nextArmyId-2)%unitProfiles.length],name=r.world.cities.find(c=>c.provinceId===p.id)?.name??p.name;
      r.world.armies.push({id,name:name+unit.name,nationId:n.id,provinceId:p.id,originId:p.id,troops,morale:80,supplies:100,status:'idle',route:[],progress:0});
      r.units[id]=unit.key;r.tactics.forces[id]={homeId:p.id,kind:'regular',fullStrength:troops};data.population-=cost;formed++;costs+=cost;
      receipts.push({armyId:id,nationId:n.id,homeId:p.id,troops,populationCost:cost});
    }
    if(formed){r.world.events.push({id:r.world.nextEventId++,day:0,kind:'system',text:`${n.name}新编${formed}支常备军`,reason:`按领土三分之二目标与故乡编制征集；显示兵力为内部值×10，本次扣内部人口${costs}。粮储未扣；持续供给仍按网页经济结算。`});r.world.events=r.world.events.slice(-160);}
  }
  return receipts;
}
