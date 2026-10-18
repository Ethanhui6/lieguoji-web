import {describe,expect,it} from 'vitest';
import {assertFrameLoop47,frameTicks47,FRAME_TICKS47,FRAMES_PER_DAY47,FRAME_LOOP_RULE47} from './frame-loop47';
import {assertForceClock47,initialForceClock47,reconcileAttackClock47,rescheduleAttack47} from './force-clock47';

describe('original frame loop rule',()=>{
  it('is 6 virtual frames per 120-tick day and absent means per-tick rules',()=>{
    expect(FRAMES_PER_DAY47).toBe(6);expect(FRAME_TICKS47).toBe(20);
    expect(frameTicks47({})).toBeUndefined();
    expect(frameTicks47({frameLoop:{version:1,rule:FRAME_LOOP_RULE47,enabledTick:0}})).toBe(20);
  });
  it('rejects malformed, misaligned or future switches',()=>{
    const clock={tick:40} as never;
    expect(()=>assertFrameLoop47({clock,frameLoop:{version:1,rule:FRAME_LOOP_RULE47,enabledTick:20}})).not.toThrow();
    expect(()=>assertFrameLoop47({clock,frameLoop:{version:1,rule:FRAME_LOOP_RULE47,enabledTick:10}})).toThrow();
    expect(()=>assertFrameLoop47({clock,frameLoop:{version:1,rule:FRAME_LOOP_RULE47,enabledTick:60}})).toThrow();
    expect(()=>assertFrameLoop47({clock,frameLoop:{version:2,rule:FRAME_LOOP_RULE47,enabledTick:0} as never})).toThrow();
    expect(()=>assertFrameLoop47({clock,frameLoop:{version:1,rule:FRAME_LOOP_RULE47,enabledTick:0,extra:1} as never})).toThrow();
  });
  it('aligns attack deadlines to the next frame boundary only for frame worlds',()=>{
    const spt=.1/120,plain=initialForceClock47(40,7,spt),framed=initialForceClock47(40,7,spt);
    reconcileAttackClock47(plain,new Set(['a']),40);reconcileAttackClock47(framed,new Set(['a']),40,20);
    expect(plain.deadlines.a).toBe(40+2/spt);
    expect(framed.deadlines.a%20).toBe(0);expect(framed.deadlines.a).toBeGreaterThanOrEqual(plain.deadlines.a);expect(framed.deadlines.a-plain.deadlines.a).toBeLessThan(20);
    rescheduleAttack47(framed,'a',40,20);expect(framed.deadlines.a%20).toBe(0);
    expect(()=>assertForceClock47(framed,40,new Set(['a']),20)).not.toThrow();
    // A misaligned deadline is rejected in a frame world but accepted per tick.
    framed.deadlines.a=41+2/spt;expect(()=>assertForceClock47(framed,40,new Set(['a']),20)).toThrow();expect(()=>assertForceClock47(framed,40,new Set(['a']))).not.toThrow();
  });
});
