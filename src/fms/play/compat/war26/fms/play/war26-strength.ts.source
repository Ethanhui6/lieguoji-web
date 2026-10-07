import type {ChronicleRun} from './chronicle-model';
import type {World} from '../../sim/types';
/** State.GetStrength numeric aggregation with explicit WEB unit scales.
 * Web armies are displayed persons, web fleets contain at most 5 ships.
 * These are not claimed as recovered WorldSettings/Navy initialization values.
 * The browser has validated live objects rather than Unity frame caches. */
export function war26Strength(w:World,r:Pick<ChronicleRun,'navy'|'transports'>,id:string){
 const f=Math.fround;let army=0,navy=0;
 for(const a of [...w.armies,...r.transports.cargo.map(c=>c.army)])if(a.nationId===id&&a.status!=='destroyed')army=f(army+f(f(Math.max(0,a.troops))/f(2000)));
 for(const n of r.navy.fleets)if(n.nationId===id&&n.status!=='lost')navy=f(navy+f(f(Math.max(0,Math.min(5,n.ships)))/f(5)));
 return f(f(f(f(navy+navy)+f(army+army))+f(f(w.provinces.filter(p=>p.controller===id).length)*f(5)))+f(1));
}
