import {beforeAll,describe,it,expect,vi} from 'vitest';
import * as military from './civilization47-military';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal,type Culture47Opening} from './culture47-session';
import {Culture47DisplayDecoder,sameDisplayStatic47,type Culture47DisplayPacket} from './culture47-display';
const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'war',setup:{mode:'culture-generated',enabled:['chinese','japanese']}};
let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create(opening).journal;},30000);
const expected=(sequence?:number,actions=1)=>({engine:__CULTURE47_ENGINE__,sequence,actions});
const withoutMotion=(s:ReturnType<Culture47DisplayDecoder['decode']>)=>{const {motion,...state}=s;void motion;return state;};
function ready(){const owner=new Culture47Session();owner.load(journal);const decoder=new Culture47DisplayDecoder(),full=owner.displaySnapshot(),snapshot=decoder.decode(full,expected());return{owner,decoder,snapshot,full};}
describe('culture world compact transport and atomic batches',()=>{
 it('rolls back a later runtime failure without committing an earlier valid day',()=>{
  const {owner,decoder,snapshot}=ready(),original=military.advanceCivilizationMilitary47;let calls=0;
  const spy=vi.spyOn(military,'advanceCivilizationMilitary47').mockImplementation((...args)=>{if(++calls===2)throw Error('injected later-day failure');return original(...args);});
  try {expect(()=>owner.executeDisplay([{kind:'advance',ticks:120},{kind:'advance',ticks:120}],0)).toThrow(/later-day/);expect(calls).toBe(2);expect(owner.snapshot()).toEqual(snapshot);}finally{spy.mockRestore();}
  expect(decoder.decode(owner.executeDisplay([{kind:'advance',ticks:120}],0),expected(0)).run.world.day).toBe(1);
 },30000);
 it('sends full maps once, retains all dynamic changes and reconstructs exact replay state',()=>{
  const {owner,decoder,snapshot}=ready();
  const packet=owner.executeDisplay([{kind:'advance',ticks:120},{kind:'advance',ticks:120}],0);
  expect(packet.kind).toBe('update');if(packet.kind!=='update')throw Error('expected update');
  expect('terrain'in packet.run).toBe(false);expect('diplomaticGeography'in packet.run).toBe(false);expect('opening'in packet.journal).toBe(false);
  const result=decoder.decode(packet,expected(0,2));const {motion,...state}=result;expect(state).toEqual(owner.snapshot());expect(motion).toMatchObject({fromTick:0,toTick:240,fromSequence:0,toSequence:2});expect(motion!.armies).not.toEqual({});
  expect(result.run.terrain).toBe(snapshot.run.terrain);expect(result.journal.opening).toBe(snapshot.journal.opening);
  expect(new Culture47Session().load(result.journal)).toEqual(state);
 },60000);
 it('matches serial actions including a partial day and preserves public snapshot isolation',()=>{
  const {owner,decoder}=ready(),serial=new Culture47Session();serial.load(journal);
  const actions=[{kind:'advance' as const,ticks:120},{kind:'advance' as const,ticks:17}];
  const result=decoder.decode(owner.executeDisplay(actions,0),expected(0,2));
  actions.forEach((a,i)=>serial.execute(a,i));expect(withoutMotion(result)).toEqual(serial.snapshot());
  result.run.world.nations[0].name='tampered';result.journal.actions[0]={kind:'advance',ticks:1};
  expect(owner.snapshot()).toEqual(serial.snapshot());
 },60000);
 it('rejects stale or invalid batch atomically and retains the previous accepted sequence',()=>{
  const {owner,decoder,snapshot}=ready();
  expect(()=>owner.executeDisplay([{kind:'advance',ticks:120},{kind:'advance',ticks:121}],0)).toThrow();
  expect(()=>owner.executeDisplay([{kind:'identity',edit:{kind:'city',id:'c-0',customName:'Changed'}},{kind:'identity',edit:{kind:'city',id:'missing',customName:'Bad'}}],0)).toThrow();
  expect(()=>owner.executeDisplay([{kind:'advance',ticks:1}],1)).toThrow();expect(owner.snapshot()).toEqual(snapshot);
  expect(decoder.decode(owner.executeDisplay([{kind:'advance',ticks:1}],0),expected(0)).run.clock.tick).toBe(1);
 },30000);
 it('does not reuse baselines across loads, epochs, worlds or duplicate responses',()=>{
  const {owner,decoder}=ready(),packet=owner.executeDisplay([{kind:'advance',ticks:1}],0);
  expect(()=>new Culture47DisplayDecoder().decode(packet,expected(0))).toThrow();
  expect(()=>decoder.decode({...packet,base:'different'},expected(0))).toThrow();
  const corrupt=structuredClone(packet);if(corrupt.kind==='update')corrupt.journal.id='fms-wrong';expect(()=>decoder.decode(corrupt,expected(0))).toThrow();
  decoder.decode(packet,expected(0));expect(()=>decoder.decode(packet,expected(0))).toThrow();
  owner.load(journal);const reset=owner.displaySnapshot();expect(reset.kind).toBe('full');decoder.decode(reset,expected());
 },30000);
 it('detects exposed terrain bytes and neighbor edits without contaminating the Worker',()=>{
  for(const mutate of [(s:ReturnType<Culture47Session['snapshot']>)=>{s.run.terrain.elevations[0]++;},(s:ReturnType<Culture47Session['snapshot']>)=>{s.journal.opening.terrain.elevations[0]++;}]){
   const {owner,decoder,snapshot}=ready();mutate(snapshot);const packet=owner.executeDisplay([{kind:'advance',ticks:1}],0);
   expect(()=>decoder.decode(packet,expected(0))).toThrow(/基图/);expect(owner.snapshot().run.terrain.elevations[0]).toBe(opening.terrain.elevations[0]);
  }
  const {snapshot}=ready();expect(()=>snapshot.run.terrain.neighbors[0].push(99)).toThrow();expect(()=>snapshot.run.terrain.neighbors[0].length++).toThrow();
  const a=[1,2],b=[1,2];b.length++;expect(sameDisplayStatic47(a,b)).toBe(false);
 },30000);
 it('rejects attempts to replace static fields inside an update',()=>{
  const {owner,decoder,snapshot}=ready(),packet=owner.executeDisplay([{kind:'advance',ticks:1}],0);
  if(packet.kind!=='update')throw Error('expected update');
  const invalid={...packet,run:{...packet.run,terrain:snapshot.run.terrain}} as Culture47DisplayPacket;
  expect(()=>decoder.decode(invalid,expected(0))).toThrow();expect(withoutMotion(decoder.decode(packet,expected(0)))).toEqual(owner.snapshot());
 },30000);
 it('rejects motion from another batch or an altered endpoint without advancing the display epoch',()=>{
  const {owner,decoder}=ready(),packet=owner.executeDisplay([{kind:'advance',ticks:5}],0);if(!packet.motion)throw Error('expected completed movement evidence');
  const wrong=structuredClone(packet);wrong.motion!.fromSequence++;expect(()=>decoder.decode(wrong,expected(0))).toThrow(/轨迹/);
  const endpoint=structuredClone(packet),path=Object.values(endpoint.motion!.armies)[0];path.at(-1)!.x+=10;expect(()=>decoder.decode(endpoint,expected(0))).toThrow(/终点/);
  expect(withoutMotion(decoder.decode(packet,expected(0)))).toEqual(owner.snapshot());expect('motion'in owner.snapshot()).toBe(false);
 },30000);
});
