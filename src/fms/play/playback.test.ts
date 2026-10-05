import {afterEach,describe,expect,it,vi} from 'vitest';
import {startDayLoop,startRealtimeLoop} from './playback';
describe('continuous playback scheduling',()=>{
  afterEach(()=>vi.useRealTimers());
  it('spends elapsed time as sub-day ticks and discards blocked time',async()=>{
    vi.useFakeTimers();let blocked=false;const step=vi.fn(async(_ticks:number)=>{});
    const stop=startRealtimeLoop({playing:()=>true,blocked:()=>blocked,tickMillis:25,step});
    await vi.advanceTimersByTimeAsync(320);expect(step.mock.calls.reduce((n,[ticks])=>n+ticks,0)).toBe(12);
    blocked=true;await vi.advanceTimersByTimeAsync(3200);const count=step.mock.calls.length;blocked=false;await vi.advanceTimersByTimeAsync(32);expect(step.mock.calls.length).toBe(count+1);expect(step.mock.lastCall![0]).toBe(1);stop();
  });
  it('does not queue realtime ticks after stopping a pending request',async()=>{
    vi.useFakeTimers();let resolve!:()=>void;const step=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));
    const stop=startRealtimeLoop({playing:()=>true,blocked:()=>false,tickMillis:25,step});await vi.advanceTimersByTimeAsync(32);expect(step).toHaveBeenCalledTimes(1);stop();resolve();await vi.advanceTimersByTimeAsync(5000);expect(step).toHaveBeenCalledTimes(1);
  });
  it('waits for the new route after a busy Worker completes during a speed/effect restart',async()=>{
    vi.useFakeTimers();vi.setSystemTime(0);let busy=true,end=0;
    const step=vi.fn(async()=>{end=Date.now()+750;});
    const stop=startDayLoop({playing:()=>true,blocked:()=>busy,remaining:()=>Math.max(0,end-Date.now()),step});
    await vi.advanceTimersByTimeAsync(60);busy=false;end=810;
    await vi.advanceTimersByTimeAsync(749);expect(step).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);expect(step).toHaveBeenCalledTimes(1);stop();
  });
  it('never queues a second step after cleanup while an old Worker request is pending',async()=>{
    vi.useFakeTimers();let resolve!:()=>void;const step=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));
    const stop=startDayLoop({playing:()=>true,blocked:()=>false,remaining:()=>0,step});
    await vi.advanceTimersByTimeAsync(0);expect(step).toHaveBeenCalledTimes(1);stop();resolve();
    await vi.advanceTimersByTimeAsync(5000);expect(step).toHaveBeenCalledTimes(1);
  });
});
