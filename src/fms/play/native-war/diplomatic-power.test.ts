import {describe,it,expect,vi} from 'vitest';
import {nativeAccumulateDiplomaticPower,nativeSpendDeclarationPower,NATIVE_INITIAL_DIPLOMATIC_POWER,NATIVE_DIPLOMATIC_EFFICIENCY_FACTOR,NATIVE_START_WAR_THRESHOLD,type NativeDiplomaticPower} from './diplomatic-power';
describe('native monthly declaration points',()=>{
 const power=():NativeDiplomaticPower=>({power:100,startWar:100,endWar:100,efficiency:0});
 it('first monthly update reaches 120; failed choice waits through 80 and 100 before trying again at 120',()=>{
  const s=power(),evaluate=vi.fn(()=>null);expect(NATIVE_INITIAL_DIPLOMATIC_POWER).toBe(100);
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
});
