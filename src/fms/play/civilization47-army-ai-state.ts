import {fastChecks47} from './checks47';
import type {FoundingForces47} from './civilization47-forces';
import type {World} from '../../sim/types';
export type ArmyDecision47={targetId:string|null;garrisonId:string|null;campaignId:number|null;decision:'waiting'|'attacking'|'supporting'|'staging'|'garrison'|'returning'|'resting'|'manual'|'busy'|'lost'|'no-route';nextTick:number;issuedTick:number|null;reason:string};
export type ArmyAutonomy47={version:2;rule:'native-target-web-space-v2';revision:number;lastDay:number;armies:Record<string,ArmyDecision47>};
export const initialArmyDecision47=():ArmyDecision47=>({targetId:null,garrisonId:null,campaignId:null,decision:'waiting',nextTick:0,issuedTick:null,reason:'等待自主军令评估。'});
export const initialArmyAutonomy47=(w:World):ArmyAutonomy47=>({version:2,rule:'native-target-web-space-v2',revision:0,lastDay:w.day,armies:Object.fromEntries(w.armies.map(a=>[a.id,initialArmyDecision47()]))});
const exact=(v:unknown,keys:readonly string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('/')===[...keys].sort().join('/');
/** Narrow running ledger guard. Not a complete live47/Store49 validator. */
export function assertArmyAutonomy47(r:Pick<FoundingForces47,'world'|'clock'|'nativeWars'>&{armyAutonomy:ArmyAutonomy47}){if(fastChecks47())return;
  const s=r.armyAutonomy,int=(v:number,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=0&&v<=max,fail=()=>{throw Error('自主军令记录无效。');};
  if(!exact(s,['version','rule','revision','lastDay','armies'])||s.version!==2||s.rule!=='native-target-web-space-v2'||!int(s.revision)||!int(s.lastDay,r.world.day)||s.lastDay<r.world.day-1||!exact(s.armies,r.world.armies.map(a=>a.id)))return fail();
  for(const p of Object.values(s.armies))if(!exact(p,['targetId','garrisonId','campaignId','decision','nextTick','issuedTick','reason'])||!['waiting','attacking','supporting','staging','garrison','returning','resting','manual','busy','lost','no-route'].includes(p.decision)||!int(p.nextTick,r.clock.tick+120)||p.issuedTick!==null&&!int(p.issuedTick,r.clock.tick)||p.targetId!==null&&!r.world.provinces.some(v=>v.id===p.targetId)||p.garrisonId!==null&&!r.world.provinces.some(v=>v.id===p.garrisonId)||p.campaignId!==null&&!r.nativeWars.campaigns.some(c=>c.id===p.campaignId)||typeof p.reason!=='string'||p.reason.length>400||['attacking','supporting','staging','garrison','returning'].includes(p.decision)&&(!p.targetId||p.issuedTick===null))return fail();
}
