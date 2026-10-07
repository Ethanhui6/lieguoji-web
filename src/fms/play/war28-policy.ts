import type {War28World} from './war28-state';
import type {War28Policy} from './war28-query';
import type {NativePolity} from './native-combat/upper-efficiency';
/** GetDefaultForPoliticalSystem 44CCB0, +50. These are polity defaults;
 * ethnic/trait threshold overrides are not yet represented by the web schema. */
export const WAR28_LOSS_THRESHOLD:Record<NativePolity,number>={Kingdom:.5,Empire:Math.fround(.45),Federation:Math.fround(.55),Republic:.5,Tribal:Math.fround(.6),Theocracy:.5};
export function war28Policy(r:War28World):War28Policy{return {
 territoryLossThreshold:id=>{const n=r.upperCombat.nations[id];if(!n)throw Error('国家政体缺失，无法评估战局。');return WAR28_LOSS_THRESHOLD[n.polity];},
 // Both original State constructors initialize +51 to true. The v28 web
 // sandbox has no independent national diplomacy toggle yet; food priority
 // does not substitute for this policy.
 autonomousDiplomacy:id=>{if(!r.people.nations[id])throw Error('国家外交信息缺失。');return true;},
};}
