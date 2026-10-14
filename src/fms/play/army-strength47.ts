import type {Army} from '../../sim/types';
import type {TacticsState} from './tactics-model';
/** The army's current soldiers are its strength; keep the registered full
 * formation as the denominator through losses, recovery and save/restore. */
export function armyStrength47(armies:readonly Pick<Army,'id'|'troops'>[],forces:TacticsState['forces']){
 const current=armies.reduce((sum,a)=>sum+Math.max(0,a.troops),0);
 const maximum=armies.reduce((sum,a)=>sum+(forces[a.id]?.fullStrength??Math.max(1,a.troops)),0);
 return{current,maximum,fraction:Math.max(0,Math.min(1,current/Math.max(1,maximum)))};
}
