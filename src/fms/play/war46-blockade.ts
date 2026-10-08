import type {World} from '../../sim/types';
import type {Ports46} from './war46-ports';
import {nationsAtWar} from './realtime-statecraft';
/** PE 419440/419460: valid land owner and port occupier, different IDs.
 * String country IDs are the web adapter for native positive State IDs.
 * Ignore a stale record after a same-tick land capture; port reconciliation
 * then installs the new owner. No fleet-presence or occupation-value threshold.
 */
export function blockadedPort46(w:World,ports:Ports46|undefined,provinceId:string){
 const p=w.provinces.find(p=>p.id===provinceId),port=ports?.ports[provinceId];
 return !!p&&!!port&&port.landOwnerId===p.controller&&port.landOwnerId!==port.occupierId&&
  w.nations.some(n=>n.id===port.landOwnerId)&&w.nations.some(n=>n.id===port.occupierId);
}
/** Army.BattleInProvince 3445B0–344689: only positive land attack uses ×2.
 * Road contacts/sea combat and defender repair never receive this multiplier.
 * Native does not require the attacking army to own the captured harbor.
 */
export function landAttackMultiplier46(w:World,ports:Ports46|undefined,provinceId:string,nationId:string,atNode=true):1|2{
 const p=w.provinces.find(p=>p.id===provinceId);
 return atNode&&p&&nationsAtWar(w,nationId,p.controller)&&blockadedPort46(w,ports,provinceId)?2:1;
}
/** Match the native mulss for boosted province damage; unchanged cases retain
 * the previous web resistance arithmetic. The ×10 display scale is existing.
 */
export function provinceDamage46(base:number,multiplier:1|2){return multiplier===2?Math.fround(Math.fround(base)*2):base;}
