import type {NativeWarProvince} from './score';
import type {NativeExecutableWar} from './settlement-execute';
import type {NativeEffectNation,NativeEffectQueries} from './settlement-effects';
import type {NativeSettlementGoal} from './settlement-verdict';
import type {NativeClassificationQueries,NativeSettlementPlan} from './settlement-classification';

export function nativeWarFixture(){
 const provinces=new Map<number,NativeWarProvince>([[0,1],[1,1],[2,1],[10,2],[11,2],[12,2],[20,3]].map(([id,stateId])=>[id,{id,stateId,isLand:true}]));
 const states=new Map<number,NativeEffectNation>([1,2,3].map(id=>[id,{id,name:`state${id}`,religionId:'faith'+id,dead:false,provinces:[...provinces.values()].filter(p=>p.stateId===id),gold:100,goldPerMonth:10,armyCostGold:10}]));
 const w:NativeExecutableWar={id:1,legacyWarType:0,motherStateId:3,blankConquerable:false,annexationConquerorId:-1,internal:false,primaryAttackerId:1,primaryDefenderId:2,startTime:0,participants:[{stateId:1,side:0},{stateId:2,side:1}],destroyedParticipants:[],goals:[],killsByState:new Map(),deathsByState:new Map(),initialCapitals:new Map([[1,0],[2,10]]),initialProvinceCounts:new Map([[1,3],[2,3]]),initialOwners:new Map([...provinces.values()].filter(p=>p.stateId!==3).map(p=>[p.id,p.stateId]))};
 const goal:NativeSettlementGoal={id:40,type:0,addedBy:1,target:2,beneficiary:1,scope:{provinceIds:[10],requiredCount:1}};
 const p:NativeSettlementPlan={warId:1,winnerSide:null,victorSide:0,outcomes:new Map(),enforcedGoals:[],transfers:[],appliedTransfers:[],annexation:false,effects:[],effectResults:[]};
 const q:NativeClassificationQueries={province:id=>provinces.get(id)??null,state:id=>states.get(id)??null,currentOwner:id=>provinces.get(id)?.stateId??-1,strength:()=>100,monthsSince:()=>0,hasStateCollapsed:()=>false,goalAchieved:()=>false};
 const effects:NativeEffectQueries={state:id=>states.get(id)??null,isVassalOf:()=>false,makeVassalImmediate:()=>({success:true,reason:null}),religions:new Map([['faith1',{religion:{name:'faith1'}}]]),rulingFamily:()=>null,leader:()=>null,markStateNameDirty:()=>{},logApplied:()=>{}};
 return{w,p,q,goal,provinces,states,effects};
}
