import type {Culture47Snapshot} from './culture47.worker';
import type {ContactTraceFrame47} from './force-display-trace47';
import type {ForceContact47} from './force-motion47';

/** Contacts and troop movement share the confirmed display clock. Preserve
 * unfinished ACK tails; never show a future contact in the middle of a march.
 * Frozen workers provide endpoints only: hold the last known ledger until the
 * next confirmed endpoint, without inventing contact times in between. */
export class CombatTimeline47 {
 private previous?:Culture47Snapshot;
 private frames:ContactTraceFrame47[]=[];
 pairs(tick:number):ForceContact47[]{
  let lo=0,hi=this.frames.length;while(lo<hi){const mid=(lo+hi)>>>1;if(this.frames[mid].tick<=tick)lo=mid+1;else hi=mid;}
  return lo?this.frames[lo-1].pairs:[];
 }
 install(next:Culture47Snapshot,displayTick:number,immediate=false){
  const previous=this.previous,end=next.run.clock.tick;this.previous=next;
  const final={tick:end,pairs:structuredClone(next.run.forceContacts?.pairs??[])};
  if(!previous||previous.run.id!==next.run.id||previous.journal.engine!==next.journal.engine||end<previous.run.clock.tick||immediate){this.frames=[final];return;}
  const baseline={tick:displayTick,pairs:this.pairs(displayTick)};
  const trace=next.motion,valid=trace?.runId===next.run.id&&trace.fromSequence===previous.journal.actions.length&&trace.toSequence===next.journal.actions.length&&trace.fromTick===previous.run.clock.tick&&trace.toTick===end;
  const incoming=valid?(trace.contacts??[]).filter(f=>Number.isFinite(f.tick)&&f.tick>=trace.fromTick&&f.tick<=end):[];
  const frames=[baseline,...this.frames.filter(f=>f.tick>=displayTick&&f.tick<=previous.run.clock.tick),...incoming,final];
  // Same-tick death/peace and the settled daily ledger supersede motion events.
  this.frames=[...new Map(frames.map(f=>[f.tick,f])).values()].sort((a,b)=>a.tick-b.tick);
 }
}
