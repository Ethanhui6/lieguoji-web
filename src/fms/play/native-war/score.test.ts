import {describe,it,expect} from 'vitest';
import {nativeWarScoreParts,nativeGoalProgress,nativeSideKills,nativeSideLoss,nativeCurrentProvinceCount,nativeEnemyStates,nativeEffectiveRange,nativeAverageGoal,type NativeScoreWar,type NativeWarQueries,type NativeWarGoal,type NativeWarProvince,type NativeWarNation} from './score';

const f=Math.fround;
function fixture(){
 const provinces=new Map<number,NativeWarProvince>([1,2,3,4].map(id=>[id,{id,stateId:id<=2?1:2,isLand:true}]));
 const states=new Map<number,NativeWarNation>([1,2].map(id=>[id,{dead:false,provinces:[...provinces.values()].filter(p=>p.stateId===id)}]));
 const w:NativeScoreWar={internal:false,primaryDefenderId:2,participants:[{stateId:1,side:0},{stateId:2,side:1}],destroyedParticipants:[],goals:[],killsByState:new Map(),initialProvinceCounts:new Map([[1,2],[2,2]]),initialOwners:new Map([...provinces.values()].map(p=>[p.id,p.stateId]))};
 const q:NativeWarQueries={province:id=>provinces.get(id)??null,state:id=>states.get(id)??null};
 const g:NativeWarGoal={type:0,addedBy:1,target:2,beneficiary:1,scope:{provinceIds:[3,4],requiredCount:1}};
 return {w,q,g,provinces,states};
}
describe('recovered war score and goal contract (not yet a production adapter)',()=>{
 it('null war/goal returns zero without querying game managers',()=>{const q={province:()=>{throw Error('unexpected query');},state:()=>{throw Error('unexpected query');}};expect(nativeWarScoreParts(null,q).score).toBe(0);expect(nativeGoalProgress(null,fixture().g,q)).toBe(0);expect(nativeGoalProgress(fixture().w,null,q)).toBe(0);});
 it('keeps occupation, battle and goal contributions separate at 50, 20 and 30 points',()=>{
  const {w,q,g,provinces,states}=fixture();states.get(2)!.provinces=[];expect(nativeWarScoreParts(w,q)).toEqual({occupation:1,battle:0,goal:0,score:50});
  states.get(2)!.provinces=[provinces.get(3)!,provinces.get(4)!];w.killsByState.set(1,100);expect(nativeWarScoreParts(w,q).score).toBe(20);
  w.killsByState.clear();provinces.get(3)!.stateId=1;provinces.get(4)!.stateId=1;w.goals=[g];expect(nativeWarScoreParts(w,q).score).toBeCloseTo(30,5);
  w.killsByState.set(1,100);states.get(2)!.provinces=[];expect(nativeWarScoreParts(w,q).score).toBe(100);
 });
 it('negative loss and battle results are signed, with no score beyond minus 100',()=>{const {w,q,states}=fixture();states.get(1)!.dead=true;w.killsByState.set(2,90);expect(nativeWarScoreParts(w,q)).toEqual({occupation:-1,battle:-1,goal:0,score:-70});});
 it('current count follows list count, including null/sea/duplicates; dead means zero',()=>{const {q,states,provinces}=fixture();states.get(1)!.provinces=[null,{id:9,stateId:9,isLand:false},provinces.get(1)!,provinces.get(1)!];expect(nativeCurrentProvinceCount(1,q)).toBe(4);states.get(1)!.dead=true;expect(nativeCurrentProvinceCount(1,q)).toBe(0);expect(nativeCurrentProvinceCount(99,q)).toBe(0);});
 it('preserves float32 accumulation and repeated live/destroyed participants',()=>{const {w}=fixture();w.participants=[{stateId:1,side:0},{stateId:2,side:0},{stateId:3,side:0}];w.killsByState=new Map([[1,16777216],[2,1],[3,1]]);expect(nativeSideKills(w,0)).toBe(16777216);w.destroyedParticipants=[{stateId:1,side:0}];expect(nativeSideKills(w,0)).toBe(33554432);});
 it('retains int32 initial sum overflow and clamps apparent gains to zero loss',()=>{const {w,q}=fixture();w.participants.push({stateId:1,side:0});w.initialProvinceCounts.set(1,2147483647);expect(nativeSideLoss(w,0,q)).toBe(0);w.initialProvinceCounts.set(1,1);expect(nativeSideLoss(w,0,q)).toBe(0);});
 it('uses fixed current defender IDs even for defender-added goals; fallback is unfiltered',()=>{const {w,g}=fixture();g.addedBy=2;g.target=1;w.destroyedParticipants.push({stateId:7,side:1});expect([...nativeEnemyStates(w,g)]).toEqual([2,1]);w.participants=[];w.primaryDefenderId=-1;g.target=0;expect([...nativeEnemyStates(w,g)]).toEqual([-1]);});
 it('preserves duplicate scope entries and counts third-party capture',()=>{const {w,q,g,provinces}=fixture();g.scope!.provinceIds=[3,3,4,99];provinces.get(3)!.stateId=7;expect(nativeGoalProgress(w,g,q)).toBe(f(2/3));g.type=2;expect(nativeGoalProgress(w,g,q)).toBe(1);g.scope!.requiredCount=90;expect(nativeGoalProgress(w,g,q)).toBe(f(2/3));});
 it('filters missing and non-land at range time and uses target snapshots for types 3/4/11',()=>{const {w,q,g,provinces}=fixture();provinces.get(4)!.isLand=false;expect(nativeEffectiveRange(w,g,nativeEnemyStates(w,g),q)).toEqual([3]);for(const type of [3,4,11]){g.type=type;g.scope=null;expect(nativeEffectiveRange(w,g,nativeEnemyStates(w,g),q)).toEqual([3]);}provinces.get(3)!.isLand=false;expect(nativeGoalProgress(w,g,q)).toBe(1);});
 it('requeries ownership after effective range construction instead of caching a province',()=>{const {w,q,g}=fixture();g.scope!.provinceIds=[3];let calls=0;q.province=id=>++calls===1?{id,stateId:2,isLand:true}:null;expect(nativeGoalProgress(w,g,q)).toBe(1);expect(calls).toBe(2);});
 it('null scope remains an error for ordinary goals, while null ProvinceIds is an empty range',()=>{const {w,q,g}=fixture();g.scope!.provinceIds=null;expect(nativeGoalProgress(w,g,q)).toBe(1);g.scope=null;expect(()=>nativeGoalProgress(w,g,q)).toThrow();});
 it('only averages enforceable goals, equally, by addedBy across both participant lists',()=>{const {w,q,g,provinces}=fixture();provinces.get(3)!.stateId=1;w.destroyedParticipants=[{stateId:3,side:0}];w.goals=[g,{...g,addedBy:3,scope:{provinceIds:[],requiredCount:1}},{...g,type:5},{...g,type:12},{...g,addedBy:99}];expect(nativeAverageGoal(w,0,q)).toBe(.75);expect(nativeAverageGoal(w,1,q)).toBe(0);});
 it('independence checks a defeated target before a missing beneficiary, and uses ceil of half initial land',()=>{const {w,q,g,states,provinces}=fixture();w.internal=true;g.type=7;g.beneficiary=99;states.get(2)!.dead=true;expect(nativeGoalProgress(w,g,q)).toBe(1);states.get(2)!.dead=false;expect(nativeGoalProgress(w,g,q)).toBe(0);g.beneficiary=1;for(let id=5;id<8;id++){provinces.set(id,{id,stateId:2,isLand:true});w.initialOwners.set(id,1);}expect(nativeGoalProgress(w,g,q)).toBe(f(2/3));});
 it.each([8,9,10])('internal goal %i uses initial current-land snapshot and target loss',type=>{const {w,q,g,states,provinces}=fixture();w.internal=true;g.type=type;states.get(2)!.provinces=[provinces.get(3)!];expect(nativeGoalProgress(w,g,q)).toBe(.5);states.get(2)!.provinces=[];expect(nativeGoalProgress(w,g,q)).toBe(1);});
});
