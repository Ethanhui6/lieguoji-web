import type {FoundingForces47} from './civilization47-forces';
import {FRAME_TICKS47,frameTicks47} from './frame-loop47';
import {populationStamp47,type PopulationStamp47} from './civilization47-population-types';
import {sameCulture47Value} from './culture47-equal';
import {cloneMilitaryCandidate47} from './geography-content47';

/** Native ctor 0x35D72C / singleton 0x35D8E8 default to five calls.
 * WEB adaptation: the existing target/order policy consumes these calls;
 * movement, damage and economy retain their separate owners. */
export const ARMY_BATCH_RULE47='native-five-army-orders-web-v1';
export type ArmyBatch47={version:1;rule:typeof ARMY_BATCH_RULE47;cursor:number;lastTick:number;calls:number};
export function assertArmyBatch47(r:Pick<FoundingForces47,'armyBatch'|'frameLoop'|'clock'>){
 const s=r.armyBatch;if(s===undefined)return;
 if(!r.frameLoop||!s||Object.keys(s).sort().join('/')!=='calls/cursor/lastTick/rule/version'||s.version!==1||s.rule!==ARMY_BATCH_RULE47||![s.cursor,s.lastTick,s.calls].every(v=>Number.isSafeInteger(v)&&v>=0)||s.lastTick>r.clock.tick||s.lastTick%(frameTicks47(r)??FRAME_TICKS47)!==0||s.calls%5!==0)throw Error('陆军轮转记录无效，已保留原档。');
}
/** Wrap only when cursor >= count, not modulo: removals preserve the native
 * reset-to-zero rule. Small lists repeat calls; no fabricated army is added. */
export function rotateArmyBatch47(ids:readonly string[],cursor:number){
 const selected:string[]=[];
 if(ids.length)for(let i=0;i<5;i++){if(cursor>=ids.length)cursor=0;selected.push(ids[cursor++]);}
 return {selected,cursor};
}
export function consumeArmyBatch47(r:FoundingForces47):string[]{
 assertArmyBatch47(r);const s=r.armyBatch;if(!s)return [];
 if(r.clock.tick===s.lastTick)return [];
 if(r.clock.tick!==s.lastTick+(frameTicks47(r)??FRAME_TICKS47)||s.calls>Number.MAX_SAFE_INTEGER-5)throw Error('陆军轮转必须接续虚拟帧。');
 // Dead/retired records stay in history but cannot consume a live order slot.
 const out=rotateArmyBatch47(r.world.armies.filter(a=>a.troops>0).map(a=>a.id),s.cursor);
 s.cursor=out.cursor;s.lastTick=r.clock.tick;s.calls+=out.selected.length;return out.selected;
}
export function enableArmyBatch47<T extends FoundingForces47>(input:T,expected:PopulationStamp47):T{
 assertArmyBatch47(input);
 if(input.armyBatch||!input.frameLoop||input.clock.tick%FRAME_TICKS47!==0||input.forceClock.now!==input.clock.tick||!sameCulture47Value(expected,populationStamp47(input)))throw Error('陆军轮转只能在未变化的帧边界启用。');
 const r=cloneMilitaryCandidate47(input);r.armyBatch={version:1,rule:ARMY_BATCH_RULE47,cursor:0,lastTick:r.clock.tick,calls:0};return r;
}
