import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {reconcileCore} from './core-refresh51';
import {assertPolitics47,finishPoliticalTick47,politicalStamp47,type PoliticalStamp47} from './civilization47-political-owner';

/** Original ProvinceInfoUI 行省操作:
 * - OnSetAsCapitalButtonClicked: unless the owner is a blank state, the
 *   province's city becomes the state's capital (state.capitalBurgID). No
 *   history entry; only the city icons refresh.
 * - OnSetAsFortressButtonClicked: isMannulSetFortress=true, isMannulFortreess=true.
 * - OnSetAsCityButtonClicked: isMannulSetFortress=true, isMannulFortreess=false.
 * The fortress flags are the existing native combat inputs manualSet/manualFortress. */
export type ProvinceEdit47={type:'capital'|'fortress'|'city';provinceId:string};
export function assertProvinceEdit47(v:unknown):asserts v is ProvinceEdit47{
  const e=v as ProvinceEdit47;
  if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).sort().join('/')!=='provinceId/type'||!['capital','fortress','city'].includes(e.type)||typeof e.provinceId!=='string'||!/^p-\d+$/.test(e.provinceId))throw Error('行省操作无效。');
}
export function provinceEditBlocker47(r:PoliticalRun47,e:ProvinceEdit47):string|null{
  const p=r.world.provinces.find(v=>v.id===e.provinceId);if(!p)return '选择的行省不存在。';
  if(e.type==='capital'){
    const nation=r.world.nations.find(n=>n.id===p.controller),city=r.world.cities.find(c=>c.provinceId===p.id);
    if(!nation)return '该行省不属于任何国家。';if(!city)return '该行省没有城市。';if(nation.capitalId===city.id)return '该城市已是首都。';
    return null;
  }
  const c=r.upperCombat.provinces[p.id];if(!c)return '该行省没有防御记录。';
  if(c.manualSet&&c.manualFortress===(e.type==='fortress'))return e.type==='fortress'?'该行省已是要塞。':'该行省已设为普通城市。';
  return null;
}
function applyOwned(r:PoliticalRun47,e:ProvinceEdit47){
  assertProvinceEdit47(e);const blocked=provinceEditBlocker47(r,e);if(blocked)throw Error(blocked);
  const p=r.world.provinces.find(v=>v.id===e.provinceId)!;
  if(e.type==='capital'){r.world.nations.find(n=>n.id===p.controller)!.capitalId=r.world.cities.find(c=>c.provinceId===p.id)!.id;reconcileCore(r.world,r.upperCombat);}
  else{const c=r.upperCombat.provinces[p.id];c.manualSet=true;c.manualFortress=e.type==='fortress';}
  finishPoliticalTick47(r);assertPolitics47(r);
}
export function applyProvinceEdit47(r:PoliticalRun47,edit:ProvinceEdit47,expected:PoliticalStamp47){
  const stamp=politicalStamp47(r),keys=Object.keys(stamp) as (keyof PoliticalStamp47)[];
  if(!expected||typeof expected!=='object'||Object.keys(expected).length!==keys.length||keys.some(k=>expected[k]!==stamp[k]))throw Error('世界已变化，请重新操作；原世界未改动。');
  const next=structuredClone(r);applyOwned(next,edit);return next;
}
