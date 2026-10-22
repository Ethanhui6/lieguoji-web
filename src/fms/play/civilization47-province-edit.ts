import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {reconcileCore} from './core-refresh51';
import {resetNativeProvinceDefense} from './native-combat/upper-efficiency';
import {assertPolitics47,finishPoliticalTick47,politicalStamp47,type PoliticalStamp47} from './civilization47-political-owner';

/** Original ProvinceInfoUI 行省操作:
 * - OnSetAsCapitalButtonClicked: unless the owner is a blank state, the
 *   province's city becomes the state's capital (state.capitalBurgID). No
 *   history entry; only the city icons refresh.
 * - OnSetAsFortressButtonClicked: isMannulSetFortress=true, isMannulFortreess=true.
 * - OnSetAsCityButtonClicked: isMannulSetFortress=true, isMannulFortreess=false.
 * The fortress flags are the existing native combat inputs manualSet/manualFortress.
 * - 自定义人口 (ShowSetCustomPopulationPanel): current and max population; the
 *   original rejects current<0, max<=0 or current>max (SetCustomPopulationInvalid).
 * - 自定义防御 (ShowSetCustomDefensePanel): 主场作战效率 1–10 and its lock, the
 *   native storedDefense/locked inputs. Unlocked, the value follows terrain,
 *   biome and fortress rules again (LockHomeFieldAdvantageTooltipOff). */
export type ProvinceEdit47={type:'capital'|'fortress'|'city';provinceId:string}|{type:'population';provinceId:string;current:number;max:number}|{type:'defense';provinceId:string;modifier:number;locked:boolean};
export const POPULATION_INVALID47='自定义人口输入无效，请输入有效整数，当前人口不能小于 0，最大人口必须大于 0，且当前人口不能大于最大人口';
export const DEFENSE_INVALID47='自定义防御输入无效，请输入有效数字：当前城市防御不能小于 0，最大城市防御必须大于 0，当前城市防御不能大于最大城市防御，主场作战效率必须在 1 到 10 之间。';
export function assertProvinceEdit47(v:unknown):asserts v is ProvinceEdit47{
  const e=v as ProvinceEdit47;
  const keys=e&&typeof e==='object'&&!Array.isArray(e)?Object.keys(e).sort().join('/'):'';
  const shape=e?.type==='population'?keys==='current/max/provinceId/type':e?.type==='defense'?keys==='locked/modifier/provinceId/type':['capital','fortress','city'].includes(e?.type)&&keys==='provinceId/type';
  if(!shape||typeof e.provinceId!=='string'||!/^p-\d+$/.test(e.provinceId))throw Error('行省操作无效。');
  if(e.type==='population'&&(!Number.isSafeInteger(e.current)||!Number.isSafeInteger(e.max)||e.current<0||e.max<=0||e.current>e.max||e.max>2147483647))throw Error(POPULATION_INVALID47);
  if(e.type==='defense'&&(typeof e.locked!=='boolean'||typeof e.modifier!=='number'||!Number.isFinite(e.modifier)||e.modifier<1||e.modifier>10))throw Error(DEFENSE_INVALID47);
}
export function provinceEditBlocker47(r:PoliticalRun47,e:ProvinceEdit47):string|null{
  const p=r.world.provinces.find(v=>v.id===e.provinceId);if(!p)return '选择的行省不存在。';
  if(e.type==='capital'){
    const nation=r.world.nations.find(n=>n.id===p.controller),city=r.world.cities.find(c=>c.provinceId===p.id);
    if(!nation)return '该行省不属于任何国家。';if(!city)return '该行省没有城市。';if(nation.capitalId===city.id)return '该城市已是首都。';
    return null;
  }
  if(e.type==='population')return r.finance.provinces[p.id]&&r.world.statecraft!.provinces.some(v=>v.provinceId===p.id)?null:'该行省没有人口记录。';
  const c=r.upperCombat.provinces[p.id];if(!c)return '该行省没有防御记录。';
  if(e.type==='defense')return null;
  if(c.manualSet&&c.manualFortress===(e.type==='fortress'))return e.type==='fortress'?'该行省已是要塞。':'该行省已设为普通城市。';
  return null;
}
function applyOwned(r:PoliticalRun47,e:ProvinceEdit47){
  assertProvinceEdit47(e);const blocked=provinceEditBlocker47(r,e);if(blocked)throw Error(blocked);
  const p=r.world.provinces.find(v=>v.id===e.provinceId)!;
  if(e.type==='capital'){r.world.nations.find(n=>n.id===p.controller)!.capitalId=r.world.cities.find(c=>c.provinceId===p.id)!.id;reconcileCore(r.world,r.upperCombat);}
  else if(e.type==='population'){r.finance.provinces[p.id].maxPopulation=e.max;r.world.statecraft!.provinces.find(v=>v.provinceId===p.id)!.population=Math.min(e.current,e.max);}
  else if(e.type==='defense'){const c=r.upperCombat.provinces[p.id],land=r.terrainContext.provinces[p.id];
    c.locked=e.locked;c.storedDefense=resetNativeProvinceDefense({mountain:!!land?.mountain,plateau:!!land?.plateau,biomeCounts:c.biomeOrder.map(biome=>({biome,count:c.biomeCounts[biome]})),locked:e.locked,stored:e.modifier});}
  else{const c=r.upperCombat.provinces[p.id];c.manualSet=true;c.manualFortress=e.type==='fortress';}
  finishPoliticalTick47(r);assertPolitics47(r);
}
export function applyProvinceEdit47(r:PoliticalRun47,edit:ProvinceEdit47,expected:PoliticalStamp47){
  const stamp=politicalStamp47(r),keys=Object.keys(stamp) as (keyof PoliticalStamp47)[];
  if(!expected||typeof expected!=='object'||Object.keys(expected).length!==keys.length||keys.some(k=>expected[k]!==stamp[k]))throw Error('世界已变化，请重新操作；原世界未改动。');
  const next=structuredClone(r);applyOwned(next,edit);return next;
}
