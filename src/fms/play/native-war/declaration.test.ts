import {describe,it,expect,vi} from 'vitest';
import {NativeWarIdSet,type NativeWarProvince} from '../war26-native';
import {nativeCoastal,nativeLandAdjacent,nativeHasCedeableProvince,nativeTerritorialConquestCanUse,type NativeDeclarationGeography} from './declaration-geography';
import {nativeCanConsiderDeclaring,nativeChooseCasusBelli,nativeConquestAiWeight,nativeDeclarationSuppressed,nativeBestDeclarationCandidate,type NativeDeclarationState,type NativeChooseQueries,type NativeConsiderQueries} from './declaration-choice';

function geography(){
 const p=(id:number,stateId:number,isLand=true,neighbors:number[]=[]):NativeWarProvince=>({id,stateId,isLand,center:id,neighbors:new NativeWarIdSet(neighbors)});
 const land=p(20,2,true,[10,30]),own=p(10,1),sea=p(30,-1,false),provinces=new Map([[20,land],[10,own],[30,sea]]);
 const state=(id:number):NativeDeclarationGeography=>({id,dead:false,blankState:false,conquerable:false,neighbors:new Set([3-id]),seaNeighbors:new Set(),provinces:[id===1?own:land]});
 const a=state(1),d=state(2),lookup=vi.fn((id:number)=>provinces.get(id)??null),count=vi.fn((s:NativeDeclarationGeography)=>s.provinces?.filter(p=>p?.isLand).length??0);
 return {a,d,land,own,sea,provinces,lookup,count};
}
describe('native CB1 geography, separate from executable transport',()=>{
 it('accepts a land border without reading the annex fallback count',()=>{const q=geography();expect(nativeTerritorialConquestCanUse(q.a,q.d,q.lookup,q.count)).toBe(true);expect(q.count).not.toHaveBeenCalled();});
 it('accepts a sea neighbor coastal province without fabricating a harbor or land route',()=>{const q=geography();q.a.neighbors=new Set();q.a.seaNeighbors=new Set([2]);q.land.neighbors=new NativeWarIdSet([30]);expect(nativeTerritorialConquestCanUse(q.a,q.d,q.lookup,q.count)).toBe(true);expect(nativeLandAdjacent(q.land,1,q.lookup)).toBe(false);expect(nativeCoastal(q.land,q.lookup)).toBe(true);});
 it('does not claim coastal land across an absent national sea-neighbor link',()=>{const q=geography();q.land.neighbors=new NativeWarIdSet([30]);expect(nativeHasCedeableProvince(q.a,q.d,q.lookup)).toBe(false);});
 it('does not add an owner filter absent from the native province-list query',()=>{const q=geography();q.land.stateId=7;expect(nativeHasCedeableProvince(q.a,q.d,q.lookup)).toBe(true);});
 it('skips missing and water provinces but ignores missing neighbor lookups',()=>{const q=geography();q.d.provinces=[null,q.sea,q.land];q.land.neighbors=new NativeWarIdSet([999,10]);expect(nativeHasCedeableProvince(q.a,q.d,q.lookup)).toBe(true);expect(q.lookup.mock.calls.map(x=>x[0])).toEqual([999,10]);});
 it('uses one-land-province annex fallback only after the full cedeable query',()=>{const q=geography();q.land.neighbors=new NativeWarIdSet();expect(nativeTerritorialConquestCanUse(q.a,q.d,q.lookup,q.count)).toBe(true);expect(q.count).toHaveBeenCalledWith(q.d);q.count.mockReturnValue(2);expect(nativeTerritorialConquestCanUse(q.a,q.d,q.lookup,q.count)).toBe(false);});
 it('rejects non-neighbor even with only one land province',()=>{const q=geography();q.a.neighbors=new Set();expect(nativeTerritorialConquestCanUse(q.a,q.d,q.lookup,q.count)).toBe(false);expect(q.count).not.toHaveBeenCalled();expect(q.lookup).not.toHaveBeenCalled();});
 it('uses reference identity and checks defender death but not attacker death in this leaf',()=>{const q=geography();expect(nativeTerritorialConquestCanUse(q.a,q.a,q.lookup,q.count)).toBe(false);q.a.dead=true;expect(nativeTerritorialConquestCanUse(q.a,q.d,q.lookup,q.count)).toBe(true);q.d.dead=true;expect(nativeTerritorialConquestCanUse(q.a,q.d,q.lookup,q.count)).toBe(false);});
 it('rejects only a blank-conquerable defender, not every blank or conquerable country',()=>{const q=geography();q.d.blankState=true;expect(nativeTerritorialConquestCanUse(q.a,q.d,q.lookup,q.count)).toBe(true);q.d.conquerable=true;expect(nativeTerritorialConquestCanUse(q.a,q.d,q.lookup,q.count)).toBe(false);q.d.blankState=false;expect(nativeTerritorialConquestCanUse(q.a,q.d,q.lookup,q.count)).toBe(true);});
 it('keeps native null-collection failures instead of accepting via the annex fallback',()=>{const q=geography();q.a.seaNeighbors=null;expect(()=>nativeTerritorialConquestCanUse(q.a,q.d,q.lookup,q.count)).toThrow(/null reference/);expect(q.count).not.toHaveBeenCalled();q.d.provinces=null;expect(nativeHasCedeableProvince(q.a,q.d,q.lookup)).toBe(false);expect(()=>nativeCoastal(null,q.lookup)).toThrow(/null reference/);});
});

const state=(id:number,extra:Partial<NativeDeclarationState>={}):NativeDeclarationState=>({id,dead:false,blankState:false,conquerable:false,vassal:false,pacifist:false,autoDiplomacy:true,expansionism:1,...extra});
describe('native declaration weights and gates',()=>{
 it('recovers the ordinary strength/hostility/expansion/ambition terms without grain or randomness',()=>{
  const a=state(1,{expansionism:1.5}),b=state(2),q={strength:(s:NativeDeclarationState)=>s.id===1?60:40,affinity:()=>-25,ambitious:()=>true};
  // Native addss sequence: .6000000238418579 -> .64000004529953 ->
  // .6800000667572021 -> .7200000882148743, not a single rounded .72.
  expect(nativeConquestAiWeight(a,b,q)).toBe(.7200000882148743);
  expect(nativeConquestAiWeight(a,b,{...q,affinity:()=>50,ambitious:()=>false})).toBe(Math.fround(.64000004529953));
 });
 it('null or nonpositive combined strength skips all later trait/affinity reads',()=>{
  const q={strength:vi.fn(()=>0),affinity:vi.fn(()=>-50),ambitious:vi.fn(()=>true)};
  expect(nativeConquestAiWeight(null,state(2),q)).toBe(0);expect(q.strength).not.toHaveBeenCalled();
  expect(nativeConquestAiWeight(state(1),state(2),q)).toBe(0);expect(q.affinity).not.toHaveBeenCalled();expect(q.ambitious).not.toHaveBeenCalled();
 });
 it('caps expansion and hostility contributions, then the final score',()=>{
  const q={strength:(s:NativeDeclarationState)=>s.id===1?100:0,affinity:()=>-500,ambitious:()=>true};
  expect(nativeConquestAiWeight(state(1,{expansionism:5}),state(2),q)).toBe(1);
  expect(nativeConquestAiWeight(state(1,{expansionism:-5}),state(2),{...q,strength:()=>1,affinity:()=>50,ambitious:()=>false})).toBe(.5);
 });
 it('strictly greater than float32 .55, with first-candidate and first-CB tie stability',()=>{
  expect(nativeBestDeclarationCandidate([1],()=>[1],()=>Math.fround(.55))).toBeNull();
  expect(nativeBestDeclarationCandidate([9,2],()=>[8,1],()=>.6)).toEqual({defender:9,casusBelli:8,weight:Math.fround(.6)});
  expect(nativeBestDeclarationCandidate([9,2],()=>[8,1],(s,cb)=>s===2&&cb===1?.8:.6)).toEqual({defender:2,casusBelli:1,weight:Math.fround(.8)});
 });
 it('suppression sums ordered nonblank enemies including dead entries, with strict doubled comparison',()=>{
  const a=state(1),b=state(2,{dead:true}),strength=vi.fn((s:NativeDeclarationState)=>s.id===1?100:s.id===2?50:1000);
  expect(nativeDeclarationSuppressed(a,[null,b,state(3,{blankState:true,conquerable:true})],strength)).toBe(false);expect(strength.mock.calls.map(x=>x[0].id)).toEqual([1,2]);
  expect(nativeDeclarationSuppressed(a,[b],s=>s.id===1?99:50)).toBe(true);
  expect(nativeDeclarationSuppressed(a,[b],()=>-10)).toBe(false);
 });
 const consider=():NativeConsiderQueries<NativeDeclarationState>=>({worldAutoDiplomacy:()=>true,activeIntervalMonths:12,passiveIntervalMonths:12,monthsSinceActive:()=>12,monthsSincePassive:()=>12});
 it.each(['dead','vassal','pacifist'] as const)('%s blocks before world/clock lookups',key=>{
  const q={...consider(),worldAutoDiplomacy:vi.fn(()=>true),monthsSinceActive:vi.fn(()=>12)};
  expect(nativeCanConsiderDeclaring(state(1,{[key]:true}),q)).toBe(false);expect(q.worldAutoDiplomacy).not.toHaveBeenCalled();expect(q.monthsSinceActive).not.toHaveBeenCalled();
 });
 it('separate active/passive month clocks permit equality and reject either below threshold',()=>{
  const a=state(1),q=consider();expect(nativeCanConsiderDeclaring(a,q)).toBe(true);
  const passive=vi.fn(()=>12);expect(nativeCanConsiderDeclaring(a,{...q,monthsSinceActive:()=>11,monthsSincePassive:passive})).toBe(false);expect(passive).not.toHaveBeenCalled();
  expect(nativeCanConsiderDeclaring(a,{...q,monthsSincePassive:()=>11})).toBe(false);
  expect(nativeCanConsiderDeclaring(state(1,{autoDiplomacy:false}),q)).toBe(false);
  expect(nativeCanConsiderDeclaring(a,{...q,worldAutoDiplomacy:()=>false})).toBe(false);
 });
});

describe('native strategic CB priority and exact RNG consumption',()=>{
 function choose(extra:Partial<NativeChooseQueries<NativeDeclarationState,{id:number}>>={}){
  const calls:number[]=[],draw=vi.fn(()=>0),q:NativeChooseQueries<NativeDeclarationState,{id:number}>={strength:s=>s.id===1?80:20,landCount:()=>4,usable:id=>{calls.push(id);return{id};},randomValue:draw,...extra};
  return{q,calls,draw,a:state(1),d:state(2)};
 }
 it('chooses annex only after usable then strict .8 draw',()=>{const t=choose();expect(nativeChooseCasusBelli(t.a,t.d,null,t.q)?.id).toBe(2);expect(t.calls).toEqual([2]);expect(t.draw).toHaveBeenCalledTimes(1);const second=choose({randomValue:()=>Math.fround(.8)});expect(nativeChooseCasusBelli(second.a,second.d,null,second.q)?.id).toBe(6);expect(second.calls).toEqual([2,6]);});
 it('does not draw when annex is unavailable; culture precedes faith with no random',()=>{const t=choose({usable:id=>id===6?{id}:null});expect(nativeChooseCasusBelli(t.a,t.d,null,t.q)?.id).toBe(6);expect(t.draw).not.toHaveBeenCalled();});
 it('faith draw failure at .35 goes to vassal and never draws for fallback',()=>{const t=choose({usable:id=>id===7||id===3?{id}:null,randomValue:()=>Math.fround(.35)});expect(nativeChooseCasusBelli(t.a,t.d,{id:1},t.q)?.id).toBe(3);});
 it('vassals cannot choose the vassalization branch and retain an unvalidated non-faith fallback',()=>{const usable=vi.fn(()=>null),t=choose({usable});expect(nativeChooseCasusBelli(t.a,{...t.d,vassal:true},{id:99},t.q)?.id).toBe(99);expect(usable.mock.calls).toHaveLength(3);expect(t.draw).not.toHaveBeenCalled();});
 it('a religion-only fallback is discarded in favor of usable ordinary conquest',()=>{const t=choose({strength:()=>1,usable:id=>id===1?{id}:null});expect(nativeChooseCasusBelli(t.a,t.d,{id:7},t.q)?.id).toBe(1);expect(t.draw).not.toHaveBeenCalled();});
 it('null is preserved when no fallback and no ordinary CB is eligible',()=>{const t=choose({strength:()=>1,usable:()=>null});expect(nativeChooseCasusBelli(t.a,t.d,null,t.q)).toBeNull();expect(t.draw).not.toHaveBeenCalled();});
 it('always queries both land counts, in defender then attacker order, including weak and small targets',()=>{const landCount=vi.fn((_s:NativeDeclarationState)=>1),t=choose({strength:()=>1,landCount});nativeChooseCasusBelli(t.a,t.d,null,t.q);expect(landCount.mock.calls.map(x=>x[0])).toEqual([t.d,t.a]);});
});
