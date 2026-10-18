import type {FoundingForces47} from './civilization47-forces';
import {populationStamp47,type PopulationStamp47} from './civilization47-population-types';
import {sameCulture47Value} from './culture47-equal';
import {cloneMilitaryCandidate47} from './geography-content47';
import {TICKS_PER_DAY} from './clock';

/** The original's frame loop (TimeManager.Update): game time advances per
 * frame and secondsPerDay = 0.1, so at 1x and 60 fps one game day is 6 frames.
 * New worlds step movement, combat and per-frame observers once per virtual
 * frame of 120 / 6 = 20 ticks, independent of playback speed or the device's
 * frame rate, so a journal still replays exactly. Calendar ticks, day/month
 * settlement and saved time are unchanged. Absence keeps the per-tick rules. */
export const FRAME_LOOP_RULE47='original-frame-loop-v1';
export const FRAMES_PER_DAY47=6;
export const FRAME_TICKS47=TICKS_PER_DAY/FRAMES_PER_DAY47;
export type FrameLoop47={version:1;rule:typeof FRAME_LOOP_RULE47;enabledTick:number};

export function assertFrameLoop47(r:Pick<FoundingForces47,'clock'>&{frameLoop?:FrameLoop47}):void{
  const s=r.frameLoop;if(s===undefined)return;
  if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).sort().join('/')!=='enabledTick/rule/version'||s.version!==1||s.rule!==FRAME_LOOP_RULE47||!Number.isSafeInteger(s.enabledTick)||s.enabledTick<0||s.enabledTick%FRAME_TICKS47!==0||s.enabledTick>r.clock.tick)throw Error('原作帧循环规则无效或属于未来版本，已保留原档。');
}
/** Virtual frame length in ticks for this run, or undefined for the per-tick rules. */
export function frameTicks47(r:{frameLoop?:FrameLoop47}):number|undefined{return r.frameLoop?FRAME_TICKS47:undefined;}

/** Explicit, journalled switch at a frame boundary. Never retrofit a loaded old run. */
export function enableFrameLoop47<T extends FoundingForces47>(input:T,expected:PopulationStamp47):T{
  assertFrameLoop47(input);
  if(input.frameLoop||input.clock.tick%FRAME_TICKS47!==0||input.forceClock.now!==input.clock.tick||!sameCulture47Value(expected,populationStamp47(input)))throw Error('原作帧循环只能在世界未变化的帧边界启用，请重新操作。');
  const r=cloneMilitaryCandidate47(input);
  r.frameLoop={version:1,rule:FRAME_LOOP_RULE47,enabledTick:r.clock.tick};
  // Existing attack deadlines move to their next frame boundary.
  for(const key of Object.keys(r.forceClock.deadlines))r.forceClock.deadlines[key]=Math.ceil(r.forceClock.deadlines[key]/FRAME_TICKS47)*FRAME_TICKS47;
  return r;
}
