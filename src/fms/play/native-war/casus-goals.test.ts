import {describe,it,expect,vi} from 'vitest';
import {NativeWarIdSet} from '../war26-native';
import {nativeBuildCasusGoals,nativeTryBuildDeclaration} from './casus-goals';
import {nativeConquestGoals} from './conquest-goals';
import {casus,casusFixture} from './casus.test-support';

describe('installed native casus goals',()=>{
 it.each([2,3,7,8])('CB %s builds a primary whole-state goal with an actual empty scope',id=>{
  const t=casusFixture();if(id===7)t.a.politicalSystem=5;if(id===8){t.d.blankState=true;t.d.conquerable=true;}
  expect(nativeBuildCasusGoals(casus(id),t.a,t.d,t.q)).toEqual([{id:1,type:({2:3,3:4,7:11,8:3})[id],addedBy:1,target:2,beneficiary:1,primary:true,scopeType:3,scope:{provinceIds:[],requiredCount:0},districtId:0,secondaryStateId:0}]);
  expect(t.q.strength).not.toHaveBeenCalled();expect(t.q.connected).not.toHaveBeenCalled();expect(t.q.cedeable).not.toHaveBeenCalled();expect(t.q.randomValue).not.toHaveBeenCalled();
 });
 it('rechecks annex/vassal feasibility after CanUse; a changed target does not yield stale goals',()=>{
  const t=casusFixture();t.q.landCount.mockReturnValueOnce(1).mockReturnValueOnce(0);expect(nativeBuildCasusGoals(casus(2),t.a,t.d,t.q)).toEqual([]);expect(t.q.landCount).toHaveBeenCalledTimes(2);
  const v=casusFixture();v.q.isVassal.mockReturnValueOnce(false).mockReturnValueOnce(true);expect(nativeBuildCasusGoals(casus(3),v.a,v.d,v.q)).toEqual([]);expect(v.q.isVassal).toHaveBeenCalledTimes(2);
 });
 it('religious whole-state priority precedes vassalization and territorial work',()=>{
  const t=casusFixture();expect(nativeBuildCasusGoals({...casus(1),allowedGoals:[2,4,11]},t.a,t.d,t.q)[0].type).toBe(11);expect(t.q.isVassal).not.toHaveBeenCalled();expect(t.q.cedeable).not.toHaveBeenCalled();
 });
 it('unification takes all matching cedeable provinces without quota, connected expansion, strength or RNG',()=>{
  const t=casusFixture();t.q.unifier.mockReturnValue(true);t.d.provinces=[t.second,t.land,t.land];
  expect(nativeBuildCasusGoals(casus(6),t.a,t.d,t.q)).toEqual([{id:1,type:1,addedBy:1,target:2,beneficiary:1,primary:true,scopeType:0,scope:{provinceIds:[21,20,20],requiredCount:0},districtId:0,secondaryStateId:0}]);
  expect(t.q.connected).not.toHaveBeenCalled();expect(t.q.strength).not.toHaveBeenCalled();expect(t.q.randomValue).not.toHaveBeenCalled();expect(t.q.cedeable).not.toHaveBeenCalled();
 });
 it('does not retry a different CB if the same-culture list disappears after qualification',()=>{
  const t=casusFixture();t.q.unifier.mockReturnValue(true);let reads=0;const original=t.d.provinces;Object.defineProperty(t.d,'provinces',{get:()=>++reads<=3?original:[]});
  expect(nativeBuildCasusGoals(casus(6),t.a,t.d,t.q)).toEqual([]);expect(t.q.cedeable).not.toHaveBeenCalled();expect(t.q.randomValue).not.toHaveBeenCalled();
 });
 it('same-culture list is queried before checking whether a custom CB has territory or reparation goals',()=>{
  const t=casusFixture();t.q.unifier.mockReturnValue(true);const cb={...casus(6),allowedGoals:[]};
  expect(nativeBuildCasusGoals(cb,t.a,t.d,t.q)).toEqual([]);expect(t.q.province.mock.calls.map(x=>x[0])).toEqual([10,10,10,10]);expect(t.q.cedeable).not.toHaveBeenCalled();
 });
 it('ordinary claims retain connected order, fall back only when empty, and re-query strengths',()=>{
  const t=casusFixture();t.q.connected.mockReturnValue([21,20]);const goals=nativeBuildCasusGoals(casus(1),t.a,t.d,t.q);expect(goals[0].scope).toEqual({provinceIds:[21,20],requiredCount:2});expect(goals[0].type).toBe(2);expect(t.q.strength.mock.calls.map(x=>x[0].id)).toEqual([1,2,1,2]);
  t.q.connected.mockReturnValue([]);expect(nativeBuildCasusGoals(casus(1),t.a,t.d,t.q)[0].scope?.provinceIds).toEqual([20,21]);
 });
 it('ordinary CB1 projection agrees with the frozen v29 leaf for fixed inputs',()=>{
  for(const strength of [0,40,60,65,99])for(const random of [0,Math.fround(.35),1]){
   const t=casusFixture();t.q.strength.mockImplementation(s=>s===t.a?strength:100-strength);t.q.randomValue.mockReturnValue(random);
   const current=nativeBuildCasusGoals(casus(1),t.a,t.d,t.q).map(({id,type,addedBy,target,beneficiary,scope})=>({id,type,addedBy,target,beneficiary,scope}));
   const old=nativeConquestGoals(1,2,{canUse:()=>true,cedeable:()=>[20,21],connected:()=>[20,21],strength:id=>id===1?strength:100-strength,defenderLand:()=>2,randomValue:()=>random});expect(current).toEqual(old);
  }
 });
 it('reparations are secondary with the entire original list and strictly below .35',()=>{
  const t=casusFixture();t.q.cedeable.mockReturnValue([20,21,22,23,24,25]);t.q.connected.mockReturnValue([20,21]);t.q.randomValue.mockReturnValue(0);
  const goals=nativeBuildCasusGoals(casus(1),t.a,t.d,t.q);expect(goals[1]).toMatchObject({id:2,type:6,primary:false,scopeType:0,scope:{provinceIds:[20,21,22,23,24,25],requiredCount:1}});expect(t.q.randomValue).toHaveBeenCalledTimes(1);
  t.q.randomValue.mockReturnValue(Math.fround(.35));expect(nativeBuildCasusGoals(casus(1),t.a,t.d,t.q)).toHaveLength(1);
  t.q.randomValue.mockReturnValue(Math.fround(.35)-1e-10);expect(nativeBuildCasusGoals(casus(1),t.a,t.d,t.q)).toHaveLength(1);
 });
 it('one cedeable province skips quota strength reads; dedicated annex fallback does not draw',()=>{
  const t=casusFixture();t.q.cedeable.mockReturnValue([20]);t.q.connected.mockReturnValue([20]);nativeBuildCasusGoals(casus(1),t.a,t.d,t.q);expect(t.q.strength).toHaveBeenCalledTimes(2);
  const v=casusFixture();v.d.provinces=[v.land];v.land.neighbors=new NativeWarIdSet();v.q.cedeable.mockReturnValue([]);expect(nativeBuildCasusGoals(casus(1),v.a,v.d,v.q)[0].type).toBe(3);expect(v.q.randomValue).not.toHaveBeenCalled();
 });
 it('TryBuild only constructs a nonempty declaration and preserves the chosen CB',()=>{
  const t=casusFixture();const declaration=nativeTryBuildDeclaration(t.a,t.d,casus(2),t.q);expect(declaration).toMatchObject({attackerId:1,defenderId:2,casusBelliId:2,goals:[{type:3}]});
  expect(nativeTryBuildDeclaration(null,t.d,casus(2),t.q)).toBeNull();expect(nativeTryBuildDeclaration(t.a,t.d,null,t.q)).toBeNull();t.d.dead=true;expect(nativeTryBuildDeclaration(t.a,t.d,casus(2),t.q)).toBeNull();
 });
 it('eligibility is re-evaluated when building rather than trusting the caller selection',()=>{
  const t=casusFixture();const access=vi.spyOn(t.q,'landCount');t.a.neighbors=new Set();expect(nativeBuildCasusGoals(casus(2),t.a,t.d,t.q)).toEqual([]);expect(access).not.toHaveBeenCalled();
 });
});
