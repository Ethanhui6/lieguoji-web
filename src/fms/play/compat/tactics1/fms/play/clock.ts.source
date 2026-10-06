export const TICKS_PER_DAY=120;
export interface SimClock {version:1;tick:number}
export function assertClock(clock:unknown,day:number):asserts clock is SimClock {
  const c=clock as SimClock;
  if(!c||Object.keys(c).length!==2||c.version!==1||!Number.isSafeInteger(c.tick)||c.tick<0||c.tick>=TICKS_PER_DAY*1_000_000_001||Math.floor(c.tick/TICKS_PER_DAY)!==day)throw Error('日内时钟损坏或属于未来版本，已锁定读写。');
}
