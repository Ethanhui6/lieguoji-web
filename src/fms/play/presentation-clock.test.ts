import {afterEach,describe,expect,it,vi} from 'vitest';
import {startPresentationClock} from './PresentationClock';
import {culture47PlaybackBudget} from './culture47-pacing';
describe('bounded visible-world playback',()=>{
 afterEach(()=>vi.useRealTimers());
 it('posts the next credited Worker batch before the queued display task when opted in',async()=>{
  vi.useFakeTimers();let tick=0,resolve!:()=>void;const order:string[]=[];
  const stop=startPresentationClock({tickMillis:.2,maxBatch:480,acknowledgedContinuation:true,batchBoundary:()=>120-tick%120,playing:()=>true,blocked:()=>false,step:n=>{order.push('post');return new Promise<void>(done=>{resolve=()=>{tick+=n;setTimeout(()=>order.push('display'),0);done();};});}});
  await vi.advanceTimersByTimeAsync(32);await vi.advanceTimersByTimeAsync(500);
  expect(order).toEqual(['post']);resolve();
  for(let i=0;i<6;i++)await Promise.resolve();
  expect(order).toEqual(['post','post']);expect(tick%120).toBe(0);
  stop();resolve();await vi.advanceTimersByTimeAsync(1000);expect(order.filter(v=>v==='post')).toHaveLength(2);
 });
 it.each(['pause','cancel','foreground'] as const)('rechecks %s before a prioritized ACK continuation',async reason=>{
  vi.useFakeTimers();let playing=true,blocked=false,resolve!:()=>void;const step=vi.fn(()=>new Promise<void>(done=>{resolve=done;}));
  const stop=startPresentationClock({tickMillis:.2,maxBatch:480,acknowledgedContinuation:true,playing:()=>playing,blocked:()=>blocked,step});
  await vi.advanceTimersByTimeAsync(32);await vi.advanceTimersByTimeAsync(500);
  if(reason==='pause')playing=false;else if(reason==='cancel')stop();else blocked=true;
  resolve();for(let i=0;i<6;i++)await Promise.resolve();await vi.advanceTimersByTimeAsync(100);
  expect(step).toHaveBeenCalledTimes(1);stop();
 });
 it('does not microtask-spin idle or immediately acknowledged work',async()=>{
  vi.useFakeTimers();let tick=0;const step=vi.fn(async(n:number)=>{tick+=n;});
  const stop=startPresentationClock({tickMillis:2,maxBatch:480,acknowledgedContinuation:true,batchBoundary:()=>120-tick%120,playing:()=>true,blocked:()=>false,step});
  await vi.advanceTimersByTimeAsync(1000);stop();expect(tick).toBe(480);expect(step).toHaveBeenCalledTimes(4);
 });
 it.each([0,66])('aligns automatic endpoints from tick %s without spending unearned credit',async(initial)=>{
  vi.useFakeTimers();let tick=initial;const batches:{count:number;time:number;end:number}[]=[];
  const stop=startPresentationClock({tickMillis:2,maxBatch:480,batchBoundary:()=>120-tick%120,playing:()=>true,blocked:()=>false,step:async n=>{tick+=n;batches.push({count:n,time:performance.now(),end:tick});}});
  await vi.advanceTimersByTimeAsync(2300);stop();expect(batches.length).toBeGreaterThan(0);expect(batches.every(b=>b.end%120===0&&b.count>0&&b.count<=480)).toBe(true);
  expect(tick-initial).toBeLessThanOrEqual(1150);expect(1150-(tick-initial)).toBeLessThan(120);
  for(const b of batches)expect(b.end-initial).toBeLessThanOrEqual(Math.floor(b.time/2));
 });
 it('keeps day alignment through slow ACKs and leaves no late request after pause',async()=>{
  vi.useFakeTimers();let tick=66,playing=true,resolve!:()=>void;const starts:number[]=[],ends:number[]=[];
  const stop=startPresentationClock({tickMillis:.2,maxBatch:480,batchBoundary:()=>120-tick%120,playing:()=>playing,blocked:()=>false,step:n=>{starts.push(tick);return new Promise<void>(r=>{resolve=()=>{tick+=n;ends.push(tick);r();};});}});
  await vi.advanceTimersByTimeAsync(32);await vi.advanceTimersByTimeAsync(600);expect(starts).toEqual([66]);resolve();await vi.advanceTimersByTimeAsync(1);expect(starts).toHaveLength(2);expect(starts[1]%120).toBe(0);playing=false;stop();resolve();await vi.advanceTimersByTimeAsync(1000);expect(starts).toHaveLength(2);expect(ends.every(t=>t%120===0)).toBe(true);
 });
 it('does not carry paused credit into a new speed and keeps partial-day restoration bounded',async()=>{
  vi.useFakeTimers();let tick=66,blocked=false;const counts:number[]=[];
  const opts={maxBatch:480,batchBoundary:()=>120-tick%120,playing:()=>true,blocked:()=>blocked,step:async(n:number)=>{tick+=n;counts.push(n);}};
  let stop=startPresentationClock({...opts,tickMillis:2});await vi.advanceTimersByTimeAsync(100);expect(counts).toEqual([]);blocked=true;await vi.advanceTimersByTimeAsync(500);stop();blocked=false;
  stop=startPresentationClock({...opts,tickMillis:.5});await vi.advanceTimersByTimeAsync(32);stop();expect(counts).toEqual([54]);expect(tick).toBe(120);
 });
 it('rebases 1x to the previous 4x target without changing saved calendar seconds',async()=>{
  vi.useFakeTimers();const seconds=Math.fround(.1),totals:number[]=[];
  for(const speed of [1,4]){let total=0;const budget=culture47PlaybackBudget(seconds,speed,true);
   expect(budget.maxBatch).toBe(480);
   const stop=startPresentationClock({...budget,playing:()=>true,blocked:()=>false,step:async n=>{total+=n;}});
   await vi.advanceTimersByTimeAsync(1000);stop();totals.push(total);
  }
  expect(totals[0]).toBeGreaterThanOrEqual(4700);expect(totals[1]/totals[0]).toBeCloseTo(4,1);
  expect(culture47PlaybackBudget(seconds,1,false).maxBatch).toBe(120);
  expect(culture47PlaybackBudget(seconds,1,true).tickMillis).toBe(seconds*1000/480);
 });
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
