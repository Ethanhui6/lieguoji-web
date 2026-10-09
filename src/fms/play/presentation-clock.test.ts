import {afterEach,describe,expect,it,vi} from 'vitest';
import {startPresentationClock} from './PresentationClock';
describe('bounded visible-world playback',()=>{
 afterEach(()=>vi.useRealTimers());
 it('honors 1x and 4x elapsed tick budgets when the Worker can keep up',async()=>{
  vi.useFakeTimers();const totals:number[]=[];
  for(const speed of [1,4]){let total=0;const stop=startPresentationClock({playing:()=>true,blocked:()=>false,tickMillis:100/120/speed,maxBatch:120*speed,step:async ticks=>{total+=ticks;}});await vi.advanceTimersByTimeAsync(1000);stop();totals.push(total);}
  expect(totals[0]).toBeGreaterThanOrEqual(1180);expect(totals[1]).toBeGreaterThanOrEqual(4720);expect(totals[1]/totals[0]).toBeCloseTo(4,1);
 });
 it('dispatches the next bounded batch immediately after a slow ACK, not 32 ms later',async()=>{
  vi.useFakeTimers();let resolve!:()=>void;const step=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));
  const stop=startPresentationClock({playing:()=>true,blocked:()=>false,tickMillis:.2,maxBatch:480,step});
  await vi.advanceTimersByTimeAsync(32);await vi.advanceTimersByTimeAsync(500);expect(step).toHaveBeenCalledTimes(1);
  resolve();await vi.advanceTimersByTimeAsync(1);expect(step.mock.calls[1]).toEqual([480]);stop();resolve();
 });
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
