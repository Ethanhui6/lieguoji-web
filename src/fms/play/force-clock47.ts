import {TACTICS_SECOND} from './tactics-rules';

/** Web replay clock, not Unity's frame/random stream. Public commits are whole
 * ticks; geometry and due attacks may occur between them. Native first delay
 * is 2 scaled seconds, later 2 * Range(float 1,3). Activation/reset on encounter
 * is an explicit web policy; constructor evidence alone does not prove it. */
export type ForceClock47 = {
  version: 1; basis: 'web-ticks10-lcg-v1'; now: number;
  rng: number; draws: number; deadlines: Record<string, number>;
};
export function initialForceClock47(now: number, seed: number): ForceClock47 {
  const clock: ForceClock47 = {version:1,basis:'web-ticks10-lcg-v1',now,rng:seed,draws:0,deadlines:{}};
  assertForceClock47(clock,now,new Set()); return clock;
}
export function assertForceClock47(value: ForceClock47, tick: number, liveKeys: ReadonlySet<string>) {
  const c=value;
  if(!c || Object.keys(c).sort().join('/')!=='basis/deadlines/draws/now/rng/version' || c.version!==1 || c.basis!=='web-ticks10-lcg-v1' || !Number.isSafeInteger(c.now) || c.now<0 || c.now!==tick || !Number.isSafeInteger(c.rng) || c.rng<0 || c.rng>0xffffffff || !Number.isSafeInteger(c.draws) || c.draws<0 || !c.deadlines || typeof c.deadlines!=='object' || Array.isArray(c.deadlines)) throw Error('统一攻击时钟损坏或属于未来规则。');
  for(const [key,at] of Object.entries(c.deadlines)) if(!liveKeys.has(key) || !Number.isFinite(at) || at<=c.now || at>c.now+6*TACTICS_SECOND) throw Error('部队攻击期限或身份无效。');
}
/** Owned candidate only. Continuing contact keeps its original deadline. */
export function reconcileAttackClock47(c: ForceClock47, eligible: ReadonlySet<string>, now: number) {
  for(const key of Object.keys(c.deadlines)) if(!eligible.has(key)) delete c.deadlines[key];
  for(const key of [...eligible].sort()) if(!Object.hasOwn(c.deadlines,key)) c.deadlines[key]=now+2*TACTICS_SECOND;
}
/** Consume one draw per due typed identity, including a unit simultaneously
 * killed in this volley. The whole caller transaction owns rollback. */
export function rescheduleAttack47(c: ForceClock47, key: string, now: number) {
  if(c.draws>=Number.MAX_SAFE_INTEGER) throw Error('攻击随机序列已达上限。');
  c.rng=(Math.imul(c.rng,1664525)+1013904223)>>>0; c.draws++;
  const f=Math.fround, range=f(f(1)+f(f(2)*f(c.rng/4294967296)));
  c.deadlines[key]=now+f(f(2)*range)*TACTICS_SECOND;
}
