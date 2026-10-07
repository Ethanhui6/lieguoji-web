import {describe,it,expect} from 'vitest';
import type {NativeWarProvince} from './score';
import type {NativeFatigueNation} from './weariness';
import type {NativeSettlementWar,NativeSettlementGoal} from './settlement-verdict';
import {nativeNetGain,nativeLossFraction,nativeAllEnforceableGoalsFailed,nativeIsSettlementBeneficiary,nativeHasSettlementEffect,nativeClassifyState,nativeClassifyOutcomes,type NativeSettlementPlan,type NativeEffect} from './settlement-classification';
import {nativeBuildSettlementPlan,nativeCollectTransfers,nativeCollectAnnexationTransfers,nativeResolveGoalProvinces,type NativePlanQueries} from './settlement-plan';

function fixture(){
 const provinces=new Map<number,NativeWarProvince>([[0,1],[1,1],[2,1],[10,2],[11,2],[12,2],[20,3],[21,3]].map(([id,stateId])=>[id,{id,stateId,isLand:true}]));
 const states=new Map<number,NativeFatigueNation>([1,2,3].map(id=>[id,{dead:false,provinces:[...provinces.values()].filter(p=>p.stateId===id),gold:600,goldPerMonth:100,armyCostGold:100}]));
 const w:NativeSettlementWar={id:100,legacyWarType:0,blankConquerable:false,annexationConquerorId:-1,internal:false,primaryAttackerId:1,primaryDefenderId:2,startTime:0,participants:[{stateId:1,side:0},{stateId:2,side:1}],destroyedParticipants:[],goals:[],killsByState:new Map(),deathsByState:new Map(),initialCapitals:new Map([[1,0],[2,10]]),initialProvinceCounts:new Map([[1,3],[2,3]]),initialOwners:new Map([...provinces.values()].filter(p=>p.stateId!==3).map(p=>[p.id,p.stateId]))};
 const goal:NativeSettlementGoal={id:40,type:0,addedBy:1,target:2,beneficiary:1,scope:{provinceIds:[10],requiredCount:1}};
 const q:NativePlanQueries={province:id=>provinces.get(id)??null,state:id=>states.get(id)??null,currentOwner:id=>provinces.get(id)?.stateId??-1,strength:()=>100,monthsSince:()=>0,hasStateCollapsed:()=>false,goalAchieved:()=>false,buildEffect:g=>({sourceGoalId:g.id,type:g.type,beneficiary:g.beneficiary,target:g.target}),buildInternalPlan:()=>{throw Error('internal settlement not wired in fixture');}};
 const p:NativeSettlementPlan={warId:100,winnerSide:null,victorSide:null,outcomes:new Map(),enforcedGoals:[],transfers:[],appliedTransfers:[],annexation:false,effects:[],effectResults:[]};
 const attackers=new Set([1]),defenders=new Set([2]);
 const classify=(id:number,pending=false,actual=false)=>nativeClassifyState(w,p,w.participants.find(n=>n.stateId===id)!,id===1?defenders:attackers,pending,actual,q);
 return{w,p,q,provinces,states,goal,attackers,defenders,classify};
}
const effect=(beneficiary:number,target:number):NativeEffect=>({sourceGoalId:40,type:6,beneficiary,target});

describe('native country outcomes and final winner',()=>{
 it('missing, dead, empty or collapsed states lose even with successful benefits',()=>{
  const {p,q,states,classify}=fixture();p.effects=[effect(1,2)];expect(classify(1)).toBe(0);
  q.hasStateCollapsed=()=>true;expect(classify(1)).toBe(1);q.hasStateCollapsed=()=>false;
  states.get(1)!.dead=true;expect(classify(1)).toBe(1);states.get(1)!.dead=false;
  states.get(1)!.provinces=[];expect(classify(1)).toBe(1);states.delete(1);expect(classify(1)).toBe(1);
 });
 it('a nonempty province list is not filtered for land at the dead-or-empty gate',()=>{
  const {states,classify}=fixture();states.get(1)!.provinces=[null];expect(classify(1)).toBe(2);
 });
 it('losing territory alone does not label a surviving country defeated',()=>{
  const {provinces,classify}=fixture();provinces.get(0)!.stateId=2;expect(classify(1)).toBe(2);expect(classify(2)).toBe(0);
 });
 it('a defending country that holds its territory wins when all enforceable goals fail',()=>{
  const {w,goal,classify}=fixture();expect(classify(2)).toBe(2);w.goals=[{...goal,type:5}];expect(classify(2)).toBe(2);
  w.goals.push(goal);expect(classify(2)).toBe(0);expect(classify(1)).toBe(2);
 });
 it('all-goals-failed includes goals added by defenders and stops at an achieved goal',()=>{
  const {w,q,goal}=fixture();w.goals=[{...goal,addedBy:2},{...goal,id:41}];const calls:number[]=[];
  q.goalAchieved=(_,g)=>{calls.push(g.id);return g.addedBy===2;};expect(nativeAllEnforceableGoalsFailed(w,q)).toBe(false);expect(calls).toEqual([40]);
 });
 it('loss to a neutral country prevents the held-territory defence victory',()=>{
  const {w,goal,provinces,classify}=fixture();w.goals=[goal];provinces.get(10)!.stateId=3;expect(classify(2)).toBe(2);
 });
 it('planned effects and successful actual effects produce distinct outcomes',()=>{
  const {w,p,goal,classify}=fixture();w.goals=[goal];p.effects=[effect(1,2)];
  expect(classify(1,false,false)).toBe(0);expect(classify(2,false,false)).toBe(2);
  p.effectResults=[{...effect(1,2),status:2,reason:'failed'}];
  expect(classify(1,false,true)).toBe(2);expect(classify(2,false,true)).toBe(0);
  p.effectResults[0].status=1;expect(classify(1,false,true)).toBe(0);expect(classify(2,false,true)).toBe(2);
  p.effectResults[0].status=0;expect(nativeHasSettlementEffect(p,1,'beneficiary',true)).toBe(true);
 });
 it('applied-transfer history alone does not grant annexation beneficiary status',()=>{
  const {w,p,classify}=fixture();p.annexation=true;p.transfers=[{sourceGoalId:40,provinceId:20,from:3,to:1,type:0}];
  expect(classify(1,true)).toBe(0);p.appliedTransfers=[...p.transfers];expect(classify(1,false)).toBe(2);
  expect(nativeIsSettlementBeneficiary(w,p,1,false)).toBe(false);w.annexationConquerorId=1;expect(classify(1,false)).toBe(0);
 });
 it('a planned victor does not make its allies or primary country individual winners',()=>{
  const {w,p,q,goal,attackers,defenders}=fixture();w.goals=[goal];w.participants.push({stateId:3,side:0});attackers.add(3);p.victorSide=0;
  nativeClassifyOutcomes(w,p,attackers,defenders,0,true,false,q);
  expect([...p.outcomes]).toEqual([[1,2],[2,2],[3,2]]);expect(p.winnerSide).toBe(0);
  nativeClassifyOutcomes(w,p,attackers,defenders,0,false,true,q);expect(p.winnerSide).toBe(null);expect(p.victorSide).toBe(0);
 });
 it('a losing primary with material benefits retains victory and can change the final winning side',()=>{
  const {w,p,q,attackers,defenders}=fixture();p.effects=[effect(2,1)];p.effectResults=[{...effect(2,1),status:0,reason:''}];
  nativeClassifyOutcomes(w,p,attackers,defenders,0,true,false,q);expect(p.outcomes.get(2)).toBe(0);expect(p.winnerSide).toBe(1);
  nativeClassifyOutcomes(w,p,attackers,defenders,0,false,true,q);expect(p.winnerSide).toBe(1);
 });
 it('successful benefits to both sides leave no unique final side when the primary victor did not win',()=>{
  const {w,p,q,attackers,defenders}=fixture();w.participants.push({stateId:3,side:0});attackers.add(3);
  p.effectResults=[{...effect(3,2),status:1,reason:''},{...effect(2,1),status:0,reason:''}];
  nativeClassifyOutcomes(w,p,attackers,defenders,0,false,true,q);expect(p.outcomes.get(1)).toBe(2);expect(p.outcomes.get(2)).toBe(0);expect(p.outcomes.get(3)).toBe(0);expect(p.winnerSide).toBe(null);
 });
 it('destroyed participants remain classified; duplicate IDs are last-write outcomes, not deduplicated traversal',()=>{
  const {w,p,q,goal,states,attackers,defenders}=fixture();w.goals=[goal];w.destroyedParticipants=[{stateId:3,side:1},{stateId:1,side:1}];states.get(3)!.dead=true;
  nativeClassifyOutcomes(w,p,attackers,defenders,null,false,true,q);
  expect(p.outcomes.get(3)).toBe(1);expect(p.outcomes.get(1)).toBe(0);expect(p.winnerSide).toBe(null);
 });
 it('pending transfer gain is additive, including already-owned and repeated entries',()=>{
  const {w,p,q,provinces,defenders}=fixture();provinces.get(10)!.stateId=1;p.transfers=[{sourceGoalId:40,provinceId:10,from:2,to:1,type:0}];
  expect(nativeNetGain(w,p,1,defenders,false,q)).toBe(1);expect(nativeNetGain(w,p,1,defenders,true,q)).toBe(2);
  p.transfers.push({...p.transfers[0]});expect(nativeNetGain(w,p,1,defenders,true,q)).toBe(3);
 });
 it('pending loss is counted only when the initial owner still owns that province',()=>{
  const {w,p,q,provinces,attackers}=fixture();p.transfers=[{sourceGoalId:40,provinceId:10,from:2,to:1,type:0}];
  expect(nativeNetGain(w,p,2,attackers,true,q)).toBe(-1);provinces.get(10)!.stateId=1;expect(nativeNetGain(w,p,2,attackers,true,q)).toBe(-1);
 });
 it('loss fraction uses initial list count and owner changes even for water or missing provinces',()=>{
  const {w,q,provinces}=fixture();provinces.get(10)!.isLand=false;provinces.get(10)!.stateId=3;provinces.delete(11);
  expect(nativeLossFraction(w,2,q)).toBe(Math.fround(2/3));w.initialProvinceCounts.delete(2);expect(nativeLossFraction(w,2,q)).toBe(0);
 });
});

describe('native settlement plan and transfer collection',()=>{
 it.each([6,7,8,10,11] as const)('reason %i skips plan construction before internal queries',reason=>{
  const {w,q}=fixture();w.internal=true;expect(nativeBuildSettlementPlan(w,reason,q)).toBe(null);
 });
 it('null wars have no plan; nominal peace still has a plan',()=>{
  const {w,q}=fixture();expect(nativeBuildSettlementPlan(null,5,q)).toBe(null);expect(nativeBuildSettlementPlan(w,5,q)?.warId).toBe(100);
 });
 it('internal wars use their own builder rather than ordinary territory effects',()=>{
  const {w,p,q}=fixture();w.internal=true;q.buildInternalPlan=(war,reason)=>{expect(war).toBe(w);expect(reason).toBe(4);return p;};expect(nativeBuildSettlementPlan(w,4,q)).toBe(p);
 });
 it('fulfilled goals can benefit the losing side; unfulfilled goals require victor-side beneficiaries',()=>{
  const {w,q,goal}=fixture();w.goals=[{...goal,type:6,beneficiary:2,target:1}];
  expect(nativeBuildSettlementPlan(w,0,q)!.effects).toEqual([]);q.goalAchieved=()=>true;
  expect(nativeBuildSettlementPlan(w,0,q)!.effects).toEqual([effect(2,1)]);
 });
 it('only the recovered goal types can be forced by a side verdict',()=>{
  const {w,q,goal}=fixture();w.goals=[0,1,2,3,4,5,6,7,8,9,10,11].map(type=>({...goal,type,id:100+type}));
  expect(nativeBuildSettlementPlan(w,0,q)!.enforcedGoals).toEqual([100,101,104,106,111]);
 });
 it('null effects and effects suppressed by an existing annexation flag are not marked enforced',()=>{
  const {w,q,goal}=fixture();w.goals=[{...goal,type:6}];q.buildEffect=()=>null;expect(nativeBuildSettlementPlan(w,0,q)!.enforcedGoals).toEqual([]);
  w.annexationConquerorId=0;q.buildEffect=()=>{throw Error('annexation suppresses nonterritory effects');};const p=nativeBuildSettlementPlan(w,4,q)!;expect(p.annexation).toBe(true);expect(p.enforcedGoals).toEqual([]);
 });
 it('fatigue blocks new decisive annexation but does not remove an existing flag',()=>{
  const {w,q,states,goal,provinces}=fixture();states.get(2)!.provinces=[provinces.get(10)!];w.goals=[{...goal,type:3}];provinces.get(10)!.stateId=1;
  expect(nativeBuildSettlementPlan(w,0,q)!.annexation).toBe(true);expect(nativeBuildSettlementPlan(w,4,q)!.annexation).toBe(false);
  w.annexationConquerorId=1;expect(nativeBuildSettlementPlan(w,4,q)!.annexation).toBe(true);
 });
 it('settlement defenders include destroyed members but never add a nonparticipant goal target',()=>{
  const {w,q,goal}=fixture();w.destroyedParticipants.push({stateId:3,side:1});w.goals=[{...goal,scope:{provinceIds:[20],requiredCount:1}}];q.goalAchieved=()=>true;
  expect(nativeBuildSettlementPlan(w,0,q)!.transfers.map(t=>t.provinceId)).toEqual([20]);w.destroyedParticipants=[];w.goals[0].target=3;
  expect(nativeBuildSettlementPlan(w,0,q)!.transfers).toEqual([]);
 });
 it('an empty defender set never falls back to the primary defender',()=>{
  const {w,q,goal}=fixture();w.participants=w.participants.filter(p=>p.side===0);w.goals=[goal];q.goalAchieved=()=>true;expect(nativeBuildSettlementPlan(w,0,q)!.transfers).toEqual([]);
 });
 it('first goal wins a province; plans do not mutate ownership or require beneficiary occupation',()=>{
  const {w,q,goal,provinces}=fixture();w.goals=[goal,{...goal,id:41,beneficiary:3}];q.goalAchieved=()=>true;const p=nativeBuildSettlementPlan(w,0,q)!;
  expect(p.enforcedGoals).toEqual([40,41]);expect(p.transfers).toEqual([{sourceGoalId:40,provinceId:10,from:2,to:1,type:0}]);expect(provinces.get(10)!.stateId).toBe(2);
 });
 it('nonannexed transfers check current province count, without subtracting already queued terms',()=>{
  const {p,q,goal,defenders,states,provinces}=fixture();states.get(2)!.provinces=[provinces.get(10)!,provinces.get(11)!];
  nativeCollectTransfers(p,{...goal,scope:{provinceIds:[10,11],requiredCount:1}},false,defenders,q);expect(p.transfers.map(t=>t.provinceId)).toEqual([10,11]);
  p.transfers=[];states.get(2)!.provinces=[provinces.get(10)!];nativeCollectTransfers(p,goal,false,defenders,q);expect(p.transfers).toEqual([]);
  nativeCollectTransfers(p,goal,true,defenders,q);expect(p.transfers).toHaveLength(1);
 });
 it('OccupyCount still resolves and queries its provinces but never creates transfer terms',()=>{
  const {p,q,goal,defenders}=fixture();const seen:number[]=[];const original=q.province;q.province=id=>{seen.push(id);return original(id);};q.state=()=>{throw Error('must not query current land count');};
  nativeCollectTransfers(p,{...goal,type:2},false,defenders,q);expect(seen).toEqual([10]);expect(p.transfers).toEqual([]);
  expect(()=>nativeCollectTransfers(p,{...goal,type:2,scope:null},false,defenders,q)).toThrow();
  nativeCollectTransfers(p,{...goal,type:2,scope:{provinceIds:null,requiredCount:1}},false,defenders,q);expect(seen).toEqual([10]);
 });
 it('annex goal provinces come from current target land list, independent of explicit scope',()=>{
  const {q,goal,states,provinces}=fixture();states.get(2)!.provinces=[provinces.get(10)!,null,provinces.get(11)!];provinces.get(11)!.isLand=false;
  expect(nativeResolveGoalProvinces({...goal,type:3,scope:null},q)).toEqual([10]);expect(()=>nativeResolveGoalProvinces({...goal,scope:null},q)).toThrow();
 });
 it('annexation fallback snapshots the loser list and does not recheck each current owner',()=>{
  const {p,q,states,provinces}=fixture();provinces.get(10)!.stateId=3;states.get(2)!.provinces=[provinces.get(10)!,null,provinces.get(11)!];
  p.transfers=[{sourceGoalId:40,provinceId:11,from:2,to:3,type:0}];nativeCollectAnnexationTransfers(p,2,1,q);
  expect(p.transfers).toEqual([{sourceGoalId:40,provinceId:11,from:2,to:3,type:0},{sourceGoalId:-1,provinceId:10,from:2,to:1,type:3}]);
 });
});
