import {it,expect,vi} from 'vitest';
import {nativeVassalRebellion,nativeRebellionResistance,type NativeRebellionInput} from './vassal-rebellion';
import {nativeSuppressionDestiny} from './suppression-destiny';
const input=(overrides:Partial<NativeRebellionInput>={})=>({years:12,strengthRatio:.5,destinyDifference:0,resistance:0,overlordCollapsed:vi.fn(()=>false),randomValue:vi.fn(()=>1),...overrides});
it('12-year gate and strict powerful threshold do not spend random draws',()=>{const q=input({years:11,strengthRatio:1});expect(nativeVassalRebellion(q)).toBeNull();expect(q.randomValue).not.toHaveBeenCalled();expect(q.overlordCollapsed).not.toHaveBeenCalled();q.years=12;expect(nativeVassalRebellion(q)).toBe('powerful');expect(q.randomValue).not.toHaveBeenCalled();q.strengthRatio=Math.fround(.85);expect(nativeVassalRebellion(q)).toBeNull();expect(q.randomValue).toHaveBeenCalledTimes(2);});
it('keeps failed war/destiny bonuses for development and consumes branches in order',()=>{const calls:number[]=[],q=input({destinyDifference:50,overlordCollapsed:()=>true,randomValue:()=>[1,1,.1][calls.push(1)-1]});expect(nativeVassalRebellion(q)).toBe('development');expect(calls).toHaveLength(3);});
it('uses strict comparison, ratio gates and final 0.002/0.1 clamp',()=>{
 const q=input({strengthRatio:.2,resistance:100,randomValue:()=>Math.fround(.002)});expect(nativeVassalRebellion(q)).toBeNull();q.randomValue=()=>0;expect(nativeVassalRebellion(q)).toBe('default');
 const draws=vi.fn(()=>.11);expect(nativeVassalRebellion(input({years:99,strengthRatio:.3,resistance:-100,randomValue:draws}))).toBeNull();expect(draws).toHaveBeenCalledTimes(1);
});
it('sums actual trait resistance without clamping or double precision regrouping',()=>{expect(nativeRebellionResistance([{rebellionResistanceModifier:.1},{rebellionResistanceModifier:.2},{rebellionResistanceModifier:-.1}])).toBe(Math.fround(Math.fround(Math.fround(.1)+Math.fround(.2))+Math.fround(-.1)));});
it('suppression redraw excludes sole/dominant states and keeps exact half/random thresholds',()=>{
 const value=vi.fn(()=>.49),draw=vi.fn((min:number)=>min),q={eligible:true,otherEligibleAlive:true,totalLand:10,ownLand:5,manifest:true,manifestCount:1,value,intRange:draw};
 expect(nativeSuppressionDestiny(q)).toBe(70);expect(draw).toHaveBeenCalledWith(70,91);q.ownLand=6;expect(nativeSuppressionDestiny(q)).toBeNull();expect(value).toHaveBeenCalledTimes(1);q.ownLand=5;q.value.mockReturnValue(.5);expect(nativeSuppressionDestiny(q)).toBeNull();
});
