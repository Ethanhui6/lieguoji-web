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
export type FrameLoop47={version:1;rule:typeof FRAME_LOOP_RULE47;enabledTick:number;ticks?:number};
/** Original TimeManager: game time per frame = frame time x timeScale, so a
 * faster speed takes fewer, longer frames per game day (60 fps reference).
 * Ideal ticks per frame are 20 x speed; frames must divide one day, so 4x and
 * 5x use the nearest divisors (60 and 120: 2 and 1 frames per day instead of
 * the original 1.5 and 1.2). */
export const FRAME_TICKS_BY_SPEED47:Readonly<Record<string,number>>=Object.freeze({'0.1':2,'0.5':10,'1':20,'2':40,'3':60,'4':60,'5':120});
const FRAME_LENGTHS47=new Set(Object.values(FRAME_TICKS_BY_SPEED47));

export function assertFrameLoop47(r:Pick<FoundingForces47,'clock'>&{frameLoop?:FrameLoop47}):void{
  const s=r.frameLoop;if(s===undefined)return;
  const keys=Object.keys(s??{}).sort().join('/');
  if(!s||typeof s!=='object'||Array.isArray(s)||keys!=='enabledTick/rule/version'&&!(keys==='enabledTick/rule/ticks/version'&&FRAME_LENGTHS47.has(s.ticks!))||s.version!==1||s.rule!==FRAME_LOOP_RULE47||!Number.isSafeInteger(s.enabledTick)||s.enabledTick<0||s.enabledTick%FRAME_TICKS47!==0||s.enabledTick>r.clock.tick)throw Error('原作帧循环规则无效或属于未来版本，已保留原档。');
}
/** Virtual frame length in ticks for this run, or undefined for the per-tick rules. */
export function frameTicks47(r:{frameLoop?:FrameLoop47}):number|undefined{return r.frameLoop?r.frameLoop.ticks??FRAME_TICKS47:undefined;}
/** Journalled speed change (original timeScale) at a day boundary, where every
 * frame length's boundaries coincide. Attack deadlines move to the next new
 * frame boundary, exactly as when the frame loop was first enabled. */
export function setFrameLength47<T extends FoundingForces47>(input:T,ticks:number):T{
  assertFrameLoop47(input);
  const s=input.frameLoop,now=input.clock.tick;
  if(!s||!FRAME_LENGTHS47.has(ticks)||ticks===frameTicks47(input)||now%TICKS_PER_DAY!==0||input.forceClock.now!==now)throw Error('推演速度只能在日界切换，请稍后再试。');
  if(input.armyBatch&&input.armyBatch.lastTick!==now||input.navalAutonomy.lastTick!==now)throw Error('推演速度切换时部队轮转未对齐，原进度保留。');
  const r=cloneMilitaryCandidate47(input);
  r.frameLoop={...s,ticks};
  for(const key of Object.keys(r.forceClock.deadlines))r.forceClock.deadlines[key]=Math.ceil(r.forceClock.deadlines[key]/ticks)*ticks;
  return r;
}

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
