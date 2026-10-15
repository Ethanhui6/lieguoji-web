import {describe,expect,it} from 'vitest';
import {CombatTimeline47} from './combat-timeline47';
import {ForceDisplayTraceCollector47} from './force-display-trace47';
import type {Culture47Snapshot} from './culture47.worker';
import type {ForceContact47} from './force-motion47';
const pair:ForceContact47={a:'a',b:'b',area:'land/p',cellA:1,cellB:2,pointA:{x:10,y:0},pointB:{x:12,y:0}};
function snapshot(tick:number,sequence:number,pairs:ForceContact47[]=[],contacts?:{tick:number;pairs:ForceContact47[]}[]):Culture47Snapshot{
 return {run:{id:'world',clock:{tick},forceContacts:{version:1,pairs}},journal:{engine:'engine',actions:Array(sequence).fill(null)},...(contacts?{motion:{runId:'world',fromSequence:sequence-1,toSequence:sequence,fromTick:tick-10,toTick:tick,armies:{},fleets:{},contacts}}:{})} as unknown as Culture47Snapshot;
}
describe('confirmed contact presentation clock',()=>{
 it('does not show a later encounter before troops reach its accepted event and removes a resolved contact',()=>{
  const c=new CombatTimeline47();c.install(snapshot(0,0),0);c.install(snapshot(10,1,[],[{tick:0,pairs:[]},{tick:4.5,pairs:[pair]},{tick:8,pairs:[]}]),0);
  expect(c.pairs(4.49)).toEqual([]);expect(c.pairs(4.5)).toEqual([pair]);expect(c.pairs(7.99)).toEqual([pair]);expect(c.pairs(8)).toEqual([]);expect(c.pairs(10)).toEqual([]);
 });
 it('preserves an unfinished ACK tail when the next one arrives and a same-tick preview does not restart it',()=>{
  const c=new CombatTimeline47();c.install(snapshot(0,0),0);const first=snapshot(10,1,[pair],[{tick:0,pairs:[]},{tick:7,pairs:[pair]}]);c.install(first,0);
  c.install(first,2);c.install(snapshot(20,2,[],[{tick:10,pairs:[pair]},{tick:14,pairs:[]}]),3);
  expect(c.pairs(6.9)).toEqual([]);expect(c.pairs(7)).toEqual([pair]);expect(c.pairs(13.9)).toEqual([pair]);expect(c.pairs(14)).toEqual([]);
 });
 it('holds old-worker endpoint knowledge until the accepted endpoint, never guessing a mid-route fight',()=>{
  const c=new CombatTimeline47();c.install(snapshot(0,0),0);c.install(snapshot(10,1,[pair]),0);
  expect(c.pairs(9.9)).toEqual([]);expect(c.pairs(10)).toEqual([pair]);c.install(snapshot(20,2),12);expect(c.pairs(19.9)).toEqual([pair]);expect(c.pairs(20)).toEqual([]);
 });
 it('rejects a trace from another sequence and resets on restore rather than leaking the last world',()=>{
  const c=new CombatTimeline47();c.install(snapshot(0,0),0);const forged=snapshot(10,1,[pair],[{tick:1,pairs:[pair]}]);forged.motion!.fromSequence=8;c.install(forged,0);expect(c.pairs(5)).toEqual([]);
  c.install(snapshot(0,0),0,true);expect(c.pairs(100)).toEqual([]);
 });
 it('records immutable changes, compresses waits, and lets same-tick death/peace supersede contact',()=>{
  const collector=new ForceDisplayTraceCollector47('world',0,0),book={version:1 as const,pairs:[structuredClone(pair)]};
  collector.recordContacts(0,{version:1,pairs:[]});collector.recordContacts(3,book);book.pairs[0].pointA.x=90;
  collector.recordContacts(4,{version:1,pairs:[pair]});collector.recordContacts(5,{version:1,pairs:[pair]});collector.recordContacts(5,{version:1,pairs:[]});
  expect(collector.finish(1,10)!.contacts).toEqual([{tick:0,pairs:[]},{tick:3,pairs:[pair]},{tick:5,pairs:[]}]);
 });
});
