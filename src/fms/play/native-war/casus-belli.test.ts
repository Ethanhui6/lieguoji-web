import {describe,it,expect,vi} from 'vitest';
import {NativeWarIdSet} from '../war26-native';
import {NATIVE_CASUS_BELLI_CATALOG,nativeCasusCanUse,nativeCasusAiWeight,nativeHasSameCultureCedeable,nativeCedeableSameCulture,nativeCasusValidReligion,nativeCasusVassalFeasible} from './casus-belli';
import {nativeConquestAiWeight} from './declaration-choice';
import {casus,casusFixture} from './casus.test-support';

describe('installed native casus belli eligibility',()=>{
 it('keeps the registered catalog order and internal empty goals; enum 4/5 are not registrations',()=>{
  expect(NATIVE_CASUS_BELLI_CATALOG.map(c=>[c.id,c.allowedGoals,c.internal])).toEqual([[1,[2,1,3,6],false],[2,[3],false],[3,[4],false],[6,[1],false],[7,[11],false],[8,[3],false],...[10,11,12,13,14,15,16].map(id=>[id,[],true])]);
  expect(casus(1).annexThreshold).toBe(1);expect(casus(2).annexThreshold).toBe(2147483647);
 });
 it('CB2 feasibility is independent of the strategic strength and five-province preference',()=>{
  const t=casusFixture();t.q.landCount.mockReturnValue(300);t.land.neighbors=new NativeWarIdSet();t.second.neighbors=new NativeWarIdSet();
  expect(nativeCasusCanUse(casus(2),t.a,t.d,t.q)).toBe(true);expect(t.q.strength).not.toHaveBeenCalled();expect(t.q.randomValue).not.toHaveBeenCalled();
  expect(nativeCasusCanUse(casus(1),t.a,t.d,t.q)).toBe(false);
 });
 it('blank qualification is equality in both directions, before neighbor reads',()=>{
  const t=casusFixture();expect(nativeCasusCanUse(casus(8),t.a,t.d,t.q)).toBe(false);expect(t.q.province).not.toHaveBeenCalled();
  t.d.blankState=true;t.d.conquerable=true;expect(nativeCasusCanUse(casus(1),t.a,t.d,t.q)).toBe(false);expect(nativeCasusCanUse(casus(8),t.a,t.d,t.q)).toBe(true);
  t.d.conquerable=false;expect(nativeCasusCanUse(casus(8),t.a,t.d,t.q)).toBe(false);expect(nativeCasusCanUse(casus(1),t.a,t.d,t.q)).toBe(true);
 });
 it('checks defender life and reference identity, while attacker death belongs to the outer gate',()=>{
  const t=casusFixture();t.a.dead=true;expect(nativeCasusCanUse(casus(1),t.a,t.d,t.q)).toBe(true);expect(nativeCasusCanUse(casus(1),t.a,t.a,t.q)).toBe(false);
  t.d.dead=true;expect(nativeCasusCanUse(casus(1),t.a,t.d,t.q)).toBe(false);expect(nativeCasusCanUse(casus(1),null,t.d,t.q)).toBe(false);
 });
 it('reads cedeable before allowed goals, even an internal empty entry, and preserves malformed collection failure',()=>{
  const t=casusFixture();expect(nativeCasusCanUse(casus(10),t.a,t.d,t.q)).toBe(false);expect(t.q.province).toHaveBeenCalled();
  t.a.seaNeighbors=null;expect(()=>nativeCasusCanUse(casus(2),t.a,t.d,t.q)).toThrow(/null reference/);expect(t.q.landCount).not.toHaveBeenCalled();
  t.d.provinces=null;expect(nativeCasusCanUse(casus(2),t.a,t.d,t.q)).toBe(false);
 });
 it('internal is an outer catalog filter, not an independent CanUse veto',()=>{
  const t=casusFixture();expect(nativeCasusCanUse({...casus(1),internal:true},t.a,t.d,t.q)).toBe(true);
 });
 it('requires an actual neighbor even for dedicated annexation; land short circuits the first sea query only',()=>{
  const t=casusFixture();t.a.neighbors=new Set();expect(nativeCasusCanUse(casus(2),t.a,t.d,t.q)).toBe(false);expect(t.q.landCount).not.toHaveBeenCalled();
  t.a.seaNeighbors=new Set([2]);expect(nativeCasusCanUse(casus(2),t.a,t.d,t.q)).toBe(true);
 });
 it('theocratic gate checks polity, distinct exact IDs, attacker then defender validity',()=>{
  const t=casusFixture();expect(nativeCasusCanUse(casus(7),t.a,t.d,t.q)).toBe(false);expect(t.q.validReligion).not.toHaveBeenCalled();
  t.a.politicalSystem=5;t.a.religionId=t.d.religionId;expect(nativeCasusCanUse(casus(7),t.a,t.d,t.q)).toBe(false);expect(t.q.validReligion).not.toHaveBeenCalled();
  t.a.religionId='faith-1';t.q.validReligion.mockReturnValueOnce(false);expect(nativeCasusCanUse(casus(7),t.a,t.d,t.q)).toBe(false);expect(t.q.validReligion.mock.calls).toEqual([['faith-1']]);
  t.q.validReligion.mockClear();expect(nativeCasusCanUse(casus(7),t.a,t.d,t.q)).toBe(true);expect(t.q.validReligion.mock.calls).toEqual([['faith-1'],['faith-2']]);
 });
 it('vassal feasibility tests defender land before the manager and does not veto attacker vassalhood',()=>{
  const t=casusFixture();t.a.vassal=true;expect(nativeCasusCanUse(casus(3),t.a,t.d,t.q)).toBe(true);expect(t.q.isVassal.mock.calls).toEqual([[t.d]]);
  t.d.vassal=true;expect(nativeCasusCanUse(casus(3),t.a,t.d,t.q)).toBe(false);
  const isVassal=vi.fn(()=>{throw Error('missing manager');});expect(nativeCasusVassalFeasible(t.d,{landCount:()=>0,isVassal})).toBe(false);expect(isVassal).not.toHaveBeenCalled();expect(()=>nativeCasusVassalFeasible(t.d,{landCount:()=>1,isVassal})).toThrow(/manager/);
 });
});

describe('unification province culture and religion sources',()=>{
 it('uses provincial culture, not national culture or current owner, retaining duplicate IDs',()=>{
  const t=casusFixture();t.q.unifier.mockReturnValue(true);t.d.culture=9;t.land.stateId=7;t.d.provinces=[null,t.water,t.land,t.land,t.second];t.second.culture=9;
  expect(nativeCasusCanUse(casus(6),t.a,t.d,t.q)).toBe(true);expect(nativeCedeableSameCulture(t.a,t.d,t.q.province)).toEqual([20,20]);expect(t.q.landCount).not.toHaveBeenCalled();
 });
 it('returns from the same-culture threshold without touching malformed allowed goals',()=>{
  const t=casusFixture();t.q.unifier.mockReturnValue(true);const cb={...casus(6),get allowedGoals():readonly number[]{throw Error('must not enumerate');}};
  expect(nativeCasusCanUse(cb,t.a,t.d,t.q)).toBe(true);t.q.unifier.mockReturnValue(false);t.q.province.mockClear();expect(nativeCasusCanUse(cb,t.a,t.d,t.q)).toBe(false);expect(t.q.province).not.toHaveBeenCalled();
 });
 it('captures each accepted province ID immediately before a later lookup can change it',()=>{
  const t=casusFixture();let reads=0;t.q.province.mockImplementation(id=>{if(++reads===2)t.land.id=99;return t.provinces.get(id)??null;});
  expect(nativeCedeableSameCulture(t.a,t.d,t.q.province)).toEqual([20,21]);
 });
 it('coastal same-culture land is eligible only through the national sea-neighbor relation',()=>{
  const t=casusFixture();t.land.neighbors=new NativeWarIdSet([30]);t.second.neighbors=new NativeWarIdSet([30]);
  expect(nativeCedeableSameCulture(t.a,t.d,t.q.province)).toEqual([]);t.a.seaNeighbors=new Set([2]);expect(nativeCedeableSameCulture(t.a,t.d,t.q.province)).toEqual([20,21]);
  t.second.culture=2;expect(nativeHasSameCultureCedeable(t.a,t.d,2,t.q.province)).toBe(false);
 });
 it('guards null lists and nonpositive thresholds before sea access, but a valid list does query sea',()=>{
  const t=casusFixture();t.a.seaNeighbors=null;expect(nativeHasSameCultureCedeable(t.a,t.d,0,t.q.province)).toBe(false);expect(()=>nativeHasSameCultureCedeable(t.a,t.d,1,t.q.province)).toThrow(/null reference/);
  t.d.provinces=null;expect(nativeCedeableSameCulture(t.a,t.d,t.q.province)).toEqual([]);expect(nativeHasSameCultureCedeable(t.a,t.d,1,t.q.province)).toBe(false);
 });
 it('religion ID early exits precede missing-manager errors and do not trim',()=>{
  const manager=vi.fn(()=>null);for(const id of [null,'','Atheism'])expect(nativeCasusValidReligion(id,manager)).toBe(false);expect(manager).not.toHaveBeenCalled();expect(()=>nativeCasusValidReligion(' Atheism ',manager)).toThrow(/null reference/);
  expect(nativeCasusValidReligion('faith',()=>({religions:null}))).toBe(false);
 });
 it('valid religion depends on the resolved native name, including its null-name behavior',()=>{
  const religions=new Map([['faith',{religion:{name:null}}],['none',{religion:null}],['atheist',{religion:{name:'AtheismName'}}]]);
  expect(nativeCasusValidReligion('faith',()=>({religions}))).toBe(true);for(const id of ['none','missing','atheist'])expect(nativeCasusValidReligion(id,()=>({religions}))).toBe(false);
 });
});

describe('native casus weight branches',()=>{
 it('ordinary entries retain CB1 arithmetic without adding feasibility checks',()=>{
  const t=casusFixture();t.d.dead=true;t.a.neighbors=new Set();for(const id of [1,2,3,7])expect(nativeCasusAiWeight(casus(id),t.a,t.d,t.q)).toBe(nativeConquestAiWeight(t.a,t.d,t.q));expect(t.q.landCount).not.toHaveBeenCalled();
 });
 it('unification bonus rereads the trait after base scoring and before final clamp',()=>{
  const t=casusFixture();t.q.unifier.mockReturnValue(true);const base=nativeConquestAiWeight(t.a,t.d,t.q);expect(nativeCasusAiWeight(casus(6),t.a,t.d,t.q)).toBe(Math.fround(base+Math.fround(.15)));expect(t.q.unifier).toHaveBeenCalledTimes(1);
  t.q.strength.mockImplementation(s=>s===t.a?100:0);t.a.expansionism=3;expect(nativeCasusAiWeight(casus(6),t.a,t.d,t.q)).toBe(1);
 });
 it('unification at share .45 reads the trait; below it and NaN share skip the trait',()=>{
  const t=casusFixture();t.q.strength.mockImplementation(s=>s===t.a?45:55);nativeCasusAiWeight(casus(6),t.a,t.d,t.q);expect(t.q.unifier).toHaveBeenCalledTimes(1);
  t.q.unifier.mockClear();t.q.strength.mockImplementation(s=>s===t.a?44:56);nativeCasusAiWeight(casus(6),t.a,t.d,t.q);expect(t.q.unifier).not.toHaveBeenCalled();
  t.q.strength.mockReturnValue(NaN);expect(nativeCasusAiWeight(casus(6),t.a,t.d,t.q)).toBeNaN();expect(t.q.unifier).not.toHaveBeenCalled();
 });
 it('blank weight has no strength, affinity or ruler reads; its special path is flag-driven',()=>{
  const t=casusFixture();t.a.expansionism=1;expect(nativeCasusAiWeight(casus(8),t.a,t.d,t.q)).toBe(Math.fround(.58));t.a.expansionism=6;t.q.ambitious.mockReturnValue(true);expect(nativeCasusAiWeight({...casus(8),id:99},t.a,t.d,t.q)).toBe(Math.fround(.7));
  expect(t.q.strength).not.toHaveBeenCalled();expect(t.q.affinity).not.toHaveBeenCalled();expect(t.q.unifier).not.toHaveBeenCalled();
 });
 it('preserves minss NaN behavior for blank and normal NaN propagation for ordinary weight',()=>{
  const t=casusFixture();t.a.expansionism=NaN;expect(nativeCasusAiWeight(casus(8),t.a,t.d,t.q)).toBe(Math.fround(.7));expect(nativeCasusAiWeight(casus(1),t.a,t.d,t.q)).toBeNaN();
  expect(nativeCasusAiWeight(casus(8),null,t.d,t.q)).toBe(0);
 });
});
