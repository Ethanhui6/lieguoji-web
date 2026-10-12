import type {FoundingForces47} from './civilization47-forces';
import {populationStamp47,type PopulationStamp47} from './civilization47-population-types';
import {sameCulture47Value} from './culture47-equal';
import {cloneMilitaryCandidate47} from './geography-content47';
import {actualForces47} from './force-runtime47';
import {canRefill47,landHolders47,readArmySpace47} from './army-space47';
import {nationsAtWar} from './realtime-statecraft';
import {dailyEvent47} from './civilization47-upkeep';

export const ARMY_RECOVERY_RULE47='wounded-army-recovery-web-v1';
export type ArmyRecovery47={version:1;rule:typeof ARMY_RECOVERY_RULE47;enabledTick:number};

/** Absence means the saved world retains its original no-replacement rules. */
export function assertArmyRecovery47(r:FoundingForces47):void{
  const s=r.armyRecovery;if(s===undefined)return;
  if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).sort().join('/')!=='enabledTick/rule/version'||s.version!==1||s.rule!==ARMY_RECOVERY_RULE47||!Number.isSafeInteger(s.enabledTick)||s.enabledTick<0||s.enabledTick>r.clock.tick||!r.armyRetirement||s.enabledTick<r.armyRetirement.enabledTick)throw Error('伤军补员规则无效，原世界保持。');
}

/** Explicit, journalled rule switch. Never retrofit a loaded old run. */
export function enableArmyRecovery47<T extends FoundingForces47>(input:T,expected:PopulationStamp47):T{
  assertArmyRecovery47(input);
  if(input.armyRecovery||!input.armyRetirement||!sameCulture47Value(expected,populationStamp47(input)))throw Error('伤军补员需要已启用退役规则且世界未变化，请重新操作。');
  const r=cloneMilitaryCandidate47(input);
  r.armyRecovery={version:1,rule:ARMY_RECOVERY_RULE47,enabledTick:r.clock.tick};
  return r;
}

/** Once per settled day, on the private candidate after actual food and loss
 * accounting. Only stationary regular armies on uncontested owned/legal land
 * draw from that province's *remaining* people and grain. The same 10 visible
 * troops per internal person used by regular muster is maintained. One grain
 * person-day per replacement is a declared web equipping cost; preserve ten
 * civilian grain-days as a reserve and debit the already-open daily ledger. */
export function recoverArmiesOwned47(r:FoundingForces47):void{
  if(!r.armyRecovery)return;
  assertArmyRecovery47(r);
  const {spatial}=actualForces47(r),space=readArmySpace47(r.world,{...spatial,positions:r.armyPositions});
  const stock=new Map(r.world.statecraft!.provinces.map(p=>[p.provinceId,p]));
  for(const id of [...space.byArmy.keys()].sort()){
    const v=space.byArmy.get(id)!,a=v.army,formation=r.tactics.forces[id],province=v.province;
    if(!formation||formation.kind!=='regular'||!canRefill47(v)||!province||province.controller!==a.nationId||province.legalOwner!==a.nationId||landHolders47(space,province.id).some(other=>nationsAtWar(r.world,a.nationId,other.nationId)))continue;
    const missing=Math.max(0,formation.fullStrength-a.troops);if(!missing)continue;
    const resource=stock.get(province.id),ledger=r.world.statecraft!.nations.find(n=>n.nationId===a.nationId)?.lastLedger;
    if(!resource||!ledger||ledger.day!==r.world.day)throw Error('伤军补员缺少本地人口、粮库或当日日粮账。');
    const grainReserve=resource.population*10,grainAvailable=Math.max(0,resource.grain-grainReserve);
    const dailyLimit=Math.max(40,Math.min(120,Math.ceil(formation.fullStrength*.06)));
    const recruits=Math.min(missing,dailyLimit,resource.population*10,grainAvailable);
    if(recruits<1)continue;
    const people=Math.ceil(recruits/10);
    resource.population-=people;resource.grain-=recruits;ledger.militaryConsumed+=recruits;ledger.closingGrain-=recruits;
    const before=a.troops;a.troops+=recruits;
    if(before<=180&&a.troops>180)dailyEvent47(r,'system',`${a.name}补员后恢复出征能力`,`在${province.name}实际停驻；补入${recruits}人，扣本地人口${people}、粮储${recruits}人日粮。未从其他地区或海上凭空补员。`);
  }
}
