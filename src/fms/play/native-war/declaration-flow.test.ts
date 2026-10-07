import {describe,it,expect,vi} from 'vitest';
import {NATIVE_CASUS_BELLI_CATALOG,nativeCasusCanUse,nativeCasusAiWeight} from './casus-belli';
import {nativeBuildCasusGoals,type NativeDeclaredGoal} from './casus-goals';
import {nativeChooseCasusBelli} from './declaration-choice';
import {nativeEvaluateDeclaration,type NativeDeclaration} from './declaration';
import {nativeAccumulateDiplomaticPower,nativeInitializeWarPowers,nativeSpendDeclarationPower} from './diplomatic-power';
import {casusFixture} from './casus.test-support';

describe('connected native points -> catalog -> choice -> goals -> start-war port',()=>{
 function flow(){
  const t=casusFixture();t.a.expansionism=2;t.q.strength.mockReturnValue(50);t.q.unifier.mockReturnValue(true);
  const usable=(id:number,a:typeof t.a,d:typeof t.d)=>{const cb=NATIVE_CASUS_BELLI_CATALOG.find(c=>c.id===id);return cb&&nativeCasusCanUse(cb,a,d,t.q)?cb:null;};
  const startWar=vi.fn((declaration:NativeDeclaration<NativeDeclaredGoal>):{id:number;declaration:NativeDeclaration<NativeDeclaredGoal>}|null=>({id:1,declaration}));
  const evaluate=vi.fn(()=>nativeEvaluateDeclaration(t.a,{
   worldAutoDiplomacy:()=>true,activeIntervalMonths:12,passiveIntervalMonths:12,monthsSinceActive:()=>24,monthsSincePassive:()=>24,suppressed:()=>false,
   candidates:()=>[t.d],catalog:()=>NATIVE_CASUS_BELLI_CATALOG,internal:cb=>cb.internal,
   canUse:(cb,a,d)=>nativeCasusCanUse(cb,a,d,t.q),weight:(cb,a,d)=>nativeCasusAiWeight(cb,a,d,t.q),
   choose:(a,d,fallback)=>nativeChooseCasusBelli(a,d,fallback,{...t.q,usable}),defaultGoals:(cb,a,d)=>nativeBuildCasusGoals(cb,a,d,t.q),
   stateTag:id=>'country-'+id,log:()=>{},startWar,
  }));return{...t,startWar,evaluate};
 }
 it('new-country random point reset delays the actual attempt; selected culture scope reaches start-war intact',()=>{
  const t=flow(),points={power:100,startWar:100,endWar:100,efficiency:0};nativeAccumulateDiplomaticPower(points,20);nativeInitializeWarPowers(points,100,100,()=>25);
  for(let i=0;i<3;i++){nativeAccumulateDiplomaticPower(points,20);expect(nativeSpendDeclarationPower(points,100,t.evaluate)).toBeNull();}expect(t.evaluate).not.toHaveBeenCalled();
  nativeAccumulateDiplomaticPower(points,20);const result=nativeSpendDeclarationPower(points,100,t.evaluate);
  expect(result?.declaration).toMatchObject({attackerId:1,defenderId:2,casusBelliId:6,goals:[{type:1,primary:true,scope:{provinceIds:[20,21],requiredCount:0}}]});expect(points.startWar).toBe(0);expect(t.startWar).toHaveBeenCalledTimes(1);expect(t.q.randomValue).not.toHaveBeenCalled();
 });
 it('a real failed start-war result halves points and does not invent a successful war',()=>{
  const t=flow(),points={power:120,startWar:120,endWar:120,efficiency:20};t.startWar.mockReturnValue(null);expect(nativeSpendDeclarationPower(points,100,t.evaluate)).toBeNull();expect(t.startWar).toHaveBeenCalledTimes(1);expect(points.startWar).toBe(60);
 });
 it('catalog rejection after state change returns null and halves points without calling start-war',()=>{
  const t=flow(),points={power:120,startWar:120,endWar:120,efficiency:20};t.d.dead=true;expect(nativeSpendDeclarationPower(points,100,t.evaluate)).toBeNull();expect(t.startWar).not.toHaveBeenCalled();expect(points.startWar).toBe(60);
 });
});
