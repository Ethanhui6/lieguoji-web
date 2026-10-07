import {describe,it,expect,vi} from 'vitest';
import {nativeAccumulateDiplomaticPower,nativeSpendDeclarationPower,nativeInitializeWarPowers,NATIVE_CONSTRUCTOR_DIPLOMATIC_POWER,NATIVE_DIPLOMATIC_EFFICIENCY_FACTOR,NATIVE_START_WAR_THRESHOLD,type NativeDiplomaticPower} from './diplomatic-power';
describe('native monthly declaration points',()=>{
 const power=():NativeDiplomaticPower=>({power:100,startWar:100,endWar:100,efficiency:0});
 it('constructor-fragment fixture reaches 120; failed choice waits through 80 and 100 (not full new-country initialization)',()=>{
  const s=power(),evaluate=vi.fn(()=>null);expect(NATIVE_CONSTRUCTOR_DIPLOMATIC_POWER).toBe(100);
  nativeAccumulateDiplomaticPower(s,NATIVE_DIPLOMATIC_EFFICIENCY_FACTOR);nativeSpendDeclarationPower(s,NATIVE_START_WAR_THRESHOLD,evaluate);expect(s).toEqual({power:120,startWar:60,endWar:120,efficiency:20});
  for(const expected of [80,100]){nativeAccumulateDiplomaticPower(s,20);nativeSpendDeclarationPower(s,100,evaluate);expect(s.startWar).toBe(expected);expect(evaluate).toHaveBeenCalledTimes(1);}
  nativeAccumulateDiplomaticPower(s,20);nativeSpendDeclarationPower(s,100,evaluate);expect(evaluate).toHaveBeenCalledTimes(2);expect(s.startWar).toBe(60);
 });
 it('success clears only the start-war pool and returns the actual war',()=>{const s=power(),war={id:4};nativeAccumulateDiplomaticPower(s,20);expect(nativeSpendDeclarationPower(s,100,()=>war)).toBe(war);expect(s).toEqual({power:120,startWar:0,endWar:120,efficiency:20});});
 it('does not catch a failure or debit a speculative successful war',()=>{const s=power();nativeAccumulateDiplomaticPower(s,20);expect(()=>nativeSpendDeclarationPower(s,100,()=>{throw Error('candidate invalid');})).toThrow(/invalid/);expect(s.startWar).toBe(120);});
 it('accumulation has no diplomacy switch and retains power/endWar/startWar write order',()=>{
  const values={power:100,startWar:100,endWar:100,efficiency:0},writes:string[]=[],s=new Proxy(values,{set(target,key,value){writes.push(String(key));Reflect.set(target,key,value);return true;}});
  nativeAccumulateDiplomaticPower(s,20);expect(writes).toEqual(['efficiency','power','endWar','startWar']);
 });
 it('simulation initialization overwrites constructor-derived start/end pools but keeps total power',()=>{
  const s=power(),reads:[number,number,number,number][]=[];nativeAccumulateDiplomaticPower(s,20);
  nativeInitializeWarPowers(s,100,80,(min,max)=>{reads.push([min,max,s.startWar,s.endWar]);return max*.25;});
  expect(reads).toEqual([[0,100,120,120],[0,80,25,120]]);expect(s).toEqual({power:120,startWar:25,endWar:20,efficiency:20});
  nativeAccumulateDiplomaticPower(s,20);const attempt=vi.fn(()=>null);nativeSpendDeclarationPower(s,100,attempt);expect(s.startWar).toBe(45);expect(attempt).not.toHaveBeenCalled();
 });
 it('second initialization draw failure leaves the native first write visible to the private candidate',()=>{
  const s=power();let call=0;expect(()=>nativeInitializeWarPowers(s,100,100,()=>{if(++call===2)throw Error('RNG failed');return 25;})).toThrow(/RNG/);expect(s.startWar).toBe(25);expect(s.endWar).toBe(100);
 });
});
