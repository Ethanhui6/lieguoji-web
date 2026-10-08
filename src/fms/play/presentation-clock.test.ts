import {afterEach,describe,expect,it,vi} from 'vitest';
import {startPresentationClock} from './PresentationClock';
describe('bounded visible-world playback',()=>{
 afterEach(()=>vi.useRealTimers());
 it('bounds each visible feedback batch independently from the one-day elapsed cap',async()=>{
  vi.useFakeTimers();let resolve!:()=>void;const step=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));
  const stop=startPresentationClock({playing:()=>true,blocked:()=>false,tickMillis:6.25,maxBatch:12,step});
  await vi.advanceTimersByTimeAsync(32);await vi.advanceTimersByTimeAsync(1900);resolve();await vi.advanceTimersByTimeAsync(32);
  expect(step.mock.calls[1]).toEqual([12]);stop();resolve();
 });
 it('accounts for slow acknowledged requests without overlapping or asking for more than one real day',async()=>{
  vi.useFakeTimers();let resolve!:()=>void;
  const step=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));
  const stop=startPresentationClock({playing:()=>true,blocked:()=>false,tickMillis:6.25,step});
  await vi.advanceTimersByTimeAsync(32);expect(step.mock.calls).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1900);expect(step.mock.calls).toHaveLength(1);
  resolve();await vi.advanceTimersByTimeAsync(32);expect(step.mock.calls[1]).toEqual([120]);
  stop();resolve();await vi.advanceTimersByTimeAsync(10000);expect(step.mock.calls).toHaveLength(2);
 });
 it('uses elapsed fractions at normal cadence and discards blocked time',async()=>{
  vi.useFakeTimers();let blocked=false;const step=vi.fn(async(_ticks:number)=>{});
  const stop=startPresentationClock({playing:()=>true,blocked:()=>blocked,tickMillis:25,step});
  await vi.advanceTimersByTimeAsync(320);expect(step.mock.calls.reduce((n,[ticks])=>n+ticks,0)).toBe(12);
  blocked=true;await vi.advanceTimersByTimeAsync(5000);const count=step.mock.calls.length;
  blocked=false;await vi.advanceTimersByTimeAsync(32);expect(step.mock.calls).toHaveLength(count+1);expect(step.mock.lastCall).toEqual([1]);stop();
 });
 it('does not advance after pause while the previous Worker response is pending',async()=>{
  vi.useFakeTimers();let playing=true,resolve!:()=>void;
  const step=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));const stop=startPresentationClock({playing:()=>playing,blocked:()=>false,tickMillis:25,step});
  await vi.advanceTimersByTimeAsync(32);playing=false;resolve();await vi.advanceTimersByTimeAsync(5000);expect(step).toHaveBeenCalledTimes(1);stop();
 });
});
